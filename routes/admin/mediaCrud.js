const {
  processAndSaveImage,
  getFirstImageUrl,
  getAllImagesFromFolder,
} = require("../../utils/imageHelper");

async function getFirstImage(req, res) {
  const folderName = req.params.folder;
  if (!folderName) {
    return res.status(400).json({ error: "Missing folder name" });
  }

  const url = await getFirstImageUrl(folderName);
  if (url) {
    res.json({ success: true, url });
  } else {
    res.json({ success: false, url: null });
  }
}

async function getAllImages(req, res) {
  try {
    const folderName = req.params.folder;
    const urls = await getAllImagesFromFolder(folderName);
    res.json({ success: true, urls });
  } catch (error) {
    console.error("Error fetching all images:", error);
    res.json({ success: false, urls: [] });
  }
}

function isSafeRemoteUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) {
      return false;
    }
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function uploadLocal(req, res) {
  try {
    let buffer;
    let folder = req.body.folder || "misc";
    let publicId =
      req.body.publicId ||
      req.body.public_id ||
      req.body.filename ||
      `img_${Date.now()}`;

    if (req.file) {
      buffer = req.file.buffer;
    } else if (req.body.file || req.body.base64) {
      const dataStr = req.body.file || req.body.base64;
      const matches = dataStr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches) {
        buffer = Buffer.from(matches[2], "base64");
      } else {
        buffer = Buffer.from(dataStr, "base64");
      }
    } else if (req.body.url && typeof req.body.url === "string") {
      const targetUrl = req.body.url.trim();
      if (!isSafeRemoteUrl(targetUrl)) {
        return res.status(400).json({
          success: false,
          message: "Nevažeći ili nedozvoljen URL slike (dozvoljeni su samo javni http i https linkovi).",
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const fetchRes = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          },
        });
        clearTimeout(timeoutId);

        if (!fetchRes.ok) {
          return res.status(400).json({
            success: false,
            message: `Preuzimanje slike nije uspelo (status ${fetchRes.status}).`,
          });
        }

        const arrayBuf = await fetchRes.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } catch (fErr) {
        clearTimeout(timeoutId);
        return res.status(400).json({
          success: false,
          message: "Greška pri preuzimanju slike sa URL-a: " + fErr.message,
        });
      }
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Nijedna slika nije poslata." });
    }

    const publicUrl = await processAndSaveImage(buffer, folder, publicId);

    res.json({ success: true, secure_url: publicUrl });
  } catch (error) {
    console.error("Local upload error:", error);
    res.status(500).json({ success: false, message: error.message || "Greška pri uploadu." });
  }
}

module.exports = {
  getFirstImage,
  getAllImages,
  uploadLocal,
};
