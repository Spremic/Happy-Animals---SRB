const path = require("path");
const fs = require("fs");
const fsPromises = fs.promises;
const sharp = require("sharp");
const mongoose = require("mongoose");
sharp.cache(false);

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

async function updateProduct(req, res) {
  try {
    const { id } = req.params;
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
      imagesChanged,
      finalImageUrls,
      isFeatured,
      isBestseller,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Neispravan ID proizvoda." });
    }

    const existingProduct = await Product.findById(id).exec();
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Proizvod nije pronađen." });
    }

    const oldCode = existingProduct.code;

    // Provera jedinstvenosti šifre ukoliko je izmenjena
    if (code && String(code).trim().toLowerCase() !== String(existingProduct.code).trim().toLowerCase()) {
      const cleanNewCode = String(code).trim().toLowerCase();
      const duplicateProduct = await Product.findOne({
        code: cleanNewCode,
        _id: { $ne: id },
      }).lean().exec();

      if (duplicateProduct) {
        return res.status(400).json({
          success: false,
          message: `Proizvod sa šifrom '${cleanNewCode}' već postoji.`,
        });
      }
      existingProduct.code = cleanNewCode;
    }

    // Ažuriranje naziva i slug-a
    if (title && String(title).trim() !== existingProduct.title) {
      existingProduct.title = String(title).trim();
      let baseSlug = generateSlug(existingProduct.title) || generateSlug(existingProduct.code);
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const existing = await Product.findOne({ slug, _id: { $ne: id } }).lean().exec();
        if (!existing) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      existingProduct.slug = slug;
    }

    if (status) existingProduct.status = status;
    if (price !== undefined) existingProduct.price = parseFloat(price);
    if (oldPrice !== undefined) {
      existingProduct.oldPrice = oldPrice ? parseFloat(oldPrice) : undefined;
    }

    if (stock !== undefined) {
      const numStock = parseInt(stock, 10);
      if (!isNaN(numStock) && numStock >= 0) {
        existingProduct.stock = numStock;
        if (numStock === 0 && existingProduct.status !== "neaktivan") {
          existingProduct.status = "rasprodato";
        } else if (numStock > 0 && existingProduct.status === "rasprodato" && (!status || status === "rasprodato")) {
          existingProduct.status = "aktivan";
        }
      }
    } else if (status === "aktivan" && existingProduct.stock === 0) {
      existingProduct.stock = 10;
    } else if (status === "rasprodato" && existingProduct.stock > 0) {
      existingProduct.stock = 0;
    }

    let categoryChanged = false;
    if (category !== undefined) {
      existingProduct.category = safeParseArray(category);
      categoryChanged = true;
    }

    if (subcategory !== undefined) {
      existingProduct.subcategory = safeParseArray(subcategory);
    }

    if (subcategory2 !== undefined) {
      existingProduct.subcategory2 = safeParseArray(subcategory2);
    }

    if (variantType !== undefined) {
      existingProduct.variantType = resolveVariantType(variantType);
    }

    if (variants !== undefined || sizes !== undefined) {
      const parsedSizesInput = sizes !== undefined ? safeParseArray(sizes) : existingProduct.sizes;
      const baseP = price !== undefined ? price : existingProduct.price;
      const baseOldP = oldPrice !== undefined ? oldPrice : existingProduct.oldPrice;
      const baseStk = stock !== undefined ? stock : existingProduct.stock;
      const variantData = normalizeVariantsInput(variants, parsedSizesInput, baseP, baseOldP, baseStk);
      if (variants !== undefined) {
        existingProduct.variants = variantData.variants;
        if (variantData.variants.length > 0 && typeof variantData.totalStock === "number") {
          existingProduct.stock = variantData.totalStock;
        }
      }
      existingProduct.sizes = variantData.sizes;
      if (variantData.variants.length > 0) {
        existingProduct.price = variantData.price;
        existingProduct.oldPrice = variantData.oldPrice !== null ? variantData.oldPrice : undefined;
      }
    }

    if (petType !== undefined) {
      existingProduct.petType = normalizeStringArray(safeParseArray(petType));
    }
    if (flavor !== undefined) {
      existingProduct.flavor = String(flavor || "").trim();
    }

    if (colors !== undefined) {
      const baseStkForColors = stock !== undefined ? stock : existingProduct.stock;
      const colorData = normalizeColorsInput(colors, baseStkForColors);
      existingProduct.colors = colorData.colors;
    }

    // Sinhronizacija ukupnog lagera i statusa kada su menjane varijante, boje ili lager
    if (variants !== undefined || colors !== undefined || stock !== undefined) {
      const varsArr = Array.isArray(existingProduct.variants) ? existingProduct.variants : [];
      const colsArr = Array.isArray(existingProduct.colors) ? existingProduct.colors : [];
      const varTotal = varsArr.length > 0
        ? varsArr.reduce((sum, v) => sum + (typeof v.stock === "number" && !isNaN(v.stock) ? Math.max(0, v.stock) : 0), 0)
        : null;
      const colTotal = colsArr.length > 0
        ? colsArr.reduce((sum, c) => sum + (typeof c.stock === "number" && !isNaN(c.stock) ? Math.max(0, c.stock) : 0), 0)
        : null;

      if (varTotal !== null && colTotal !== null) {
        existingProduct.stock = (varTotal === 0 || colTotal === 0) ? 0 : varTotal;
      } else if (varTotal !== null) {
        existingProduct.stock = varTotal;
      } else if (colTotal !== null) {
        existingProduct.stock = colTotal;
      }

      if (existingProduct.stock <= 0 && existingProduct.status !== "neaktivan") {
        existingProduct.stock = 0;
        existingProduct.status = "rasprodato";
      } else if (existingProduct.stock > 0 && existingProduct.status === "rasprodato" && (!status || status === "rasprodato")) {
        existingProduct.status = "aktivan";
      }
    }

    if (material !== undefined) existingProduct.material = String(material).trim();
    if (brand !== undefined) existingProduct.brand = String(brand).trim();
    if (technicalData !== undefined && typeof technicalData === "object") {
      existingProduct.technicalData = {
        labels: safeParseArray(technicalData.labels),
        features: safeParseArray(technicalData.features),
      };
    }
    if (description !== undefined) existingProduct.description = String(description).trim();
    if (isFeatured !== undefined) existingProduct.isFeatured = Boolean(isFeatured);
    if (isBestseller !== undefined) existingProduct.isBestseller = Boolean(isBestseller);

    // =========================================================================
    // UPRAVLJANJE SLIKAMA I FOLDERIMA (Rešenje iz projekta RADE)
    // =========================================================================
    const newCodeClean = String(code || existingProduct.code || "").trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "");
    const oldCodeClean = String(oldCode || "").trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "");

    // Određivanje aktivnog foldera na disku
    let activeFolder = String(existingProduct.mainImages || existingProduct.code || newCodeClean).replace(/[^a-zA-Z0-9_-]/g, "");
    let uploadDir = path.join(__dirname, "..", "..", "static", "uploads", activeFolder);

    // Ako activeFolder ne postoji na disku, proveri fallback kandidate
    if (!fs.existsSync(uploadDir)) {
      const candidates = [existingProduct.mainImages, existingProduct.code, oldCodeClean, newCodeClean].filter(Boolean);
      for (const cand of candidates) {
        const testDir = path.join(__dirname, "..", "..", "static", "uploads", String(cand).replace(/[^a-zA-Z0-9_-]/g, ""));
        if (fs.existsSync(testDir)) {
          activeFolder = String(cand).replace(/[^a-zA-Z0-9_-]/g, "");
          uploadDir = testDir;
          break;
        }
      }
    }

    // Čišćenje zaostalog temp foldera ako je prosleđen
    if (req.body.tempFolder) {
      const safeTemp = String(req.body.tempFolder).replace(/[^a-zA-Z0-9_-]/g, "");
      const tempPath = path.join(__dirname, "..", "..", "static", "uploads", safeTemp);
      if (fs.existsSync(tempPath)) {
        await fsPromises.rm(tempPath, { recursive: true, force: true }).catch(() => {});
      }
    }

    // SAMO ako su slike stvarno menjane u modalu (dodavanje, brisanje, promena redosleda):
    if (imagesChanged === true && Array.isArray(finalImageUrls) && fs.existsSync(uploadDir)) {
      try {
        const filesOnDisk = await fsPromises.readdir(uploadDir);

        // Ekstrakcija željenih imena fajlova iz finalImageUrls
        const wantedBasenames = finalImageUrls
          .map((url) => {
            if (typeof url !== "string") return null;
            const clean = url.split("?")[0];
            return path.basename(clean);
          })
          .filter(Boolean);

        // 1. Obriši sa diska fajlove koji su uklonjeni iz modala
        for (const diskFile of filesOnDisk) {
          if (diskFile.startsWith("_") || diskFile.startsWith("thumb_")) continue;
          if (!/\.(webp|jpg|jpeg|png|gif|avif)$/i.test(diskFile)) continue;

          if (!wantedBasenames.includes(diskFile)) {
            const filePathToDelete = path.join(uploadDir, diskFile);
            await fsPromises.unlink(filePathToDelete).catch(() => {});
          }
        }

        // 2. Pročitaj zadržane i nove slike u in-memory bafere da bi se izbegao EBUSY file lock na Windows-u
        const imageBuffers = [];
        for (let i = 0; i < wantedBasenames.length; i++) {
          const originalBasename = wantedBasenames[i];
          const originalPath = path.join(uploadDir, originalBasename);
          if (fs.existsSync(originalPath)) {
            const ext = path.extname(originalBasename) || ".webp";
            const buf = await fsPromises.readFile(originalPath);
            imageBuffers.push({ ext, buf });
          }
        }

        // 3. Obriši stare nazive sa diska
        for (const diskFile of filesOnDisk) {
          if (diskFile.startsWith("_") || diskFile.startsWith("thumb_")) continue;
          if (!/\.(webp|jpg|jpeg|png|gif|avif)$/i.test(diskFile)) continue;
          await fsPromises.unlink(path.join(uploadDir, diskFile)).catch(() => {});
        }

        // 4. Upiši sekvencijalno iz memorije: 001.ext, 002.ext, 003.ext po tačnom novom rasporedu
        for (let i = 0; i < imageBuffers.length; i++) {
          const finalBasename = `${String(i + 1).padStart(3, "0")}${imageBuffers[i].ext}`;
          const finalPath = path.join(uploadDir, finalBasename);
          await fsPromises.writeFile(finalPath, imageBuffers[i].buf);
        }

        // 5. Direktno regeneriši _thumb.webp iz prvog bafera (bez zaključavanja fajlova)
        if (imageBuffers.length > 0) {
          const thumbPath = path.join(uploadDir, "_thumb.webp");
          try {
            await sharp(imageBuffers[0].buf)
              .resize(400, 520, { fit: "cover", position: "center" })
              .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.5 })
              .webp({ quality: 90 })
              .toFile(thumbPath);
          } catch (sharpErr) {
            console.error("Greška pri generisanju thumbnail-a:", sharpErr.message);
          }
        }
      } catch (imgSyncError) {
        console.error("Greška pri sinhronizaciji slika na disku:", imgSyncError);
      }
    }

    // Preimenuj folder ako je šifra promenjena
    if (oldCodeClean && newCodeClean && oldCodeClean !== newCodeClean) {
      const targetDir = path.join(__dirname, "..", "..", "static", "uploads", newCodeClean);
      if (fs.existsSync(uploadDir) && !fs.existsSync(targetDir)) {
        await fsPromises.rename(uploadDir, targetDir).catch(() => {});
        uploadDir = targetDir;
        activeFolder = newCodeClean;
      }
    }

    existingProduct.mainImages = activeFolder || newCodeClean;

    await existingProduct.save();

    // Sinhronizacija kategorije u GlavnaKategorija
    if (categoryChanged && existingProduct.code) {
      const newCategorySlugs = (existingProduct.category || []).map((c) => c.toLowerCase().trim());
      await GlavnaKategorija.updateMany(
        {
          glavnaKategorija: { $nin: newCategorySlugs },
          ads: oldCode || existingProduct.code,
        },
        {
          $pull: { ads: oldCode || existingProduct.code },
        }
      );

      for (const cat of existingProduct.category) {
        const cleanCat = cat.toLowerCase().trim();
        let katDoc = await GlavnaKategorija.findOne({ glavnaKategorija: cleanCat });
        if (!katDoc) {
          await GlavnaKategorija.create({
            glavnaKategorija: cleanCat,
            naziv: cat,
            ads: [existingProduct.code],
          });
        } else if (!katDoc.ads.includes(existingProduct.code)) {
          katDoc.ads.push(existingProduct.code);
          await katDoc.save();
        }
      }

      // Očisti prazne kategorije koje više nemaju nijedan proizvod
      const allGk = await GlavnaKategorija.find({}).lean().exec();
      for (const gk of allGk) {
        const catSlug = (gk.glavnaKategorija || "").trim();
        if (!catSlug) {
          await GlavnaKategorija.deleteOne({ _id: gk._id });
          continue;
        }
        const countForCat = await Product.countDocuments({
          category: { $regex: new RegExp(`^${catSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });
        if (countForCat === 0) {
          await GlavnaKategorija.deleteOne({ _id: gk._id });
        }
      }
    }

    if (typeof clearImageCache === "function") clearImageCache(activeFolder);
    if (typeof getProducts.clearCache === "function") getProducts.clearCache();
    if (typeof getCategories.clearCache === "function") getCategories.clearCache();

    res.json({
      success: true,
      message: "Proizvod uspešno ažuriran.",
      product: existingProduct,
    });
  } catch (err) {
    console.error("Greška pri ažuriranju proizvoda:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = updateProduct;
