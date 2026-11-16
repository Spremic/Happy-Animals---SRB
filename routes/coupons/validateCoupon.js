async function validateCoupon(req, res) {
  try {
    const rawVal =
      (req.body && req.body.code) || (req.query && req.query.code) || "";
    const rawCode =
      typeof rawVal === "string" ? rawVal.trim().toUpperCase().slice(0, 50) : "";

    if (!rawCode) {
      return res.status(400).json({
        valid: false,
        message: "Molimo unesite kupon kod.",
      });
    }

    if (rawCode === "HA10" || rawCode === "MIA10") {
      return res.status(200).json({
        valid: true,
        code: rawCode,
        discountPercent: 10,
        message: `Kupon ${rawCode} je uspešno primenjen (-10%)!`,
      });
    }

    return res.status(400).json({
      valid: false,
      message: "Uneti kupon kod nije validan ili je istekao.",
    });
  } catch (err) {
    console.error("Greška pri validaciji kupona:", err);
    return res.status(500).json({
      valid: false,
      message: "Greška na serveru pri proveri kupona.",
    });
  }
}

module.exports = validateCoupon;

