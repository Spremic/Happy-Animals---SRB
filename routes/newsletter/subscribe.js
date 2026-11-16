const Subscriber = require("../../db/subscriber");
const { sendNewsletterCouponEmail } = require("../../utils/email");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function subscribeNewsletter(req, res) {
  try {
    const rawEmail =
      req.body && typeof req.body.email === "string" ? req.body.email : "";
    const email = rawEmail.trim().toLowerCase().slice(0, 150);

    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Molimo unesite ispravnu email adresu.",
      });
    }

    const couponCode = "HA10";

    let subscriber = await Subscriber.findOne({ email });
    let isNew = false;

    if (!subscriber) {
      subscriber = await Subscriber.create({
        email,
        couponCode,
        source: req.body.source || "popup_modal",
      });
      isNew = true;
    } else if (subscriber.status === "unsubscribed") {
      subscriber.status = "active";
      await subscriber.save();
    }

    // Pošalji email sa kuponom u pozadini
    sendNewsletterCouponEmail(email, couponCode).catch((err) =>
      console.warn("Newsletter email warning:", err.message)
    );

    return res.status(200).json({
      success: true,
      message: isNew
        ? "Uspešno ste se prijavili! Vaš promotivni kod HA10 za 10% popusta stiže na vašu email adresu."
        : "Već ste prijavljeni na naš newsletter! Vaš promotivni kod je HA10 za 10% popusta.",
      coupon: couponCode,
      isNew,
    });
  } catch (err) {
    console.error("Greška pri prijavi na newsletter:", err);
    return res.status(500).json({
      success: false,
      message: "Došlo je do greške prilikom prijave. Molimo pokušajte ponovo.",
    });
  }
}

module.exports = subscribeNewsletter;

