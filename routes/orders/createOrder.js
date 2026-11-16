const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../../db/order");
const Product = require("../../db/proizvodi");
const { sendOrderNotificationEmail } = require("../../utils/email");
const getProducts = require("../products/getProducts");
const getCategories = require("../categories/getCategories");
const { resolveVariantForItem } = require("../../utils/productVariants");

let _orderStockLock = Promise.resolve();
function acquireOrderStockLock() {
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const prev = _orderStockLock;
  _orderStockLock = prev.then(() => next);
  return prev.then(() => release);
}

async function createOrder(req, res) {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      email,
      streetName,
      houseNumber,
      apartment,
      city,
      postalCode,
      note,
      paymentMethod,
      items,
      couponCode,
      acceptTerms,
    } = req.body;

    const safeStr = (val, maxLen = 150) =>
      typeof val === "string" ? val.trim().slice(0, maxLen) : "";

    const cleanFirstName = safeStr(firstName, 80);
    const cleanLastName = safeStr(lastName, 80);
    const cleanPhone = safeStr(phoneNumber, 40);
    const cleanEmail = safeStr(email, 150).toLowerCase();
    const cleanStreet = safeStr(streetName, 150);
    const cleanHouse = safeStr(houseNumber, 30);
    const cleanApt = safeStr(apartment, 30);
    const cleanCity = safeStr(city, 80);
    const cleanPostal = safeStr(postalCode, 20);
    const cleanNote = safeStr(note, 1000);

    // =========================================================================
    // SERVERSKA EXPRESS VALIDACIJA PODATAKA ZA DOSTAVU I USLOVA KORIŠĆENJA
    // Štiti sistem ako neko zaobiđe ili izmeni klijentski JS
    // =========================================================================
    if (!acceptTerms || acceptTerms === false || acceptTerms === "false") {
      return res.status(400).json({
        success: false,
        message: "Morate prihvatiti uslove korišćenja da biste izvršili porudžbinu.",
      });
    }

    if (!cleanFirstName || cleanFirstName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Ime je obavezno i mora imati najmanje 2 karaktera.",
      });
    }

    if (!cleanLastName || cleanLastName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Prezime je obavezno i mora imati najmanje 2 karaktera.",
      });
    }

    const phoneDigits = cleanPhone.replace(/[^0-9]/g, "");
    if (!cleanPhone || phoneDigits.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Molimo unesite ispravan broj telefona sa najmanje 8 cifara.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Molimo unesite ispravnu email adresu.",
      });
    }

    if (!cleanStreet || cleanStreet.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Ulica i kućni broj su obavezni (najmanje 4 karaktera).",
      });
    }

    if (!cleanCity || cleanCity.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Grad/mesto je obavezno polje.",
      });
    }

    if (!cleanPostal || cleanPostal.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Poštanski broj je obavezno polje (najmanje 3 karaktera).",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vaša korpa je prazna.",
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Prekoračen je maksimalan broj stavki u jednoj porudžbini.",
      });
    }

    let calculatedTotal = 0;
    const verifiedItems = [];
    const validCartItems = [];
    // Mapa za agregaciju ukupne tražene količine po proizvodu (_id) u istoj porudžbini
    const productOrderMap = new Map();

    const unavailableItems = [];

    let discount = 0;
    let cleanCoupon = "";
    let shipping = 0;
    let totalAmount = 0;
    const deductedProducts = [];
    let rollbackDeductedStock = async () => {};

    const releaseStockLock = await acquireOrderStockLock();
    try {

    // =========================================================================
    // BEZBEDNOSNA VALIDACIJA: Provera svakog artikla u bazi podataka
    // Cene, nazivi i dostupnost se uzimaju ISKLJUČIVO iz MongoDB baze!
    // Klijentske manipulacije cenom (Inspect Element / DevTools) se odbacuju!
    // =========================================================================
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item || typeof item !== "object") {
        return res.status(400).json({
          success: false,
          message: "Neispravan format stavke u korpi.",
        });
      }

      // 1. Provera količine (mora biti striktno pozitivan ceo broj, sprečava NaN, negativne vrednosti i decimalne injekcije)
      const rawQtyNum = Number(item.quantity);
      const qty = parseInt(item.quantity, 10);
      if (isNaN(rawQtyNum) || !Number.isInteger(rawQtyNum) || isNaN(qty) || qty <= 0 || qty > 50) {
        return res.status(400).json({
          success: false,
          message: `Neispravna količina za artikal "${item.title || idx + 1}". Količina mora biti pozitivan ceo broj.`,
        });
      }

      // 2. Pretraga proizvoda u bazi po _id, šifri (code), slugu ili naslovu
      const rawCode = String(item.code || "").trim().toLowerCase();
      const rawProductId = String(item.productId || item.id || "").trim();
      const rawSlug = String(item.slug || "").trim().toLowerCase();
      const rawTitle = String(item.title || item.name || "").trim();

      const lookupQueries = [];
      if (rawProductId && mongoose.Types.ObjectId.isValid(rawProductId)) {
        lookupQueries.push({ _id: rawProductId });
      }
      if (rawCode) {
        lookupQueries.push({ code: rawCode });
      }
      if (rawSlug) {
        lookupQueries.push({ slug: rawSlug });
      }
      if (rawTitle) {
        lookupQueries.push({ title: new RegExp("^" + rawTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") });
      }

      const itemImg = item.image || item.img || "/img/customPageBcg.png";
      const itemSize = String(item.variant || item.size || item.velicina || "Standard").trim();
      const itemColor = String(item.color || item.boja || "Standard").trim();
      const resolvedItemId = item.id !== undefined ? item.id : `unavail-${idx}`;

      if (lookupQueries.length === 0) {
        unavailableItems.push({
          id: resolvedItemId,
          productId: rawProductId,
          code: rawCode,
          slug: rawSlug,
          title: rawTitle || "Nepoznat artikal",
          variant: itemSize,
          size: itemSize,
          color: itemColor,
          quantity: qty,
          price: parseFloat(item.price) || 0,
          img: itemImg,
          reason: "deleted",
          reasonText: "Artikal više ne postoji u ponudi",
        });
        continue;
      }

      const product = await Product.findOne({ $or: lookupQueries });

      // 3. Provera da li artikal uopšte postoji u bazi ili je neaktivan
      if (!product || product.status === "neaktivan") {
        unavailableItems.push({
          id: resolvedItemId,
          productId: product ? String(product._id) : rawProductId,
          code: product ? product.code : rawCode,
          slug: product ? product.slug : rawSlug,
          title: product ? product.title : (rawTitle || rawCode || "Artikal"),
          variant: itemSize,
          size: itemSize,
          color: itemColor,
          quantity: qty,
          price: product ? parseFloat(product.price) : (parseFloat(item.price) || 0),
          img: (product && (product.imageUrl || (Array.isArray(product.images) && product.images[0]))) || itemImg,
          reason: "deleted",
          reasonText: "Artikal više ne postoji u ponudi",
        });
        continue;
      }

      // 4. STVARNA CENA I LAGER PO VARIJANTI IZ BAZE (IGNORIŠU SE KLIJENTSKE CENE!)
      const resolvedVariant = resolveVariantForItem(product, item);
      const verifiedPrice = resolvedVariant.price;
      const resolvedVariantLabel = resolvedVariant.variantLabel || itemSize;
      const currentStock = typeof product.stock === "number" ? product.stock : 10;
      const variantStock = typeof resolvedVariant.stock === "number" ? resolvedVariant.stock : currentStock;
      const effectiveStock = Math.min(currentStock, variantStock);

      if (product.status === "rasprodato" || currentStock <= 0 || variantStock <= 0) {
        unavailableItems.push({
          id: resolvedItemId,
          productId: String(product._id),
          code: product.code,
          slug: product.slug,
          title: product.title,
          variant: resolvedVariantLabel,
          size: resolvedVariantLabel,
          color: itemColor,
          quantity: qty,
          price: verifiedPrice || parseFloat(product.price) || (parseFloat(item.price) || 0),
          img: product.imageUrl || (Array.isArray(product.images) && product.images[0]) || itemImg,
          reason: "sold_out",
          reasonText: "Trenutno rasprodato",
        });
        continue;
      }

      const prodKey = String(product._id);
      const existingEntry = productOrderMap.get(prodKey);
      const cumulativeQty = (existingEntry ? existingEntry.deductQty : 0) + qty;
      const varMap = existingEntry && existingEntry.variantDeductions ? new Map(existingEntry.variantDeductions) : new Map();
      const varKeyLower = String(resolvedVariantLabel).trim().toLowerCase();
      const cumulativeVarQty = (varMap.get(varKeyLower) || 0) + qty;

      if (cumulativeQty > currentStock || cumulativeVarQty > variantStock) {
        unavailableItems.push({
          id: resolvedItemId,
          productId: String(product._id),
          code: product.code,
          slug: product.slug,
          title: product.title,
          variant: resolvedVariantLabel,
          size: resolvedVariantLabel,
          color: itemColor,
          quantity: qty,
          price: verifiedPrice || parseFloat(product.price) || (parseFloat(item.price) || 0),
          img: product.imageUrl || (Array.isArray(product.images) && product.images[0]) || itemImg,
          reason: "insufficient_stock",
          reasonText: `Na stanju ima samo ${effectiveStock} komada`,
        });
        continue;
      }

      if (isNaN(verifiedPrice) || verifiedPrice < 0) {
        return res.status(500).json({
          success: false,
          message: `Greška u konfiguraciji cene za artikal "${product.title}".`,
        });
      }

      const itemTotal = verifiedPrice * qty;
      calculatedTotal += itemTotal;

      // Izbor slike
      let verifiedImg = product.imageUrl || "";
      if (!verifiedImg && Array.isArray(product.images) && product.images.length > 0) {
        verifiedImg = product.images[0];
      }
      if (!verifiedImg) {
        verifiedImg = item.image || item.img || "/img/customPageBcg.png";
      }

      verifiedItems.push({
        productId: prodKey,
        code: product.code || rawCode,
        title: product.title,
        variant: resolvedVariantLabel,
        size: resolvedVariantLabel,
        color: itemColor,
        price: verifiedPrice, // Autoritativna cena varijante iz MongoDB
        quantity: qty,
        image: verifiedImg,
        total: itemTotal,
      });

      validCartItems.push({
        ...item,
        id: item.id,
        productId: prodKey,
        code: product.code || rawCode,
        slug: product.slug || rawSlug,
        title: product.title,
        price: verifiedPrice,
        priceFormatted: verifiedPrice.toLocaleString("sr-RS") + " RSD",
        quantity: qty,
        stock: currentStock,
        status: product.status || "aktivan",
        img: verifiedImg,
        variant: resolvedVariantLabel,
        size: resolvedVariantLabel,
        color: itemColor,
      });

      varMap.set(varKeyLower, cumulativeVarQty);
      productOrderMap.set(prodKey, {
        productDoc: product,
        deductQty: cumulativeQty,
        currentStock,
        variantDeductions: varMap,
      });
    }

    // Ako postoje nedostupni artikli, vraćamo strukturiranu grešku sa svim nedostupnim i validnim artiklima
    if (unavailableItems.length > 0) {
      const adjShipping = calculatedTotal >= 3000 || calculatedTotal === 0 ? 0 : 350;
      return res.status(400).json({
        success: false,
        hasUnavailable: true,
        unavailableItems,
        validItems: validCartItems,
        adjustedSubtotal: calculatedTotal,
        adjustedShipping: adjShipping,
        adjustedTotal: calculatedTotal + adjShipping,
        message: `Nažalost, ${unavailableItems.length === 1 ? 'jedan artikal iz vaše korpe više nije dostupan' : `${unavailableItems.length} artikla iz vaše korpe više nisu dostupna`}. Možete poručiti bez njih.`,
      });
    }

    if (verifiedItems.length === 0) {
      return res.status(400).json({
        success: false,
        hasUnavailable: true,
        unavailableItems,
        validItems: [],
        message: "Vaša korpa ne sadrži nijedan dostupan artikal za poručivanje.",
      });
    }

    // =========================================================================
    // SERVERSKI PRORAČUN KUPONA I POPUSTA
    // =========================================================================
    cleanCoupon = String(couponCode || "").trim().toUpperCase();
    if (cleanCoupon === "HA10" || cleanCoupon === "MIA10") {
      discount = Math.round(calculatedTotal * 0.1);
    } else if (cleanCoupon) {
      return res.status(400).json({
        success: false,
        message: "Uneti kupon kod nije validan ili je istekao.",
      });
    }

    // =========================================================================
    // SERVERSKI PRORAČUN DOSTAVE (POTPUNO IGNORIŠE KLIJENTSKI shippingAmount!)
    // Pravilo sajta: Besplatna dostava za porudžbine >= 3.000 RSD, inače 350 RSD
    // =========================================================================
    shipping = calculatedTotal >= 3000 ? 0 : 350;
    totalAmount = Math.max(0, calculatedTotal - discount) + shipping;

    // =========================================================================
    // ATOMSKO AŽURIRANJE ZALIHA (LAGERA) U BAZI PRE UPISA PORUDŽBINE
    // Sprečava Race Condition i zaobilaženje stanja dupliranim stavkama
    // =========================================================================
    rollbackDeductedStock = async () => {
      for (const prev of deductedProducts) {
        try {
          const restored = await Product.findOneAndUpdate(
            { _id: prev.productId },
            { $inc: { stock: prev.deductQty } },
            { new: true }
          );
          if (restored && prev.variantDeductions && prev.variantDeductions.size > 0 && Array.isArray(restored.variants)) {
            let varChanged = false;
            restored.variants.forEach((v) => {
              const vKey = String(v.label || "").trim().toLowerCase();
              const vAdd = prev.variantDeductions.get(vKey);
              if (vAdd) {
                v.stock = Math.max(0, (typeof v.stock === "number" ? v.stock : 0) + vAdd);
                varChanged = true;
              }
            });
            if (varChanged) await restored.save();
          }
          if (restored && restored.stock > 0 && restored.status === "rasprodato") {
            await Product.updateOne(
              { _id: prev.productId, status: "rasprodato", stock: { $gt: 0 } },
              { $set: { status: "aktivan" } }
            );
          }
        } catch (rollbackErr) {
          console.error("Greška pri vraćanju zaliha (rollback):", rollbackErr.message);
        }
      }
    };

    for (const updateInfo of productOrderMap.values()) {
      const prod = updateInfo.productDoc;
      const deductQty = updateInfo.deductQty;

      // Osiguraj da stariji artikli u bazi koji možda nemaju eksplicitno polje 'stock' dobiju početnu vrednost
      await Product.updateOne(
        { _id: prod._id, stock: { $exists: false } },
        { $set: { stock: updateInfo.currentStock } }
      );

      const updatedProd = await Product.findOneAndUpdate(
        {
          _id: prod._id,
          status: { $nin: ["neaktivan", "rasprodato"] },
          stock: { $gte: deductQty },
        },
        {
          $inc: { stock: -deductQty },
        },
        { new: true }
      );

      if (!updatedProd) {
        await rollbackDeductedStock();
        return res.status(400).json({
          success: false,
          message: `Za artikal "${prod.title}" više nema dovoljno zaliha na stanju.`,
        });
      }

      if (updateInfo.variantDeductions && updateInfo.variantDeductions.size > 0 && Array.isArray(updatedProd.variants) && updatedProd.variants.length > 0) {
        let varChanged = false;
        let variantInsufficient = false;
        updatedProd.variants.forEach((v) => {
          const vKey = String(v.label || "").trim().toLowerCase();
          const vSub = updateInfo.variantDeductions.get(vKey);
          if (vSub) {
            const avail = typeof v.stock === "number" ? v.stock : 0;
            if (avail < vSub) {
              variantInsufficient = true;
            } else {
              v.stock = avail - vSub;
              varChanged = true;
            }
          }
        });
        if (variantInsufficient) {
          await Product.findOneAndUpdate({ _id: prod._id }, { $inc: { stock: deductQty } });
          await rollbackDeductedStock();
          return res.status(400).json({
            success: false,
            message: `Za izabranu varijantu artikla "${prod.title}" više nema dovoljno zaliha na stanju.`,
          });
        }
        if (varChanged) {
          await updatedProd.save();
        }
      }

      if (updatedProd.stock <= 0) {
        await Product.updateOne(
          { _id: prod._id },
          { $set: { stock: 0, status: updatedProd.status === "neaktivan" ? "neaktivan" : "rasprodato" } }
        );
      }

      deductedProducts.push({
        productId: prod._id,
        deductQty,
        variantDeductions: updateInfo.variantDeductions,
      });
    }
    } finally {
      releaseStockLock();
    }

    // Generisanje čitljivog broja porudžbine
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHex = crypto.randomInt(1000, 10000);
    const orderNumber = `HA-${dateStr}-${randomHex}`;

    // Kreiranje porudžbine u bazi (uz rollback zaliha ako upis ne uspe)
    let newOrder;
    try {
      newOrder = await Order.create({
        orderNumber,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        phoneNumber: cleanPhone,
        email: cleanEmail,
        streetName: cleanStreet,
        houseNumber: cleanHouse,
        apartment: cleanApt,
        city: cleanCity,
        postalCode: cleanPostal,
        note: cleanNote,
        paymentMethod:
          typeof paymentMethod === "string" && ["pouzecem", "kartica", "cod", "card", "paypal"].includes(paymentMethod.trim())
            ? paymentMethod.trim()
            : "pouzecem",
        paymentStatus: "pending",
        status: "na_cekanju",
        items: verifiedItems,
        couponCode: cleanCoupon,
        discountAmount: discount,
        shippingAmount: shipping,
        totalAmount,
      });
    } catch (createErr) {
      await rollbackDeductedStock();
      throw createErr;
    }

    if (typeof getProducts.clearCache === "function") getProducts.clearCache();
    if (typeof getCategories.clearCache === "function") getCategories.clearCache();

    // Slanje email notifikacije u pozadini
    sendOrderNotificationEmail(newOrder).catch((e) =>
      console.error("Email notification error:", e.message)
    );

    res.status(201).json({
      success: true,
      message: "Porudžbina je uspešno primljena i verifikovana!",
      orderNumber: newOrder.orderNumber,
      orderId: newOrder._id,
      subtotal: calculatedTotal,
      discountAmount: discount,
      shippingAmount: shipping,
      totalAmount,
    });
  } catch (err) {
    console.error("Greška pri kreiranju porudžbine:", err);
    res.status(500).json({
      success: false,
      message: "Greška pri obradi porudžbine na serveru: " + err.message,
    });
  }
}

module.exports = createOrder;
