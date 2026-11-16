const mongoose = require("mongoose");
const Order = require("../../db/order");
const Product = require("../../db/proizvodi");
const getProducts = require("../products/getProducts");
const getCategories = require("../categories/getCategories");

const VALID_ORDER_STATUSES = new Set([
  "na_cekanju",
  "obradjeno",
  "poslato",
  "isporuceno",
  "otkazano",
]);

/**
 * Grupiše stavke iz porudžbine po proizvodu (productId ili code) kako bi se
 * više veličina/boja istog artikla sabralo u jedinstvenu količinu.
 */
function aggregateOrderItems(items) {
  const grouped = new Map();
  if (!Array.isArray(items)) return [];

  for (const item of items) {
    if (!item) continue;
    const qty = parseInt(item.quantity, 10) || 1;
    if (qty <= 0) continue;

    const rawId = String(item.productId || "").trim();
    const rawCode = String(item.code || "").trim().toLowerCase();
    const rawTitle = String(item.title || "").trim();
    const rawVar = String(item.variant || item.size || "").trim().toLowerCase();

    const key =
      rawId && mongoose.Types.ObjectId.isValid(rawId)
        ? `id:${rawId}`
        : rawCode
        ? `code:${rawCode}`
        : `title:${rawTitle.toLowerCase()}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.qty += qty;
      if (rawVar) {
        existing.variantQtys.set(rawVar, (existing.variantQtys.get(rawVar) || 0) + qty);
      }
    } else {
      const variantQtys = new Map();
      if (rawVar) variantQtys.set(rawVar, qty);
      grouped.set(key, {
        productId: rawId,
        code: rawCode,
        title: rawTitle,
        qty,
        variantQtys,
      });
    }
  }

  return Array.from(grouped.values());
}

/**
 * Sastavlja MongoDB filter za pronalaženje proizvoda iz stavke porudžbine.
 */
function buildProductLookupFilter(entry) {
  const orQueries = [];
  if (entry.productId && mongoose.Types.ObjectId.isValid(entry.productId)) {
    orQueries.push({ _id: entry.productId });
  }
  if (entry.code) {
    orQueries.push({ code: entry.code });
  }
  if (!orQueries.length && entry.title) {
    const escapedTitle = entry.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    orQueries.push({ title: new RegExp("^" + escapedTitle + "$", "i") });
  }
  if (!orQueries.length) return null;
  return orQueries.length === 1 ? orQueries[0] : { $or: orQueries };
}

/**
 * Vraća količinu na stanje (stock) i prebacuje status iz "rasprodato" u "aktivan"
 * kada se porudžbina otkaže ili obriše.
 */
async function restoreStockForOrder(items) {
  const aggregated = aggregateOrderItems(items);
  for (const entry of aggregated) {
    const filter = buildProductLookupFilter(entry);
    if (!filter) continue;

    try {
      const updatedProd = await Product.findOneAndUpdate(
        filter,
        { $inc: { stock: entry.qty } },
        { new: true }
      );

      if (updatedProd && entry.variantQtys && entry.variantQtys.size > 0 && Array.isArray(updatedProd.variants) && updatedProd.variants.length > 0) {
        let varChanged = false;
        updatedProd.variants.forEach((v) => {
          const vKey = String(v.label || "").trim().toLowerCase();
          const vAdd = entry.variantQtys.get(vKey);
          if (vAdd) {
            v.stock = Math.max(0, (typeof v.stock === "number" ? v.stock : 0) + vAdd);
            varChanged = true;
          }
        });
        if (varChanged) await updatedProd.save();
      }

      if (updatedProd && updatedProd.stock > 0 && updatedProd.status === "rasprodato") {
        await Product.updateOne(
          { _id: updatedProd._id, status: "rasprodato", stock: { $gt: 0 } },
          { $set: { status: "aktivan" } }
        );
      }
    } catch (err) {
      console.error("Greška pri vraćanju zaliha za artikal:", entry, err.message);
    }
  }
}

/**
 * Ponovo skida količinu sa stanja kada se prethodno otkazana porudžbina vrati u aktivan status.
 */
async function deductStockForOrder(items) {
  const aggregated = aggregateOrderItems(items);
  const deducted = [];

  for (const entry of aggregated) {
    const filter = buildProductLookupFilter(entry);
    if (!filter) continue;

    const prod = await Product.findOne(filter);
    if (!prod) continue;

    const updatedProd = await Product.findOneAndUpdate(
      {
        _id: prod._id,
        status: { $nin: ["neaktivan", "rasprodato"] },
        stock: { $gte: entry.qty },
      },
      { $inc: { stock: -entry.qty } },
      { new: true }
    );

    if (!updatedProd) {
      // Rollback već skinutih stavki
      for (const prev of deducted) {
        const restored = await Product.findOneAndUpdate(
          { _id: prev.productId },
          { $inc: { stock: prev.qty } },
          { new: true }
        );
        if (restored && restored.stock > 0 && restored.status === "rasprodato") {
          await Product.updateOne(
            { _id: prev.productId, status: "rasprodato", stock: { $gt: 0 } },
            { $set: { status: "aktivan" } }
          );
        }
      }
      const err = new Error(
        `Nema dovoljno zaliha na stanju za ponovno aktiviranje porudžbine (artikal: "${prod.title}", dostupno: ${prod.stock || 0}, potrebno: ${entry.qty}).`
      );
      err.statusCode = 400;
      throw err;
    }

    if (updatedProd && entry.variantQtys && entry.variantQtys.size > 0 && Array.isArray(updatedProd.variants) && updatedProd.variants.length > 0) {
      let varChanged = false;
      updatedProd.variants.forEach((v) => {
        const vKey = String(v.label || "").trim().toLowerCase();
        const vSub = entry.variantQtys.get(vKey);
        if (vSub) {
          v.stock = Math.max(0, (typeof v.stock === "number" ? v.stock : 0) - vSub);
          varChanged = true;
        }
      });
      if (varChanged) await updatedProd.save();
    }

    if (updatedProd.stock <= 0 && updatedProd.status !== "rasprodato") {
      await Product.updateOne(
        { _id: prod._id, stock: { $lte: 0 }, status: { $ne: "neaktivan" } },
        { $set: { status: "rasprodato" } }
      );
    }

    deducted.push({ productId: prod._id, qty: entry.qty, variantQtys: entry.variantQtys });
  }
}

async function getOrders(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 200);
    const status = typeof req.query.status === "string" ? req.query.status.trim().slice(0, 40) : null;
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";

    const query = {};
    if (status && status !== "sve" && status !== "all") {
      query.status = status;
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearch, "i");
      query.$or = [
        { orderNumber: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { phoneNumber: searchRegex },
        { email: searchRegex },
        { city: searchRegex },
      ];
    }

    const skip = (page - 1) * limit;

    const [orders, totalCount, revResult, statusAgg] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      Order.countDocuments(query).exec(),
      Order.aggregate([
        { $match: { status: { $ne: "otkazano" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const totalRevenue = revResult.length > 0 ? (revResult[0].total || 0) : 0;

    const counts = {
      all: 0,
      na_cekanju: 0,
      obradjeno: 0,
      poslato: 0,
      isporuceno: 0,
      otkazano: 0,
    };

    let totalAll = 0;
    (statusAgg || []).forEach((item) => {
      const st = item._id;
      const c = item.count || 0;
      totalAll += c;
      if (counts.hasOwnProperty(st)) {
        counts[st] = c;
      }
    });
    counts.all = totalAll;

    res.json({
      success: true,
      orders,
      totalCount,
      totalRevenue,
      statusCounts: counts,
      page,
      totalPages: Math.ceil(totalCount / limit) || 1,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getOrderById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Neispravan ID porudžbine." });
    }
    const order = await Order.findById(id).lean().exec();
    if (!order) {
      return res.status(404).json({ success: false, message: "Porudžbina nije pronađena." });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateOrder(req, res) {
  try {
    const { id } = req.params;
    const { status, paymentStatus, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Neispravan ID porudžbine." });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Porudžbina nije pronađena." });
    }

    const previousStatus = order.status;

    if (status !== undefined) {
      const cleanStatus = String(status).trim();
      if (!VALID_ORDER_STATUSES.has(cleanStatus)) {
        return res.status(400).json({
          success: false,
          message: "Neispravan status porudžbine.",
        });
      }

      if (cleanStatus !== previousStatus) {
        if (previousStatus !== "otkazano" && cleanStatus === "otkazano") {
          // Porudžbina prelazi u "otkazano" -> vrati zalihe na stanje i aktiviraj proizvod ako je bio rasprodat
          await restoreStockForOrder(order.items);
        } else if (previousStatus === "otkazano" && cleanStatus !== "otkazano") {
          // Otkazana porudžbina se ponovo aktivira -> skini zalihe sa stanja
          await deductStockForOrder(order.items);
        }
        order.status = cleanStatus;
      }
    }

    if (paymentStatus && typeof paymentStatus === "string") {
      order.paymentStatus = paymentStatus.trim();
    }
    if (note !== undefined && typeof note === "string") {
      order.note = note.trim();
    }

    await order.save();
    if (typeof getProducts.clearCache === "function") getProducts.clearCache();
    if (typeof getCategories.clearCache === "function") getCategories.clearCache();
    res.json({ success: true, message: "Porudžbina ažurirana.", order });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
}

async function deleteOrder(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Neispravan ID porudžbine." });
    }
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Porudžbina nije pronađena." });
    }

    // Ako porudžbina nije već bila otkazana, vrati zalihe na stanje pre brisanja
    if (order.status !== "otkazano") {
      await restoreStockForOrder(order.items);
    }

    await Order.findByIdAndDelete(id);
    if (typeof getProducts.clearCache === "function") getProducts.clearCache();
    if (typeof getCategories.clearCache === "function") getCategories.clearCache();
    res.json({ success: true, message: "Porudžbina obrisana i zalihe su vraćene na stanje." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
};

