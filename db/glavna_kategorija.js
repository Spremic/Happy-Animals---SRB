const mongoose = require("mongoose");

const GlavnaKategorijaSchema = new mongoose.Schema(
  {
    glavnaKategorija: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    naziv: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    ads: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
    collection: "GlavnaKategorija",
  }
);

const GlavnaKategorija = mongoose.model(
  "GlavnaKategorija",
  GlavnaKategorijaSchema
);

module.exports = GlavnaKategorija;

