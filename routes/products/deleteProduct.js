const mongoose = require("mongoose");
const Product = require("../../db/proizvodi");
const GlavnaKategorija = require("../../db/glavna_kategorija");
const { deleteLocalFolder } = require("../../utils/imageHelper");
const getProducts = require("./getProducts");
const getCategories = require("../categories/getCategories");

async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Neispravan ID proizvoda." });
    }
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Proizvod nije pronađen." });
    }

    const folderToDelete = product.mainImages || product.code;

    // Sačuvajmo podatke o kategorijama i kodu pre brisanja
    const productCategories = Array.isArray(product.category)
      ? product.category
      : product.category
      ? [product.category]
      : [];
    const productCode = product.code;

    // Ukloni šifru proizvoda iz GlavnaKategorija ads nizova
    if (productCode) {
      await GlavnaKategorija.updateMany(
        { ads: productCode },
        { $pull: { ads: productCode } }
      );
    }

    // Obriši proizvod iz baze
    await Product.findByIdAndDelete(id);

    // Ako je obrisani proizvod bio JEDINI u toj kategoriji, obriši i tu kategoriju iz GlavnaKategorija
    for (const rawCat of productCategories) {
      const cleanCat = String(rawCat || "").trim();
      if (!cleanCat) continue;
      const regexCat = new RegExp(`^${cleanCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const remainingCount = await Product.countDocuments({ category: regexCat });
      if (remainingCount === 0) {
        await GlavnaKategorija.deleteMany({
          glavnaKategorija: regexCat,
        });
      }
    }

    // Dodatno očisti sve GlavnaKategorija zapise koji više nemaju nijedan proizvod u bazi
    const allGk = await GlavnaKategorija.find({}).lean().exec();
    for (const gk of allGk) {
      const catSlug = (gk.glavnaKategorija || "").trim();
      if (!catSlug) {
        await GlavnaKategorija.deleteOne({ _id: gk._id });
        continue;
      }
      const countForCat = await Product.countDocuments({
        category: { $regex: new RegExp(`^${catSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });
      if (countForCat === 0) {
        await GlavnaKategorija.deleteOne({ _id: gk._id });
      }
    }

    // Delete uploaded image folder locally
    if (folderToDelete) {
      await deleteLocalFolder(folderToDelete);
    }

    if (typeof getProducts.clearCache === "function") getProducts.clearCache();
    if (typeof getCategories.clearCache === "function") getCategories.clearCache();

    res.json({
      success: true,
      message: "Proizvod i njegove slike su uspešno obrisani.",
    });
  } catch (err) {
    console.error("Greška pri brisanju proizvoda:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = deleteProduct;
