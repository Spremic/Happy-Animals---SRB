const mongoose = require("mongoose");
const GlavnaKategorija = require("../../db/glavna_kategorija");
const Product = require("../../db/proizvodi");

// In-memory cache (po uzoru na Rade getKategorijeStruktura.js)
let cachedCategories = null;
let lastFetchTime = 0;
let fetchPromise = null;
const CACHE_DURATION_MS = 60 * 1000; // 1 minut keš + instant clearCache pri izmenama

function formatCategoryName(str) {
  if (!str) return "";
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function fetchAndBuildCategories() {
  const now = Date.now();
  if (cachedCategories && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedCategories;
  }
  if (fetchPromise) {
    return fetchPromise;
  }
  if (mongoose.connection.readyState !== 1) {
    return [];
  }

  fetchPromise = (async () => {
    try {
      // Paralelno izvršavanje svih upita ka bazi (kao u projektu Rade)
      const [categories, counts, subcatsAgg, subcats2Agg] = await Promise.all([
        GlavnaKategorija.find().sort({ order: 1 }).lean().exec(),
        Product.aggregate([
          { $unwind: "$category" },
          {
            $group: {
              _id: { $toLower: "$category" },
              activeCount: {
                $sum: { $cond: [{ $eq: ["$status", "aktivan"] }, 1, 0] },
              },
              totalCount: { $sum: 1 },
            },
          },
        ]),
        Product.aggregate([
          { $match: { subcategory: { $exists: true, $ne: [] } } },
          { $unwind: "$category" },
          { $unwind: "$subcategory" },
          {
            $group: {
              _id: {
                cat: { $toLower: "$category" },
                subcat: { $toLower: "$subcategory" },
              },
              activeCount: {
                $sum: { $cond: [{ $eq: ["$status", "aktivan"] }, 1, 0] },
              },
              totalCount: { $sum: 1 },
            },
          },
          { $sort: { totalCount: -1 } },
        ]),
        Product.aggregate([
          { $match: { subcategory2: { $exists: true, $ne: [] } } },
          { $unwind: "$category" },
          {
            $unwind: {
              path: "$subcategory",
              preserveNullAndEmptyArrays: true,
            },
          },
          { $unwind: "$subcategory2" },
          {
            $group: {
              _id: {
                cat: { $toLower: "$category" },
                subcat: { $toLower: { $ifNull: ["$subcategory", ""] } },
                subcat2: { $toLower: "$subcategory2" },
              },
              activeCount: {
                $sum: { $cond: [{ $eq: ["$status", "aktivan"] }, 1, 0] },
              },
              totalCount: { $sum: 1 },
            },
          },
          { $sort: { totalCount: -1 } },
        ]),
      ]);

      const countMap = {};
      const totalCountMap = {};
      counts.forEach((c) => {
        if (c._id) {
          const key = String(c._id).trim();
          if (key) {
            countMap[key] = c.activeCount || 0;
            totalCountMap[key] = c.totalCount || 0;
          }
        }
      });

      const subcat2ByCatAndSub = {};
      const subcat2ByCat = {};
      subcats2Agg.forEach((item) => {
        const catKey = (item._id.cat || "").trim();
        const subKey = (item._id.subcat || "").trim();
        const sub2Raw = (item._id.subcat2 || "").trim();
        if (!catKey || !sub2Raw) return;

        const slug2 = sub2Raw.toLowerCase().replace(/[\s_]+/g, "-");
        const entry2 = {
          name: formatCategoryName(sub2Raw),
          slug: slug2,
          raw: sub2Raw,
          parentSubcategory: subKey,
          count: item.activeCount || 0,
          totalCount: item.totalCount || 0,
        };

        if (!subcat2ByCat[catKey]) subcat2ByCat[catKey] = [];
        const existingInCat = subcat2ByCat[catKey].find((s) => s.slug === slug2);
        if (!existingInCat) {
          subcat2ByCat[catKey].push({ ...entry2 });
        } else {
          existingInCat.count += entry2.count;
          existingInCat.totalCount += entry2.totalCount;
        }

        if (subKey) {
          const comboKey = `${catKey}::${subKey}`;
          if (!subcat2ByCatAndSub[comboKey]) subcat2ByCatAndSub[comboKey] = [];
          if (!subcat2ByCatAndSub[comboKey].some((s) => s.slug === slug2)) {
            subcat2ByCatAndSub[comboKey].push(entry2);
          }
        }
      });

      const subcatMap = {};
      subcatsAgg.forEach((item) => {
        const catKey = (item._id.cat || "").trim();
        const subRaw = (item._id.subcat || "").trim();
        if (!catKey || !subRaw) return;
        if (!subcatMap[catKey]) subcatMap[catKey] = [];

        const slug = subRaw.toLowerCase().replace(/[\s_]+/g, "-");
        const comboKey = `${catKey}::${subRaw}`;
        if (!subcatMap[catKey].some((s) => s.slug === slug)) {
          subcatMap[catKey].push({
            name: formatCategoryName(subRaw),
            slug: slug,
            raw: subRaw,
            count: item.activeCount || 0,
            totalCount: item.totalCount || 0,
            subcategories2: subcat2ByCatAndSub[comboKey] || [],
          });
        }
      });

      // Obriši iz baze GlavnaKategorija sve zapise koji više nemaju nijedan proizvod
      const emptyCatIds = [];
      categories.forEach((cat) => {
        const catKey = (cat.glavnaKategorija || "").toLowerCase().trim();
        if (!totalCountMap[catKey] || totalCountMap[catKey] <= 0) {
          emptyCatIds.push(cat._id);
        }
      });
      if (emptyCatIds.length > 0) {
        GlavnaKategorija.deleteMany({ _id: { $in: emptyCatIds } }).catch(() => {});
      }

      const categoriesWithData = categories
        .filter((cat) => {
          const catKey = (cat.glavnaKategorija || "").toLowerCase().trim();
          return (totalCountMap[catKey] || 0) > 0;
        })
        .map((cat) => {
          const catKey = (cat.glavnaKategorija || "").toLowerCase().trim();
          const catName = cat.naziv || formatCategoryName(catKey);
          return {
            ...cat,
            glavnaKategorija: catKey,
            slug: catKey,
            naziv: catName,
            name: catName,
            count: countMap[catKey] || 0,
            totalCount: totalCountMap[catKey] || 0,
            subcategories: (subcatMap[catKey] || []).filter((s) => (s.totalCount || 0) > 0),
            subcategories2: (subcat2ByCat[catKey] || []).filter((s) => (s.totalCount || 0) > 0),
          };
        });

      // Proveri da li ima neka kategorija iz proizvoda koja nedostaje u GlavnaKategorija
      const existingSlugs = new Set(categoriesWithData.map((c) => c.glavnaKategorija));
      Object.keys(totalCountMap).forEach((catKey) => {
        if (!existingSlugs.has(catKey) && totalCountMap[catKey] > 0) {
          const catName = formatCategoryName(catKey);
          categoriesWithData.push({
            glavnaKategorija: catKey,
            slug: catKey,
            naziv: catName,
            name: catName,
            order: 99,
            count: countMap[catKey] || 0,
            totalCount: totalCountMap[catKey] || 0,
            subcategories: (subcatMap[catKey] || []).filter((s) => (s.totalCount || 0) > 0),
            subcategories2: (subcat2ByCat[catKey] || []).filter((s) => (s.totalCount || 0) > 0),
          });
        }
      });

      cachedCategories = categoriesWithData;
      lastFetchTime = Date.now();
      return categoriesWithData;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

async function getCategories(req, res) {
  try {
    const categoriesWithData = await fetchAndBuildCategories();
    res.json({ success: true, categories: categoriesWithData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

getCategories.clearCache = () => {
  cachedCategories = null;
  lastFetchTime = 0;
};

getCategories.warmCache = () => {
  return fetchAndBuildCategories().catch(() => {});
};

getCategories.getCachedData = () => cachedCategories;

module.exports = getCategories;
