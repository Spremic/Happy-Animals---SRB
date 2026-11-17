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
 * Normalizuje boje proizvoda zajedno sa stanjem zaliha (stock) po boji.
 */
function normalizeColorsInput(rawColors, fallbackStock) {
  const baseStock =
    fallbackStock !== undefined && fallbackStock !== null && fallbackStock !== ""
      ? Math.max(0, parseInt(fallbackStock, 10) || 0)
      : 10;

  let list = [];
  if (Array.isArray(rawColors)) {
    list = rawColors;
  } else if (typeof rawColors === "string") {
    const trimmed = rawColors.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) {}
    } else if (trimmed) {
      list = trimmed.split(",").map((c) => ({ name: c.trim(), hex: "#2c2527", code: "#2c2527", stock: baseStock }));
    }
  }

  const normalized = [];
  const seen = new Set();

  for (const item of list) {
    if (!item) continue;
    let name = "";
    let hex = "#2c2527";
    let code = "#2c2527";
    let stock = baseStock;

    if (typeof item === "string") {
      name = item.trim().slice(0, 60);
    } else if (typeof item === "object") {
      name = String(item.name || item.label || "").trim().slice(0, 60);
      const rawHex = String(item.hex || item.code || "#2c2527").trim();
      hex = rawHex || "#2c2527";
      code = String(item.code || rawHex || "#2c2527").trim() || hex;
      if (item.stock !== undefined && item.stock !== null && item.stock !== "") {
        const parsedStk = parseInt(item.stock, 10);
        if (!isNaN(parsedStk) && parsedStk >= 0) {
          stock = parsedStk;
        }
      }
    }

    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      name,
      hex,
      code,
      stock,
    });
  }

  const totalStock = normalized.length > 0
    ? normalized.reduce((sum, c) => sum + (typeof c.stock === "number" && !isNaN(c.stock) ? c.stock : 0), 0)
    : baseStock;

  return {
    colors: normalized,
    totalStock,
  };
}

/**
 * Autoritativno pronalazi cenu, naziv i lager varijante i boje sa servera (MongoDB dokumenta)
 * za stavku u korpi ili porudžbini. Ignoriše klijentske cene radi bezbednosti.
 */
function resolveVariantForItem(product, item) {
  const requestedRaw = String((item && (item.variant || item.size || item.velicina)) || "").trim();
  const requestedColorRaw = String((item && (item.color || item.boja)) || "").trim();
  const variants = Array.isArray(product && product.variants) ? product.variants : [];
  const colors = Array.isArray(product && product.colors) ? product.colors : [];
  const productStock = typeof (product && product.stock) === "number" ? product.stock : 10;

  // Razrešavanje boje i lagera boje
  let hasColors = colors.length > 0;
  let colorName = requestedColorRaw || "";
  let colorStock = productStock;

  if (hasColors) {
    let matchedColor = null;
    if (requestedColorRaw && requestedColorRaw.toLowerCase() !== "standard") {
      const reqColorLower = requestedColorRaw.toLowerCase();
      matchedColor = colors.find((c) => {
        const cName = typeof c === "string" ? c.trim() : String((c && (c.name || c.label)) || "").trim();
        return cName.toLowerCase() === reqColorLower;
      }) || null;
    }
    if (!matchedColor) {
      matchedColor = colors[0];
    }
    const matchedColorName = typeof matchedColor === "string"
      ? matchedColor.trim()
      : String((matchedColor && (matchedColor.name || matchedColor.label)) || "").trim();
    colorName = matchedColorName || requestedColorRaw || "Standard";
    colorStock = typeof matchedColor === "object" && typeof matchedColor.stock === "number"
      ? matchedColor.stock
      : productStock;
  }

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
    const stock = typeof matched.stock === "number" ? matched.stock : productStock;

    return {
      variantLabel: matched.label || requestedRaw || "Standard",
      price,
      stock,
      hasVariants: true,
      colorName,
      colorStock,
      hasColors,
    };
  }

  return {
    variantLabel: requestedRaw || (Array.isArray(product && product.sizes) && product.sizes[0]) || "Standard",
    price: Number(product && product.price) || 0,
    stock: productStock,
    hasVariants: false,
    colorName,
    colorStock,
    hasColors,
  };
}

module.exports = {
  VALID_VARIANT_TYPES,
  normalizeStringArray,
  normalizeVariantsInput,
  normalizeColorsInput,
  resolveVariantType,
  resolveVariantForItem,
};

