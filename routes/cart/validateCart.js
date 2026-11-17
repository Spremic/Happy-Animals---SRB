const mongoose = require("mongoose");
const Product = require("../../db/proizvodi");
const { resolveVariantForItem } = require("../../utils/productVariants");

/**
 * Validacija stavki iz korpe prema stanju u MongoDB bazi
 * Proverava da li su artikli izbrisani, neaktivni ili rasprodati (stock <= 0)
 */
async function validateCart(req, res) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({
        success: true,
        hasUnavailable: false,
        unavailableItems: [],
        validItems: [],
        adjustedSubtotal: 0,
        adjustedShipping: 0,
        adjustedTotal: 0,
      });
    }

    const unavailableItems = [];
    const validItems = [];
    const usedStockMap = new Map();
    let adjustedSubtotal = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item || typeof item !== "object") continue;

      const rawId = String(item.productId || item.id || "").trim();
      const rawCode = String(item.code || "").trim().toLowerCase();
      const rawSlug = String(item.slug || "").trim().toLowerCase();
      const rawTitle = String(item.title || item.name || "").trim();

      const lookupQueries = [];
      if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
        lookupQueries.push({ _id: rawId });
      }
      if (rawCode) {
        lookupQueries.push({ code: rawCode });
      }
      if (rawSlug) {
        lookupQueries.push({ slug: rawSlug });
      }
      if (rawTitle) {
        lookupQueries.push({
          title: new RegExp("^" + rawTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
        });
      }

      const product = lookupQueries.length > 0
        ? await Product.findOne({ $or: lookupQueries }).lean()
        : null;

      const itemImg = item.img || item.image || "/img/customPageBcg.png";
      const itemSize = String(item.variant || item.size || item.velicina || "Standard").trim();
      const itemColor = String(item.color || item.boja || "Standard").trim();
      const itemQty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const itemPrice = parseFloat(item.price) || 0;

      // 1. Proizvod je izbrisan iz baze ili neaktivan
      if (!product || product.status === "neaktivan") {
        unavailableItems.push({
          id: item.id !== undefined ? item.id : `unavail-${idx}`,
          productId: rawId,
          code: item.code || "",
          slug: item.slug || "",
          title: item.title || "Artikal",
          variant: itemSize,
          size: itemSize,
          color: itemColor,
          quantity: itemQty,
          price: itemPrice,
          img: itemImg,
          reason: "deleted",
          reasonText: "Artikal više ne postoji u ponudi",
        });
        continue;
      }

      // 2. Proizvod, izabrana varijanta ili izabrana boja su rasprodati ili nema lagera
      const resolvedVariant = resolveVariantForItem(product, item);
      const verifiedPrice = resolvedVariant.price;
      const resolvedVariantLabel = resolvedVariant.variantLabel || itemSize;
      const resolvedColorName = resolvedVariant.hasColors ? (resolvedVariant.colorName || itemColor) : itemColor;
      const currentStock = typeof product.stock === "number" ? product.stock : 10;
      const variantStock = resolvedVariant.hasVariants && typeof resolvedVariant.stock === "number"
        ? resolvedVariant.stock
        : currentStock;
      const colorStock = resolvedVariant.hasColors && typeof resolvedVariant.colorStock === "number"
        ? resolvedVariant.colorStock
        : currentStock;
      const effectiveStock = Math.min(currentStock, variantStock, colorStock);
      const prodKey = String(product._id);
      const varKey = `${prodKey}::v::${String(resolvedVariantLabel).toLowerCase()}`;
      const colKey = `${prodKey}::c::${String(resolvedColorName).toLowerCase()}`;
      const alreadyUsedTotal = usedStockMap.get(prodKey) || 0;
      const alreadyUsedVar = resolvedVariant.hasVariants ? (usedStockMap.get(varKey) || 0) : 0;
      const alreadyUsedCol = resolvedVariant.hasColors ? (usedStockMap.get(colKey) || 0) : 0;
      const remainingStock = Math.max(
        0,
        Math.min(
          currentStock - alreadyUsedTotal,
          resolvedVariant.hasVariants ? (variantStock - alreadyUsedVar) : currentStock,
          resolvedVariant.hasColors ? (colorStock - alreadyUsedCol) : currentStock
        )
      );

      if (product.status === "rasprodato" || currentStock <= 0 || variantStock <= 0 || colorStock <= 0) {
        unavailableItems.push({
          id: item.id !== undefined ? item.id : `unavail-${idx}`,
          productId: prodKey,
          code: product.code || item.code || "",
          slug: product.slug || item.slug || "",
          title: product.title || item.title || "Artikal",
          variant: resolvedVariantLabel,
          size: resolvedVariantLabel,
          color: resolvedColorName,
          quantity: itemQty,
          price: verifiedPrice || parseFloat(product.price) || itemPrice,
          img: (product.imageUrl || (Array.isArray(product.images) && product.images[0])) || itemImg,
          reason: "sold_out",
          reasonText: "Trenutno rasprodato",
        });
        continue;
      }

      if (remainingStock <= 0) {
        unavailableItems.push({
          id: item.id !== undefined ? item.id : `unavail-${idx}`,
          productId: prodKey,
          code: product.code || item.code || "",
          slug: product.slug || item.slug || "",
          title: product.title || item.title || "Artikal",
          variant: resolvedVariantLabel,
          size: resolvedVariantLabel,
          color: resolvedColorName,
          quantity: itemQty,
          price: verifiedPrice || parseFloat(product.price) || itemPrice,
          img: (product.imageUrl || (Array.isArray(product.images) && product.images[0])) || itemImg,
          reason: "insufficient_stock",
          reasonText: `Na stanju ima samo ${effectiveStock} komada`,
        });
        continue;
      }

      // 3. Proizvod je dostupan
      const verifiedQty = Math.min(itemQty, remainingStock);
      usedStockMap.set(prodKey, alreadyUsedTotal + verifiedQty);
      if (resolvedVariant.hasVariants) usedStockMap.set(varKey, alreadyUsedVar + verifiedQty);
      if (resolvedVariant.hasColors) usedStockMap.set(colKey, alreadyUsedCol + verifiedQty);
      const verifiedImg = (product.imageUrl || (Array.isArray(product.images) && product.images[0])) || itemImg;

      adjustedSubtotal += verifiedPrice * verifiedQty;

      validItems.push({
        ...item,
        id: item.id,
        productId: prodKey,
        code: product.code,
        slug: product.slug,
        title: product.title,
        price: verifiedPrice,
        priceFormatted: verifiedPrice.toLocaleString("sr-RS") + " RSD",
        quantity: verifiedQty,
        stock: effectiveStock,
        status: product.status || "aktivan",
        img: verifiedImg,
        variant: resolvedVariantLabel,
        size: resolvedVariantLabel,
        color: resolvedColorName,
      });
    }

    const adjustedShipping = adjustedSubtotal >= 3000 || adjustedSubtotal === 0 ? 0 : 350;
    const adjustedTotal = adjustedSubtotal + adjustedShipping;

    return res.json({
      success: true,
      hasUnavailable: unavailableItems.length > 0,
      unavailableItems,
      validItems,
      adjustedSubtotal,
      adjustedShipping,
      adjustedTotal,
    });
  } catch (err) {
    console.error("Greška pri validaciji korpe:", err);
    return res.status(500).json({
      success: false,
      message: "Došlo je do greške pri proveri dostupnosti artikala.",
    });
  }
}

module.exports = validateCart;

