const path = require("path");
const fs = require("fs");
const fsPromises = fs.promises;
const sharp = require("sharp");
sharp.cache(false);

// Fast in-memory image caches (identično optimizaciji u projektu Rade)
const folderImagesCache = new Map();
const firstImageCache = new Map();

/**
 * Resolves static/uploads folder path reliably across local and serverless (Vercel) environments
 */
function resolveUploadsDir(safeFolderName = "") {
  const cleanFolder = safeFolderName ? String(safeFolderName).replace(/[^a-zA-Z0-9_-]/g, "") : "";
  const candidate1 = cleanFolder
    ? path.join(__dirname, "..", "static", "uploads", cleanFolder)
    : path.join(__dirname, "..", "static", "uploads");
  const candidate2 = cleanFolder
    ? path.join(process.cwd(), "static", "uploads", cleanFolder)
    : path.join(process.cwd(), "static", "uploads");

  if (fs.existsSync(candidate1)) return candidate1;
  if (fs.existsSync(candidate2)) return candidate2;
  return candidate1;
}

function clearImageCache(folderName) {
  if (folderName) {
    const safe = String(folderName).replace(/[^a-zA-Z0-9_-]/g, "");
    folderImagesCache.delete(safe);
    firstImageCache.delete(safe);
  } else {
    folderImagesCache.clear();
    firstImageCache.clear();
  }
}

// Helper to validate magic bytes (JPEG, PNG, GIF, WEBP)
function isValidImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return true;
  // GIF: 47 49 46 ('GIF')
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return true;
  return false;
}

/**
 * Validates, sanitizes, compresses and saves an image to local static uploads folder.
 * Converts to WebP format with high performance 82% quality.
 */
async function processAndSaveImage(buffer, folderName, filenamePrefix = "img") {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Nevažeći podaci o slici.");
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("Datoteka prelazi maksimalnu dozvoljenu veličinu od 10MB.");
  }

  const safeFolderName = String(folderName || "misc").replace(
    /[^a-zA-Z0-9_-]/g,
    ""
  );
  const uploadDir = resolveUploadsDir(safeFolderName);
  await fsPromises.mkdir(uploadDir, { recursive: true });

  const safePrefix = String(filenamePrefix || "img").replace(
    /[^a-zA-Z0-9._-]/g,
    ""
  );

  if (!isValidImageMagicBytes(buffer)) {
    throw new Error(
      "Bezbednosna provera neuspešna: Datoteka nema validna zaglavlja slike."
    );
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
    if (!metadata || !metadata.format) {
      throw new Error("Nevažeći format slike.");
    }
  } catch (err) {
    throw new Error(
      "Bezbednosna provera neuspešna: Datoteka nije ispravna slika."
    );
  }

  const sanitizedWebpBuffer = await sharp(buffer)
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();

  const filename = safePrefix.endsWith(".webp")
    ? safePrefix
    : `${safePrefix}.webp`;
  const filePath = path.join(uploadDir, filename);

  await fsPromises.writeFile(filePath, sanitizedWebpBuffer);

  // Generate thumbnail for faster loading in product lists (only if _thumb.webp does not exist yet or this is the first image)
  const thumbPath = path.join(uploadDir, "_thumb.webp");
  if (!fs.existsSync(thumbPath)) {
    try {
      await sharp(sanitizedWebpBuffer)
        .resize(400, 520, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toFile(thumbPath);
    } catch (tErr) {
      console.error("Greška pri generisanju thumb-a:", tErr.message);
    }
  }

  clearImageCache(safeFolderName);
  return `/uploads/${safeFolderName}/${filename}`;
}

/**
 * Synchronizes the local folder with the array of kept image URLs from the admin modal.
 * - Moves any images uploaded to a temporary folder (e.g. temp_artikal) into the product's folder.
 * - Re-indexes kept images sequentially (001.webp, 002.webp...) to preserve exact drag-and-drop visual order.
 * - Deletes any images in the product's folder that were removed by the admin.
 * - Updates _thumb.webp to match the primary (first) image.
 */
async function syncFolderImages(folderName, keptImageUrls) {
  if (!folderName || !Array.isArray(keptImageUrls)) return;

  const safeFolderName = String(folderName).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeFolderName) return;

  const baseUploadsDir = resolveUploadsDir();
  const targetDir = resolveUploadsDir(safeFolderName);

  try {
    await fsPromises.mkdir(targetDir, { recursive: true });

    const keptFileNames = [];

    for (const rawUrl of keptImageUrls) {
      if (typeof rawUrl !== "string" || !rawUrl.trim()) continue;
      const cleanPath = rawUrl.split("?")[0].trim();

      // Match /uploads/<folder>/<file>
      const match = cleanPath.match(/^\/uploads\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/);
      if (!match) continue;

      const srcFolder = match[1];
      const fileName = match[2];
      if (fileName === "_thumb.webp" || fileName.startsWith("thumb_")) continue;

      if (srcFolder !== safeFolderName) {
        const srcFilePath = path.join(baseUploadsDir, srcFolder, fileName);
        const destFilePath = path.join(targetDir, fileName);
        if (fs.existsSync(srcFilePath)) {
          try {
            await fsPromises.rename(srcFilePath, destFilePath);
          } catch (_) {
            await fsPromises.copyFile(srcFilePath, destFilePath);
            await fsPromises.unlink(srcFilePath).catch(() => {});
          }
        }
      }

      if (!keptFileNames.includes(fileName)) {
        keptFileNames.push(fileName);
      }
    }

    if (fs.existsSync(targetDir)) {
      // 1. Učitavanje svih zadržanih slika u memoriju po tačnom vizuelnom redosledu
      const imageBuffers = [];
      for (let i = 0; i < keptFileNames.length; i++) {
        const filePath = path.join(targetDir, keptFileNames[i]);
        if (fs.existsSync(filePath)) {
          const ext = path.extname(keptFileNames[i]) || ".webp";
          const buf = await fsPromises.readFile(filePath);
          imageBuffers.push({ ext, buf });
        }
      }

      // 2. Brisanje starih slika u folderu kako bi se upisale po novom redosledu (001.webp, 002.webp...)
      const existingFiles = await fsPromises.readdir(targetDir);
      for (const file of existingFiles) {
        if (file === "_thumb.webp" || file.startsWith("thumb_") || /\.(webp|jpg|jpeg|png|gif|avif)$/i.test(file)) {
          await fsPromises.unlink(path.join(targetDir, file)).catch(() => {});
        }
      }

      // 3. Upisivanje slika po novom redosledu (001.webp, 002.webp, 003.webp...)
      for (let i = 0; i < imageBuffers.length; i++) {
        const newFileName = `${String(i + 1).padStart(3, "0")}${imageBuffers[i].ext}`;
        await fsPromises.writeFile(path.join(targetDir, newFileName), imageBuffers[i].buf);
      }

      // 4. Regenerisanje _thumb.webp iz prve (glavne) slike
      const thumbPath = path.join(targetDir, "_thumb.webp");
      if (imageBuffers.length > 0) {
        try {
          await sharp(imageBuffers[0].buf)
            .resize(400, 520, { fit: "cover", position: "center" })
            .webp({ quality: 85 })
            .toFile(thumbPath);
        } catch (tErr) {
          console.error("Greška pri osvežavanju thumb-a:", tErr.message);
        }
      }
    }
    clearImageCache();
  } catch (err) {
    console.error("Error syncing folder images:", safeFolderName, err.message);
  }
}

/**
 * Get first image URL from local folder by folder name with cache buster
 */
async function getFirstImageUrl(folderName) {
  if (!folderName) return null;

  if (
    typeof folderName === "string" &&
    (folderName.startsWith("http://") ||
      folderName.startsWith("https://") ||
      folderName.startsWith("/uploads/") ||
      folderName.startsWith("/static/"))
  ) {
    return folderName;
  }

  const safeFolderName = String(folderName).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeFolderName) return null;

  if (firstImageCache.has(safeFolderName)) {
    return firstImageCache.get(safeFolderName);
  }

  try {
    const uploadDir = resolveUploadsDir(safeFolderName);
    if (!fs.existsSync(uploadDir)) return null;

    const files = await fsPromises.readdir(uploadDir);
    const imageFiles = files
      .filter(
        (file) =>
          !file.startsWith("_") &&
          !file.startsWith("thumb_") &&
          /\.(webp|jpg|jpeg|png|gif|avif)$/i.test(file)
      )
      .sort();

    if (imageFiles.length > 0) {
      const thumbFile = "_thumb.webp";
      const thumbPath = path.join(uploadDir, thumbFile);
      if (fs.existsSync(thumbPath)) {
        try {
          const stat = await fsPromises.stat(thumbPath);
          const url = `/uploads/${safeFolderName}/${thumbFile}?v=${Math.round(stat.mtimeMs)}`;
          firstImageCache.set(safeFolderName, url);
          return url;
        } catch (_) {
          const url = `/uploads/${safeFolderName}/${thumbFile}`;
          firstImageCache.set(safeFolderName, url);
          return url;
        }
      }

      const mainFile = imageFiles[0];
      const mainPath = path.join(uploadDir, mainFile);
      try {
        const stat = await fsPromises.stat(mainPath);
        const url = `/uploads/${safeFolderName}/${mainFile}?v=${Math.round(stat.mtimeMs)}`;
        firstImageCache.set(safeFolderName, url);
        return url;
      } catch (_) {
        const url = `/uploads/${safeFolderName}/${mainFile}`;
        firstImageCache.set(safeFolderName, url);
        return url;
      }
    }
    return null;
  } catch (err) {
    console.error("Local storage error for folder:", safeFolderName, err.message);
    return null;
  }
}

/**
 * Get ALL image URLs from local folder by folder name
 */
async function getAllImagesFromFolder(folderName) {
  if (!folderName) return [];

  if (
    typeof folderName === "string" &&
    (folderName.startsWith("http://") ||
      folderName.startsWith("https://") ||
      folderName.startsWith("/uploads/") ||
      folderName.startsWith("/static/"))
  ) {
    return [folderName];
  }

  const safeFolderName = String(folderName).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeFolderName) return [];

  if (folderImagesCache.has(safeFolderName)) {
    return folderImagesCache.get(safeFolderName);
  }

  try {
    const uploadDir = resolveUploadsDir(safeFolderName);
    if (!fs.existsSync(uploadDir)) return [];

    const files = await fsPromises.readdir(uploadDir);
    const imageFiles = files
      .filter(
        (file) =>
          !file.startsWith("_") &&
          !file.startsWith("thumb_") &&
          /\.(webp|jpg|jpeg|png|gif|avif)$/i.test(file)
      )
      .sort();

    const result = await Promise.all(
      imageFiles.map(async (file) => {
        try {
          const stat = await fsPromises.stat(path.join(uploadDir, file));
          return `/uploads/${safeFolderName}/${file}?v=${Math.round(stat.mtimeMs)}`;
        } catch (_) {
          return `/uploads/${safeFolderName}/${file}`;
        }
      })
    );

    if (result.length > 0) {
      folderImagesCache.set(safeFolderName, result);
    }
    return result;
  } catch (err) {
    console.error("Local storage error for folder:", safeFolderName, err.message);
    return [];
  }
}

/**
 * Delete local image folder
 */
async function deleteLocalFolder(folderName) {
  if (!folderName) return;
  let target = String(folderName).trim();
  if (target.startsWith("/uploads/")) {
    target = target.replace(/^\/uploads\//, "");
  }
  if (target.includes("/")) {
    target = target.split("/")[0];
  }
  const safeFolderName = target.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeFolderName) return;

  clearImageCache(safeFolderName);

  try {
    const uploadDir = resolveUploadsDir(safeFolderName);
    if (fs.existsSync(uploadDir)) {
      await fsPromises.rm(uploadDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Error deleting local folder:", safeFolderName, err.message);
  }
}

module.exports = {
  isValidImageMagicBytes,
  processAndSaveImage,
  syncFolderImages,
  getFirstImageUrl,
  getAllImagesFromFolder,
  deleteLocalFolder,
  clearImageCache,
};

