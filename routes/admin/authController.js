const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../../db/admin");
const { clearAuthCookie, getJwtSecret, getAuthCookieOptions } = require("../../utils/auth");

async function login(req, res) {
  const { mail, password } = req.body || {};

  if (
    !mail ||
    !password ||
    typeof mail !== "string" ||
    typeof password !== "string" ||
    mail.length > 200 ||
    password.length > 200
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Unesite ispravan email i lozinku." });
  }

  try {
    const cleanMail = String(mail).trim().toLowerCase();
    const user = await Admin.findOne({ mail: cleanMail }).exec();

    if (!user || !user.password) {
      return res
        .status(401)
        .json({ success: false, message: "Neispravni podaci za prijavu." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Neispravni podaci za prijavu." });
    }

    const jwtSecret = getJwtSecret();
    const tokenPayload = {
      id: user._id,
      name: user.name,
      mail: user.mail,
      adminType: user.adminType,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: "7d" });

    const cookieOptions = getAuthCookieOptions(req);
    res.cookie("token", token, cookieOptions);
    return res.json({
      success: true,
      message: "Prijava uspešna.",
      user: { name: user.name, mail: user.mail, id: user._id },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Greška na serveru." });
  }
}

async function verifyAuth(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ authenticated: false });

  try {
    const jwtSecret = getJwtSecret();
    const payload = jwt.verify(token, jwtSecret);
    const user = await Admin.findById(payload.id).lean();
    if (!user) {
      clearAuthCookie(res, req);
      return res.status(401).json({ authenticated: false });
    }
    const { password, ...userWithoutPassword } = user;
    return res.json({ authenticated: true, user: userWithoutPassword });
  } catch (err) {
    clearAuthCookie(res, req);
    return res.status(401).json({ authenticated: false });
  }
}

function logoutApi(req, res) {
  clearAuthCookie(res, req);
  return res.json({ success: true, message: "Uspešno ste odjavljeni." });
}

function logoutUi(req, res) {
  clearAuthCookie(res, req);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return res.redirect("/login");
}

module.exports = {
  login,
  verifyAuth,
  logoutApi,
  logoutUi,
};

