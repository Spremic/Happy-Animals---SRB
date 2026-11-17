let currentPage = 1;
let currentScope = "all"; // "all" | "featured" | "stock_alerts" | "out_of_stock"
let currentColors = []; // Array of { name, hex, code, stock }
let currentVariants = []; // Array of { label, price, oldPrice, stock }
let currentTechSpecs = []; // Array of { label, value }
let uploadedImages = []; // Array of { id, file, url, name, isExisting, isRemoteUrl }
let initialImageUrls = []; // Slike pre izmena u modalu
let editingProductId = null;
let editingProductData = null;
const productsMap = new Map();
let dbCategoriesData = []; // Sve postojeće kategorije, potkategorije i potkategorije2 iz baze

const VARIANT_PRESETS = {
  kg: ["400g", "1kg", "1.5kg", "2kg", "2.5kg", "4kg", "7kg", "10kg", "12kg", "15kg"],
  size: ["XS", "S", "M", "L", "XL", "XXL", "Univerzalna"],
  volume: ["100ml", "250ml", "500ml", "1L", "5L"],
  pieces: ["1 kom", "3 kom", "6 kom", "12 kom", "24 kom"],
  custom: ["Standard"],
};

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeSearchStr(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj");
}

function formatDisplayLabel(str) {
  if (!str) return "";
  const t = String(str).trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

document.addEventListener("DOMContentLoaded", () => {
  initCustomTooltip();
  setupCategoryComboInputs();
  syncAdminCategoryOptions();
  loadProducts(1);
  setupUploader();
  setupStockStatusSync();
  setupVariantAndSpecControls();

  document.getElementById("productForm").addEventListener("submit", handleProductSave);

  // Debounced live search
  let searchTimer;
  document.getElementById("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadProducts(1), 300);
  });
});

function ensureCategoryOption(selectEl, slug, label) {
  if (!selectEl || !slug) return;
  const cleanSlug = String(slug).trim().toLowerCase();
  if (!cleanSlug) return;
  const exists = Array.from(selectEl.options).some((opt) => opt.value.toLowerCase() === cleanSlug);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = cleanSlug;
    opt.textContent = label || formatDisplayLabel(cleanSlug);
    selectEl.appendChild(opt);
  }
}

async function syncAdminCategoryOptions() {
  try {
    const res = await fetch("/api/categories?t=" + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.categories)) return;

    dbCategoriesData = data.categories;

    const filterSelect = document.getElementById("categoryFilter");
    if (filterSelect) {
      const currentSelected = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Sve kategorije</option>';
      data.categories.forEach((cat) => {
        const slug = (cat.glavnaKategorija || cat.slug || "").toLowerCase().trim();
        const name = formatDisplayLabel(cat.naziv || cat.name || slug);
        ensureCategoryOption(filterSelect, slug, name);
      });
      if (currentSelected && Array.from(filterSelect.options).some((o) => o.value === currentSelected)) {
        filterSelect.value = currentSelected;
      } else {
        filterSelect.value = "";
      }
    }
  } catch (e) {}
}

function mergeProductsIntoDbCategories(products) {
  if (!Array.isArray(products) || !products.length) return;
  const filterSelect = document.getElementById("categoryFilter");

  products.forEach((p) => {
    const cats = Array.isArray(p.category) ? p.category : p.category ? [p.category] : [];
    const subs = Array.isArray(p.subcategory) ? p.subcategory : p.subcategory ? [p.subcategory] : [];
    const subs2 = Array.isArray(p.subcategory2) ? p.subcategory2 : p.subcategory2 ? [p.subcategory2] : [];

    cats.forEach((rawCat) => {
      const catSlug = String(rawCat || "").toLowerCase().trim();
      if (!catSlug) return;
      ensureCategoryOption(filterSelect, catSlug, formatDisplayLabel(catSlug));

      let catObj = dbCategoriesData.find(
        (c) => (c.glavnaKategorija || c.slug || "").toLowerCase().trim() === catSlug
      );
      if (!catObj) {
        catObj = {
          glavnaKategorija: catSlug,
          slug: catSlug,
          naziv: formatDisplayLabel(catSlug),
          name: formatDisplayLabel(catSlug),
          count: 1,
          totalCount: 1,
          subcategories: [],
          subcategories2: [],
        };
        dbCategoriesData.push(catObj);
      }
      if (!Array.isArray(catObj.subcategories)) catObj.subcategories = [];
      if (!Array.isArray(catObj.subcategories2)) catObj.subcategories2 = [];

      subs.forEach((rawSub) => {
        const subClean = String(rawSub || "").toLowerCase().trim();
        if (!subClean) return;
        let subObj = catObj.subcategories.find(
          (s) => String(s.raw || s.name || s.slug || "").toLowerCase().trim() === subClean
        );
        if (!subObj) {
          subObj = {
            name: formatDisplayLabel(subClean),
            slug: subClean.replace(/[\s_]+/g, "-"),
            raw: subClean,
            count: 1,
            totalCount: 1,
            subcategories2: [],
          };
          catObj.subcategories.push(subObj);
        }
        if (!Array.isArray(subObj.subcategories2)) subObj.subcategories2 = [];

        subs2.forEach((rawSub2) => {
          const sub2Clean = String(rawSub2 || "").toLowerCase().trim();
          if (!sub2Clean) return;
          if (
            !subObj.subcategories2.some(
              (s2) => String(s2.raw || s2.name || s2.slug || "").toLowerCase().trim() === sub2Clean
            )
          ) {
            subObj.subcategories2.push({
              name: formatDisplayLabel(sub2Clean),
              slug: sub2Clean.replace(/[\s_]+/g, "-"),
              raw: sub2Clean,
              parentSubcategory: subClean,
              count: 1,
              totalCount: 1,
            });
          }
        });
      });

      subs2.forEach((rawSub2) => {
        const sub2Clean = String(rawSub2 || "").toLowerCase().trim();
        if (!sub2Clean) return;
        if (
          !catObj.subcategories2.some(
            (s2) => String(s2.raw || s2.name || s2.slug || "").toLowerCase().trim() === sub2Clean
          )
        ) {
          catObj.subcategories2.push({
            name: formatDisplayLabel(sub2Clean),
            slug: sub2Clean.replace(/[\s_]+/g, "-"),
            raw: sub2Clean,
            count: 1,
            totalCount: 1,
          });
        }
      });
    });
  });
}

/* ==========================================================================
   PRETRAŽIVI COMBO DROPDOWN IZ BAZE (KATEGORIJA, POTKATEGORIJA, POTKATEGORIJA 2)
   ========================================================================== */
const COMBO_CONFIG = {
  category: {
    inputId: "productCategory",
    wrapperId: "categoryComboWrapper",
    listId: "categoryDropdownList",
    allowMultiple: false,
    emptyText: "Nema sačuvanih kategorija u bazi.",
    headerAll: "Postojeće kategorije iz baze",
  },
  subcategory: {
    inputId: "productSubcategory",
    wrapperId: "subcategoryComboWrapper",
    listId: "subcategoryDropdownList",
    allowMultiple: true,
    emptyText: "Nema sačuvanih potkategorija u bazi.",
    headerContext: "Potkategorije za izabranu kategoriju",
    headerAll: "Sve potkategorije iz baze",
  },
  subcategory2: {
    inputId: "productSubcategory2",
    wrapperId: "subcategory2ComboWrapper",
    listId: "subcategory2DropdownList",
    allowMultiple: true,
    emptyText: "Nema sačuvanih potkategorija 2 u bazi.",
    headerContext: "Potkategorije 2 za izabranu grupu",
    headerAll: "Sve potkategorije 2 iz baze",
  },
};

function getActiveSearchToken(inputVal, allowMultiple) {
  const raw = String(inputVal || "");
  if (!allowMultiple) return raw.trim();
  const parts = raw.split(",");
  return (parts[parts.length - 1] || "").trim();
}

function collectComboSuggestions(type) {
  const catInput = document.getElementById("productCategory");
  const subInput = document.getElementById("productSubcategory");
  const selectedCatNorm = normalizeSearchStr(
    catInput ? catInput.value.split(",")[0] : ""
  );
  const selectedSubTokens = subInput
    ? subInput.value
        .split(",")
        .map((s) => normalizeSearchStr(s))
        .filter(Boolean)
    : [];

  if (type === "category") {
    const map = new Map();
    dbCategoriesData.forEach((c) => {
      const rawVal = (c.glavnaKategorija || c.slug || c.naziv || c.name || "").trim();
      if (!rawVal) return;
      const key = normalizeSearchStr(rawVal);
      if (!key) return;
      const count = typeof c.totalCount === "number" && c.totalCount > 0 ? c.totalCount : c.count || 0;
      if (!map.has(key)) {
        map.set(key, {
          value: rawVal.toLowerCase(),
          label: formatDisplayLabel(c.naziv || c.name || rawVal),
          meta: count > 0 ? `${count} art.` : "U bazi",
          contextual: true,
        });
      }
    });
    return Array.from(map.values());
  }

  if (type === "subcategory") {
    const contextMap = new Map();
    const otherMap = new Map();

    dbCategoriesData.forEach((c) => {
      const catNorm = normalizeSearchStr(c.glavnaKategorija || c.slug || c.naziv || "");
      const catLabel = formatDisplayLabel(c.naziv || c.name || c.glavnaKategorija || "");
      const isMatchingCat = selectedCatNorm && catNorm === selectedCatNorm;

      (c.subcategories || []).forEach((s) => {
        const rawSub = (s.raw || s.name || s.slug || "").trim();
        if (!rawSub) return;
        const key = normalizeSearchStr(rawSub);
        if (!key) return;
        const item = {
          value: formatDisplayLabel(rawSub),
          label: formatDisplayLabel(s.name || rawSub),
          meta: catLabel || "U bazi",
          contextual: isMatchingCat,
        };
        if (isMatchingCat) {
          if (!contextMap.has(key)) contextMap.set(key, item);
        } else if (!otherMap.has(key)) {
          otherMap.set(key, item);
        }
      });
    });

    // Ukloni duplikate iz otherMap ako već postoje u contextMap
    contextMap.forEach((_, k) => otherMap.delete(k));
    return [...Array.from(contextMap.values()), ...Array.from(otherMap.values())];
  }

  if (type === "subcategory2") {
    const contextMap = new Map();
    const otherMap = new Map();

    dbCategoriesData.forEach((c) => {
      const catNorm = normalizeSearchStr(c.glavnaKategorija || c.slug || c.naziv || "");
      const catLabel = formatDisplayLabel(c.naziv || c.name || c.glavnaKategorija || "");
      const isMatchingCat = selectedCatNorm && catNorm === selectedCatNorm;

      // 1. Iz podkategorija (sa tačnim parentSubcategory)
      (c.subcategories || []).forEach((s) => {
        const subNorm = normalizeSearchStr(s.raw || s.name || s.slug || "");
        const subLabel = formatDisplayLabel(s.name || s.raw || "");
        const isMatchingSub = selectedSubTokens.length > 0 && selectedSubTokens.includes(subNorm);

        (s.subcategories2 || []).forEach((s2) => {
          const rawSub2 = (s2.raw || s2.name || s2.slug || "").trim();
          if (!rawSub2) return;
          const key = normalizeSearchStr(rawSub2);
          if (!key) return;
          const isCtx = isMatchingSub || (!selectedSubTokens.length && isMatchingCat);
          const item = {
            value: formatDisplayLabel(rawSub2),
            label: formatDisplayLabel(s2.name || rawSub2),
            meta: subLabel ? `${catLabel} › ${subLabel}` : catLabel || "U bazi",
            contextual: Boolean(isCtx),
          };
          if (isCtx) {
            if (!contextMap.has(key)) contextMap.set(key, item);
          } else if (!otherMap.has(key)) {
            otherMap.set(key, item);
          }
        });
      });

      // 2. Direktno iz c.subcategories2 ako nisu vezane za potkategoriju 1
      (c.subcategories2 || []).forEach((s2) => {
        const rawSub2 = (s2.raw || s2.name || s2.slug || "").trim();
        if (!rawSub2) return;
        const key = normalizeSearchStr(rawSub2);
        if (!key) return;
        const isCtx = Boolean(isMatchingCat);
        const item = {
          value: formatDisplayLabel(rawSub2),
          label: formatDisplayLabel(s2.name || rawSub2),
          meta: catLabel || "U bazi",
          contextual: isCtx,
        };
        if (isCtx) {
          if (!contextMap.has(key)) contextMap.set(key, item);
        } else if (!otherMap.has(key)) {
          otherMap.set(key, item);
        }
      });
    });

    contextMap.forEach((_, k) => otherMap.delete(k));
    return [...Array.from(contextMap.values()), ...Array.from(otherMap.values())];
  }

  return [];
}

function renderComboDropdown(type, filterTokenOverride) {
  const cfg = COMBO_CONFIG[type];
  if (!cfg) return;
  const inputEl = document.getElementById(cfg.inputId);
  const listEl = document.getElementById(cfg.listId);
  if (!inputEl || !listEl) return;

  const activeToken =
    filterTokenOverride !== undefined
      ? String(filterTokenOverride).trim()
      : getActiveSearchToken(inputEl.value, cfg.allowMultiple);
  const queryNorm = normalizeSearchStr(activeToken);

  const allItems = collectComboSuggestions(type);

  // Ako se tekst u polju 100% poklapa sa jedinom stavkom (npr. pri kliku na chevron), prikaži sve, a kad kuca filtriraj
  const filtered = queryNorm
    ? allItems.filter(
        (item) =>
          normalizeSearchStr(item.label).includes(queryNorm) ||
          normalizeSearchStr(item.value).includes(queryNorm) ||
          normalizeSearchStr(item.meta).includes(queryNorm)
      )
    : allItems;

  const exactExists =
    queryNorm &&
    allItems.some(
      (item) =>
        normalizeSearchStr(item.label) === queryNorm ||
        normalizeSearchStr(item.value) === queryNorm
    );

  let html = "";

  if (filtered.length > 0) {
    const contextItems = filtered.filter((i) => i.contextual);
    const otherItems = filtered.filter((i) => !i.contextual);

    if (type !== "category" && contextItems.length > 0 && otherItems.length > 0) {
      html += `<div class="combo-dropdown-header">${escapeHtml(cfg.headerContext)}</div>`;
      contextItems.forEach((item) => {
        html += buildComboItemHtml(type, item);
      });
      html += `<div class="combo-dropdown-header">${escapeHtml(cfg.headerAll)}</div>`;
      otherItems.forEach((item) => {
        html += buildComboItemHtml(type, item);
      });
    } else {
      const headerTitle =
        type !== "category" && contextItems.length > 0
          ? cfg.headerContext
          : cfg.headerAll;
      html += `<div class="combo-dropdown-header">${escapeHtml(headerTitle)}</div>`;
      filtered.forEach((item) => {
        html += buildComboItemHtml(type, item);
      });
    }
  } else {
    html += `<div class="combo-dropdown-empty">${
      queryNorm
        ? `Nema postojećih stavki u bazi za "${escapeHtml(activeToken)}".`
        : escapeHtml(cfg.emptyText)
    }</div>`;
  }

  if (activeToken && !exactExists) {
    const cleanNew = activeToken.trim();
    html += `
      <div class="combo-dropdown-custom-hint" data-combo-type="${escapeHtml(type)}" data-combo-val="${escapeHtml(cleanNew)}">
        <i class="fas fa-plus-circle"></i>
        <span>Koristi novi unos: <strong>"${escapeHtml(cleanNew)}"</strong></span>
      </div>
    `;
  }

  listEl.innerHTML = html;

  listEl.querySelectorAll(".combo-dropdown-item, .combo-dropdown-custom-hint").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Spreči gubitak fokusa pre klika
      const chosenVal = el.getAttribute("data-combo-val");
      selectComboItem(type, chosenVal);
    });
  });
}

function buildComboItemHtml(type, item) {
  return `
    <div class="combo-dropdown-item" data-combo-type="${escapeHtml(type)}" data-combo-val="${escapeHtml(item.value)}">
      <span class="combo-item-label">${escapeHtml(item.label)}</span>
      <span class="combo-item-meta">${escapeHtml(item.meta)}</span>
    </div>
  `;
}

function selectComboItem(type, chosenVal) {
  const cfg = COMBO_CONFIG[type];
  if (!cfg) return;
  const inputEl = document.getElementById(cfg.inputId);
  const wrapperEl = document.getElementById(cfg.wrapperId);
  if (!inputEl) return;

  const val = String(chosenVal || "").trim();
  if (!val) return;

  if (cfg.allowMultiple && inputEl.value.includes(",")) {
    const parts = inputEl.value
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // Zameni poslednji token koji korisnik trenutno kuca izabranom vrednošću
    const rawEndsWithComma = /,\s*$/.test(inputEl.value);
    if (!rawEndsWithComma && parts.length > 0) {
      parts.pop();
    }
    if (!parts.some((p) => normalizeSearchStr(p) === normalizeSearchStr(val))) {
      parts.push(val);
    }
    inputEl.value = parts.join(", ");
  } else {
    inputEl.value = val;
  }

  if (wrapperEl) wrapperEl.classList.remove("open");

  // Osveži podređene liste kada se promeni kategorija ili potkategorija
  if (type === "category") {
    renderComboDropdown("subcategory", "");
    renderComboDropdown("subcategory2", "");
  } else if (type === "subcategory") {
    renderComboDropdown("subcategory2", "");
  }
}

function openComboDropdown(type, showAll = false) {
  const cfg = COMBO_CONFIG[type];
  if (!cfg) return;
  closeAllComboDropdowns(type);
  const wrapperEl = document.getElementById(cfg.wrapperId);
  if (!wrapperEl) return;
  renderComboDropdown(type, showAll ? "" : undefined);
  wrapperEl.classList.add("open");
}

function toggleComboDropdown(type, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const cfg = COMBO_CONFIG[type];
  if (!cfg) return;
  const wrapperEl = document.getElementById(cfg.wrapperId);
  const inputEl = document.getElementById(cfg.inputId);
  if (!wrapperEl) return;

  const isOpen = wrapperEl.classList.contains("open");
  closeAllComboDropdowns();
  if (!isOpen) {
    renderComboDropdown(type, ""); // Prikaži sve postojeće iz baze kada klikne na strelicu
    wrapperEl.classList.add("open");
    if (inputEl) inputEl.focus();
  }
}

function closeAllComboDropdowns(exceptType = null) {
  Object.keys(COMBO_CONFIG).forEach((t) => {
    if (exceptType && t === exceptType) return;
    const w = document.getElementById(COMBO_CONFIG[t].wrapperId);
    if (w) w.classList.remove("open");
  });
}

function setupCategoryComboInputs() {
  Object.keys(COMBO_CONFIG).forEach((type) => {
    const cfg = COMBO_CONFIG[type];
    const inputEl = document.getElementById(cfg.inputId);
    const wrapperEl = document.getElementById(cfg.wrapperId);
    const listEl = document.getElementById(cfg.listId);
    if (!inputEl || !wrapperEl || !listEl) return;

    inputEl.addEventListener("focus", () => {
      // Pri fokusu prikaži sve opcije iz baze (ili filtrirane ako kuca)
      openComboDropdown(type, true);
    });

    inputEl.addEventListener("click", () => {
      if (!wrapperEl.classList.contains("open")) {
        openComboDropdown(type, true);
      }
    });

    inputEl.addEventListener("input", () => {
      closeAllComboDropdowns(type);
      renderComboDropdown(type);
      wrapperEl.classList.add("open");
    });

    inputEl.addEventListener("keydown", (e) => {
      const items = Array.from(listEl.querySelectorAll(".combo-dropdown-item, .combo-dropdown-custom-hint"));
      if (!wrapperEl.classList.contains("open") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        openComboDropdown(type, true);
        return;
      }
      if (!items.length) return;

      const currentIdx = items.findIndex((el) => el.classList.contains("active-item"));

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
        items.forEach((el, i) => el.classList.toggle("active-item", i === nextIdx));
        items[nextIdx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
        items.forEach((el, i) => el.classList.toggle("active-item", i === prevIdx));
        items[prevIdx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && wrapperEl.classList.contains("open")) {
        if (currentIdx >= 0 && items[currentIdx]) {
          e.preventDefault();
          selectComboItem(type, items[currentIdx].getAttribute("data-combo-val"));
        } else {
          wrapperEl.classList.remove("open");
        }
      } else if (e.key === "Escape") {
        wrapperEl.classList.remove("open");
      }
    });
  });

  document.addEventListener("mousedown", (e) => {
    const insideCombo = e.target.closest && e.target.closest(".combo-search-wrapper");
    if (!insideCombo) {
      closeAllComboDropdowns();
    }
  });
}

function setupStockStatusSync() {
  const stockInput = document.getElementById("productStock");
  const statusSelect = document.getElementById("productStatus");
  if (!stockInput || !statusSelect) return;

  stockInput.addEventListener("input", () => {
    const val = parseInt(stockInput.value, 10);
    if (!isNaN(val)) {
      if (val === 0 && statusSelect.value === "aktivan") {
        statusSelect.value = "rasprodato";
      } else if (val > 0 && statusSelect.value === "rasprodato") {
        statusSelect.value = "aktivan";
      }
    }
  });

  statusSelect.addEventListener("change", () => {
    const currentStock = parseInt(stockInput.value, 10);
    if (statusSelect.value === "rasprodato") {
      stockInput.value = 0;
    } else if (statusSelect.value === "aktivan" && (isNaN(currentStock) || currentStock <= 0)) {
      stockInput.value = 10;
    }
  });
}

/* ==========================================================================
   1. UČITAVANJE I PRIKAZ PROIZVODA
   ========================================================================== */
function initCustomTooltip() {
  let tooltipEl = document.getElementById("miaCustomTooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "miaCustomTooltip";
    tooltipEl.className = "mia-custom-tooltip";
    document.body.appendChild(tooltipEl);
  }

  let activeTrigger = null;

  function showTooltip(trigger) {
    const text = trigger.getAttribute("data-tooltip");
    if (!text) return;

    activeTrigger = trigger;
    tooltipEl.textContent = text;
    tooltipEl.classList.remove("tooltip-bottom");
    tooltipEl.classList.add("show");

    const rect = trigger.getBoundingClientRect();
    const tooltipWidth = tooltipEl.offsetWidth;
    const tooltipHeight = tooltipEl.offsetHeight;

    let top = rect.top - tooltipHeight - 7;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    if (top < 8) {
      top = rect.bottom + 7;
      tooltipEl.classList.add("tooltip-bottom");
    }

    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }

    tooltipEl.style.top = `${top + window.scrollY}px`;
    tooltipEl.style.left = `${left + window.scrollX}px`;
  }

  function hideTooltip() {
    activeTrigger = null;
    tooltipEl.classList.remove("show");
  }

  document.addEventListener("mouseover", (e) => {
    const trigger = e.target.closest && e.target.closest("[data-tooltip]");
    if (trigger) {
      if (activeTrigger !== trigger) {
        showTooltip(trigger);
      }
    } else if (activeTrigger) {
      hideTooltip();
    }
  });

  document.addEventListener("mouseout", (e) => {
    if (activeTrigger) {
      const related = e.relatedTarget;
      if (!related || !activeTrigger.contains(related)) {
        const nextTrigger = related && related.closest && related.closest("[data-tooltip]");
        if (!nextTrigger) {
          hideTooltip();
        }
      }
    }
  });

  window.addEventListener("scroll", hideTooltip, { passive: true });
}

function renderScopeCountsSkeleton() {
  const allEl = document.getElementById("scopeCountAll");
  const featEl = document.getElementById("scopeCountFeatured");
  const alertsEl = document.getElementById("scopeCountStockAlerts");
  const oosEl = document.getElementById("scopeCountOutOfStock");
  const totalEl = document.getElementById("productTotalCount");
  const skel = '<span class="skeleton skeleton-badge-num"></span>';
  if (allEl) allEl.innerHTML = '<span class="skeleton skeleton-badge-num" style="width: 18px;"></span> <span class="skeleton skeleton-badge-num" style="width: 18px;"></span>';
  if (featEl) featEl.innerHTML = skel;
  if (alertsEl) alertsEl.innerHTML = skel;
  if (oosEl) oosEl.innerHTML = skel;
  if (totalEl) totalEl.innerHTML = `Ukupno: <span class="skeleton skeleton-badge-num" style="width: 32px; height: 13px;"></span>`;
}

function renderProductsSkeleton(count = 8) {
  renderScopeCountsSkeleton();
  const tbody = document.getElementById("productsList");
  if (!tbody) return;
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-img"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 70px;"></div></td>
        <td>
          <div class="skeleton skeleton-text" style="width: 65%; height: 16px; margin-bottom: 6px;"></div>
          <div class="skeleton skeleton-text" style="width: 30%; height: 12px;"></div>
        </td>
        <td><div class="skeleton skeleton-badge" style="width: 90px;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 85px; height: 15px;"></div></td>
        <td><div class="skeleton skeleton-badge" style="width: 75px;"></div></td>
        <td style="text-align: center; white-space: nowrap; width: 150px; min-width: 150px;">
          <div class="table-action-btns" style="display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap;">
            <div class="skeleton skeleton-btn" style="flex: 0 0 34px; width: 34px; height: 34px;"></div>
            <div class="skeleton skeleton-btn" style="flex: 0 0 34px; width: 34px; height: 34px;"></div>
            <div class="skeleton skeleton-btn" style="flex: 0 0 34px; width: 34px; height: 34px;"></div>
          </div>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function setProductScope(scope) {
  if (currentScope === scope) return;
  currentScope = scope;
  document.querySelectorAll(".scope-slider-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.scope === scope);
  });
  const banner = document.getElementById("stockAlertsBanner");
  if (banner) {
    banner.style.display = scope === "stock_alerts" ? "block" : "none";
  }
  loadProducts(1);
}

function updateScopeCounts(counts) {
  if (!counts) return;
  const allEl = document.getElementById("scopeCountAll");
  const featEl = document.getElementById("scopeCountFeatured");
  const alertsEl = document.getElementById("scopeCountStockAlerts");
  const oosEl = document.getElementById("scopeCountOutOfStock");

  if (allEl && typeof counts.all === "number") {
    const totalCount = counts.all;
    const activeCount = typeof counts.active === "number" ? counts.active : totalCount;
    allEl.innerHTML = `
      <span class="count-num-item" data-tooltip="Ukupno artikala: ${totalCount}">${totalCount}</span>
      <span class="count-num-sep">&nbsp;</span>
      <span class="count-num-item count-num-active" data-tooltip="Aktivnih na lageru: ${activeCount}">(${activeCount})</span>
    `;
  }

  if (featEl && typeof counts.featured === "number") {
    featEl.innerHTML = `<span class="count-num-item" data-tooltip="Istaknuto na početnoj: ${counts.featured}">${counts.featured}</span>`;
  }
  if (alertsEl && typeof counts.stockAlerts === "number") {
    alertsEl.classList.toggle("has-alerts", counts.stockAlerts > 0);
    alertsEl.innerHTML = `<span class="count-num-item" data-tooltip="Artikli sa potrošenom bojom, kilažom ili lagerom: ${counts.stockAlerts}">${counts.stockAlerts}</span>`;
  }
  if (oosEl && typeof counts.outOfStock === "number") {
    oosEl.innerHTML = `<span class="count-num-item" data-tooltip="Potpuno rasprodati artikli (van lagera): ${counts.outOfStock}">${counts.outOfStock}</span>`;
  }
}

async function refreshScopeCounts() {
  renderScopeCountsSkeleton();
  try {
    const res = await fetch("/api/products?admin=1&limit=1");
    if (!res.ok) return;
    const data = await res.json();
    if (data.data && data.data.scopeCounts) {
      updateScopeCounts(data.data.scopeCounts);
    }
  } catch (_) {}
}

async function toggleProductFlag(id, flagName, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const p = productsMap.get(String(id));
  if (!p) return;

  const currentVal = Boolean(p[flagName]);
  const newVal = !currentVal;
  const btn = event ? event.currentTarget : null;

  p[flagName] = newVal;
  productsMap.set(String(id), p);

  const activeClass = "active-featured";
  if (btn) {
    btn.classList.toggle(activeClass, newVal);
  }

  const countEl = document.getElementById("scopeCountFeatured");
  if (countEl) {
    const currentNum = parseInt(countEl.textContent, 10);
    if (!isNaN(currentNum)) {
      const nextNum = Math.max(0, currentNum + (newVal ? 1 : -1));
      countEl.innerHTML = `<span class="count-num-item" data-tooltip="Istaknuto na početnoj: ${nextNum}">${nextNum}</span>`;
    }
  }

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ [flagName]: newVal }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Greška pri promeni statusa.");
    }
  } catch (err) {
    p[flagName] = currentVal;
    productsMap.set(String(id), p);
    if (btn) {
      btn.classList.toggle(activeClass, currentVal);
    }
    if (countEl) {
      const currentNum = parseInt(countEl.textContent, 10);
      if (!isNaN(currentNum)) {
        const revertedNum = Math.max(0, currentNum + (currentVal ? 1 : -1));
        countEl.innerHTML = `<span class="count-num-item" data-tooltip="Istaknuto na početnoj: ${revertedNum}">${revertedNum}</span>`;
      }
    }
    alert("Greška pri čuvanju u bazi: " + err.message);
  }
}

async function loadProducts(page = 1) {
  currentPage = page;
  const tbody = document.getElementById("productsList");
  const searchEl = document.getElementById("searchInput");
  const categoryEl = document.getElementById("categoryFilter");
  const statusEl = document.getElementById("statusFilter");
  const search = searchEl ? searchEl.value.trim() : "";
  const category = categoryEl ? categoryEl.value : "";
  const status = statusEl ? statusEl.value : "";

  renderProductsSkeleton(8);
  if (!tbody) return;

  try {
    let url = `/api/products?admin=1&page=${page}&limit=15`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (currentScope === "featured") url += `&tag=featured`;
    if (currentScope === "stock_alerts") url += `&scope=stock_alerts`;
    if (currentScope === "out_of_stock") url += `&scope=out_of_stock`;

    const banner = document.getElementById("stockAlertsBanner");
    if (banner) {
      banner.style.display = currentScope === "stock_alerts" ? "block" : "none";
    }

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const products = data.data.products || [];
    const count = data.data.count || 0;
    const totalPages = data.data.totalPages || 1;

    const totalEl = document.getElementById("productTotalCount");
    if (totalEl) {
      totalEl.innerHTML = `Ukupno: <span class="count-num-item" data-tooltip="Ukupno pronađeno po zadatim filterima: ${count}">${count}</span>`;
    }

    if (data.data && data.data.scopeCounts) {
      updateScopeCounts(data.data.scopeCounts);
    }

    productsMap.clear();

    if (!products.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-muted">
            <i class="fas fa-boxes fa-3x mb-3 text-muted"></i>
            <p>${currentScope === "stock_alerts" ? "Odlično! Svi artikli, boje i pakovanja imaju dovoljno zaliha." : "Nema pronađenih artikala za zadate kriterijume."}</p>
          </td>
        </tr>`;
      renderPagination(1, 1, 0);
      return;
    }

    products.forEach((p) => productsMap.set(String(p._id), p));
    mergeProductsIntoDbCategories(products);

    tbody.innerHTML = products
      .map((p) => {
        const prodId = escapeHtml(p._id);
        const code = escapeHtml(p.code);
        const title = escapeHtml(p.title);
        const rawThumb = p.imageUrl || "";
        const thumbUrl = (rawThumb.startsWith("/uploads/") || rawThumb.startsWith("/img/") || rawThumb.startsWith("http://") || rawThumb.startsWith("https://"))
          ? escapeHtml(rawThumb)
          : "/img/customPageBcg.png";

        const statusRaw = (p.status || "aktivan").toLowerCase();
        const stockNum = typeof p.stock === "number" ? p.stock : 10;

        const catStr = (p.category || []).map(escapeHtml).join(", ") || "-";
        const variantsList = Array.isArray(p.variants) && p.variants.length
          ? p.variants
          : (p.sizes || []).map((s) => ({ label: s, price: p.price, stock: stockNum }));

        const stockIssues = [];
        variantsList.forEach((v) => {
          const vStk = typeof v.stock === "number" ? v.stock : stockNum;
          if (vStk <= 0) {
            stockIssues.push(`Pakovanje ${escapeHtml(v.label)} (0 kom)`);
          }
        });

        const colorsList = Array.isArray(p.colors) ? p.colors : [];
        colorsList.forEach((c) => {
          const cName = typeof c === "string" ? c : (c.name || "Boja");
          const cStk = typeof c === "object" && typeof c.stock === "number" ? c.stock : stockNum;
          if (cStk <= 0) {
            stockIssues.push(`Boja ${escapeHtml(cName)} (0 kom)`);
          }
        });

        if (stockNum <= 0 || statusRaw === "rasprodato") {
          if (stockIssues.length === 0) {
            stockIssues.push("Ceo artikal van lagera (0 kom)");
          }
        }

        const issueAlertHtml = stockIssues.length > 0 && currentScope === "stock_alerts"
          ? `<div class="stock-issues-alert" onclick="editProduct('${prodId}')" title="Kliknite da izmenite i dopunite zalihe">
              <i class="fas fa-exclamation-triangle"></i>
              <span><strong>Potrošeno:</strong> ${stockIssues.join(", ")} — <u>Izmeni</u></span>
            </div>`
          : "";

        const isOutOfStock = statusRaw === "rasprodato" || stockNum <= 0;
        const statusClass = isOutOfStock
          ? "badge-status-rasprodato"
          : (statusRaw === "neaktivan" || statusRaw === "inactive")
          ? "badge-status-neaktivan"
          : "badge-status-aktivan";
        const statusDisplay = isOutOfStock
          ? "Van lagera"
          : (statusRaw === "neaktivan" || statusRaw === "inactive")
          ? "Neaktivan"
          : "Aktivan";
        const varPrices = variantsList.map((v) => Number(v.price)).filter((n) => !isNaN(n) && n >= 0);
        const minVarPrice = varPrices.length ? Math.min(...varPrices) : (Number(p.price) || 0);
        const maxVarPrice = varPrices.length ? Math.max(...varPrices) : minVarPrice;
        const priceFormatted = minVarPrice !== maxVarPrice
          ? `od ${minVarPrice.toLocaleString("sr-RS")}`
          : (Number(p.price) || 0).toLocaleString("sr-RS");
        const slug = p.slug || p.code || p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

        return `
          <tr${stockIssues.length > 0 && currentScope === "stock_alerts" ? ' class="table-danger-soft"' : ""}>
            <td>
              <img src="${thumbUrl}" alt="${title}" class="product-thumb-table" onerror="this.src='/img/customPageBcg.png'" />
            </td>
            <td class="font-weight-bold text-uppercase" style="color: #009900; font-size: 0.88rem;">${code}</td>
            <td>
              <div class="font-weight-bold" style="color: #1e293b;">${title}</div>
              <div class="product-flags-row">
                <button type="button" class="flag-toggle-btn ${p.isFeatured ? 'active-featured' : ''}" 
                        onclick="toggleProductFlag('${prodId}', 'isFeatured', event)" 
                        title="Kliknite da uključite/isključite prikaz u Novitetima na početnoj">
                  <i class="fas fa-star"></i> Istaknuto
                </button>
              </div>
              ${issueAlertHtml}
            </td>
            <td>
              <span class="badge badge-light border text-capitalize">${catStr}</span>
            </td>
            <td>
              <strong style="color: #1e293b;">${priceFormatted} RSD</strong>
            </td>
            <td>
              <span class="${statusClass}">${statusDisplay}</span>
              <div class="small text-muted mt-1">Lager: <strong>${stockNum}</strong></div>
            </td>
            <td style="text-align: center; white-space: nowrap; min-width: 150px; width: 150px;">
              <div class="table-action-btns" style="display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap;">
                <a href="/${encodeURIComponent(slug)}" target="_blank" class="btn btn-sm btn-outline-secondary" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" title="Pogledaj na sajtu">
                  <i class="fas fa-eye"></i>
                </a>
                <button class="btn btn-sm btn-outline-primary" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" onclick="editProduct('${prodId}')" title="Izmeni">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" onclick="deleteProduct('${prodId}')" title="Obriši">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    renderPagination(page, totalPages, count);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderPagination(page, totalPages, totalCount) {
  const info = document.getElementById("paginationInfo");
  const controls = document.getElementById("paginationControls");

  info.textContent = `Strana ${page} od ${totalPages} (ukupno ${totalCount})`;

  let html = "";
  if (page > 1) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="loadProducts(${page - 1})">&laquo;</a></li>`;
  } else {
    html += `<li class="page-item disabled"><span class="page-link">&laquo;</span></li>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === page) {
      html += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
    } else if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="loadProducts(${i})">${i}</a></li>`;
    } else if (i === page - 3 || i === page + 3) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  if (page < totalPages) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="loadProducts(${page + 1})">&raquo;</a></li>`;
  } else {
    html += `<li class="page-item disabled"><span class="page-link">&raquo;</span></li>`;
  }

  controls.innerHTML = html;
}

/* ==========================================================================
   2. BOJE I VELIČINE (MODAL CONTROLS)
   ========================================================================== */
function addColor() {
  const hex = document.getElementById("newColorHex")?.value || "#009900";
  const nameInput = document.getElementById("newColorName");
  const stockInput = document.getElementById("newColorStock");
  const name = (nameInput?.value || "").trim();
  const parsedStock = parseInt(stockInput?.value, 10);
  const stock = !isNaN(parsedStock) && parsedStock >= 0 ? parsedStock : 10;

  if (!name) {
    alert("Unesite naziv boje (npr. Crna, Puder roze).");
    return;
  }

  const existingIdx = currentColors.findIndex(
    (c) => String(c.name || "").trim().toLowerCase() === name.toLowerCase()
  );
  if (existingIdx > -1) {
    currentColors[existingIdx] = { name, hex, code: hex, stock };
  } else {
    currentColors.push({ name, hex, code: hex, stock });
  }

  if (nameInput) nameInput.value = "";
  if (stockInput) stockInput.value = "10";
  renderColors();
  syncBasePriceFromVariants();
}

function removeColor(idx) {
  currentColors.splice(idx, 1);
  renderColors();
  syncBasePriceFromVariants();
}

function renderColors() {
  const container = document.getElementById("colorsContainer");
  if (!container) return;

  if (!currentColors.length) {
    container.innerHTML = '<div class="text-muted small py-2">Nema unetih boja.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="thead-light">
          <tr>
            <th>Boja</th>
            <th style="width: 140px;">Lager (kom)</th>
            <th style="width: 60px;" class="text-center">Ukloni</th>
          </tr>
        </thead>
        <tbody>
          ${currentColors
            .map((c, idx) => {
              const cStock = typeof c.stock === "number" && !isNaN(c.stock) ? c.stock : 10;
              const isOos = cStock <= 0;
              return `
                <tr data-color-idx="${idx}" class="${isOos ? "table-danger-soft" : ""}">
                  <td class="align-middle font-weight-bold">
                    <span class="color-dot-sm mr-2" style="background-color: ${escapeHtml(c.hex || c.code || "#ccc")};"></span>
                    <span>${escapeHtml(c.name || "")}</span>
                    <span class="color-oos-badge badge badge-status-rasprodato ml-2" style="${isOos ? "" : "display:none;"}">Potrošeno!</span>
                  </td>
                  <td>
                    <input type="number" class="form-control form-control-sm color-stock-input" min="0" value="${cStock}" data-idx="${idx}" />
                  </td>
                  <td class="text-center align-middle">
                    <button type="button" class="btn btn-sm btn-outline-danger color-remove-btn" data-idx="${idx}" title="Ukloni">&times;</button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".color-stock-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      const val = parseInt(inp.value, 10);
      if (!isNaN(val) && val >= 0 && currentColors[idx]) {
        currentColors[idx].stock = val;
        const row = inp.closest("tr");
        if (row) {
          row.classList.toggle("table-danger-soft", val <= 0);
          const badge = row.querySelector(".color-oos-badge");
          if (badge) badge.style.display = val <= 0 ? "inline-block" : "none";
        }
        syncBasePriceFromVariants();
      }
    });
  });

  container.querySelectorAll(".color-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      removeColor(idx);
    });
  });
}

/* ==========================================================================
   2B. PET SHOP VARIJANTE (KG / VELIČINE / ZAPREMINA / KOM) & SPECIFIKACIJE
   ========================================================================== */
function setupVariantAndSpecControls() {
  const typeSelect = document.getElementById("productVariantType");
  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      renderVariantPresets();
    });
  }

  const addVarBtn = document.getElementById("addVariantBtn");
  if (addVarBtn) {
    addVarBtn.addEventListener("click", addVariantFromInputs);
  }

  const addSpecBtn = document.getElementById("addTechSpecBtn");
  if (addSpecBtn) {
    addSpecBtn.addEventListener("click", () => {
      currentTechSpecs.push({ label: "", value: "" });
      renderTechSpecs();
    });
  }
}

function renderVariantPresets() {
  const wrapper = document.getElementById("variantPresetsWrapper");
  const typeSelect = document.getElementById("productVariantType");
  if (!wrapper || !typeSelect) return;

  const presets = VARIANT_PRESETS[typeSelect.value] || VARIANT_PRESETS.kg;
  const activeLabels = new Set(currentVariants.map((v) => String(v.label || "").toLowerCase()));

  wrapper.innerHTML = presets
    .map((lbl) => {
      const checked = activeLabels.has(lbl.toLowerCase()) ? "checked" : "";
      return `
        <label class="size-chip">
          <input type="checkbox" class="variant-preset-chk" value="${escapeHtml(lbl)}" ${checked} />
          <span>${escapeHtml(lbl)}</span>
        </label>
      `;
    })
    .join("");

  wrapper.querySelectorAll(".variant-preset-chk").forEach((chk) => {
    chk.addEventListener("change", () => togglePresetVariant(chk.value, chk.checked));
  });
}

function syncBasePriceFromVariants() {
  if (currentVariants.length) {
    const valid = currentVariants.filter((v) => !isNaN(Number(v.price)) && Number(v.price) >= 0);
    if (valid.length) {
      valid.sort((a, b) => Number(a.price) - Number(b.price));
      const lowest = valid[0];
      const priceEl = document.getElementById("productPrice");
      const oldPriceEl = document.getElementById("productOldPrice");
      if (priceEl) priceEl.value = lowest.price;
      if (oldPriceEl) oldPriceEl.value = lowest.oldPrice || "";
    }
  }

  const hasVars = currentVariants.length > 0;
  const hasCols = currentColors.length > 0;
  const varTotal = hasVars
    ? currentVariants.reduce((sum, v) => {
        const s = parseInt(v.stock, 10);
        return sum + (!isNaN(s) && s >= 0 ? s : 0);
      }, 0)
    : null;
  const colTotal = hasCols
    ? currentColors.reduce((sum, c) => {
        const s = parseInt(c.stock, 10);
        return sum + (!isNaN(s) && s >= 0 ? s : 0);
      }, 0)
    : null;

  let effectiveTotalStock = null;
  if (varTotal !== null && colTotal !== null) {
    effectiveTotalStock = (varTotal <= 0 || colTotal <= 0) ? 0 : varTotal;
  } else if (varTotal !== null) {
    effectiveTotalStock = varTotal;
  } else if (colTotal !== null) {
    effectiveTotalStock = colTotal;
  }

  const stockEl = document.getElementById("productStock");
  const statusEl = document.getElementById("productStatus");
  if (effectiveTotalStock !== null) {
    if (stockEl) stockEl.value = effectiveTotalStock;
    if (statusEl) {
      if (effectiveTotalStock === 0 && statusEl.value === "aktivan") {
        statusEl.value = "rasprodato";
      } else if (effectiveTotalStock > 0 && statusEl.value === "rasprodato") {
        statusEl.value = "aktivan";
      }
    }
  }
}

function togglePresetVariant(label, isChecked) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) return;
  const idx = currentVariants.findIndex((v) => String(v.label || "").toLowerCase() === cleanLabel.toLowerCase());

  if (isChecked && idx === -1) {
    const basePrice = parseFloat(document.getElementById("productPrice")?.value) || 0;
    const baseOldPriceVal = document.getElementById("productOldPrice")?.value;
    const baseOldPrice = baseOldPriceVal ? parseFloat(baseOldPriceVal) : null;
    const newVarStkEl = document.getElementById("newVariantStock");
    const preferredStock = parseInt(newVarStkEl?.value, 10);
    const fallbackProdStock = parseInt(document.getElementById("productStock")?.value, 10);
    const initVarStock = !isNaN(preferredStock) && preferredStock >= 0
      ? preferredStock
      : (!isNaN(fallbackProdStock) && fallbackProdStock >= 0 ? fallbackProdStock : 10);

    currentVariants.push({
      label: cleanLabel,
      price: basePrice,
      oldPrice: baseOldPrice && baseOldPrice > basePrice ? baseOldPrice : null,
      stock: initVarStock,
    });
  } else if (!isChecked && idx > -1) {
    currentVariants.splice(idx, 1);
  }

  renderVariantsList();
  renderVariantPresets();
  syncBasePriceFromVariants();
}

function addVariantFromInputs() {
  const lblEl = document.getElementById("newVariantLabel");
  const priceEl = document.getElementById("newVariantPrice");
  const oldPriceEl = document.getElementById("newVariantOldPrice");
  const varStockEl = document.getElementById("newVariantStock");

  const label = (lblEl?.value || "").trim();
  const basePrice = parseFloat(document.getElementById("productPrice")?.value) || 0;
  const parsedPrice = priceEl?.value !== "" ? parseFloat(priceEl.value) : basePrice;
  const parsedOld = oldPriceEl?.value !== "" ? parseFloat(oldPriceEl.value) : null;
  const parsedVarStock = varStockEl && varStockEl.value !== "" ? parseInt(varStockEl.value, 10) : NaN;
  const fallbackProdStock = parseInt(document.getElementById("productStock")?.value, 10);
  const stock = !isNaN(parsedVarStock) && parsedVarStock >= 0
    ? parsedVarStock
    : (!isNaN(fallbackProdStock) && fallbackProdStock >= 0 ? fallbackProdStock : 10);

  if (!label) {
    alert("Unesite oznaku varijante (npr. 2.5kg, L, 500ml).");
    return;
  }
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    alert("Unesite ispravnu cenu za ovu varijantu.");
    return;
  }

  const existingIdx = currentVariants.findIndex(
    (v) => String(v.label || "").toLowerCase() === label.toLowerCase()
  );
  const newObj = {
    label,
    price: parsedPrice,
    oldPrice: parsedOld && !isNaN(parsedOld) && parsedOld > parsedPrice ? parsedOld : null,
    stock,
  };

  if (existingIdx > -1) {
    currentVariants[existingIdx] = newObj;
  } else {
    currentVariants.push(newObj);
  }

  if (lblEl) lblEl.value = "";
  if (priceEl) priceEl.value = "";
  if (oldPriceEl) oldPriceEl.value = "";
  if (varStockEl) varStockEl.value = "10";

  renderVariantsList();
  renderVariantPresets();
  syncBasePriceFromVariants();
}

function renderVariantsList() {
  const container = document.getElementById("variantsListContainer");
  if (!container) return;

  if (!currentVariants.length) {
    container.innerHTML =
      '<div class="text-muted small py-2">Nema odabranih varijanti pakovanja/veličina. Označite gore opciju ili dodajte novu varijantu sa cenom i količinom.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="thead-light">
          <tr>
            <th>Pakovanje / Veličina</th>
            <th style="width: 150px;">Cena (RSD)</th>
            <th style="width: 150px;">Stara cena (RSD)</th>
            <th style="width: 120px;">Lager (kom)</th>
            <th style="width: 55px;" class="text-center">Ukloni</th>
          </tr>
        </thead>
        <tbody>
          ${currentVariants
            .map((v, idx) => {
              const vStock = typeof v.stock === "number" && !isNaN(v.stock) ? v.stock : 10;
              const isOos = vStock <= 0;
              return `
            <tr data-variant-idx="${idx}" class="${isOos ? "table-danger-soft" : ""}">
              <td class="align-middle font-weight-bold">
                <span>${escapeHtml(v.label)}</span>
                <span class="var-oos-badge badge badge-status-rasprodato ml-2" style="${isOos ? "" : "display:none;"}">Potrošeno!</span>
              </td>
              <td>
                <input type="number" class="form-control form-control-sm var-price-input" min="0" value="${Number(v.price) || 0}" data-idx="${idx}" />
              </td>
              <td>
                <input type="number" class="form-control form-control-sm var-oldprice-input" min="0" placeholder="-" value="${v.oldPrice ? Number(v.oldPrice) : ""}" data-idx="${idx}" />
              </td>
              <td>
                <input type="number" class="form-control form-control-sm var-stock-input" min="0" value="${vStock}" data-idx="${idx}" />
              </td>
              <td class="text-center align-middle">
                <button type="button" class="btn btn-sm btn-outline-danger var-remove-btn" data-idx="${idx}" title="Ukloni">&times;</button>
              </td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".var-price-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      const val = parseFloat(inp.value);
      if (!isNaN(val) && val >= 0 && currentVariants[idx]) {
        currentVariants[idx].price = val;
        syncBasePriceFromVariants();
      }
    });
  });

  container.querySelectorAll(".var-oldprice-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      const val = inp.value !== "" ? parseFloat(inp.value) : null;
      if (currentVariants[idx]) {
        currentVariants[idx].oldPrice = val && !isNaN(val) ? val : null;
        syncBasePriceFromVariants();
      }
    });
  });

  container.querySelectorAll(".var-stock-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      const val = parseInt(inp.value, 10);
      if (!isNaN(val) && val >= 0 && currentVariants[idx]) {
        currentVariants[idx].stock = val;
        const row = inp.closest("tr");
        if (row) {
          row.classList.toggle("table-danger-soft", val <= 0);
          const badge = row.querySelector(".var-oos-badge");
          if (badge) badge.style.display = val <= 0 ? "inline-block" : "none";
        }
        syncBasePriceFromVariants();
      }
    });
  });

  container.querySelectorAll(".var-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentVariants.splice(idx, 1);
      renderVariantsList();
      renderVariantPresets();
      syncBasePriceFromVariants();
    });
  });
}

function renderTechSpecs() {
  const container = document.getElementById("techSpecsContainer");
  if (!container) return;

  if (!currentTechSpecs.length) {
    container.innerHTML = '<div class="text-muted small">Nema unetih dodatnih specifikacija (opciono).</div>';
    return;
  }

  container.innerHTML = currentTechSpecs
    .map(
      (s, idx) => `
    <div class="row align-items-center mb-2">
      <div class="col-5">
        <input type="text" class="form-control form-control-sm spec-label-input" placeholder="Naziv (npr. Proteini)" value="${escapeHtml(s.label)}" data-idx="${idx}" />
      </div>
      <div class="col-6">
        <input type="text" class="form-control form-control-sm spec-val-input" placeholder="Vrednost (npr. 28%)" value="${escapeHtml(s.value)}" data-idx="${idx}" />
      </div>
      <div class="col-1 text-right">
        <button type="button" class="btn btn-sm btn-outline-danger spec-remove-btn" data-idx="${idx}">&times;</button>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".spec-label-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      if (currentTechSpecs[idx]) currentTechSpecs[idx].label = inp.value;
    });
  });

  container.querySelectorAll(".spec-val-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      if (currentTechSpecs[idx]) currentTechSpecs[idx].value = inp.value;
    });
  });

  container.querySelectorAll(".spec-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentTechSpecs.splice(idx, 1);
      renderTechSpecs();
    });
  });
}

/* ==========================================================================
   3. DRAG & DROP UPLOADER SLIKA I PROMENA RASPOREDA (Sharp WebP kompresija)
   ========================================================================== */
let draggedImageElement = null;

// Upload slike na backend (/api/upload-local)
async function uploadToCloudinary(base64OrUrl, folder, publicId = null) {
  let safeFolder = String(folder || "misc").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeFolder) {
    safeFolder = "defaultfolder";
  }

  try {
    const uploadData = {
      folder: safeFolder,
      publicId: publicId || `img_${Date.now()}`,
    };

    if (typeof base64OrUrl === "string" && /^https?:\/\//i.test(base64OrUrl)) {
      uploadData.url = base64OrUrl;
    } else {
      uploadData.file = base64OrUrl;
    }

    const res = await fetch("/api/upload-local", {
      method: "POST",
      body: JSON.stringify(uploadData),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Upload neuspešan (${res.status}): ${errorJson.message || "Greška pri obradi slike"}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Upload error:", err);
    throw err;
  }
}

function setupUploader() {
  const zone = document.getElementById("uploadDropZone");
  const input = document.getElementById("imageFileInput");

  if (zone && input) {
    zone.addEventListener("click", (e) => {
      if (e.target.closest("#pasteAndAddUrlBtn") || e.target === input) {
        return;
      }
      input.click();
    });

    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("dragover");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    input.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length) {
        const filesToUpload = Array.from(e.target.files);
        input.value = "";
        handleFiles(filesToUpload);
      }
    });
  }

  // Dugme "Zalepi URL" unutar upload zone
  const pasteBtn = document.getElementById("pasteAndAddUrlBtn");
  if (pasteBtn) {
    pasteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pasteFromClipboard();
    });
  }

  // Podrška za globalni Ctrl+V (paste) unutar modala
  window.addEventListener("paste", (e) => {
    const modal = document.getElementById("productModal");
    if (!modal || !modal.classList.contains("show")) return;

    const active = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
    if (active === "input" || active === "textarea") return;

    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
      const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        handleFiles(files);
        return;
      }
    }

    if (e.clipboardData) {
      const text = e.clipboardData.getData("text").trim();
      if (/^https?:\/\//i.test(text)) {
        e.preventDefault();
        addImageFromUrl(text);
      }
    }
  });
}

async function pasteFromClipboard() {
  try {
    // 1. Provera direktne binarne slike u clipboard-u (npr. Copy Image ili Screenshot)
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        const imageFiles = [];
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith("image/")) {
              const blob = await item.getType(type);
              const ext = type.split("/")[1] || "png";
              const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type });
              imageFiles.push(file);
            }
          }
        }
        if (imageFiles.length > 0) {
          handleFiles(imageFiles);
          return;
        }
      } catch (_) {}
    }

    // 2. Čitanje teksta (URL linka) iz privremene memorije
    let text = "";
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (_) {}
    }

    text = (text || "").trim();

    if (text) {
      // Provera za data:image base64 URI
      if (text.startsWith("data:image/")) {
        try {
          const res = await fetch(text);
          const blob = await res.blob();
          const ext = (blob.type && blob.type.split("/")[1]) || "png";
          const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type: blob.type || "image/png" });
          handleFiles([file]);
          return;
        } catch (_) {}
      }

      // Provera za web link (http:// ili https://)
      if (/^https?:\/\//i.test(text)) {
        addImageFromUrl(text);
        return;
      }

      // Sadržaj u memoriji nije slika niti URL
      alert("Kopirani sadržaj u memoriji nije slika niti validan URL slike.");
      return;
    }

    // Memorija je prazna
    alert("Privremena memorija (clipboard) je prazna. Prvo kopirajte sliku ili URL slike.");
  } catch (err) {
    alert("Nije moguće pristupiti privremenoj memoriji pretraživača. Dozvolite pristup ili upotrebite prečicu Ctrl+V.");
  }
}

async function handleFiles(files) {
  if (!files || !files.length) return;

  const fileList = Array.from(files).filter((file) => {
    if (!file) return false;
    if (file.type && file.type.startsWith("image/")) return true;
    return /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name || "");
  });

  if (!fileList.length) {
    alert("Nijedan izabrani fajl nije slika. Dozvoljeni formati su JPG, PNG, WEBP, GIF.");
    return;
  }

  // Lokalno čitanje slika za instant preview - BEZ slanja na server pre čuvanja artikla
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file.size > 10 * 1024 * 1024) {
      alert(`Slika "${file.name}" prelazi maksimalnu dozvoljenu veličinu od 10MB.`);
      continue;
    }

    const imgId = `img_new_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });

    uploadedImages.push({
      id: imgId,
      file,
      url: previewUrl,
      name: file.name,
      isExisting: false,
    });
  }

  syncImagesFromDom();
  renderImagesPreview();
}

function addImageFromUrl(url) {
  let targetUrl = (url || "").trim();
  if (!targetUrl) return;

  if (!/^https?:\/\//i.test(targetUrl) && !targetUrl.startsWith("/uploads/")) {
    alert("Unesite validan URL slike koji počinje sa https:// ili http://");
    return;
  }

  const imgId = `img_url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  uploadedImages.push({
    id: imgId,
    file: null,
    url: targetUrl,
    name: "URL Slika",
    isExisting: targetUrl.startsWith("/uploads/"),
    isRemoteUrl: !targetUrl.startsWith("/uploads/"),
  });

  syncImagesFromDom();
  renderImagesPreview();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

function removeImageById(imageId) {
  syncImagesFromDom();
  uploadedImages = uploadedImages.filter((img) => String(img.id) !== String(imageId));
  renderImagesPreview();
}

function syncImagesFromDom() {
  const container = document.getElementById("imagesPreviewContainer");
  if (!container) return;
  const domElements = Array.from(container.querySelectorAll(".modern-preview-card"));
  if (!domElements.length) return;

  const newOrder = [];
  domElements.forEach((el) => {
    const id = el.dataset.imageId;
    const found = uploadedImages.find((img) => String(img.id) === String(id));
    if (found) {
      newOrder.push(found);
    }
  });

  if (newOrder.length === uploadedImages.length) {
    uploadedImages = newOrder;
  }
}

function updateImageOrderDOM() {
  const container = document.getElementById("imagesPreviewContainer");
  if (!container) return;
  const cards = container.querySelectorAll(".modern-preview-card");
  cards.forEach((card, index) => {
    const orderEl = card.querySelector(".image-order");
    if (orderEl) {
      orderEl.textContent = index + 1;
    }
    const badgeEl = card.querySelector(".main-badge");
    if (badgeEl) {
      badgeEl.style.display = index === 0 ? "block" : "none";
    }
  });
}

function attachCardDragEvents(card) {
  card.addEventListener("dragstart", (e) => {
    draggedImageElement = e.currentTarget;
    e.currentTarget.classList.add("dragging");
    const container = document.getElementById("imagesPreviewContainer");
    if (container) container.classList.add("reordering");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", e.currentTarget.dataset.imageId || "");
    } catch (_) {}
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const targetElement = e.currentTarget;
    if (draggedImageElement && draggedImageElement !== targetElement) {
      const container = document.getElementById("imagesPreviewContainer");
      const rect = targetElement.getBoundingClientRect();
      const isAfter = e.clientX > rect.left + rect.width / 2;

      if (isAfter) {
        targetElement.after(draggedImageElement);
      } else {
        container.insertBefore(draggedImageElement, targetElement);
      }

      syncImagesFromDom();
      updateImageOrderDOM();
    }
  });

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const targetElement = e.currentTarget;
    targetElement.classList.remove("drag-over");
    syncImagesFromDom();
    updateImageOrderDOM();
  });

  card.addEventListener("dragend", (e) => {
    e.currentTarget.classList.remove("dragging");
    const container = document.getElementById("imagesPreviewContainer");
    if (container) {
      container.classList.remove("reordering");
      container.querySelectorAll(".modern-preview-card").forEach((item) => {
        item.classList.remove("drag-over");
      });
    }
    draggedImageElement = null;
    syncImagesFromDom();
    updateImageOrderDOM();
  });

  card.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (e.currentTarget !== draggedImageElement) {
      e.currentTarget.classList.add("drag-over");
    }
  });

  card.addEventListener("dragleave", (e) => {
    e.currentTarget.classList.remove("drag-over");
  });
}

function renderImagesPreview() {
  const container = document.getElementById("imagesPreviewContainer");
  if (!container) return;

  if (!uploadedImages.length) {
    container.innerHTML = "";
    return;
  }

  // Osiguraj da svaka slika ima jedinstven ID
  uploadedImages.forEach((img, idx) => {
    if (!img.id) {
      img.id = `img_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
    }
  });

  container.innerHTML = uploadedImages
    .map(
      (img, idx) => `
    <div class="modern-preview-card" draggable="true" data-image-id="${escapeHtml(img.id)}" title="Prevucite za promenu rasporeda">
      <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.name || `Slika ${idx + 1}`)}" />
      <div class="image-order">${idx + 1}</div>
      <span class="main-badge" style="${idx === 0 ? "display:block;" : "display:none;"}">Glavna</span>
      <button type="button" class="btn-remove-img" data-remove-id="${escapeHtml(img.id)}" title="Ukloni sliku">&times;</button>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".modern-preview-card").forEach((card) => {
    attachCardDragEvents(card);
    const removeBtn = card.querySelector(".btn-remove-img");
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeImageById(removeBtn.getAttribute("data-remove-id"));
      });
    }
  });
}

/* ==========================================================================
   4. OTVARANJE MODALA I ČUVANJE (DODAVANJE / IZMENA)
   ========================================================================== */
function openAddModal() {
  editingProductId = null;
  editingProductData = null;
  initialImageUrls = [];
  uploadedImages = [];

  document.getElementById("productForm").reset();
  document.getElementById("productId").value = "";
  document.getElementById("productMainImages").value = "";
  document.getElementById("productCode").readOnly = false;
  const brandEl = document.getElementById("productBrand");
  if (brandEl) brandEl.value = "";
  document.getElementById("productStock").value = 10;
  const newVarStkEl = document.getElementById("newVariantStock");
  if (newVarStkEl) newVarStkEl.value = 10;
  const newColStkEl = document.getElementById("newColorStock");
  if (newColStkEl) newColStkEl.value = 10;
  document.getElementById("productCategory").value = "";
  document.getElementById("productSubcategory").value = "";
  const sub2El = document.getElementById("productSubcategory2");
  if (sub2El) sub2El.value = "";
  closeAllComboDropdowns();
  syncAdminCategoryOptions();

  document.getElementById("productModalTitle").innerHTML = '<i class="fas fa-plus-circle mr-2"></i><span>Dodaj novi Pet Shop artikal</span>';

  currentColors = [];
  currentVariants = [];
  currentTechSpecs = [];
  renderColors();
  renderImagesPreview();

  const vtEl = document.getElementById("productVariantType");
  if (vtEl) vtEl.value = "kg";
  const lsEl = document.getElementById("productLifeStage");
  if (lsEl) lsEl.value = "";
  const flEl = document.getElementById("productFlavor");
  if (flEl) flEl.value = "";

  document.querySelectorAll("#petTypeWrapper input[type='checkbox'], #specialDietWrapper input[type='checkbox']").forEach((chk) => {
    chk.checked = false;
  });

  renderVariantPresets();
  renderVariantsList();
  renderTechSpecs();

  $("#productModal").modal("show");
}

async function editProduct(idOrProduct) {
  const p = typeof idOrProduct === "string" ? productsMap.get(idOrProduct) : idOrProduct;
  if (!p) return;

  editingProductId = p._id;
  editingProductData = p;

  closeAllComboDropdowns();
  mergeProductsIntoDbCategories([p]);

  const catValue = Array.isArray(p.category)
    ? p.category.map((c) => formatDisplayLabel(c)).join(", ")
    : formatDisplayLabel(p.category || "");
  const subcatValue = Array.isArray(p.subcategory)
    ? p.subcategory.map((s) => formatDisplayLabel(s)).join(", ")
    : formatDisplayLabel(p.subcategory || "");
  const subcat2Value = Array.isArray(p.subcategory2)
    ? p.subcategory2.map((s) => formatDisplayLabel(s)).join(", ")
    : formatDisplayLabel(p.subcategory2 || "");

  document.getElementById("productId").value = p._id;
  document.getElementById("productCode").value = p.code;
  document.getElementById("productCode").readOnly = true;
  document.getElementById("productTitle").value = p.title;
  const brandEl = document.getElementById("productBrand");
  if (brandEl) brandEl.value = p.brand || "";
  document.getElementById("productPrice").value = p.price;
  document.getElementById("productOldPrice").value = p.oldPrice || "";
  document.getElementById("productStock").value = typeof p.stock === "number" ? p.stock : 10;
  document.getElementById("productStatus").value = p.status || "aktivan";
  document.getElementById("productCategory").value = catValue;
  document.getElementById("productSubcategory").value = subcatValue;
  const sub2El = document.getElementById("productSubcategory2");
  if (sub2El) sub2El.value = subcat2Value;
  document.getElementById("productMaterial").value = p.material || "";
  document.getElementById("productDescription").value = p.description || "";
  document.getElementById("productIsFeatured").checked = Boolean(p.isFeatured);
  document.getElementById("productMainImages").value = p.mainImages || p.code;
  const newVarStkEl = document.getElementById("newVariantStock");
  if (newVarStkEl) newVarStkEl.value = 10;
  const newColStkEl = document.getElementById("newColorStock");
  if (newColStkEl) newColStkEl.value = 10;

  // Pet Shop opcije i varijante
  const vtEl = document.getElementById("productVariantType");
  if (vtEl) vtEl.value = p.variantType || "kg";
  const lsEl = document.getElementById("productLifeStage");
  if (lsEl) {
    const rawLs = String(p.lifeStage || "").trim();
    const lsAliases = {
      "Adult (Odrasli)": "Odrasli (Adult)",
      "Junior / Štenci": "Junior / Štenci / Mačići",
      "Junior / Mačići": "Junior / Štenci / Mačići",
      "Senior (Stariji)": "Senior (7+ god)",
      "Svi uzrasti (All Life Stages)": "Svi uzrasti",
    };
    const mappedLs = lsAliases[rawLs] || rawLs;
    if (mappedLs && !Array.from(lsEl.options).some((opt) => opt.value === mappedLs)) {
      const customOpt = document.createElement("option");
      customOpt.value = mappedLs;
      customOpt.textContent = mappedLs;
      lsEl.appendChild(customOpt);
    }
    lsEl.value = mappedLs;
  }
  const flEl = document.getElementById("productFlavor");
  if (flEl) flEl.value = p.flavor || "";

  const petTypes = Array.isArray(p.petType) ? p.petType : [];
  const petAliases = {
    Pas: "Psi",
    Psi: "Psi",
    Mačka: "Mačke",
    Mačke: "Mačke",
    Ptica: "Ptice",
    Ptice: "Ptice",
    Glodar: "Glodari i zečevi",
    "Glodari i zečevi": "Glodari i zečevi",
    Ribica: "Ribice",
    Ribice: "Ribice",
    Reptil: "Reptili",
    Reptili: "Reptili",
  };
  const normalizedPets = new Set(petTypes.map((pt) => petAliases[String(pt).trim()] || String(pt).trim()));
  document.querySelectorAll("#petTypeWrapper input[type='checkbox']").forEach((chk) => {
    chk.checked = normalizedPets.has(chk.value) || petTypes.includes(chk.value);
  });

  const specialDiets = Array.isArray(p.specialDiet) ? p.specialDiet : [];
  const dietAliases = {
    "Grain Free": "Grain-Free (Bez žitarica)",
    Hipoalergena: "Sensitive / Hipoalergeno",
    "Za kožu i dlaku": "Derma / Dlaka i koža",
    "Visokoproteinska": "Visokoproteinska",
    "Urinary Care": "Urinary Care",
  };
  const sdWrapper = document.getElementById("specialDietWrapper");
  const normalizedDiets = new Set(specialDiets.map((sd) => dietAliases[String(sd).trim()] || String(sd).trim()));
  if (sdWrapper) {
    const existingVals = new Set(
      Array.from(sdWrapper.querySelectorAll("input[type='checkbox']")).map((c) => c.value)
    );
    normalizedDiets.forEach((dVal) => {
      if (dVal && !existingVals.has(dVal)) {
        const lbl = document.createElement("label");
        lbl.className = "size-chip";
        lbl.innerHTML = `<input type="checkbox" value="${escapeHtml(dVal)}" checked /><span>${escapeHtml(dVal)}</span>`;
        sdWrapper.appendChild(lbl);
      }
    });
    sdWrapper.querySelectorAll("input[type='checkbox']").forEach((chk) => {
      chk.checked = normalizedDiets.has(chk.value) || specialDiets.includes(chk.value);
    });
  }

  if (Array.isArray(p.variants) && p.variants.length > 0) {
    currentVariants = JSON.parse(JSON.stringify(p.variants));
  } else if (Array.isArray(p.sizes) && p.sizes.length > 0) {
    currentVariants = p.sizes.map((s) => ({
      label: s,
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
      stock: typeof p.stock === "number" ? p.stock : 10,
    }));
  } else {
    currentVariants = [];
  }
  renderVariantPresets();
  renderVariantsList();

  const td = p.technicalData || {};
  const tdLabels = Array.isArray(td.labels) ? td.labels : [];
  const tdFeatures = Array.isArray(td.features) ? td.features : [];
  currentTechSpecs = tdLabels
    .map((lbl, idx) => ({ label: lbl || "", value: tdFeatures[idx] || "" }))
    .filter((s) => s.label || s.value);
  renderTechSpecs();

  // Boje (normalizovane sa lagerom po boji)
  const fallbackProdStk = typeof p.stock === "number" ? p.stock : 10;
  currentColors = Array.isArray(p.colors)
    ? p.colors
        .filter(Boolean)
        .map((c) => {
          if (typeof c === "string") {
            return { name: c, hex: "#2c2527", code: "#2c2527", stock: fallbackProdStk };
          }
          return {
            name: c.name || c.label || "Boja",
            hex: c.hex || c.code || "#2c2527",
            code: c.code || c.hex || "#2c2527",
            stock: typeof c.stock === "number" ? c.stock : fallbackProdStk,
          };
        })
    : [];
  renderColors();

  // Učitavanje postojećih slika iz /api/cloudinary/all/:folder (ili fallback na p.images)
  uploadedImages = [];
  initialImageUrls = [];
  const folderName = p.mainImages || p.code;

  let loadedUrls = [];
  if (folderName) {
    try {
      const res = await fetch(`/api/cloudinary/all/${encodeURIComponent(folderName)}`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.urls) && data.urls.length > 0) {
        loadedUrls = data.urls;
      }
    } catch (_) {}
  }

  if (loadedUrls.length === 0 && Array.isArray(p.images) && p.images.length > 0) {
    loadedUrls = p.images;
  }

  initialImageUrls = [...loadedUrls];
  uploadedImages = loadedUrls.map((url, idx) => ({
    id: `img_existing_${idx}_${Date.now()}`,
    file: null,
    url,
    name: `Slika ${idx + 1}`,
    isExisting: true,
  }));
  renderImagesPreview();

  document.getElementById("productModalTitle").innerHTML = '<i class="fas fa-edit mr-2"></i><span>Izmeni artikal: ' + escapeHtml(p.title) + '</span>';
  $("#productModal").modal("show");
}

async function handleProductSave(e) {
  e.preventDefault();
  syncImagesFromDom();

  const id = document.getElementById("productId").value;
  const isEditMode = Boolean(id);
  const code = document.getElementById("productCode").value.trim().toLowerCase();
  const title = document.getElementById("productTitle").value.trim();
  const price = parseFloat(document.getElementById("productPrice").value);
  const oldPriceVal = document.getElementById("productOldPrice").value;
  const oldPrice = oldPriceVal ? parseFloat(oldPriceVal) : undefined;
  const stockVal = parseInt(document.getElementById("productStock").value, 10);
  const stock = !isNaN(stockVal) && stockVal >= 0 ? stockVal : 10;
  const status = document.getElementById("productStatus").value;
  const categoryVal = document.getElementById("productCategory").value.trim();
  const subcategoryVal = document.getElementById("productSubcategory").value.trim();
  const sub2El = document.getElementById("productSubcategory2");
  const subcategory2Val = sub2El ? sub2El.value.trim() : "";
  const material = document.getElementById("productMaterial").value.trim();
  const brandEl = document.getElementById("productBrand");
  const brand = brandEl ? brandEl.value.trim() : "";
  const description = document.getElementById("productDescription").value.trim();
  const isFeatured = document.getElementById("productIsFeatured").checked;

  const variantType = document.getElementById("productVariantType")?.value || "kg";
  const lifeStage = document.getElementById("productLifeStage")?.value || "";
  const flavor = document.getElementById("productFlavor")?.value.trim() || "";

  const petType = [];
  document.querySelectorAll("#petTypeWrapper input[type='checkbox']:checked").forEach((chk) => {
    petType.push(chk.value);
  });

  const specialDiet = [];
  document.querySelectorAll("#specialDietWrapper input[type='checkbox']:checked").forEach((chk) => {
    specialDiet.push(chk.value);
  });

  const cleanVariants = currentVariants
    .map((v) => ({
      label: String(v.label || "").trim(),
      price: Number(v.price) || 0,
      oldPrice: v.oldPrice && Number(v.oldPrice) > Number(v.price) ? Number(v.oldPrice) : null,
      stock: typeof v.stock === "number" ? v.stock : stock,
    }))
    .filter((v) => Boolean(v.label));

  const cleanColors = currentColors
    .map((c) => ({
      name: String(c.name || "").trim(),
      hex: c.hex || c.code || "#2c2527",
      code: c.code || c.hex || "#2c2527",
      stock: typeof c.stock === "number" && !isNaN(c.stock) && c.stock >= 0 ? c.stock : stock,
    }))
    .filter((c) => Boolean(c.name));

  const sizes = cleanVariants.map((v) => v.label);
  const effectivePrice =
    cleanVariants.length > 0
      ? Math.min(...cleanVariants.map((v) => v.price))
      : price;

  let effectiveStock = stock;
  if (cleanVariants.length > 0 && cleanColors.length > 0) {
    const varSum = cleanVariants.reduce((sum, v) => sum + (typeof v.stock === "number" && !isNaN(v.stock) ? v.stock : 0), 0);
    const colSum = cleanColors.reduce((sum, c) => sum + (typeof c.stock === "number" && !isNaN(c.stock) ? c.stock : 0), 0);
    effectiveStock = (varSum <= 0 || colSum <= 0) ? 0 : varSum;
  } else if (cleanVariants.length > 0) {
    effectiveStock = cleanVariants.reduce((sum, v) => sum + (typeof v.stock === "number" && !isNaN(v.stock) ? v.stock : 0), 0);
  } else if (cleanColors.length > 0) {
    effectiveStock = cleanColors.reduce((sum, c) => sum + (typeof c.stock === "number" && !isNaN(c.stock) ? c.stock : 0), 0);
  }

  let finalStatus = status;
  if (effectiveStock === 0 && finalStatus !== "neaktivan") {
    finalStatus = "rasprodato";
  } else if (effectiveStock > 0 && finalStatus === "rasprodato") {
    finalStatus = "aktivan";
  }

  const techLabels = [];
  const techFeatures = [];
  currentTechSpecs.forEach((s) => {
    const l = String(s.label || "").trim();
    const val = String(s.value || "").trim();
    if (l && val) {
      techLabels.push(l);
      techFeatures.push(val);
    }
  });

  // Validacija obaveznih polja
  const errors = [];
  if (!code) errors.push("Šifra artikla je obavezna");
  if (!title) errors.push("Naziv artikla je obavezan");
  if (isNaN(effectivePrice) || effectivePrice < 0) errors.push("Cena mora biti validan pozitivan broj");
  if (!categoryVal) errors.push("Morate odabrati kategoriju");

  const currentItems = [...uploadedImages];
  if (currentItems.length === 0) {
    errors.push("Mora postojati barem jedna slika");
  }

  if (errors.length > 0) {
    alert("Molimo popunite sva obavezna polja:\n\n" + errors.join("\n"));
    return;
  }

  const saveBtn = document.getElementById("saveProductBtn");
  const saveBtnText = document.getElementById("saveBtnText");
  const saveBtnSpinner = document.getElementById("saveBtnSpinner");

  saveBtn.disabled = true;
  saveBtnSpinner.style.display = "inline-block";

  try {
    let imagesChanged = false;
    let finalImageUrls = [];
    const productFolder = (editingProductData && (editingProductData.mainImages || editingProductData.code)) || code;

    if (isEditMode) {
      const initialUrls = initialImageUrls || [];

      // 1. Proveri da li ima novih fajlova dodatih u modalu
      const hasNewFiles = currentItems.some((img) => Boolean(img.file) || Boolean(img.isRemoteUrl));

      // 2. Proveri da li je promenjen redosled ili broj slika
      const isOrderOrCountChanged = (
        currentItems.length !== initialUrls.length ||
        currentItems.some((img, idx) => !img.isExisting || img.url !== initialUrls[idx])
      );

      imagesChanged = hasNewFiles || isOrderOrCountChanged;

      if (imagesChanged) {
        console.log("📸 Slike su izmenjene u modalu. Obrađujem samo nove fajlove...");
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i];
          if (item.file || item.isRemoteUrl) {
            saveBtnText.textContent = `Upload slike ${i + 1}/${currentItems.length}...`;
            console.log(`📤 Uploadujem novu sliku ${i + 1}/${currentItems.length}`);
            let uploadPayload;
            if (item.file) {
              uploadPayload = await fileToBase64(item.file);
            } else {
              uploadPayload = item.url;
            }
            const publicId = `new_${Date.now()}_${i + 1}`;
            const uploadResult = await uploadToCloudinary(uploadPayload, productFolder, publicId);
            if (!uploadResult || !uploadResult.secure_url) {
              throw new Error(`Upload nove slike ${i + 1} nije uspeo`);
            }
            finalImageUrls.push(uploadResult.secure_url);
            item.url = uploadResult.secure_url;
            item.file = null;
            item.isExisting = true;
            delete item.isRemoteUrl;
          } else if (item.url) {
            console.log(`✅ Zadržavam postojeću sliku ${i + 1}: ${item.url}`);
            finalImageUrls.push(item.url);
          }
        }
      } else {
        console.log("ℹ️ Slike NISU menjane u modalu. Nema ponovnog uploada slika.");
        finalImageUrls = [...initialUrls];
      }
    } else {
      // Kreiranje novog proizvoda: sekvencijalni upload novih slika direktno u folder proizvoda (code)
      console.log(`📤 Počinjem sekvencijalni upload ${currentItems.length} slika za novi proizvod...`);
      for (let i = 0; i < currentItems.length; i++) {
        const item = currentItems[i];
        saveBtnText.textContent = `Upload slike ${i + 1}/${currentItems.length}...`;
        let uploadPayload;
        if (item.file) {
          uploadPayload = await fileToBase64(item.file);
        } else {
          uploadPayload = item.url;
        }
        const publicIdNumber = String(i + 1).padStart(3, "0");
        const uploadResult = await uploadToCloudinary(uploadPayload, code, publicIdNumber);
        if (!uploadResult || !uploadResult.secure_url) {
          throw new Error(`Upload slike ${i + 1} nije uspeo`);
        }
        finalImageUrls.push(uploadResult.secure_url);
      }
    }

    saveBtnText.textContent = "Čuvanje podataka...";

    const parsedCategories = categoryVal
      ? categoryVal
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const payload = {
      code,
      title,
      price: effectivePrice,
      oldPrice,
      stock: effectiveStock,
      status: finalStatus,
      category: parsedCategories,
      subcategory: subcategoryVal ? subcategoryVal.split(",").map((s) => s.trim()).filter(Boolean) : [],
      subcategory2: subcategory2Val ? subcategory2Val.split(",").map((s) => s.trim()).filter(Boolean) : [],
      variantType,
      variants: cleanVariants,
      sizes,
      petType,
      lifeStage,
      flavor,
      specialDiet,
      colors: cleanColors,
      material,
      brand,
      technicalData: {
        labels: techLabels,
        features: techFeatures,
      },
      description,
      isFeatured,
      mainImages: isEditMode ? productFolder : code,
      imagesChanged: isEditMode ? imagesChanged : true,
      finalImageUrls,
    };

    const url = isEditMode ? `/api/products/${encodeURIComponent(id)}` : "/api/products";
    const method = isEditMode ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Greška pri čuvanju artikla.");
    }

    closeAllComboDropdowns();
    $("#productModal").modal("hide");
    await syncAdminCategoryOptions();
    loadProducts(currentPage);
  } catch (err) {
    console.error("Greška pri čuvanju proizvoda:", err);
    alert(err.message || "Greška pri čuvanju proizvoda.");
  } finally {
    saveBtn.disabled = false;
    saveBtnText.textContent = "Sačuvaj artikal";
    saveBtnSpinner.style.display = "none";
  }
}

async function deleteProduct(id, maybeTitle) {
  const p = productsMap.get(String(id));
  const title = maybeTitle || (p && p.title) || "ovaj artikal";
  if (!confirm(`Da li ste sigurni da želite da obrišete artikal "${title}"?`)) return;
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message);
    await syncAdminCategoryOptions();
    await loadProducts(currentPage);
  } catch (err) {
    alert(err.message);
  }
}

