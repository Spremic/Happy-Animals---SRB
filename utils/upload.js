const multer = require("multer");

// Configure Multer for in-memory file uploads (10MB limit) with image type filtering
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    if (file && file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Dozvoljeno je samo otpremanje slika (JPG, PNG, WEBP, GIF)."), false);
    }
  },
});

module.exports = upload;

