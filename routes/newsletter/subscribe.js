const Subscriber = require("../../db/subscriber");
const { sendNewsletterWelcomeEmail } = require("../../utils/email");

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

    let subscriber = await Subscriber.findOne({ email });
    let isNew = false;

    if (!subscriber) {
      const rawSource =
        req.body && typeof req.body.source === "string" ? req.body.source : "";
      subscriber = await Subscriber.create({
        email,
        source: rawSource.trim().slice(0, 50) || "popup_modal",
      });
      isNew = true;
    } else if (subscriber.status === "unsubscribed") {
      subscriber.status = "active";
      await subscriber.save();
    }

    // Pošalji email dobrodošlice u pozadini (samo novim pretplatnicima)
    if (isNew) {
      sendNewsletterWelcomeEmail(email).catch((err) =>
        console.warn("Newsletter email warning:", err.message)
      );
    }

    return res.status(200).json({
      success: true,
      message: isNew
        ? "Uspešno ste se prijavili na naš newsletter!"
        : "Već ste prijavljeni na naš newsletter!",
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
