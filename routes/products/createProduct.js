const Product = require("../../db/proizvodi");
const GlavnaKategorija = require("../../db/glavna_kategorija");
const { generateSlug } = require("../../utils/slugify");
const { clearImageCache } = require("../../utils/imageHelper");
const getProducts = require("./getProducts");
const getCategories = require("../categories/getCategories");
const {
  normalizeVariantsInput,
  normalizeColorsInput,
  resolveVariantType,
  normalizeStringArray,
} = require("../../utils/productVariants");

function safeParseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
        }
      } catch (e) {}
    }
    return trimmed.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function safeParseColors(colors) {
  if (!colors) return [];
  if (Array.isArray(colors)) return colors;
  if (typeof colors === "string") {
    const trimmed = colors.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return trimmed
      .split(",")
      .map((c) => ({ name: c.trim(), hex: "#2c2527", code: "#2c2527" }))
      .filter((c) => Boolean(c.name));
  }
  return [];
}

async function createProduct(req, res) {
  try {
    const {
      code,
      title,
      status,
      price,
      oldPrice,
      stock,
      category,
      subcategory,
      subcategory2,
      sizes,
      variantType,
      variants,
      petType,
      flavor,
      colors,
      material,
      brand,
      technicalData,
      description,
      mainImages,
      keptImages,
      isFeatured,
      isBestseller,
    } = req.body;

    const trimmedCategory = safeParseArray(category);
    const trimmedSubcategory = safeParseArray(subcategory);
    const trimmedSubcategory2 = safeParseArray(subcategory2);
    const trimmedSizes = safeParseArray(sizes);
    const trimmedPetType = normalizeStringArray(safeParseArray(petType));

    if (!code || !title) {
      return res.status(400).json({
        success: false,
        message: "Šifra i naziv su obavezna polja.",
      });
    }

    const variantData = normalizeVariantsInput(variants, trimmedSizes, price, oldPrice, stock);
    const numPrice = variantData.price;
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Cena mora biti validan pozitivan broj.",
      });
    }

    if (!trimmedCategory.length) {
      return res.status(400).json({
        success: false,
        message: "Morate odabrati barem jednu kategoriju.",
      });
    }

    const cleanCode = String(code).trim().toLowerCase();
    const codeExists = await Product.findOne({ code: cleanCode }).lean().exec();
    if (codeExists) {
      return res.status(400).json({
        success: false,
        message: `Proizvod sa šifrom '${cleanCode}' već postoji.`,
      });
    }

    let parsedStock = 10;
    if (stock !== undefined) {
      const s = parseInt(stock, 10);
      if (!isNaN(s) && s >= 0) parsedStock = s;
    }
    const colorData = normalizeColorsInput(colors, parsedStock);
    if (variants !== undefined && Array.isArray(variantData.variants) && variantData.variants.length > 0 && typeof variantData.totalStock === "number") {
      parsedStock = variantData.totalStock;
    } else if (colors !== undefined && Array.isArray(colorData.colors) && colorData.colors.length > 0 && typeof colorData.totalStock === "number") {
      parsedStock = colorData.totalStock;
    }
    if (variantData.variants.length > 0 && colorData.colors.length > 0) {
      if (variantData.totalStock === 0 || colorData.totalStock === 0) {
        parsedStock = 0;
      }
    }

    let initialStatus = status || "aktivan";
    if (parsedStock === 0 && initialStatus !== "neaktivan") initialStatus = "rasprodato";

    let baseSlug = generateSlug(title) || generateSlug(cleanCode);
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await Product.findOne({ slug }).lean().exec();
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const targetFolder = mainImages ? String(mainImages).trim().toLowerCase() : cleanCode;

    const newProduct = await Product.create({
      code: cleanCode,
      title: String(title).trim(),
      slug,
      status: initialStatus,
      price: variantData.price,
      oldPrice: variantData.oldPrice !== null ? variantData.oldPrice : (oldPrice ? parseFloat(oldPrice) : undefined),
      stock: parsedStock,
      category: trimmedCategory,
      subcategory: trimmedSubcategory,
      subcategory2: trimmedSubcategory2,
      sizes: variantData.sizes,
      variantType: resolveVariantType(variantType),
      variants: variantData.variants,
      petType: trimmedPetType,
      flavor: flavor ? String(flavor).trim() : "",
      colors: colorData.colors,
      material: material ? String(material).trim() : "",
      brand: brand ? String(brand).trim() : "",
      technicalData: technicalData && typeof technicalData === "object"
        ? {
            labels: safeParseArray(technicalData.labels),
            features: safeParseArray(technicalData.features),
          }
        : { labels: [], features: [] },
      description: description ? String(description).trim() : "",
      mainImages: targetFolder,
      isFeatured: Boolean(isFeatured),
      isBestseller: Boolean(isBestseller),
    });

    // Sinhronizacija kategorije u GlavnaKategorija
    for (const cat of trimmedCategory) {
      const cleanCat = cat.toLowerCase().trim();
      let katDoc = await GlavnaKategorija.findOne({ glavnaKategorija: cleanCat });
      if (!katDoc) {
        await GlavnaKategorija.create({
          glavnaKategorija: cleanCat,
          naziv: cat,
          ads: [newProduct.code],
        });
      } else if (!katDoc.ads.includes(newProduct.code)) {
        katDoc.ads.push(newProduct.code);
        await katDoc.save();
      }
    }

    if (typeof clearImageCache === "function") clearImageCache(targetFolder);
    if (typeof getProducts.clearCache === "function") getProducts.clearCache();
    if (typeof getCategories.clearCache === "function") getCategories.clearCache();

    res.status(201).json({
      success: true,
      message: "Proizvod uspešno kreiran.",
      product: newProduct,
    });
  } catch (err) {
    console.error("Greška pri kreiranju proizvoda:", err);
    res.status(500).json({
      success: false,
      message: "Greška pri kreiranju proizvoda: " + err.message,
    });
  }
}

module.exports = createProduct;
