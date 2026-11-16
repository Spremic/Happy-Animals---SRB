const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    adminType: { type: String, default: "standard" }, // "main" or "standard"
    permissions: {
      type: [String],
      default: ["proizvodi", "narudzbine"],
    },
  },
  {
    timestamps: true,
    collection: "Admin",
  }
);

const Admin = mongoose.model("Admin", AdminSchema);

module.exports = Admin;

