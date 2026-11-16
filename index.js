require("dotenv").config();

// Lokalno (Windows) rešava MongoDB SRV DNS problem bez potrebe za menjanjem sistema
if (process.env.VERCEL !== "1") {
  try {
    const dns = require("dns");
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  } catch (e) {}
}

const express = require("express");
const path = require("path");
const fs = require("fs");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const sharp = require("sharp");
sharp.cache(false);

const { connectDB } = require("./db/connect");
const { requireAuth, checkPermission, apiPermissionGuard, getJwtSecret, csrfProtection } = require("./utils/auth");
const { generateSlug } = require("./utils/slugify");
const { getAllImagesFromFolder } = require("./utils/imageHelper");

const { login, verifyAuth, logoutApi, logoutUi } = require("./routes/admin/authController");
const { getAdmins, addAdmin, updateAdmin, deleteAdmin, getDashboardStats } = require("./routes/admin/adminCrud");
const { getFirstImage, getAllImages, uploadLocal } = require("./routes/admin/mediaCrud");
const upload = require("./utils/upload");

const getCategories = require("./routes/categories/getCategories");
const getProducts = require("./routes/products/getProducts");
const getProductBySlug = require("./routes/products/getProductBySlug");
const createProduct = require("./routes/products/createProduct");
const updateProduct = require("./routes/products/updateProduct");
const deleteProduct = require("./routes/products/deleteProduct");
const createOrder = require("./routes/orders/createOrder");
const { getOrders, getOrderById, updateOrder, deleteOrder } = require("./routes/orders/getOrders");
const subscribeNewsletter = require("./routes/newsletter/subscribe");
const validateCoupon = require("./routes/coupons/validateCoupon");
const validateCart = require("./routes/cart/validateCart");

try {
  getJwtSecret();
} catch (secErr) {
  console.warn("Upozorenje za JWT_SECRET:", secErr.message);
}

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// ============================================================================
// HELMET BEZBEDNOSNA ZAGLAVLJA (Identično kao u Mia Butik sistemu)
// ============================================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://code.jquery.com",
          "https://maxcdn.bootstrapcdn.com",
          "https://unpkg.com",
        ],
        scriptSrcAttr: [
          (req) => (req.path && req.path.startsWith("/admin") ? "'unsafe-inline'" : "'none'"),
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
          "https://maxcdn.bootstrapcdn.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://images.pexels.com",
          "https://cdn.pixabay.com",
          "https://images.unsplash.com",
          "https:",
        ],
        connectSrc: ["'self'", "https://images.pexels.com", "https://cdn.pixabay.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: true },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(compression());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cookieParser());

// ============================================================================
// SEO PREUSMERENJA (.html -> čisti URL-ovi)
// ============================================================================
app.use((req, res, next) => {
  if (req.method === "GET") {
    const htmlMap = {
      "/index.html": "/",
      "/about.html": "/about",
      "/galery.html": "/gallery",
      "/legal.html": "/legal",
      "/pansion.html": "/",
      "/pansion": "/",
      "/shopping-cart.html": "/shopping-cart",
      "/cart.html": "/shopping-cart",
      "/custom-page.html": "/all-products",
    };
    if (htmlMap[req.path]) {
      return res.redirect(301, htmlMap[req.path]);
    }
  }
  next();
});

// ============================================================================
// OPTIMIZOVANA ISPORUKA STATIČKIH FAJLOVA & LOKALNIH WEBP SLIKA (KEŠIRANJE)
// ============================================================================
const uploadsDir = path.join(__dirname, "static", "uploads");
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {}
}

const uploadsStaticConfig = {
  maxAge: "7d",
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "public, max-age=604800");
  },
};
app.use("/uploads", express.static(uploadsDir, uploadsStaticConfig));
app.use("/static/uploads", express.static(uploadsDir, uploadsStaticConfig));

const staticAssetsConfig = {
  index: false,
  maxAge: "1d",
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    } else if (filePath.match(/\.(css|js|jpg|jpeg|png|gif|ico|svg|webp|woff2?)$/i)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  },
};
app.use("/static", express.static(path.join(__dirname, "static"), staticAssetsConfig));
app.use(express.static(path.join(__dirname, "static"), staticAssetsConfig));

app.use(
  "/admin",
  express.static(path.join(__dirname, "admin-static"), {
    maxAge: "0",
    redirect: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    },
  })
);

// ============================================================================
// MIDDLEWARE ZA MONGODB KONEKCIJU (Sigurno za Vercel cold start)
// ============================================================================
app.use(async (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/admin") ||
    req.path === "/login" ||
    req.path === "/auth/verify"
  ) {
    try {
      await connectDB();
    } catch (e) {}
  }
  next();
});

// ============================================================================
// BEZBEDNOSNI MIDDLEWARE-I: AUTH, CSRF, RBAC DOZVOLE & RATE LIMIT
// ============================================================================
app.use(requireAuth);
app.use(csrfProtection);
app.use("/api", apiPermissionGuard);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req) => Boolean(req.authUser),
  message: { success: false, message: "Previše zahteva sa vaše IP adrese. Pokušajte za par minuta." },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { success: false, message: "Dostigli ste limit za slanje porudžbina. Pokušajte kasnije." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { success: false, message: "Previše neuspešnih pokušaja prijave. Pokušajte za 15 minuta." },
});

app.use("/api", apiLimiter);

// ============================================================================
// AUTENTIFIKACIJA I ADMIN PANEL RUTE
// ============================================================================
app.get("/login", (req, res) => {
  if (req.authUser) {
    return res.redirect("/admin");
  }
  res.render("login", { error: null });
});

app.post("/api/login", loginLimiter, login);
app.get("/auth/verify", verifyAuth);
app.post("/api/logout", logoutApi);
app.get("/logout", logoutUi);

app.get("/admin", (req, res) => {
  res.render("index", { admin: req.authUser });
});

app.get("/admin/proizvodi", checkPermission("proizvodi"), (req, res) => {
  res.render("proizvodi", { admin: req.authUser });
});

app.get("/admin/narudzbe", checkPermission("narudzbine"), (req, res) => {
  res.render("narudzbe", { admin: req.authUser });
});

app.get("/admin/admini", checkPermission("admini"), (req, res) => {
  res.render("admin", { admin: req.authUser });
});

app.get("/api/admin/stats", checkPermission(["narudzbine", "proizvodi", "admini"]), getDashboardStats);
app.get("/api/admin/dashboard-stats", checkPermission(["narudzbine", "proizvodi", "admini"]), getDashboardStats);
app.get("/api/admins", checkPermission("admini"), getAdmins);
app.post("/api/admins", checkPermission("admini"), addAdmin);
app.post("/api/addAdmin", checkPermission("admini"), addAdmin);
app.put("/api/admins/:id", checkPermission("admini"), updateAdmin);
app.put("/api/updateAdmin/:id", checkPermission("admini"), updateAdmin);
app.delete("/api/admins/:id", checkPermission("admini"), deleteAdmin);
app.delete("/api/deleteAdmin/:id", checkPermission("admini"), deleteAdmin);

// ============================================================================
// JAVNE STOREFRONT STRANICE (HAPPY ANIMALS UI)
// ============================================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "about.html"));
});

app.get("/gallery", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "galery.html"));
});

app.get("/legal", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "legal.html"));
});

app.get(["/shopping-cart", "/korpa"], (req, res) => {
  res.sendFile(path.join(__dirname, "static", "shopping-cart.html"));
});

app.get(["/all-products", "/custom-page", "/proizvodi"], (req, res) => {
  res.sendFile(path.join(__dirname, "static", "custom-page.html"));
});

// ============================================================================
// PROIZVODI, KATEGORIJE, LOKALNE WEBP SLIKE & PORUDŽBINE API
// ============================================================================
app.get("/api/categories", getCategories);

app.get("/api/products", getProducts);
app.get("/api/products/slug/:slug", getProductBySlug);
app.get("/api/products/:slug", getProductBySlug);
app.post("/api/products", checkPermission("proizvodi"), createProduct);
app.put("/api/products/:id", checkPermission("proizvodi"), updateProduct);
app.delete("/api/products/:id", checkPermission("proizvodi"), deleteProduct);

// Kompatibilni API za slike proizvoda (isporučuje lokalno keširane WebP slike iz /uploads)
app.get("/api/product-images/:productId", async (req, res) => {
  try {
    await connectDB();
    const rawId = decodeURIComponent(String(req.params.productId || "")).trim();
    const products = await getProducts.loadAllPublicProducts();
    const match = products.find(
      (p) =>
        String(p.id).toLowerCase() === rawId.toLowerCase() ||
        String(p.code || "").toLowerCase() === rawId.toLowerCase() ||
        String(p._id) === rawId ||
        String(p.slug || "").toLowerCase() === rawId.toLowerCase()
    );
    let urls = [];
    if (match && Array.isArray(match.images) && match.images.length > 0) {
      urls = match.images;
    } else if (match && match.mainImages) {
      urls = await getAllImagesFromFolder(match.mainImages);
    } else {
      urls = await getAllImagesFromFolder(rawId);
    }
    res.json({
      success: true,
      productId: rawId,
      images: urls.map((u) => ({ url: u })),
    });
  } catch (err) {
    res.status(500).json({ success: false, images: [], error: err.message });
  }
});

app.post("/api/product-images/batch", async (req, res) => {
  try {
    await connectDB();
    const { productIds } = req.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.json({ success: true, results: {} });
    }
    const products = await getProducts.loadAllPublicProducts();
    const productById = new Map();
    products.forEach((p) => {
      if (p.id) productById.set(String(p.id).toLowerCase(), p);
      if (p.code) productById.set(String(p.code).toLowerCase(), p);
      if (p._id) productById.set(String(p._id), p);
    });

    const results = {};
    await Promise.all(
      productIds.slice(0, 100).map(async (pid) => {
        const key = String(pid);
        const match = productById.get(key.toLowerCase()) || productById.get(key);
        let urls = [];
        if (match && Array.isArray(match.images) && match.images.length > 0) {
          urls = match.images;
        } else {
          urls = await getAllImagesFromFolder((match && match.mainImages) || key);
        }
        results[key] = urls.map((u) => ({ url: u }));
      })
    );
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, results: {}, error: err.message });
  }
});

// Upload lokalnih slika i Sharp WebP konverzija (admin)
app.get("/api/cloudinary/first/:folder", getFirstImage);
app.get("/api/cloudinary/all/:folder", getAllImages);
app.post("/api/upload-local", checkPermission("proizvodi"), upload.any(), uploadLocal);
app.post("/api/cloudinary/upload-local", checkPermission("proizvodi"), upload.any(), uploadLocal);

// Porudžbine, korpa, kuponi i newsletter
app.post("/api/send-order", orderLimiter, createOrder);
app.get("/api/orders", checkPermission("narudzbine"), getOrders);
app.get("/api/orders/:id", checkPermission("narudzbine"), getOrderById);
app.put("/api/orders/:id", checkPermission("narudzbine"), updateOrder);
app.delete("/api/orders/:id", checkPermission("narudzbine"), deleteOrder);

app.post("/api/newsletter/subscribe", subscribeNewsletter);
app.post("/api/newsletter", subscribeNewsletter);

app.get("/api/coupons/validate", validateCoupon);
app.post("/api/coupons/validate", validateCoupon);

app.post("/api/cart/validate", validateCart);
app.post("/api/cart", validateCart);

// ============================================================================
// POMOĆNE FUNKCIJE ZA DINAMIČKE STRANICE PROIZVODA I KATEGORIJA
// ============================================================================
function formatPriceString(price) {
  if (price === null || price === undefined || price === "/" || price === "") return price;
  const num = typeof price === "string" ? parseFloat(price.replace(/[^\d]/g, "")) : parseFloat(price);
  if (isNaN(num)) return price;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function findCachedProductBySlugOrId(slugOrId) {
  await connectDB();
  const cleanParam = decodeURIComponent(String(slugOrId || "")).trim();
  if (!cleanParam) return null;
  const normalizedParam = generateSlug(cleanParam);
  const lowerParam = cleanParam.toLowerCase();

  const allProducts = await getProducts.loadAllPublicProducts();
  return (
    allProducts.find(
      (p) =>
        String(p.slug || "").toLowerCase() === lowerParam ||
        String(p.code || "").toLowerCase() === lowerParam ||
        String(p._id) === cleanParam ||
        String(p.id || "").toLowerCase() === lowerParam ||
        generateSlug(p.title || "") === normalizedParam ||
        generateSlug(p.title || "") === lowerParam
    ) || null
  );
}

async function checkCategoryHierarchyMatch(catSlug, subSlug, sub2Slug) {
  await connectDB();
  const allProducts = await getProducts.loadAllPublicProducts();
  const nCat = catSlug ? generateSlug(decodeURIComponent(catSlug)) : "";
  const nSub = subSlug ? generateSlug(decodeURIComponent(subSlug)) : "";
  const nSub2 = sub2Slug ? generateSlug(decodeURIComponent(sub2Slug)) : "";

  const matches = allProducts.some((p) => {
    const cats = Array.isArray(p.category) ? p.category : [p.category].filter(Boolean);
    const subs = Array.isArray(p.subcategory) ? p.subcategory : [p.subcategory].filter(Boolean);
    const sub2s = Array.isArray(p.subcategory2) ? p.subcategory2 : [p.subcategory2].filter(Boolean);

    const catOk = !nCat || cats.some((c) => generateSlug(c) === nCat);
    const subOk = !nSub || subs.some((s) => generateSlug(s) === nSub);
    const sub2Ok = !nSub2 || sub2s.some((s2) => generateSlug(s2) === nSub2);
    return catOk && subOk && sub2Ok;
  });

  if (matches) return true;

  // Fallback provera u GlavnaKategorija ako još uvek nema proizvoda u kešu
  try {
    const categoriesList = getCategories.getCachedData ? getCategories.getCachedData() : null;
    if (Array.isArray(categoriesList) && categoriesList.length > 0) {
      return categoriesList.some((c) => generateSlug(c.name || c.slug || "") === nCat);
    }
  } catch (e) {}

  return false;
}

// Pojedinačni proizvod via /product/:slug ili /proizvod
app.get("/product/:slug", async (req, res) => {
  try {
    const product = await findCachedProductBySlugOrId(req.params.slug);
    if (!product) {
      return res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
    }
    return res.render(path.join(__dirname, "static", "views", "product.ejs"), {
      product,
      formatPriceString,
    });
  } catch (err) {
    console.error("Greška na /product/:slug:", err.message);
    return res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
  }
});

// Dinamičke kategorije (2 ili 3 segmenta: /:category/:subcategory i /:category/:subcategory/:subcategory2)
app.get("/:category/:subcategory/:subcategory2", async (req, res, next) => {
  const { category, subcategory, subcategory2 } = req.params;
  if (category.startsWith("api") || category.startsWith("admin") || category.includes(".")) {
    return next();
  }
  const exists = await checkCategoryHierarchyMatch(category, subcategory, subcategory2);
  if (exists) {
    return res.sendFile(path.join(__dirname, "static", "custom-page.html"));
  }
  return res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
});

app.get("/:category/:subcategory", async (req, res, next) => {
  const { category, subcategory } = req.params;
  if (category.startsWith("api") || category.startsWith("admin") || category.includes(".")) {
    return next();
  }
  const exists = await checkCategoryHierarchyMatch(category, subcategory, "");
  if (exists) {
    return res.sendFile(path.join(__dirname, "static", "custom-page.html"));
  }
  return res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
});

// Dinamički catch-all za /:slug (prvo pojedinačni proizvod, pa glavna kategorija, pa 404)
app.get("/:slug", async (req, res, next) => {
  const slug = req.params.slug || "";
  if (
    slug.startsWith("api") ||
    slug.startsWith("admin") ||
    slug.includes(".")
  ) {
    return next();
  }

  try {
    const product = await findCachedProductBySlugOrId(slug);
    if (product) {
      return res.render(path.join(__dirname, "static", "views", "product.ejs"), {
        product,
        formatPriceString,
      });
    }

    const catExists = await checkCategoryHierarchyMatch(slug, "", "");
    if (catExists) {
      return res.sendFile(path.join(__dirname, "static", "custom-page.html"));
    }
  } catch (err) {
    console.error("Greška na dinamičkoj ruti:", err.message);
  }

  return res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
});

// ============================================================================
// 404 FALLBACK RUTA
// ============================================================================
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, message: "API ruta nije pronađena." });
  }
  res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
});

// ============================================================================
// POKRETANJE SERVERA I ZAGREVANJE KEŠA
// ============================================================================
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (process.env.VERCEL !== "1") {
    app.listen(PORT, () => {
      console.log(`Server uspešno pokrenut na portu ${PORT} (http://localhost:${PORT})`);
    });
  }

  // Povezivanje sa bazom i zagrevanje in-memory keša u pozadini
  try {
    const connected = await connectDB();
    if (connected) {
      if (typeof getCategories.warmCache === "function") {
        Promise.resolve(getCategories.warmCache()).catch(() => {});
      }
      if (typeof getProducts.warmCache === "function") {
        Promise.resolve(getProducts.warmCache()).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("Baza nije povezana pri startu:", e.message);
  }
}

startServer();

module.exports = app;
