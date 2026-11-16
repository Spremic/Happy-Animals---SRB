/**
 * Search Engine & Relevance Ranking Utility for Happy Animals Pet Shop
 * Supports diacritics stripping (č, ć, đ, š, ž), typo tolerance, and fast MongoDB indexed queries.
 */

const DIACRITIC_MAP = {
  č: "c",
  ć: "c",
  đ: "dj",
  š: "s",
  ž: "z",
  Č: "c",
  Ć: "c",
  Đ: "dj",
  Š: "s",
  Ž: "z",
};

function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  let norm = text.trim().toLowerCase();
  for (const [char, replacement] of Object.entries(DIACRITIC_MAP)) {
    norm = norm.replaceAll(char, replacement);
  }
  return norm.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function buildDiacriticPattern(text) {
  if (!text) return "";
  const safeText = String(text).slice(0, 100);
  const chars = safeText.split("");
  return chars
    .map((c) => {
      const lower = c.toLowerCase();
      if (lower === "c") return "[cčćCČĆ]";
      if (lower === "s") return "[sšSŠ]";
      if (lower === "z") return "[zžZŽ]";
      if (lower === "d") return "(?:dj|dž|đ|d|DJ|DŽ|Đ|D)";
      if (c === "-" || c === " ") return "[-\\s]+";
      return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
}

async function searchProductsWithEngine(ProductModel, options = {}) {
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
    baseFilter = { status: "aktivan" },
  } = options;

  const mongoQuery = { ...baseFilter };

  if (category && category !== "sve" && category !== "all" && category !== "svi-proizvodi" && category !== "kolekcija") {
    const catPattern = buildDiacriticPattern(category.replace(/-/g, " "));
    mongoQuery.category = new RegExp(catPattern, "i");
  }

  if (subcategory) {
    const subPattern = buildDiacriticPattern(subcategory.replace(/-/g, " "));
    mongoQuery.subcategory = new RegExp(subPattern, "i");
  }

  if (subcategory2) {
    const sub2Pattern = buildDiacriticPattern(subcategory2.replace(/-/g, " "));
    mongoQuery.subcategory2 = new RegExp(sub2Pattern, "i");
  }

  if (priceMin !== null || priceMax !== null) {
    mongoQuery.price = {};
    if (priceMin !== null && !isNaN(priceMin)) {
      mongoQuery.price.$gte = priceMin;
    }
    if (priceMax !== null && !isNaN(priceMax)) {
      mongoQuery.price.$lte = priceMax;
    }
  }

  // Filter veličina (npr. sizes: ['S', 'M'])
  if (sizes) {
    const sizeArr = Array.isArray(sizes)
      ? sizes
      : String(sizes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (sizeArr.length > 0) {
      const escapedSizes = sizeArr
        .slice(0, 20)
        .map((s) => String(s).slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      mongoQuery.sizes = { $in: escapedSizes.map((s) => new RegExp(`^${s}$`, "i")) };
    }
  }

  // Filter boja (npr. colors: ['crna', 'bordo'])
  if (colors) {
    const colorArr = Array.isArray(colors) ? colors : String(colors).split(",").map(c => c.trim()).filter(Boolean);
    if (colorArr.length > 0) {
      const colorRegexes = colorArr.map(c => new RegExp(buildDiacriticPattern(c), "i"));
      mongoQuery.$and = mongoQuery.$and || [];
      mongoQuery.$and.push({
        $or: [
          { "colors.name": { $in: colorRegexes } },
          { colors: { $in: colorRegexes } }
        ]
      });
    }
  }

  // Filter posebnih oznaka (akcija, bestseller, novo)
  if (tag) {
    const lowerTag = String(tag).toLowerCase().trim();
    if (lowerTag === "akcija" || lowerTag === "sale") {
      mongoQuery.oldPrice = { $gt: 0 };
    } else if (lowerTag === "bestseller") {
      mongoQuery.isBestseller = true;
    } else if (lowerTag === "novo" || lowerTag === "featured") {
      mongoQuery.isFeatured = true;
    }
  }

  if (searchQuery) {
    const rawPattern = buildDiacriticPattern(searchQuery);
    const searchRegex = new RegExp(rawPattern, "i");
    mongoQuery.$or = [
      { title: searchRegex },
      { code: searchRegex },
      { brand: searchRegex },
      { flavor: searchRegex },
      { petType: searchRegex },
      { lifeStage: searchRegex },
      { specialDiet: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort === "price-asc") sortOption = { price: 1 };
  if (sort === "price-desc") sortOption = { price: -1 };
  if (sort === "title-asc") sortOption = { title: 1 };
  if (sort === "oldest") sortOption = { createdAt: 1 };

  const skip = (page - 1) * limit;

  const [products, totalCount] = await Promise.all([
    ProductModel.find(mongoQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    ProductModel.countDocuments(mongoQuery).exec(),
  ]);

  return { products, totalCount };
}

module.exports = {
  normalizeText,
  buildDiacriticPattern,
  searchProductsWithEngine,
};

