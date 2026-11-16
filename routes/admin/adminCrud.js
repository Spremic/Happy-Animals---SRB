const Admin = require("../../db/admin");
const Order = require("../../db/order");
const Product = require("../../db/proizvodi");
const bcrypt = require("bcryptjs");

async function getAdmins(req, res) {
  try {
    const admins = await Admin.find({}, "-password").sort({ createdAt: -1 }).lean();
    res.json({ success: true, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addAdmin(req, res) {
  try {
    const { name, mail, password, permissions, adminType } = req.body;
    if (!name || !mail || !password) {
      return res.status(400).json({ success: false, message: "Sva polja su obavezna." });
    }

    if (typeof password !== "string" || password.trim().length < 6) {
      return res.status(400).json({ success: false, message: "Lozinka mora imati najmanje 6 karaktera." });
    }

    const caller = req.authUser;
    const callerIsMain = caller && caller.adminType === "main";

    // 1. Zabrana eskalacije: samo 'main' superadmin može kreirati novog 'main' administratora
    if (adminType === "main" && !callerIsMain) {
      return res.status(403).json({
        success: false,
        message: "Samo glavni administrator može kreirati superadmin naloge.",
      });
    }

    // 2. Standardni administrator ne može dodeliti dozvolu za upravljanje administratorima ('admini')
    let sanitizedPermissions = Array.isArray(permissions) ? [...permissions] : ["proizvodi", "narudzbine"];
    if (!callerIsMain) {
      sanitizedPermissions = sanitizedPermissions.filter((p) => p !== "admini");
    }

    const finalAdminType = callerIsMain ? (adminType === "main" ? "main" : "standard") : "standard";

    const cleanMail = mail.trim().toLowerCase();
    const existing = await Admin.findOne({ mail: cleanMail });
    if (existing) {
      return res.status(400).json({ success: false, message: "Korisnik sa ovim emailom već postoji." });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const newAdmin = await Admin.create({
      name: name.trim(),
      mail: cleanMail,
      password: hashedPassword,
      adminType: finalAdminType,
      permissions: sanitizedPermissions,
    });

    res.status(201).json({
      success: true,
      message: "Administrator uspešno dodat.",
      admin: { id: newAdmin._id, name: newAdmin.name, mail: newAdmin.mail, adminType: newAdmin.adminType },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateAdmin(req, res) {
  try {
    const { id } = req.params;
    const { name, mail, password, permissions, adminType } = req.body;

    const caller = req.authUser;
    const callerIsMain = caller && caller.adminType === "main";
    const isSelf = caller && String(caller._id) === String(id);

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: "Administrator nije pronađen." });
    }

    // 1. Zaštita glavnih administratora: standardni admin ne sme menjati naloge sa adminType === 'main'
    if (targetAdmin.adminType === "main" && !callerIsMain) {
      return res.status(403).json({
        success: false,
        message: "Nemate ovlašćenje da menjate nalog glavnog administratora.",
      });
    }

    // 2. Kontrola eskalacije uloge (adminType)
    if (adminType && adminType !== targetAdmin.adminType) {
      if (!callerIsMain) {
        return res.status(403).json({
          success: false,
          message: "Samo glavni administrator može menjati uloge administratora.",
        });
      }

      // Provera ako se 'main' nalog degradira u 'standard': mora ostati barem jedan 'main' admin
      if (targetAdmin.adminType === "main" && adminType !== "main") {
        const mainCount = await Admin.countDocuments({ adminType: "main" });
        if (mainCount <= 1) {
          return res.status(400).json({
            success: false,
            message: "Ne možete ukinuti status superadmina jedinom preostalom glavnom administratoru na sistemu.",
          });
        }
      }

      targetAdmin.adminType = adminType;
    }

    // 3. Kontrola dozvola (permissions)
    if (permissions && Array.isArray(permissions)) {
      if (!callerIsMain) {
        // Standardni admin ne može samom sebi dodeliti nove dozvole
        if (isSelf) {
          return res.status(403).json({
            success: false,
            message: "Ne možete sami sebi menjati dozvole.",
          });
        }

        // Standardni admin ne može drugom nalogu dodeliti dozvolu 'admini'
        if (permissions.includes("admini") && !(targetAdmin.permissions || []).includes("admini")) {
          return res.status(403).json({
            success: false,
            message: "Nemate ovlašćenje da dodelite pravo upravljanja administratorima.",
          });
        }
      }
      targetAdmin.permissions = permissions;
    }

    // 4. Ažuriranje imena
    if (name && typeof name === "string" && name.trim().length > 0) {
      targetAdmin.name = name.trim();
    }

    // 5. Ažuriranje emaila uz proveru duplikata
    if (mail && typeof mail === "string" && mail.trim().length > 0) {
      const cleanMail = mail.trim().toLowerCase();
      if (cleanMail !== targetAdmin.mail) {
        const existing = await Admin.findOne({ mail: cleanMail, _id: { $ne: targetAdmin._id } });
        if (existing) {
          return res.status(400).json({ success: false, message: "Korisnik sa ovim emailom već postoji." });
        }
        targetAdmin.mail = cleanMail;
      }
    }

    // 6. Ažuriranje lozinke
    if (password && typeof password === "string" && password.trim().length > 0) {
      if (password.trim().length < 6) {
        return res.status(400).json({ success: false, message: "Lozinka mora imati najmanje 6 karaktera." });
      }
      targetAdmin.password = await bcrypt.hash(password.trim(), 10);
    }

    await targetAdmin.save();
    res.json({ success: true, message: "Administrator uspešno ažuriran." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteAdmin(req, res) {
  try {
    const { id } = req.params;
    const caller = req.authUser;
    const callerIsMain = caller && caller.adminType === "main";

    // 1. Zabrana samobrisanja
    if (caller && String(caller._id) === String(id)) {
      return res.status(400).json({ success: false, message: "Ne možete obrisati sopstveni nalog." });
    }

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: "Administrator nije pronađen." });
    }

    // 2. Standardni admin ne sme obrisati 'main' administratora
    if (targetAdmin.adminType === "main" && !callerIsMain) {
      return res.status(403).json({
        success: false,
        message: "Nemate ovlašćenje da obrišete glavnog administratora.",
      });
    }

    // 3. Zaštita jedinog 'main' administratora na sistemu
    if (targetAdmin.adminType === "main") {
      const mainCount = await Admin.countDocuments({ adminType: "main" });
      if (mainCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Ne možete obrisati jedinog preostalog glavnog administratora na sistemu.",
        });
      }
    }

    await Admin.findByIdAndDelete(id);
    res.json({ success: true, message: "Administrator uspešno obrisan." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getDashboardStats(req, res) {
  try {
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      revenueResult
    ] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ status: "aktivan" }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $ne: "otkazano" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const totalRevenue = revenueResult.length > 0 ? (revenueResult[0].total || 0) : 0;

    res.json({
      success: true,
      stats: {
        totalProducts,
        activeProducts,
        totalOrders,
        totalRevenue,
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getAdmins,
  addAdmin,
  updateAdmin,
  deleteAdmin,
  getDashboardStats,
};

