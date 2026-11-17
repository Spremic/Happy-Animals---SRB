require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../db/admin');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("Greška: MONGO_URI nije definisan u .env fajlu!");
  process.exit(1);
}

async function createAdmin() {
  try {
    console.log("Povezivanje sa MongoDB bazom...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      family: 4
    });
    console.log("Uspešno povezano sa bazom!");

    const email = "dspremic1@gmail.com".toLowerCase().trim();
    const rawPassword = "djole123";
    const name = "Đorđe Spremić";

    const existingAdmin = await Admin.findOne({ mail: email });
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    if (existingAdmin) {
      console.log(`Administrator sa emailom "${email}" već postoji. Ažuriram lozinku i privilegije...`);
      existingAdmin.password = hashedPassword;
      existingAdmin.adminType = "main";
      existingAdmin.permissions = ["proizvodi", "narudzbine", "admini", "statistika"];
      if (!existingAdmin.name) existingAdmin.name = name;
      await existingAdmin.save();
      console.log(`Uspešno ažuriran postojeći nalog "${email}" (adminType: main, pun pristup)!`);
    } else {
      console.log(`Kreiram novog administratora "${email}"...`);
      const newAdmin = await Admin.create({
        name: name,
        mail: email,
        password: hashedPassword,
        adminType: "main",
        permissions: ["proizvodi", "narudzbine", "admini", "statistika"]
      });
      console.log(`Uspešno kreiran novi admin nalog: ${newAdmin.mail} (ID: ${newAdmin._id}, adminType: ${newAdmin.adminType})`);
    }

    await mongoose.disconnect();
    console.log("Završeno! Baza diskonektovana.");
  } catch (err) {
    console.error("Došlo je do greške:", err);
    process.exit(1);
  }
}

createAdmin();
