const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("./admin");

let cachedPromise = null;

async function initDefaultAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const defaultEmail = (
        process.env.INITIAL_ADMIN_EMAIL ||
        process.env.ADMIN_EMAIL ||
        "admin@happyanimals.rs"
      )
        .trim()
        .toLowerCase();
      const defaultPassword =
        process.env.INITIAL_ADMIN_PASSWORD ||
        process.env.ADMIN_PASSWORD ||
        "admin123";

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPassword.trim(), salt);

      await Admin.create({
        name: "Happy Animals Admin",
        mail: defaultEmail,
        password: hashedPassword,
        adminType: "main",
        permissions: ["proizvodi", "narudzbine", "admini"],
      });

      console.log(`[Admin Setup] Kreiran početni administrator: ${defaultEmail}`);
    }
  } catch (err) {
    console.error("[Admin Setup] Greška pri kreiranju početnog admina:", err.message);
  }
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  let uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === "" || uri.includes("OVDE_UNESITE") || uri.includes("<korisnicko_ime>")) {
    console.warn(
      "[MongoDB] UPOZORENJE: MONGODB_URI nije podešen u environment varijablama. Aplikacija radi u režimu bez baze dok ne unesete URL."
    );
    return false;
  }

  // Ako se koristi SRV adresa za Atlas klaster, koristimo direktni replicaSet format
  // koji ne zavisi od DNS SRV rezolucije (rešava problem na Windows-u i Vercelu bez DNS izmena, kao u Mia Butik)
  if (uri.startsWith("mongodb+srv://") && uri.includes("0nzangr.mongodb.net")) {
    const match = uri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
    if (match) {
      const user = match[1];
      const pass = match[2];
      const dbName = uri.split("/")[3]?.split("?")[0] || "happy_animals";
      uri = `mongodb://${user}:${pass}@ac-x4y5lho-shard-00-00.0nzangr.mongodb.net:27017,ac-x4y5lho-shard-00-01.0nzangr.mongodb.net:27017,ac-x4y5lho-shard-00-02.0nzangr.mongodb.net:27017/${dbName}?ssl=true&replicaSet=atlas-yuhjr8-shard-0&authSource=admin&appName=Cluster0`;
    }
  } else if (uri.startsWith("mongodb+srv://") && uri.includes("pvqbf3d.mongodb.net")) {
    const match = uri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
    if (match) {
      const user = match[1];
      const pass = match[2];
      const dbName = uri.split("/")[3]?.split("?")[0] || "happy_animals";
      uri = `mongodb://${user}:${pass}@ac-enhhnuv-shard-00-00.pvqbf3d.mongodb.net:27017,ac-enhhnuv-shard-00-01.pvqbf3d.mongodb.net:27017,ac-enhhnuv-shard-00-02.pvqbf3d.mongodb.net:27017/${dbName}?ssl=true&replicaSet=atlas-ptalwp-shard-0&authSource=admin&appName=Cluster0`;
    }
  }

  cachedPromise = mongoose
    .connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    .then(() => {
      console.log("[MongoDB] Uspešno i optimalno povezano sa bazom podataka!");
      initDefaultAdmin().catch(() => {});
      return true;
    })
    .catch((error) => {
      console.error("[MongoDB] Greška pri povezivanju sa bazom:", error.message);
      cachedPromise = null;
      return false;
    });

  return cachedPromise;
}

module.exports = { connectDB, initDefaultAdmin };

