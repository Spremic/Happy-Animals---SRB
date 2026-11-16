const VALID_VARIANT_TYPES = new Set(["kg", "size", "volume", "pieces", "custom"]);

function normalizeStringArray(val) {
  if (Array.isArray(val)) {
    return val.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    return val
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Normalizuje varijante pakovanja/veličina sa cenama iz admin forme.
 * Čuva kompatibilnost sa `sizes`, `price` i `oldPrice`.
 */
function normalizeVariantsInput(rawVariants, fallbackSizes, fallbackPrice, fallbackOldPrice, fallbackStock) {
  const basePrice = Math.max(0, Number(fallbackPrice) || 0);
  const baseOldPrice =
    fallbackOldPrice !== undefined && fallbackOldPrice !== null && fallbackOldPrice !== ""
      ? Number(fallbackOldPrice)
      : null;
  const baseStock =
    fallbackStock !== undefined && fallbackStock !== null && fallbackStock !== ""
      ? Math.max(0, parseInt(fallbackStock, 10) || 0)
      : 10;

  let list = [];
  if (Array.isArray(rawVariants)) {
    list = rawVariants;
  } else if (typeof rawVariants === "string" && rawVariants.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(rawVariants);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {}
  }

  const normalized = [];
  const seen = new Set();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const label = String(item.label || item.size || "").trim().slice(0, 60);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const vPrice = Number(item.price);
    const price = !isNaN(vPrice) && vPrice >= 0 ? vPrice : basePrice;

    const vOld =
      item.oldPrice !== undefined && item.oldPrice !== null && item.oldPrice !== ""
        ? Number(item.oldPrice)
        : null;
    const oldPrice = vOld && !isNaN(vOld) && vOld > price ? vOld : null;

    const vStock =
      item.stock !== undefined && item.stock !== null && item.stock !== ""
        ? parseInt(item.stock, 10)
        : baseStock;

    normalized.push({
      label,
      price,
      oldPrice,
      stock: !isNaN(vStock) && vStock >= 0 ? vStock : baseStock,
    });
  }

  // Fallback ako su poslate samo oznake bez varijanti
  if (normalized.length === 0) {
    const cleanSizes = normalizeStringArray(fallbackSizes);
    cleanSizes.forEach((lbl) => {
      if (!seen.has(lbl.toLowerCase())) {
        seen.add(lbl.toLowerCase());
        normalized.push({
          label: lbl,
          price: basePrice,
          oldPrice: baseOldPrice && baseOldPrice > basePrice ? baseOldPrice : null,
          stock: baseStock,
        });
      }
    });
  }

  const sizes = normalized.map((v) => v.label);
  let effectivePrice = basePrice;
  let effectiveOldPrice = baseOldPrice && baseOldPrice > basePrice ? baseOldPrice : null;

  if (normalized.length > 0 && (basePrice <= 0 || list.length > 0)) {
    const sorted = normalized.slice().sort((a, b) => a.price - b.price);
    effectivePrice = sorted[0].price;
    effectiveOldPrice = sorted[0].oldPrice || effectiveOldPrice;
  }

  const totalStock =
    list.length > 0 && normalized.length > 0
      ? normalized.reduce((sum, v) => sum + (typeof v.stock === "number" && !isNaN(v.stock) ? v.stock : 0), 0)
      : baseStock;

  return {
    variants: normalized,
    sizes,
    price: effectivePrice,
    oldPrice: effectiveOldPrice,
    totalStock,
  };
}

function resolveVariantType(rawType) {
  const t = String(rawType || "").trim().toLowerCase();
  return VALID_VARIANT_TYPES.has(t) ? t : "kg";
}

/**
 * Autoritativno pronalazi cenu i naziv varijante sa servera (MongoDB dokumenta)
 * za stavku u korpi ili porudžbini. Ignoriše klijentske cene radi bezbednosti.
 */
function resolveVariantForItem(product, item) {
  const requestedRaw = String((item && (item.variant || item.size || item.velicina)) || "").trim();
  const variants = Array.isArray(product && product.variants) ? product.variants : [];

  if (variants.length > 0) {
    let matched = null;
    if (requestedRaw) {
      const reqLower = requestedRaw.toLowerCase();
      matched = variants.find((v) => String(v.label || "").trim().toLowerCase() === reqLower) || null;
    }
    if (!matched) {
      matched = variants[0];
    }

    const vPrice = Number(matched.price);
    const fallbackProdPrice = Number(product.price) || 0;
    const price = !isNaN(vPrice) && vPrice >= 0 ? vPrice : fallbackProdPrice;
    const stock = typeof matched.stock === "number" ? matched.stock : (typeof product.stock === "number" ? product.stock : 10);

    return {
      variantLabel: matched.label || requestedRaw || "Standard",
      price,
      stock,
    };
  }

  return {
    variantLabel: requestedRaw || (Array.isArray(product.sizes) && product.sizes[0]) || "Standard",
    price: Number(product && product.price) || 0,
    stock: typeof (product && product.stock) === "number" ? product.stock : 10,
  };
}

module.exports = {
  VALID_VARIANT_TYPES,
  normalizeStringArray,
  normalizeVariantsInput,
  resolveVariantType,
  resolveVariantForItem,
};

