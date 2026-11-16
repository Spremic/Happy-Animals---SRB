const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Admin = require("../db/admin");

// Dinamički ključ za razvojno okruženje ukoliko JWT_SECRET nije postavljen u .env
let devFallbackSecret = null;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    !secret ||
    secret.trim() === "" ||
    secret === "please-set-a-strong-secret-in-env" ||
    secret === "promeni-ovaj-dugacak-nasumican-jwt-kljuc"
  ) {
    if (!devFallbackSecret) {
      devFallbackSecret =
        process.env.FALLBACK_JWT_SECRET ||
        "happy_animals_jwt_secret_fallback_key_2026_secure!";
      console.warn(
        "⚠️ [BEZBEDNOST] JWT_SECRET nije postavljen u environment varijablama! Koristi se fallback ključ."
      );
    }
    return devFallbackSecret;
  }

  return secret.trim();
}

function getAuthCookieOptions(req) {
  // Provera da li je veza bezbedna (HTTPS direktno, x-forwarded-proto od reverse proxy-ja ili Cloudflare-a, ili produkcijski režim)
  const isHttps = Boolean(req && (req.secure || (req.headers && req.headers["x-forwarded-proto"] === "https")));
  const isProduction = process.env.NODE_ENV === "production";
  const shouldBeSecure = isProduction || isHttps;

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldBeSecure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dana
  };
}

function clearAuthCookie(res, req) {
  const options = getAuthCookieOptions(req);
  delete options.maxAge;
  res.clearCookie("token", options);
}

function sendUnauthorized(req, res) {
  if (req.path.startsWith("/api/") || req.path === "/auth/verify") {
    return res.status(401).json({ authenticated: false, message: "Niste prijavljeni." });
  }
  if (req.path.startsWith("/admin")) {
    return res.redirect("/login");
  }
  return res.redirect("/");
}

// Javne putanje koje ne zahtevaju admin prijavu
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/auth/verify",
  "/logout",
  "/about",
  "/gallery",
  "/legal",
  "/shopping-cart",
  "/korpa",
  "/all-products",
  "/custom-page",
  "/proizvodi",
  "/proizvod",
  "/info",
  "/about.html",
  "/galery.html",
  "/legal.html",
  "/shopping-cart.html",
  "/custom-page.html",
  "/category-product.html",
  "/single-product.html",
  "/cart.html",
  "/index.html",
  "/info.html",
]);

// Javne GET API putanje
const PUBLIC_GET_API_PREFIXES = [
  "/api/products",
  "/api/categories",
  "/api/featured",
  "/api/bestsellers",
  "/api/coupons/validate",
  "/api/product-images",
];

// Javne POST API putanje
const PUBLIC_POST_API_ROUTES = new Set([
  "/api/login",
  "/api/send-order",
  "/api/cart",
  "/api/cart/validate",
  "/api/newsletter/subscribe",
  "/api/newsletter",
  "/api/coupons/validate",
  "/api/product-images/batch",
]);

function isPublicRoute(reqOrPath, maybeMethod) {
  let path = "";
  let method = "GET";

  if (typeof reqOrPath === "string") {
    path = reqOrPath;
    method = maybeMethod || "GET";
  } else if (reqOrPath && typeof reqOrPath === "object") {
    path = reqOrPath.path || "";
    method = reqOrPath.method || "GET";
  }
  method = method.toUpperCase();

  if (PUBLIC_PATHS.has(path)) return true;

  // Statički fajlovi i javni frontend
  if (!path.startsWith("/admin") && !path.startsWith("/api")) {
    return true;
  }

  // Javni POST API
  if (method === "POST") {
    const cleanPath = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
    return PUBLIC_POST_API_ROUTES.has(path) || PUBLIC_POST_API_ROUTES.has(cleanPath);
  }

  // Javni GET API
  if (method === "GET") {
    if (PUBLIC_GET_API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return true;
    }
  }

  return false;
}

// Brzi in-memory keš za admin sesije (eliminiše suvišne upite ka bazi na svakom kliku)
const adminSessionCache = new Map();
const ADMIN_CACHE_TTL_MS = 10 * 1000;

function clearAdminSessionCache(adminId) {
  if (adminId) {
    adminSessionCache.delete(String(adminId));
  } else {
    adminSessionCache.clear();
  }
}

async function requireAuth(req, res, next) {
  const publicRoute = isPublicRoute(req);

  // Na javnim rutama koje ne traže admin kontekst, prosledi odmah za 0ms (kao u projektu Rade)
  const needsOptionalAuth =
    req.path === "/login" ||
    req.path === "/auth/verify" ||
    (req.query && req.query.admin === "1") ||
    req.path.startsWith("/api/products/slug");

  if (publicRoute && !needsOptionalAuth) {
    return next();
  }

  const token = req.cookies && req.cookies.token;

  if (!token) {
    if (publicRoute) {
      return next();
    }
    return sendUnauthorized(req, res);
  }

  try {
    const jwtSecret = getJwtSecret();
    const payload = jwt.verify(token, jwtSecret);
    const adminId = String(payload.id);

    const now = Date.now();
    let user = null;
    const cached = adminSessionCache.get(adminId);
    if (cached && now - cached.time < ADMIN_CACHE_TTL_MS) {
      user = cached.user;
    } else {
      user = await Admin.findById(payload.id).lean();
      if (user) {
        adminSessionCache.set(adminId, { user, time: now });
      }
    }

    if (!user) {
      adminSessionCache.delete(adminId);
      clearAuthCookie(res, req);
      if (publicRoute) {
        return next();
      }
      return sendUnauthorized(req, res);
    }

    req.authUser = user;
    req.authPayload = payload;
    res.locals.admin = user;
    return next();
  } catch (err) {
    clearAuthCookie(res, req);
    if (publicRoute) {
      return next();
    }
    return sendUnauthorized(req, res);
  }
}

function hasPermission(user, requiredPermission) {
  if (!user) return false;
  if (user.adminType === "main") return true;

  const userPermissions = Array.isArray(user.permissions)
    ? user.permissions
    : [];
  const required = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  return required.some((p) => userPermissions.includes(p));
}

function checkPermission(permission) {
  return (req, res, next) => {
    const user = req.authUser;
    if (!user) {
      return res.status(401).send("Niste ulogovani.");
    }

    if (hasPermission(user, permission)) {
      return next();
    }

    if (req.path.startsWith("/api/")) {
      return res
        .status(403)
        .json({ success: false, message: "Nemate dozvolu za ovu akciju." });
    }

    return res.status(403).render("access-denied", {
      pageTitle: "Pristup Odbijen",
      userName: user.name || "Korisnik",
    });
  };
}

function apiPermissionGuard(req, res, next) {
  if (isPublicRoute(req)) {
    return next();
  }

  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ success: false, message: "Niste prijavljeni." });
  }

  if (user.adminType === "main") {
    return next();
  }

  const path = req.path || "";
  if (
    path.startsWith("/admin/") ||
    path.startsWith("/admins") ||
    path.startsWith("/addAdmin") ||
    path.startsWith("/updateAdmin") ||
    path.startsWith("/deleteAdmin")
  ) {
    if (!hasPermission(user, "admini")) {
      return res.status(403).json({ success: false, message: "Nemate administratorska prava." });
    }
  }

  if (path.startsWith("/orders") || path.startsWith("/narudzbe")) {
    if (!hasPermission(user, "narudzbine")) {
      return res.status(403).json({ success: false, message: "Nemate prava za narudžbine." });
    }
  }

  if (
    path.startsWith("/products") ||
    path.startsWith("/upload-local") ||
    path.startsWith("/cloudinary")
  ) {
    if (!hasPermission(user, "proizvodi")) {
      return res.status(403).json({ success: false, message: "Nemate prava za proizvode." });
    }
  }

  return next();
}

/**
 * CSRF Zaštita za mutirajuće zahteve (POST, PUT, DELETE, PATCH).
 * Proverava da li zahtev dolazi sa autorizovanog hosta (Origin / Referer),
 * blokira zlonamerna unakrsna slanja (Cross-Origin form/fetch napade),
 * a propušta bezbedne idempotentne GET/HEAD/OPTIONS zahteve i javne rute kupaca.
 */
function csrfProtection(req, res, next) {
  const method = req.method ? req.method.toUpperCase() : "GET";
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (SAFE_METHODS.has(method)) {
    return next();
  }

  // Javne rute (npr. porudžbine kupaca, prijava na newsletter) imaju sopstvene validacije i limiter
  if (isPublicRoute(req)) {
    return next();
  }

  const host = req.headers["host"];
  const origin = req.headers["origin"];
  const referer = req.headers["referer"];

  // 1. Provera Origin zaglavlja (obavezno u pretraživačima pri fetch/CORS zahtevima)
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        console.warn(`[CSRF BLOKIRAN] Neovlašćeni Origin: ${origin}, Očekivani Host: ${host}`);
        return res.status(403).json({
          success: false,
          message: "CSRF zaštita: Nevažeće poreklo zahteva.",
        });
      }
      return next();
    } catch (e) {
      return res.status(403).json({ success: false, message: "CSRF zaštita: Neispravan format Origin zaglavlja." });
    }
  }

  // 2. Provera Referer zaglavlja ukoliko Origin nije prisutan
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        console.warn(`[CSRF BLOKIRAN] Neovlašćeni Referer: ${referer}, Očekivani Host: ${host}`);
        return res.status(403).json({
          success: false,
          message: "CSRF zaštita: Nevažeći izvor (Referer) zahteva.",
        });
      }
      return next();
    } catch (e) {
      return res.status(403).json({ success: false, message: "CSRF zaštita: Neispravan format Referer zaglavlja." });
    }
  }

  // 3. Dodatna odbrana: ako nema ni Origin ni Referer (npr. stripovan Referer):
  // Zahteva se custom header ili Content-Type: application/json koji browseri ne mogu poslati cross-origin bez preflight-a
  const isJson = req.is && (req.is("application/json") || req.is("json"));
  const hasCustomHeader = req.headers["x-requested-with"] === "XMLHttpRequest" || req.headers["x-csrf-token"];

  if (isJson || hasCustomHeader) {
    return next();
  }

  console.warn(`[CSRF BLOKIRAN] Zahtev bez Origin/Referer/Custom headera za ${req.originalUrl || req.path}`);
  return res.status(403).json({
    success: false,
    message: "CSRF zaštita: Zahtev odbijen zbog nedostatka verifikacije porekla.",
  });
}

module.exports = {
  clearAuthCookie,
  sendUnauthorized,
  isPublicRoute,
  requireAuth,
  hasPermission,
  checkPermission,
  apiPermissionGuard,
  getJwtSecret,
  getAuthCookieOptions,
  csrfProtection,
};

