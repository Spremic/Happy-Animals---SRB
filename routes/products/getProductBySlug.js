const mongoose = require("mongoose");
const Product = require("../../db/proizvodi");
const { getAllImagesFromFolder } = require("../../utils/imageHelper");
const getProducts = require("./getProducts");

async function getProductBySlug(req, res) {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
    if (!slug || slug.length > 150) {
      return res.status(400).json({ success: false, message: "Nedostaje ili je neispravan slug." });
    }

    let cleanSlug = slug.toLowerCase();
    try {
      cleanSlug = decodeURIComponent(slug).toLowerCase();
    } catch (e) {}

    const escapedTitleSlug = cleanSlug
      .replace(/[-_]/g, " ")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const titleRegex = new RegExp("^" + escapedTitleSlug + "$", "i");

    // 1. Instant 0ms provera u in-memory kešu aktivnih/rasprodatih proizvoda (kao u projektu Rade)
    if (!req.authUser) {
      const publicProducts = await getProducts.loadAllPublicProducts();
      const cachedMatch = publicProducts.find(
        (p) =>
          (p._id && String(p._id) === slug) ||
          (p.slug && p.slug.toLowerCase() === cleanSlug) ||
          (p.code && p.code.toLowerCase() === cleanSlug) ||
          (p.slug && p.slug.toLowerCase() === slug.toLowerCase()) ||
          (p.code && p.code.toLowerCase() === slug.toLowerCase()) ||
          (p.title && titleRegex.test(p.title))
      );
      if (cachedMatch) {
        return res.json({ success: true, product: cachedMatch });
      }
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(404).json({ success: false, message: "Proizvod nije pronađen." });
    }

    const statusFilter = req.authUser ? {} : { status: { $ne: "neaktivan" } };
    const orFilters = [
      { slug: cleanSlug },
      { code: cleanSlug },
      { slug: slug.toLowerCase() },
      { code: slug.toLowerCase() },
      { title: titleRegex },
    ];
    if (mongoose.Types.ObjectId.isValid(slug)) {
      orFilters.push({ _id: slug });
    }

    const product = await Product.findOne({
      ...statusFilter,
      $or: orFilters,
    })
      .lean()
      .exec();

    if (!product) {
      return res.status(404).json({ success: false, message: "Proizvod nije pronađen." });
    }

    let images = [];
    if (product.mainImages) {
      try {
        images = await getAllImagesFromFolder(product.mainImages);
      } catch (e) {}
    }

    const variantsArr = Array.isArray(product.variants) ? product.variants : [];
    const baseSizes = Array.isArray(product.sizes) && product.sizes.length
      ? product.sizes
      : variantsArr.map((v) => v.label).filter(Boolean);

    const priceNum = Number(product.price) || 0;
    const oldPriceNum = product.oldPrice ? Number(product.oldPrice) : null;
    const hasDiscount = oldPriceNum && oldPriceNum > priceNum;
    const transformed = {
      ...product,
      stock: typeof product.stock === "number" ? product.stock : 10,
      id: product.code || String(product._id),
      price: priceNum,
      oldPrice: oldPriceNum,
      salePrice: hasDiscount ? String(priceNum) : "/",
      percentage: hasDiscount ? `${Math.round(((oldPriceNum - priceNum) / oldPriceNum) * 100)}%` : "/",
      savings: hasDiscount ? `${Math.round(oldPriceNum - priceNum)} RSD` : "/",
      type: Array.isArray(product.subcategory2) && product.subcategory2.length ? product.subcategory2[0] : "",
      variantType: product.variantType || "kg",
      variants: variantsArr,
      sizes: baseSizes,
      petType: Array.isArray(product.petType) ? product.petType : [],
      flavor: product.flavor || "",
      brand: product.brand || "",
      technicalData: product.technicalData || { labels: [], features: [] },
      images: images,
      imageUrl: images[0] || "/img/customPageBcg.png",
      colors: (product.colors || []).map((c) => {
        const fallbackStk = typeof product.stock === "number" ? product.stock : 10;
        if (typeof c === "string") {
          return { name: c, code: "#2c2527", hex: "#2c2527", stock: fallbackStk };
        }
        const colHex = c.code || c.hex || "#2c2527";
        const colStock = typeof c.stock === "number" ? c.stock : fallbackStk;
        return {
          name: c.name || "Boja",
          code: colHex,
          hex: colHex,
          stock: colStock,
        };
      }),
    };

    res.json({ success: true, product: transformed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = getProductBySlug;
