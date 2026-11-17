const mongoose = require("mongoose");
const Product = require("../../db/proizvodi");
const { getAllImagesFromFolder, clearImageCache } = require("../../utils/imageHelper");
const { searchProductsWithEngine, buildDiacriticPattern } = require("../../utils/searchEngine");

// Fast in-memory cache (po uzoru na Rade getRandomProducts.js)
let cachedPublicProducts = null;
let lastCacheTime = 0;
let cachePromise = null;
const CACHE_TTL_MS = 15 * 1000; // 15s brzi in-memory keš + instant clearCache pri izmenama

function transformProduct(p, images) {
  const imgs = Array.isArray(images) ? images : [];
  const priceNum = Number(p.price) || 0;
  const oldPriceNum = p.oldPrice ? Number(p.oldPrice) : null;
  const hasDiscount = oldPriceNum && oldPriceNum > priceNum;
  const percentage = hasDiscount
    ? `${Math.round(((oldPriceNum - priceNum) / oldPriceNum) * 100)}%`
    : "/";
  const savings = hasDiscount ? `${Math.round(oldPriceNum - priceNum)} RSD` : "/";

  const variantsArr = Array.isArray(p.variants) ? p.variants : [];
  const baseSizes = Array.isArray(p.sizes) && p.sizes.length
    ? p.sizes
    : variantsArr.map((v) => v.label).filter(Boolean);

  return {
    _id: p._id,
    id: p.code || String(p._id),
    code: p.code,
    slug: p.slug,
    title: p.title,
    price: priceNum,
    oldPrice: oldPriceNum,
    salePrice: hasDiscount ? String(priceNum) : "/",
    percentage,
    savings,
    variantType: p.variantType || "kg",
    variants: variantsArr,
    petType: Array.isArray(p.petType) ? p.petType : [],
    lifeStage: p.lifeStage || "",
    flavor: p.flavor || "",
    specialDiet: Array.isArray(p.specialDiet) ? p.specialDiet : [],
    category: p.category || [],
    subcategory: p.subcategory || [],
    subcategory2: p.subcategory2 || [],
    type: Array.isArray(p.subcategory2) && p.subcategory2.length ? p.subcategory2[0] : "",
    sizes: baseSizes,
    colors: (p.colors || []).map((c) => {
      const fallbackStk = typeof p.stock === "number" ? p.stock : 10;
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
    material: p.material || "",
    brand: p.brand || "",
    technicalData: p.technicalData || { labels: [], features: [] },
    description: p.description || "",
    status: p.status || "aktivan",
    stock: typeof p.stock === "number" ? p.stock : 10,
    isFeatured: p.isFeatured || false,
    isBestseller: p.isBestseller || false,
    mainImages: p.mainImages,
    images: imgs,
    imageUrl: imgs[0] || "/img/customPageBcg.png",
    createdAt: p.createdAt,
  };
}

async function loadAllPublicProducts() {
  const now = Date.now();
  if (cachedPublicProducts && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedPublicProducts;
  }
  if (cachePromise) {
    return cachePromise;
  }
  if (mongoose.connection.readyState !== 1) {
    return [];
  }

  cachePromise = (async () => {
    try {
      const products = await Product.find({
        status: { $in: ["aktivan", "rasprodato"] },
      })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      const transformed = await Promise.all(
        products.map(async (p) => {
          let images = [];
          if (p.mainImages) {
            try {
              images = await getAllImagesFromFolder(p.mainImages);
            } catch (e) {}
          }
          return transformProduct(p, images);
        })
      );

      cachedPublicProducts = transformed;
      lastCacheTime = Date.now();
      return transformed;
    } finally {
      cachePromise = null;
    }
  })();

  return cachePromise;
}

async function loadAllActiveProducts() {
  const all = await loadAllPublicProducts();
  return all.filter((p) => p.status === "aktivan");
}

function filterAndSortCachedProducts(allProducts, options = {}) {
  const {
    searchQuery = "",
    category = null,
    subcategory = null,
    subcategory2 = null,
    sizes = null,
    colors = null,
    tag = null,
    sort = "newest",
    page = 1,
    limit = 20,
    priceMin = null,
    priceMax = null,
  } = options;

  let result = allProducts.slice();

  // 1. Kategorija
  if (
    category &&
    category !== "sve" &&
    category !== "all" &&
    category !== "svi-proizvodi" &&
    category !== "kolekcija"
  ) {
    const lowerCat = String(category).toLowerCase().trim();
    if (lowerCat === "akcija" || lowerCat === "sale") {
      result = result.filter((p) => {
        if (p.oldPrice && p.oldPrice > 0 && p.oldPrice > p.price) return true;
        return Array.isArray(p.variants) && p.variants.some((v) => v.oldPrice && v.oldPrice > 0 && v.oldPrice > v.price);
      });
    } else if (lowerCat === "bestseller") {
      result = result.filter((p) => Boolean(p.isBestseller));
    } else if (lowerCat === "noviteti" || lowerCat === "novo") {
      result = result.filter((p) => Boolean(p.isFeatured));
    } else {
      const catPattern = buildDiacriticPattern(category.replace(/-/g, " "));
      const catRegex = new RegExp(catPattern, "i");
      result = result.filter((p) => {
        const cats = Array.isArray(p.category) ? p.category : [p.category];
        return cats.some((c) => c && catRegex.test(String(c)));
      });
    }
  }

  // 2. Potkategorija
  if (subcategory) {
    const subPattern = buildDiacriticPattern(subcategory.replace(/-/g, " "));
    const subRegex = new RegExp(subPattern, "i");
    result = result.filter((p) => {
      const subs = Array.isArray(p.subcategory) ? p.subcategory : [p.subcategory];
      return subs.some((s) => s && subRegex.test(String(s)));
    });
  }

  // 2b. Potkategorija 2
  if (subcategory2) {
    const sub2Pattern = buildDiacriticPattern(subcategory2.replace(/-/g, " "));
    const sub2Regex = new RegExp(sub2Pattern, "i");
    result = result.filter((p) => {
      const subs2 = Array.isArray(p.subcategory2) ? p.subcategory2 : [p.subcategory2];
      return subs2.some((s) => s && sub2Regex.test(String(s)));
    });
  }

  // 3. Cena
  if (priceMin !== null && !isNaN(priceMin)) {
    result = result.filter((p) => {
      if ((p.price || 0) >= priceMin) return true;
      return Array.isArray(p.variants) && p.variants.some((v) => (Number(v.price) || 0) >= priceMin);
    });
  }
  if (priceMax !== null && !isNaN(priceMax)) {
    result = result.filter((p) => {
      if ((p.price || 0) <= priceMax) return true;
      return Array.isArray(p.variants) && p.variants.some((v) => (Number(v.price) || 0) <= priceMax);
    });
  }

  // 4. Veličine
  if (sizes) {
    const sizeArr = Array.isArray(sizes)
      ? sizes
      : String(sizes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (sizeArr.length > 0) {
      const sizeRegexes = sizeArr
        .slice(0, 20)
        .map((s) => String(s).slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .map((s) => new RegExp(`^${s}$`, "i"));
      result = result.filter((p) => {
        const pSizes = Array.isArray(p.sizes) ? p.sizes : [];
        return pSizes.some((ps) => sizeRegexes.some((rx) => rx.test(String(ps))));
      });
    }
  }

  // 5. Boje
  if (colors) {
    const colorArr = Array.isArray(colors)
      ? colors
      : String(colors)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
    if (colorArr.length > 0) {
      const colorRegexes = colorArr.map((c) => new RegExp(buildDiacriticPattern(c), "i"));
      result = result.filter((p) => {
        const pColors = Array.isArray(p.colors) ? p.colors : [];
        return pColors.some((pc) => {
          const cName = typeof pc === "object" ? pc.name || "" : String(pc || "");
          return colorRegexes.some((rx) => rx.test(cName));
        });
      });
    }
  }

  // 6. Oznake (tag)
  if (tag) {
    const tags = String(tag)
      .toLowerCase()
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 0) {
      result = result.filter((p) =>
        tags.some((t) => {
          if (t === "akcija" || t === "sale") {
            if (p.oldPrice && p.oldPrice > 0 && p.oldPrice > p.price) return true;
            return Array.isArray(p.variants) && p.variants.some((v) => v.oldPrice && v.oldPrice > 0 && v.oldPrice > v.price);
          }
          if (t === "bestseller") return Boolean(p.isBestseller);
          if (t === "novo" || t === "featured") return Boolean(p.isFeatured);
          return true;
        })
      );
    }
  }

  // 7. Pretraga
  if (searchQuery) {
    const rawPattern = buildDiacriticPattern(searchQuery);
    const searchRegex = new RegExp(rawPattern, "i");
    result = result.filter((p) => {
      if (searchRegex.test(p.title || "")) return true;
      if (searchRegex.test(p.code || "")) return true;
      if (searchRegex.test(p.brand || "")) return true;
      if (searchRegex.test(p.flavor || "")) return true;
      if (searchRegex.test(p.lifeStage || "")) return true;
      if (searchRegex.test(p.description || "")) return true;
      const petArr = Array.isArray(p.petType) ? p.petType : [p.petType];
      if (petArr.some((pt) => pt && searchRegex.test(String(pt)))) return true;
      const dietArr = Array.isArray(p.specialDiet) ? p.specialDiet : [p.specialDiet];
      if (dietArr.some((d) => d && searchRegex.test(String(d)))) return true;
      const cats = Array.isArray(p.category) ? p.category : [p.category];
      return cats.some((c) => c && searchRegex.test(String(c)));
    });
  }

  // 8. Sortiranje
  if (sort === "price-asc") {
    result.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sort === "price-desc") {
    result.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sort === "title-asc") {
    result.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "sr"));
  } else if (sort === "oldest") {
    result.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  } else {
    result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  const totalCount = result.length;
  const skip = (page - 1) * limit;
  const paginated = result.slice(skip, skip + limit);

  return { products: paginated, totalCount };
}

async function getProducts(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 1000);
    const searchQuery = (req.query.search || "").trim();
    const category = req.query.category || null;
    const subcategory = req.query.subcategory || null;
    const subcategory2 = req.query.subcategory2 || null;
    const sizes = req.query.sizes || req.query.size || null;
    const colors = req.query.colors || req.query.color || null;
    const tag = req.query.tag || null;
    const sort = req.query.sort || "newest";
    const priceMin =
      req.query.priceMin !== undefined ? parseFloat(req.query.priceMin) : null;
    const priceMax =
      req.query.priceMax !== undefined ? parseFloat(req.query.priceMax) : null;

    // Ako je admin poziv (?admin=1 i req.authUser postoji), prikaži sve iz baze direktno
    const isAdmin = Boolean(req.authUser && req.query.admin === "1");

    if (!isAdmin) {
      const allActive = await loadAllActiveProducts();
      const { products: transformedProducts, totalCount } = filterAndSortCachedProducts(
        allActive,
        {
          searchQuery,
          category,
          subcategory,
          subcategory2,
          sizes,
          colors,
          tag,
          sort,
          page,
          limit,
          priceMin,
          priceMax,
        }
      );

      const scopeCounts = {
        all: allActive.length,
        active: allActive.filter((p) => {
          const s = typeof p.stock === "number" ? p.stock : 10;
          return s > 0;
        }).length,
        featured: allActive.filter((p) => Boolean(p.isFeatured)).length,
        outOfStock: 0,
        stockAlerts: 0,
      };

      return res.json({
        success: true,
        products: transformedProducts,
        data: {
          products: transformedProducts,
          count: totalCount,
          page: page,
          totalPages: Math.ceil(totalCount / limit) || 1,
          scopeCounts,
        },
      });
    }

    const requestedStatus =
      typeof req.query.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "";
    const requestedScope =
      typeof req.query.scope === "string"
        ? req.query.scope.trim().toLowerCase()
        : "";

    const stockAlertsQuery = {
      $or: [
        { status: "rasprodato" },
        { stock: { $lte: 0 } },
        { variants: { $elemMatch: { stock: { $lte: 0 } } } },
        { colors: { $elemMatch: { stock: { $lte: 0 } } } },
      ],
    };

    let baseFilter = {};
    if (requestedScope === "stock_alerts") {
      baseFilter = stockAlertsQuery;
    } else if (requestedScope === "out_of_stock") {
      baseFilter = { $or: [{ status: "rasprodato" }, { stock: { $lte: 0 } }] };
    } else if (requestedStatus && requestedStatus !== "sve" && requestedStatus !== "all") {
      baseFilter = { status: requestedStatus };
    }

    const activeInStockQuery = {
      status: "aktivan",
      $or: [{ stock: { $gt: 0 } }, { stock: { $exists: false } }],
    };
    const outOfStockQuery = { $or: [{ status: "rasprodato" }, { stock: { $lte: 0 } }] };

    const [
      { products, totalCount },
      countAll,
      countActiveInStock,
      countFeatured,
      countOutOfStock,
      countStockAlerts,
    ] = await Promise.all([
      searchProductsWithEngine(Product, {
        searchQuery,
        category,
        subcategory,
        subcategory2,
        sizes,
        colors,
        tag,
        sort,
        page,
        limit,
        priceMin,
        priceMax,
        baseFilter,
      }),
      Product.countDocuments({}),
      Product.countDocuments(activeInStockQuery),
      Product.countDocuments({ isFeatured: true }),
      Product.countDocuments(outOfStockQuery),
      Product.countDocuments(stockAlertsQuery),
    ]);

    const scopeCounts = {
      all: countAll,
      active: countActiveInStock,
      featured: countFeatured,
      outOfStock: countOutOfStock,
      stockAlerts: countStockAlerts,
    };

    const transformedProducts = await Promise.all(
      products.map(async (p) => {
        let images = [];
        if (p.mainImages) {
          try {
            images = await getAllImagesFromFolder(p.mainImages);
          } catch (e) {}
        }
        return transformProduct(p, images);
      })
    );

    res.json({
      success: true,
      products: transformedProducts,
      data: {
        products: transformedProducts,
        count: totalCount,
        page: page,
        totalPages: Math.ceil(totalCount / limit) || 1,
        scopeCounts,
      },
    });
  } catch (err) {
    console.error("Error in /api/products:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

getProducts.clearCache = () => {
  cachedPublicProducts = null;
  lastCacheTime = 0;
  clearImageCache();
};

getProducts.warmCache = () => {
  return loadAllPublicProducts().catch(() => {});
};

getProducts.loadAllPublicProducts = loadAllPublicProducts;
getProducts.loadAllActiveProducts = loadAllActiveProducts;
getProducts.getCachedProducts = () => cachedPublicProducts;

module.exports = getProducts;
