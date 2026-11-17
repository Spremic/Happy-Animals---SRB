// clone.js - Dinamicko ucitavanje header-a i footer-a

// ========== LOCALSTORAGE UTILITY FUNCTIONS ==========
// Cart functions
function getCartItems() {
  try {
    const cart = localStorage.getItem('cart');
    if (!cart) return [];
    const parsed = JSON.parse(cart);
    // Migrate old format (array of IDs) to new format (array of objects)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      const newCart = parsed.map(id => ({ id: id, quantity: 1 }));
      localStorage.setItem('cart', JSON.stringify(newCart));
      return newCart;
    }
    return parsed;
  } catch (e) {
    console.error('Error reading cart from localStorage:', e);
    return [];
  }
}

function getDefaultVariantLabel(product) {
  if (!product) return "";
  if (Array.isArray(product.variants) && product.variants.length > 0 && product.variants[0]?.label) {
    return String(product.variants[0].label).trim();
  }
  if (Array.isArray(product.sizes) && product.sizes.length > 0 && product.sizes[0]) {
    return String(product.sizes[0]).trim();
  }
  return "";
}

function resolveProductVariant(product, variantLabel = "") {
  if (!product) return { label: "", price: 0, oldPrice: null };
  const basePrice = parseFloat(formatPrice(product)) || 0;
  const baseOld = product.oldPrice ? parseFloat(product.oldPrice) : null;
  const list = Array.isArray(product.variants) ? product.variants : [];
  if (list.length === 0) {
    return {
      label: String(variantLabel || "").trim() || getDefaultVariantLabel(product),
      price: basePrice,
      oldPrice: baseOld && baseOld > basePrice ? baseOld : null
    };
  }
  const needle = String(variantLabel || "").trim().toLowerCase();
  const matched = (needle ? list.find(v => String(v.label || "").trim().toLowerCase() === needle) : null) || list[0];
  const vPrice = parseFloat(matched.price);
  const price = !isNaN(vPrice) && vPrice > 0 ? vPrice : basePrice;
  const vOldRaw = matched.oldPrice !== null && matched.oldPrice !== undefined ? parseFloat(matched.oldPrice) : baseOld;
  const oldPrice = vOldRaw && !isNaN(vOldRaw) && vOldRaw > price ? vOldRaw : null;
  return {
    label: String(matched.label || "").trim(),
    price,
    oldPrice
  };
}

function getProductPriceSummary(product) {
  if (!product) return { minPrice: 0, maxPrice: 0, hasRange: false, defaultVariant: "", variantLabels: [] };
  const list = Array.isArray(product.variants) && product.variants.length > 0 ? product.variants : [];
  const prices = list.map(v => parseFloat(v.price)).filter(n => !isNaN(n) && n > 0);
  const base = parseFloat(formatPrice(product)) || 0;
  const minPrice = prices.length ? Math.min(...prices) : base;
  const maxPrice = prices.length ? Math.max(...prices) : minPrice;
  const variantLabels = list.length
    ? list.map(v => String(v.label || "").trim()).filter(Boolean)
    : (Array.isArray(product.sizes) ? product.sizes.map(s => String(s || "").trim()).filter(Boolean) : []);
  return {
    minPrice,
    maxPrice,
    hasRange: maxPrice > minPrice,
    defaultVariant: getDefaultVariantLabel(product),
    variantLabels
  };
}

window.getDefaultVariantLabel = getDefaultVariantLabel;
window.resolveProductVariant = resolveProductVariant;
window.getProductPriceSummary = getProductPriceSummary;

window.__productsRegistry = window.__productsRegistry || {};

window.PET_COLOR_MAP = {
  'crna': '#1a1a1a',
  'bela': '#f5f5f5',
  'siva': '#8c8c8c',
  'crvena': '#e74c3c',
  'plava': '#2980b9',
  'zelena': '#27ae60',
  'žuta': '#f1c40f',
  'zuta': '#f1c40f',
  'narandžasta': '#e67e22',
  'narandzasta': '#e67e22',
  'roze': '#ff8da1',
  'ljubičasta': '#8e44ad',
  'ljubicasta': '#8e44ad',
  'braon': '#795548',
  'bež': '#e8d8c8',
  'bez': '#e8d8c8',
  'teget': '#1b263b',
  'zlatna': 'linear-gradient(135deg, #d4af37, #f3e5ab)',
  'srebrna': 'linear-gradient(135deg, #bdc3c7, #eceeef)',
  'šarena': 'linear-gradient(45deg, #ff6b6b, #feca57, #48dbfb, #1dd1a1)',
  'sarena': 'linear-gradient(45deg, #ff6b6b, #feca57, #48dbfb, #1dd1a1)'
};

function getPetColorBackground(colorName) {
  const key = String(colorName || '').trim().toLowerCase();
  if (window.PET_COLOR_MAP[key]) return window.PET_COLOR_MAP[key];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(key)) return key;
  return '#777777';
}
window.getPetColorBackground = getPetColorBackground;

function normalizeProductVariants(product) {
  if (!product) return [];
  const basePrice = parseFloat(formatPrice(product)) || 0;
  const baseOld = product.oldPrice ? parseFloat(product.oldPrice) : null;
  const defaultStock = typeof product.stock === 'number' ? product.stock : 10;

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants
      .filter(v => v && v.label)
      .map(v => {
        const p = parseFloat(v.price);
        const price = !isNaN(p) && p > 0 ? p : basePrice;
        const oldRaw = v.oldPrice !== null && v.oldPrice !== undefined ? parseFloat(v.oldPrice) : baseOld;
        const oldPrice = oldRaw && !isNaN(oldRaw) && oldRaw > price ? oldRaw : null;
        const stock = typeof v.stock === 'number' ? v.stock : defaultStock;
        return {
          label: String(v.label).trim(),
          price,
          oldPrice,
          stock
        };
      });
  }

  if (Array.isArray(product.sizes) && product.sizes.length > 0) {
    return product.sizes
      .filter(Boolean)
      .map(s => ({
        label: String(s).trim(),
        price: basePrice,
        oldPrice: baseOld && baseOld > basePrice ? baseOld : null,
        stock: defaultStock
      }));
  }

  return [];
}
window.normalizeProductVariants = normalizeProductVariants;

function normalizeProductColors(product) {
  if (!product || !Array.isArray(product.colors)) return [];
  const defaultStock = typeof product.stock === 'number' ? product.stock : 10;
  return product.colors
    .filter(Boolean)
    .map(c => {
      if (typeof c === 'string') {
        const name = c.trim();
        return name ? { name, hex: getPetColorBackground(name), stock: defaultStock } : null;
      }
      if (typeof c === 'object') {
        const name = String(c.name || c.label || '').trim();
        if (!name) return null;
        const hexRaw = String(c.code || c.hex || '').trim();
        const mapped = getPetColorBackground(name);
        const hex = (hexRaw && hexRaw !== '#2c2527') ? hexRaw : (mapped !== '#777777' ? mapped : (hexRaw || mapped));
        const stock = typeof c.stock === 'number' ? c.stock : defaultStock;
        return { name, hex, stock };
      }
      return null;
    })
    .filter(Boolean);
}
window.normalizeProductColors = normalizeProductColors;

function buildCardOptionsHTML(product) {
  if (!product) return "";
  if (product.id) {
    window.__productsRegistry[String(product.id)] = product;
  }
  const variants = normalizeProductVariants(product);
  const colors = normalizeProductColors(product);

  if (variants.length === 0 && colors.length === 0) return "";

  let colorsHtml = "";
  if (colors.length > 0) {
    const visibleColors = colors.slice(0, 4);
    const extraCount = colors.length - visibleColors.length;
    colorsHtml = `
      <div class="card-colors-row" role="group" aria-label="Dostupne boje">
        ${visibleColors.map(c => {
          const safeC = escapeHtml(c.name);
          const safeBg = escapeHtml(c.hex);
          const isOos = typeof c.stock === 'number' && c.stock <= 0;
          return `<span class="card-color-dot${isOos ? ' is-out-of-stock' : ''}" role="button" tabindex="${isOos ? '-1' : '0'}" data-color="${safeC}" data-color-stock="${c.stock}" title="${isOos ? `${safeC} (Rasprodato)` : safeC}" aria-label="Boja: ${safeC}" style="background: ${safeBg};"></span>`;
        }).join("")}
        ${extraCount > 0 ? `<span class="more-colors-badge">+${extraCount}</span>` : ""}
      </div>
    `;
  }

  let variantsHtml = "";
  if (variants.length > 0) {
    variantsHtml = `
      <div class="card-variants-row" role="group" aria-label="Dostupna pakovanja ili veličine">
        ${variants.slice(0, 5).map(v => {
          const safeLbl = escapeHtml(v.label);
          const isOos = v.stock <= 0;
          return `<span class="card-variant-pill${isOos ? ' is-out-of-stock' : ''}" role="button" tabindex="${isOos ? '-1' : '0'}" data-variant-label="${safeLbl}" data-variant-price="${v.price}" data-variant-oldprice="${v.oldPrice || ''}" data-variant-stock="${v.stock}" title="${isOos ? `${safeLbl} (Rasprodato)` : `${safeLbl} — ${formatPriceString(v.price)} RSD`}" aria-label="${safeLbl}">${safeLbl}</span>`;
        }).join("")}
        ${variants.length > 5 ? `<span class="more-variants-badge">+${variants.length - 5}</span>` : ""}
      </div>
    `;
  }

  return `<div class="card-options-wrap">${colorsHtml}${variantsHtml}</div>`;
}
window.buildCardOptionsHTML = buildCardOptionsHTML;

function showQuickToast(message) {
  let toast = document.getElementById('haQuickToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'haQuickToast';
    toast.className = 'ha-quick-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span class="material-symbols-outlined">check_circle</span><span>${escapeHtml(message)}</span>`;
  toast.classList.add('is-visible');
  clearTimeout(window.__haQuickToastTimer);
  window.__haQuickToastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2600);
}
window.showQuickToast = showQuickToast;

function flyToCartAnimation(sourceEl) {
  const cartIcon = document.querySelector("#openCart");
  if (!cartIcon) return;
  if (sourceEl) {
    const buttonRect = sourceEl.getBoundingClientRect();
    const cartRect = cartIcon.getBoundingClientRect();
    if (buttonRect.width > 0 && cartRect.width > 0) {
      const flyingElement = document.createElement("div");
      flyingElement.className = "flying-item";
      flyingElement.innerHTML = '<span class="material-symbols-outlined cart-icon">add_shopping_cart</span>';
      flyingElement.style.position = "fixed";
      flyingElement.style.left = (buttonRect.left + buttonRect.width / 2) + "px";
      flyingElement.style.top = (buttonRect.top + buttonRect.height / 2) + "px";
      flyingElement.style.pointerEvents = "none";
      flyingElement.style.zIndex = "100020";
      document.body.appendChild(flyingElement);
      setTimeout(() => {
        flyingElement.style.transition = "all 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        flyingElement.style.left = (cartRect.left + cartRect.width / 2) + "px";
        flyingElement.style.top = (cartRect.top + cartRect.height / 2) + "px";
        flyingElement.style.opacity = "0";
        flyingElement.style.transform = "scale(0.3)";
      }, 15);
      setTimeout(() => flyingElement.remove(), 800);
    }
  }
  cartIcon.style.animation = "cartNotify 0.6s ease";
  setTimeout(() => {
    cartIcon.style.animation = "";
  }, 600);
}
window.flyToCartAnimation = flyToCartAnimation;

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
window.escapeHtml = escapeHtml;

let _cartRefreshTimer = null;
function addToCart(productId, quantity = 1, variant = "", color = "") {
  const cart = getCartItems();
  const normVar = String(variant || "").trim();
  const normColor = String(color || "").trim();
  const existingItem = cart.find(item =>
    item.id === productId &&
    String(item.variant || "").trim() === normVar &&
    String(item.color || "").trim() === normColor
  );
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    const entry = { id: productId, quantity: quantity, variant: normVar };
    if (normColor) entry.color = normColor;
    cart.push(entry);
  }
  localStorage.setItem('cart', JSON.stringify(cart));
  if (typeof renderCartDrawer === 'function') {
    clearTimeout(_cartRefreshTimer);
    _cartRefreshTimer = setTimeout(() => {
      if (document.querySelector('.cart-items')) renderCartDrawer();
    }, 30);
  }
  return true;
}

function removeFromCart(productId, variant = null) {
  const cart = getCartItems();
  const hasVariantFilter = variant !== null && variant !== undefined;
  const normVar = hasVariantFilter ? String(variant || "").trim() : "";
  const index = cart.findIndex(item =>
    item.id === productId && (!hasVariantFilter || String(item.variant || "").trim() === normVar)
  );
  if (index > -1) {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    return true;
  }
  return false;
}

function updateCartQuantity(productId, quantity, variant = null) {
  const cart = getCartItems();
  const hasVariantFilter = variant !== null && variant !== undefined;
  const normVar = hasVariantFilter ? String(variant || "").trim() : "";
  const item = cart.find(item =>
    item.id === productId && (!hasVariantFilter || String(item.variant || "").trim() === normVar)
  );
  if (item) {
    if (quantity <= 0) {
      return removeFromCart(productId, hasVariantFilter ? normVar : null);
    }
    item.quantity = quantity;
    localStorage.setItem('cart', JSON.stringify(cart));
    return true;
  }
  return false;
}

function getCartItemQuantity(productId, variant = null) {
  const cart = getCartItems();
  if (variant !== null && variant !== undefined) {
    const normVar = String(variant || "").trim();
    const item = cart.find(item => item.id === productId && String(item.variant || "").trim() === normVar);
    return item ? item.quantity : 0;
  }
  return cart
    .filter(item => item.id === productId)
    .reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
}

// Saved items functions
function getSavedItems() {
  try {
    const saved = localStorage.getItem('savedItems');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Error reading savedItems from localStorage:', e);
    return [];
  }
}

function addToSavedItems(productId) {
  const saved = getSavedItems();
  if (!saved.includes(productId)) {
    saved.push(productId);
    localStorage.setItem('savedItems', JSON.stringify(saved));
    // Update all heart icons for this product across the page
    updateHeartIconsForProduct(productId);
    return true;
  }
  return false;
}

function removeFromSavedItems(productId) {
  const saved = getSavedItems();
  const index = saved.indexOf(productId);
  if (index > -1) {
    saved.splice(index, 1);
    localStorage.setItem('savedItems', JSON.stringify(saved));
    // Update all heart icons for this product across the page
    updateHeartIconsForProduct(productId);
    return true;
  }
  return false;
}

function isProductSaved(productId) {
  const saved = getSavedItems();
  return saved.includes(productId);
}

// Update all heart icons for a specific product across the page
function updateHeartIconsForProduct(productId) {
  const isSaved = isProductSaved(productId);
  
  // Update all heart-container elements (used in product cards)
  document.querySelectorAll(`.heart-container[data-product-id="${productId}"]`).forEach(heartContainer => {
    const heartFilled = heartContainer.querySelector('.heart-filled');
    const heartOutline = heartContainer.querySelector('.heart-outline');
    if (heartFilled && heartOutline) {
      heartFilled.style.opacity = isSaved ? "1" : "0";
      heartOutline.style.opacity = isSaved ? "0" : "1";
    }
  });
  
  // Update all recommended-heart-container elements
  document.querySelectorAll(`.recommended-heart-container[data-product-id="${productId}"]`).forEach(heartContainer => {
    const heartFilled = heartContainer.querySelector('.recommended-heart-filled');
    const heartOutline = heartContainer.querySelector('.recommended-heart-outline');
    if (heartFilled && heartOutline) {
      heartFilled.style.opacity = isSaved ? "1" : "0";
      heartOutline.style.opacity = isSaved ? "0" : "1";
    }
  });
  
  // Update btn-favorite elements (used on product detail page)
  document.querySelectorAll(`.btn-favorite[data-product-id="${productId}"]`).forEach(favoriteBtn => {
    const heartFilled = favoriteBtn.querySelector('.heart-filled');
    const heartOutline = favoriteBtn.querySelector('.heart-outline');
    if (heartFilled && heartOutline) {
      if (isSaved) {
        favoriteBtn.classList.add("active");
        heartFilled.style.opacity = "1";
        heartOutline.style.opacity = "0";
      } else {
        favoriteBtn.classList.remove("active");
        heartFilled.style.opacity = "0";
        heartOutline.style.opacity = "1";
      }
    } else {
      // Fallback for old structure with material-symbols-outlined span
      const icon = favoriteBtn.querySelector("span");
      if (isSaved) {
        favoriteBtn.classList.add("active");
        if (icon) {
          icon.textContent = "favorite";
        }
      } else {
        favoriteBtn.classList.remove("active");
        if (icon) {
          icon.textContent = "favorite_border";
        }
      }
    }
  });
}

// Helper functions for rendering
const fallbackImages = [
  "/img/granula.jpg",
  "/img/pas1.jpg",
  "/img/pas2.jpg",
  "/img/pas3.jpg",
  "/img/pansion.jpg",
  "/img/pansionSlika.jpg",
  "/img/zec.jpg",
  "/img/papagaj.png",
  "/img/pasPozadina.jpg",
  "/img/pozadinaMacka.jpg",
  "/img/galerija/lokal1.jpg",
  "/img/galerija/lokal2.jpg",
  "/img/galerija/lokal3.jpg",
  "/img/galerija/lokal4.jpg",
  "/img/galerija/lokal5.jpg",
  "/img/galerija/lokal6.jpg"
];

function pickImage(product) {
  if (product.image) return product.image;
  const key = `${product.id || ""}-${product.title || ""}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const idx = hash % fallbackImages.length;
  return fallbackImages[idx] || "/img/customPageBcg.png";
}

function formatPrice(product) {
  if (!product) return 0;
  const price = product.salePrice && product.salePrice !== '/' ? product.salePrice : product.price;
  return price || 0;
}

// Format price number with commas as thousand separator
function formatPriceNumber(num) {
  const numStr = num.toFixed(2);
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join('.');
}

// Format price string/number with commas as thousand separator (for simple prices without decimals)
function formatPriceString(price) {
  if (price === null || price === undefined || price === '/' || price === '') return price;
  const num = typeof price === 'string' ? parseFloat(price.replace(/[^\d]/g, '')) : parseFloat(price);
  if (isNaN(num)) return price;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
window.formatPriceString = formatPriceString;

// Render cart drawer
async function renderCartDrawer() {
  const cartItems = getCartItems();
  const allProducts = await loadProductsData();
  
  // Create a map for quick product lookup
  const productMap = {};
  allProducts.forEach(p => { productMap[p.id] = p; });
  
  // Filter cart items to only include products that exist
  const validCartItems = cartItems.filter(item => productMap[item.id]);
  
  const cartItemsContainer = document.querySelector('.cart-items');
  const cartCount = document.querySelector('.cart-count');
  const totalPriceEl = document.querySelector('.total-price');
  
  if (!cartItemsContainer) return;
  
  if (validCartItems.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="empty-state empty-cart">
        <div class="empty-icon">
          <span class="material-symbols-outlined">shopping_cart</span>
        </div>
        <h3>Vaša korpa je prazna</h3>
        <p>Izgleda da još niste dodali ništa u korpu.</p>
        <a href="/all-products" class="empty-cta-btn">
          <span class="material-symbols-outlined">shopping_bag</span>
          Katalog
        </a>
      </div>
    `;
    if (cartCount) cartCount.textContent = '(0)';
    if (totalPriceEl) totalPriceEl.textContent = '0,00 RSD';
    // Hide cart footer when empty
    const cartFooter = document.querySelector('.cart-footer');
    if (cartFooter) cartFooter.style.display = 'none';
    return;
  }
  
  // Show cart footer when not empty
  const cartFooterShow = document.querySelector('.cart-footer');
  if (cartFooterShow) cartFooterShow.style.display = 'block';
  
  let total = 0;
  let totalItems = 0;
  let html = '';
  
  validCartItems.forEach(cartItem => {
    const product = productMap[cartItem.id];
    const quantity = cartItem.quantity || 1;
    const resolvedVar = resolveProductVariant(product, cartItem.variant);
    const price = parseFloat(resolvedVar.price) || 0;
    const variantLabel = String(cartItem.variant || resolvedVar.label || '').trim();
    const colorLabel = String(cartItem.color || '').trim();
    const safeProdId = escapeHtml(product.id);
    const safeTitle = escapeHtml(product.title);
    const safeBrand = escapeHtml(product.brand || '');
    const safeVar = escapeHtml(variantLabel);
    const safeColor = escapeHtml(colorLabel);
    const variantSubtitle = [
      safeBrand,
      safeVar ? `<strong>${safeVar}</strong>` : '',
      safeColor ? `<span>${safeColor}</span>` : ''
    ].filter(Boolean).join(' • ');
    const itemTotal = price * quantity;
    total += itemTotal;
    totalItems += quantity;
    
    html += `
      <div class="cart-item" data-product-id="${safeProdId}" data-variant="${safeVar}">
        <div class="item-img">
          <div class="item-img-skeleton"></div>
          <div class="item-img-error" style="display: none;">
            <span class="material-symbols-outlined">image_not_supported</span>
          </div>
          <img src="" alt="${safeTitle}" loading="lazy" style="opacity: 0; display: block;">
        </div>
        <div class="item-details">
          <h4>${safeTitle}</h4>
          <p class="item-variant">${variantSubtitle}</p>
          <div class="price-row">
            <span class="item-price">${formatPriceNumber(itemTotal)} RSD</span>
            <div class="qty-control">
              <button class="qty-btn minus" data-product-id="${safeProdId}" data-variant="${safeVar}">-</button>
              <input type="number" value="${quantity}" min="1" readonly data-product-id="${safeProdId}" data-variant="${safeVar}">
              <button class="qty-btn plus" data-product-id="${safeProdId}" data-variant="${safeVar}">+</button>
            </div>
          </div>
        </div>
        <button class="remove-item" data-product-id="${safeProdId}" data-variant="${safeVar}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    `;
  });
  
  cartItemsContainer.innerHTML = html;
  if (cartCount) cartCount.textContent = `(${totalItems})`;
  if (totalPriceEl) totalPriceEl.textContent = `${formatPriceNumber(total)} RSD`;
  
  // Fetch images and update
  if (validCartItems.length > 0) {
    loadCartImagesFromCloudinary(validCartItems, productMap);
  }
  
  // Attach remove handlers with animation
  cartItemsContainer.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const productId = this.getAttribute('data-product-id');
      const variant = this.getAttribute('data-variant') || '';
      const cartItem = this.closest('.cart-item');
      
      // Add removing class to trigger animation
      cartItem.classList.add('removing');
      
      // Wait for animation to complete before actually removing
      setTimeout(() => {
        performFlipDelete(
            cartItemsContainer,
            cartItem,
            () => removeFromCart(productId, variant), // Update Data
            () => updateCartTotalsOnly()              // Update UI
        );
      }, 300); // Match animation duration
    });
  });
  
  // Attach quantity handlers
  cartItemsContainer.querySelectorAll('.qty-btn.plus').forEach(btn => {
    btn.addEventListener('click', function() {
      const productId = this.getAttribute('data-product-id');
      const variant = this.getAttribute('data-variant') || '';
      const input = this.parentElement.querySelector('input');
      const currentQty = parseInt(input.value) || 1;
      updateCartQuantity(productId, currentQty + 1, variant);
      renderCartDrawer();
    });
  });
  
  cartItemsContainer.querySelectorAll('.qty-btn.minus').forEach(btn => {
    btn.addEventListener('click', function() {
      const productId = this.getAttribute('data-product-id');
      const variant = this.getAttribute('data-variant') || '';
      const input = this.parentElement.querySelector('input');
      const currentQty = parseInt(input.value) || 1;
      if (currentQty > 1) {
        updateCartQuantity(productId, currentQty - 1, variant);
        renderCartDrawer();
      }
    });
  });
  
  // Add click handler to navigate to product page when clicking on cart item
  cartItemsContainer.querySelectorAll('.cart-item').forEach(item => {
    item.addEventListener('click', function(e) {
      // Don't navigate if clicking on buttons or quantity controls
      if (e.target.closest('.remove-item') || 
          e.target.closest('.qty-btn') || 
          e.target.closest('.qty-control') ||
          e.target.closest('input')) {
        return;
      }
      
      const productId = this.getAttribute('data-product-id');
      const product = productMap[productId];
      if (product && product.title) {
        const productSlug = slugify(product.title);
        window.location.href = `/${productSlug}`;
      }
    });
  });
}

// Function to show cart notification (defined at top level for accessibility)
function showCartNotification(productName) {
  // Toast notification disabled - no longer showing
  return;
  
  const toastElement = document.getElementById('cartToast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (!toastElement || !toastMessage) return;
  
  // Check if Bootstrap is available
  if (typeof bootstrap === 'undefined') {
    console.warn('Bootstrap is not loaded. Toast notification will not be shown.');
    return;
  }
  
  // Update message with product name
  toastMessage.textContent = `${productName} je dodato u vašu korpu!`;
  
  // Initialize and show Bootstrap toast
  const toast = new bootstrap.Toast(toastElement, {
    autohide: true,
    delay: 3000
  });
  toast.show();
}

// Helper function for FLIP animation (First, Last, Invert, Play)
// This enables smooth reordering of items when one is removed
function performFlipDelete(container, itemToRemove, updateDataCallback, updateUiCallback) {
  // 1. Snapshot positions of all remaining items (First)
  const siblings = Array.from(container.children).filter(el => 
      el !== itemToRemove && 
      el.style.display !== 'none' && 
      !el.classList.contains('removing')
  );
  
  const positions = siblings.map(el => {
      const rect = el.getBoundingClientRect();
      return { el, left: rect.left, top: rect.top };
  });

  // 2. Remove item from DOM
  itemToRemove.remove();

  // 3. Update data (localStorage)
  if (updateDataCallback) updateDataCallback();

  // 4. Update UI totals (counters, prices)
  if (updateUiCallback) updateUiCallback();

  // 5. FLIP animation
  requestAnimationFrame(() => {
      positions.forEach(pos => {
          // Measure new position (Last)
          const newRect = pos.el.getBoundingClientRect();
          const deltaX = pos.left - newRect.left;
          const deltaY = pos.top - newRect.top;

          // Only animate if position changed
          if (deltaX !== 0 || deltaY !== 0) {
              // Invert: Apply transform to put element back to old visual position
              pos.el.style.transition = 'none';
              pos.el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
              
              // Play: Remove transform and let CSS transition animate to new position
              requestAnimationFrame(() => {
                  pos.el.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                  pos.el.style.transform = '';
              });
          }
      });
  });
}

// Update cart totals without full re-render
async function updateCartTotalsOnly() {
  const cartItems = getCartItems();
  
  // If empty, full re-render to show empty state
  if (cartItems.length === 0) {
      renderCartDrawer();
      return;
  }

  const allProducts = await loadProductsData();
  const productMap = {};
  allProducts.forEach(p => { productMap[p.id] = p; });

  let total = 0;
  let totalItems = 0;

  cartItems.forEach(cartItem => {
      const product = productMap[cartItem.id];
      if (product) {
          const quantity = cartItem.quantity || 1;
          const resolvedVar = resolveProductVariant(product, cartItem.variant);
          const price = parseFloat(resolvedVar.price) || 0;
          total += price * quantity;
          totalItems += quantity;
      }
  });

  const cartCount = document.querySelector('.cart-count');
  const totalPriceEl = document.querySelector('.total-price');
  
  if (cartCount) cartCount.textContent = `(${totalItems})`;
  if (totalPriceEl) totalPriceEl.textContent = `${formatPriceNumber(total)} RSD`;
}

// Update saved count without full re-render
function updateSavedCountOnly() {
  const savedItems = getSavedItems();
  
  // If empty, full re-render to show empty state
  if (savedItems.length === 0) {
      renderSavedDrawer();
      return;
  }

  const savedCount = document.querySelector('.saved-count');
  if (savedCount) savedCount.textContent = savedItems.length;
}

// Render saved items drawer
async function renderSavedDrawer() {
  const savedItems = getSavedItems();
  const allProducts = await loadProductsData();
  const savedProducts = allProducts.filter(p => savedItems.includes(p.id));
  
  const savedItemsContainer = document.querySelector('.saved-items-grid');
  const savedCount = document.querySelector('.saved-count');
  
  if (!savedItemsContainer) return;
  
  if (savedProducts.length === 0) {
    savedItemsContainer.innerHTML = `
      <div class="empty-state empty-saved">
        <div class="empty-icon">
          <span class="material-symbols-outlined">favorite</span>
        </div>
        <h3>Vaša lista želja je prazna</h3>
        <p>Sačuvajte svoje omiljene proizvode za kasnije klikom na ikonu srca.</p>
        <a href="/all-products" class="empty-cta-btn">
          <span class="material-symbols-outlined">explore</span>
          Pregledaj
        </a>
      </div>
    `;
    if (savedCount) savedCount.textContent = '0';
    // Hide saved footer when empty
    const savedFooter = document.querySelector('.saved-footer');
    if (savedFooter) savedFooter.style.display = 'none';
    return;
  }
  
  // Show saved footer when not empty
  const savedFooterShow = document.querySelector('.saved-footer');
  if (savedFooterShow) savedFooterShow.style.display = 'block';
  
  let html = '';
  
  savedProducts.forEach(product => {
    const price = parseFloat(formatPrice(product));
    
    html += `
      <div class="saved-item-card" data-product-id="${product.id}">
        <button class="remove-saved-item" data-product-id="${product.id}">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="saved-img">
          <div class="saved-img-skeleton"></div>
          <div class="saved-img-error" style="display: none;">
            <span class="material-symbols-outlined">image_not_supported</span>
          </div>
          <img src="" alt="${product.title}" loading="lazy" style="opacity: 0; display: block;">
        </div>
        <div class="saved-details">
          <h4>${product.title}</h4>
          <p class="saved-variant">${product.brand || ''}</p>
          <div class="saved-bottom">
            <span class="saved-price">${formatPriceNumber(price)} RSD</span>
            <button class="move-to-cart-btn" data-product-id="${product.id}">
              <span class="material-symbols-outlined">shopping_cart</span>
            </button>
          </div>
        </div>
      </div>
    `;
  });
  
  savedItemsContainer.innerHTML = html;
  if (savedCount) savedCount.textContent = savedProducts.length;
  
  // Fetch images from Cloudinary and update
  if (savedProducts.length > 0) {
    loadSavedImagesFromCloudinary(savedProducts);
  }
  
  // Attach remove handlers with animation
  savedItemsContainer.querySelectorAll('.remove-saved-item').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const productId = this.getAttribute('data-product-id');
      const savedCard = this.closest('.saved-item-card');
      
      // Add removing class to trigger fade-out animation
      savedCard.classList.add('removing');
      
      // Wait for fade-out animation to complete before re-layout
      setTimeout(() => {
        performFlipDelete(
            savedItemsContainer, 
            savedCard, 
            () => removeFromSavedItems(productId), // Update Data
            () => updateSavedCountOnly()           // Update UI
        );
      }, 300); // Match animation duration
    });
  });
  
  // Attach move to cart handlers with animation
  savedItemsContainer.querySelectorAll('.move-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const productId = this.getAttribute('data-product-id');
      const savedCard = this.closest('.saved-item-card');
      
      // Find the product to check variants and colors
      const product = allProducts.find(p => p.id === productId);
      const variants = product ? normalizeProductVariants(product) : [];
      const colors = product ? normalizeProductColors(product) : [];
      if (product && (variants.length > 1 || colors.length > 1) && typeof window.openProductOptionsModal === 'function') {
        const sDrawer = document.querySelector('.saved-drawer');
        const cOverlay = document.querySelector('.cart-overlay-bg');
        if (sDrawer) sDrawer.classList.remove('active');
        if (cOverlay) cOverlay.classList.remove('active');
        document.body.classList.remove('no-scroll');
        document.documentElement.classList.remove('no-scroll');
        const savedImg = savedCard?.querySelector('.saved-img img');
        const imgSrc = savedImg && savedImg.src && !savedImg.src.endsWith('/undefined') ? savedImg.src : '';
        window.openProductOptionsModal(
          { ...product, preselectedImage: imgSrc },
          'add_cart',
          { fromSavedDrawer: true, savedProductId: productId }
        );
        return;
      }

      const defaultVar = variants.length === 1 ? variants[0].label : getDefaultVariantLabel(product);
      const defaultColor = colors.length === 1 ? colors[0].name : '';
      
      // Add to cart
      addToCart(productId, 1, defaultVar, defaultColor);
      renderCartDrawer();
      
      // Add removing animation
      savedCard.classList.add('removing');
      
      // Wait for animation before removing from saved items
      setTimeout(() => {
        performFlipDelete(
            savedItemsContainer, 
            savedCard, 
            () => removeFromSavedItems(productId), // Update Data
            () => {
                updateSavedCountOnly();
                showQuickToast('Proizvod je premešten u korpu!');
            }
        );
      }, 300); // Match animation duration
    });
  });
  
  // Add click handler to navigate to product page when clicking on saved item card
  savedItemsContainer.querySelectorAll('.saved-item-card').forEach(card => {
    card.addEventListener('click', function(e) {
      // Don't navigate if clicking on buttons
      if (e.target.closest('.remove-saved-item') || 
          e.target.closest('.move-to-cart-btn')) {
        return;
      }
      
      const productId = this.getAttribute('data-product-id');
      const product = allProducts.find(p => p.id === productId);
      if (product && product.title) {
        const productSlug = slugify(product.title);
        window.location.href = `/${productSlug}`;
      }
    });
  });
}

// Fetch product images in batch from Cloudinary
async function fetchProductImagesBatch(productIds) {
  try {
    const response = await fetch('/api/product-images/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productIds }),
      cache: 'no-store'
    });
    
    const data = await response.json();
    return data.results || {};
  } catch (error) {
    console.error('Error fetching batch images:', error);
    return {};
  }
}

// Load cart images (uses local /uploads WebP URLs directly, falls back to batch API if needed)
async function loadCartImagesFromCloudinary(cartItems, productMap) {
  const missingIds = cartItems
    .filter(ci => {
      const p = productMap[ci.id];
      return !p || !Array.isArray(p.images) || p.images.length === 0;
    })
    .map(ci => ci.id);
  const imagesData = missingIds.length > 0 ? await fetchProductImagesBatch(missingIds) : {};
  
  const renderedCartEls = new Set();
  cartItems.forEach(cartItem => {
    const product = productMap[cartItem.id];
    if (!product) return;
    
    const cartItemElement = Array.from(document.querySelectorAll(`.cart-item[data-product-id="${product.id}"]`)).find(el => !renderedCartEls.has(el));
    if (!cartItemElement) return;
    renderedCartEls.add(cartItemElement);
    
    const imgElement = cartItemElement.querySelector('.item-img img');
    const skeleton = cartItemElement.querySelector('.item-img-skeleton');
    const itemImgContainer = cartItemElement.querySelector('.item-img');
    
    if (!imgElement) return;
    
    const directImgs = Array.isArray(product.images) ? product.images : [];
    const productImages = imagesData[product.id] || [];
    const imageUrls = directImgs.length > 0
      ? directImgs
      : productImages.map(img => img.url);
    
    let itemError = itemImgContainer?.querySelector('.item-img-error');
    
    // If no images available, show error immediately
    if (imageUrls.length === 0) {
      // Hide skeleton
      if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          skeleton.classList.add('hidden');
          skeleton.style.display = 'none';
        }, 300);
      }
      // Show error
      if (!itemError) {
        itemError = document.createElement('div');
        itemError.className = 'item-img-error';
        itemError.innerHTML = `
          <span class="material-symbols-outlined">image_not_supported</span>
        `;
        itemImgContainer.appendChild(itemError);
      }
      itemError.style.display = 'flex';
      imgElement.style.display = 'none';
      return;
    }
    
    // Load image
    const imageLoader = new Image();
    imageLoader.onload = () => {
      imgElement.src = imageLoader.src;
      imgElement.style.opacity = '1';
      imgElement.style.transition = 'opacity 0.3s ease, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
      
      // Hide skeleton
      if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          skeleton.classList.add('hidden');
          skeleton.style.display = 'none';
        }, 300);
      }
      // Hide error if it was shown
      if (itemError) {
        itemError.style.display = 'none';
      }
    };
    imageLoader.onerror = () => {
      // Hide skeleton
      if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          skeleton.classList.add('hidden');
          skeleton.style.display = 'none';
        }, 300);
      }
      // Show error
      if (!itemError) {
        itemError = document.createElement('div');
        itemError.className = 'item-img-error';
        itemError.innerHTML = `
          <span class="material-symbols-outlined">image_not_supported</span>
        `;
        itemImgContainer.appendChild(itemError);
      }
      itemError.style.display = 'flex';
      imgElement.style.display = 'none';
    };
    imageLoader.src = imageUrls[0];
  });
}

// Load saved images (uses local /uploads WebP URLs directly, falls back to batch API if needed)
async function loadSavedImagesFromCloudinary(savedProducts) {
  const missingIds = savedProducts
    .filter(p => !Array.isArray(p.images) || p.images.length === 0)
    .map(p => p.id);
  const imagesData = missingIds.length > 0 ? await fetchProductImagesBatch(missingIds) : {};
  
  savedProducts.forEach(product => {
    const savedCard = document.querySelector(`.saved-item-card[data-product-id="${product.id}"]`);
    if (!savedCard) return;
    
    const imgElement = savedCard.querySelector('.saved-img img');
    const skeleton = savedCard.querySelector('.saved-img-skeleton');
    const savedImgContainer = savedCard.querySelector('.saved-img');
    
    if (!imgElement) return;
    
    const directImgs = Array.isArray(product.images) ? product.images : [];
    const productImages = imagesData[product.id] || [];
    const imageUrls = directImgs.length > 0
      ? directImgs
      : productImages.map(img => img.url);
    
    let savedError = savedImgContainer?.querySelector('.saved-img-error');
    
    // If no images available, show error immediately
    if (imageUrls.length === 0) {
      // Hide skeleton
      if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          skeleton.classList.add('hidden');
          skeleton.style.display = 'none';
        }, 300);
      }
      // Show error
      if (!savedError) {
        savedError = document.createElement('div');
        savedError.className = 'saved-img-error';
        savedError.innerHTML = `
          <span class="material-symbols-outlined">image_not_supported</span>
        `;
        savedImgContainer.appendChild(savedError);
      }
      savedError.style.display = 'flex';
      imgElement.style.display = 'none';
      return;
    }
    
    // Load image
    const imageLoader = new Image();
    imageLoader.onload = () => {
      imgElement.src = imageLoader.src;
      imgElement.style.opacity = '1';
      imgElement.style.transition = 'opacity 0.3s ease, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
      
      // Hide skeleton
      if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          skeleton.classList.add('hidden');
          skeleton.style.display = 'none';
        }, 300);
      }
      // Hide error if it was shown
      if (savedError) {
        savedError.style.display = 'none';
      }
    };
    imageLoader.onerror = () => {
      // Hide skeleton
      if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          skeleton.classList.add('hidden');
          skeleton.style.display = 'none';
        }, 300);
      }
      // Show error
      if (!savedError) {
        savedError = document.createElement('div');
        savedError.className = 'saved-img-error';
        savedError.innerHTML = `
          <span class="material-symbols-outlined">image_not_supported</span>
        `;
        savedImgContainer.appendChild(savedError);
      }
      savedError.style.display = 'flex';
      imgElement.style.display = 'none';
    };
    imageLoader.src = imageUrls[0];
  });
}

// Funkcija za učitavanje proizvoda iz backend API-ja (keširano u jednoj sesiji)
let __productsDataPromise = null;
async function loadProductsData() {
  if (window.productJsonPromise) {
    try {
      const preloaded = await window.productJsonPromise;
      if (Array.isArray(preloaded)) return preloaded;
      if (preloaded && Array.isArray(preloaded.products)) return preloaded.products;
    } catch (e) {}
  }
  if (!__productsDataPromise) {
    __productsDataPromise = fetch('/api/products?limit=1000')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((data) => (Array.isArray(data) ? data : (data.products || [])))
      .catch((error) => {
        console.error('Error loading products:', error);
        __productsDataPromise = null;
        return [];
      });
  }
  return __productsDataPromise;
}

// Funkcija za kreiranje strukture category iz JSON podataka
// Helper function for slugifying (used in multiple places)
function slugify(value) {
  if (!value) return "";

  const cyrToLat = {
    а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "z",
    з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n",
    њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "c", у: "u",
    ф: "f", х: "h", ц: "c", ч: "c", џ: "dz", ш: "s",
    А: "a", Б: "b", В: "v", Г: "g", Д: "d", Ђ: "dj", Е: "e", Ж: "z",
    З: "z", И: "i", Ј: "j", К: "k", Л: "l", Љ: "lj", М: "m", Н: "n",
    Њ: "nj", О: "o", П: "p", Р: "r", С: "s", Т: "t", Ћ: "c", У: "u",
    Ф: "f", Х: "h", Ц: "c", Ч: "c", Џ: "dz", Ш: "s"
  };

  let result = value.toString();
  result = result.replace(/[а-яА-ЯђЂљЉњЊћЋџЏ]/g, ch => cyrToLat[ch] || ch);
  result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  result = result
    .replace(/đ/g, "dj").replace(/Đ/g, "dj")
    .replace(/ž/g, "z").replace(/Ž/g, "z")
    .replace(/č/g, "c").replace(/Č/g, "c")
    .replace(/ć/g, "c").replace(/Ć/g, "c")
    .replace(/š/g, "s").replace(/Š/g, "s");

  return result
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function formatCategoryLabel(str) {
  if (!str) return "";
  const s = String(str).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseCategories(products) {
  const categoryMap = {};

  // Mapiranje category na ikonice
  const categoryIcons = {
    "Hrana za kućne ljubimce": "restaurant",
    "Igračke za kućne ljubimce": "toys",
    "Nega kućnih ljubimaca": "spa",
    "Oprema za kućne ljubimce": "pets"
  };

  // Mapiranje category na data-category atribute
  const categoryDataAttrs = {
    "Hrana za kućne ljubimce": "hrana",
    "Igračke za kućne ljubimce": "igracke",
    "Nega kućnih ljubimaca": "higijena",
    "Oprema za kućne ljubimce": "oprema"
  };

  products.forEach(product => {
    const rawCats = Array.isArray(product.category) ? product.category : [product.category].filter(Boolean);
    const rawSubs = Array.isArray(product.subcategory) ? product.subcategory : [product.subcategory].filter(Boolean);
    const rawSub2s = Array.isArray(product.subcategory2)
      ? product.subcategory2
      : [product.type || product.subcategory2].filter(Boolean);

    rawCats.forEach(rawCat => {
      const category = formatCategoryLabel(rawCat);
      if (!category) return;

      if (!categoryMap[category]) {
        categoryMap[category] = {
          icon: categoryIcons[category] || "pets",
          dataAttr: categoryDataAttrs[category] || slugify(category).replace(/-/g, ''),
          subcategories: {}
        };
      }

      rawSubs.forEach(rawSub => {
        const subcategory = formatCategoryLabel(rawSub);
        if (!subcategory) return;

        if (!categoryMap[category].subcategories[subcategory]) {
          categoryMap[category].subcategories[subcategory] = {
            subcategories2: new Set()
          };
        }

        rawSub2s.forEach(rawSub2 => {
          const sub2Label = formatCategoryLabel(rawSub2);
          if (sub2Label) {
            categoryMap[category].subcategories[subcategory].subcategories2.add(sub2Label);
          }
        });
      });
    });
  });

  return categoryMap;
}

// Funkcija za generisanje dinamičkog HTML-a za dropdown
function generateDynamicDropdownHTML(categoryMap) {
  let sidebarHTML = '';
  let contentHTML = '';

  Object.entries(categoryMap).forEach(([categoryName, categoryData], index) => {
    const isActive = index === 0 ? 'active' : '';
    const { icon, dataAttr, subcategories } = categoryData;

    // Sidebar dugmad
    sidebarHTML += `
      <button class="category-btn ${isActive}" data-category="${dataAttr}">
        <span class="material-symbols-outlined">${icon}</span>
        <span>${categoryName}</span>
      </button>
    `;

    // Content paneli
    let subcategoriesHTML = '';
    const subcats = Object.keys(subcategories);

    // Podeli potkategorije u kolone (maksimalno 3 kolone)
    const columns = [];
    const itemsPerColumn = Math.ceil(subcats.length / 3);

    for (let i = 0; i < subcats.length; i += itemsPerColumn) {
      const columnSubcats = subcats.slice(i, i + itemsPerColumn);
      let columnHTML = '';

      columnSubcats.forEach(subcat => {
        const subcatData = subcategories[subcat];
        const subcatHref = `/${slugify(categoryName)}/${slugify(subcat)}`;
        columnHTML += `<a class="subcategory-title" href="${subcatHref}">${subcat}</a>`;

        // Sortiraj potkategorije2
        const sortedSubcat2 = Array.from(subcatData.subcategories2).sort();

        sortedSubcat2.forEach(subcat2 => {
          const subcat2Href = `/${slugify(categoryName)}/${slugify(subcat)}/${slugify(subcat2)}`;
          columnHTML += `<a href="${subcat2Href}">${subcat2}</a>`;
        });
      });

      if (columnHTML) {
        columns.push(`<div class="subcategory-column">${columnHTML}</div>`);
      }
    }

    subcategoriesHTML = `<div class="subcategories-grid">${columns.join('')}</div>`;

    contentHTML += `
      <div class="category-panel ${isActive}" data-category="${dataAttr}">
        <div class="category-header">
          <h3>
            <span class="material-symbols-outlined">${icon}</span>
            ${categoryName}
          </h3>
          <a href="/${slugify(categoryName)}" class="view-all-link">View all →</a>
        </div>
        ${subcategoriesHTML}
      </div>
    `;
  });

  return { sidebarHTML, contentHTML };
}

document.addEventListener("DOMContentLoaded", async function () {
  // Učitaj podatke o proizvodima
  const products = await loadProductsData();
  const categoryMap = parseCategories(products);
  const { sidebarHTML, contentHTML } = generateDynamicDropdownHTML(categoryMap);

  // Header HTML
  const headerHTML = `
    <header>
      <nav>
        <div class="left">
          <a href="/" class="logo-link"><img src="/img/happy animal.png" alt="Happy Animals logo" loading="eager" fetchpriority="high" /></a>
          <h1><a href="/" class="logo-link">Happy Animals</a></h1>
        </div>

        <div class="mid">
          <!-- Desktop Navigation (hidden on mobile) -->
          <nav class="desktop-nav">
            <ul>
              <a href="/"><li>Početna</li></a>
              <a href="/about"><li>O Nama</li></a>
              <a href="/gallery"><li>Galerija</li></a>
              <li class="dropdown">
                <a href="/all-products">Proizvodi</a>
                <div class="mega-dropdown">
                  <div class="mega-dropdown-wrapper">
                    <!-- Left Sidebar: Categories List -->
                    <div class="categories-sidebar">
                      ${sidebarHTML}
                    </div>

                    <!-- Right Content Area: Subcategories -->
                    <div class="categories-content">
                      ${contentHTML}
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </nav>
          
          <!-- Mobile Menu Logo and Close -->
          <div class="mobile-menu-logo">
            <div class="mobile-menu-logo-content">
              <img src="/img/happy animal.png" alt="Happy Animals logo" />
              <div class="mobile-menu-logo-text">Happy Animals</div>
            </div>
            <button class="mobile-menu-close" aria-label="Zatvori">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <!-- Main Navigation Menu (Mobile) -->
          <nav class="mobile-menu-nav">
            <ul>
              <a href="/" class="active">
                <li>
                  <span class="material-symbols-outlined">home</span>
                  <span>Početna</span>
                </li>
              </a>
              <a href="/about">
                <li>
                  <span class="material-symbols-outlined">info</span>
                  <span>O Nama</span>
                </li>
              </a>
              <a href="/gallery">
                <li>
                  <span class="material-symbols-outlined">photo_library</span>
                  <span>Galerija</span>
                </li>
              </a>
              <li class="dropdown">
                <a href="/all-products" class="mobile-menu-products-link">
                  <span class="material-symbols-outlined">shopping_bag</span>
                  <span>Proizvodi</span>
                  <span class="material-symbols-outlined dropdown-arrow">chevron_right</span>
                </a>
                <div class="mega-dropdown">
                  <div class="mega-dropdown-wrapper">
                    <!-- Left Sidebar: Categories List -->
                    <div class="categories-sidebar">
                      ${sidebarHTML}
                    </div>

                    <!-- Right Content Area: Subcategories -->
                    <div class="categories-content">
                      ${contentHTML}
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </nav>
          <!-- Products Categories View (slides in when Products is clicked) -->
          <div class="mobile-menu-products-view">
            <div class="mobile-menu-products-view-categories active">
              <div class="mobile-menu-categories-header">
                <button class="mobile-menu-categories-back">
                  <span class="material-symbols-outlined">arrow_back_ios</span>
                </button>
                <span class="mobile-menu-categories-back-text">Nazad na navigaciju</span>
              </div>
              <ul class="mobile-menu-products-categories">
                ${Object.entries(categoryMap).map(([categoryName, categoryData]) => {
                  const { icon, subcategories } = categoryData;
                  const categorySlug = slugify(categoryName);
                  const subcategoriesData = JSON.stringify({
                    categoryName,
                    categorySlug,
                    icon,
                    subcategories: Object.keys(subcategories).map(subcatName => ({
                      name: subcatName,
                      slug: slugify(subcatName),
                      subcategories2: Array.from(subcategories[subcatName].subcategories2 || []).map(subcat2 => ({
                        name: subcat2,
                        slug: slugify(subcat2)
                      }))
                    }))
                  }).replace(/"/g, '&quot;');
                  return `
                    <li class="mobile-menu-products-category-item" data-category-data="${subcategoriesData}">
                      <a href="/${categorySlug}" class="mobile-menu-products-category-link">
                        <span class="mobile-menu-products-category-text">${categoryName}</span>
                        <span class="material-symbols-outlined mobile-menu-products-arrow">chevron_right</span>
                      </a>
                    </li>
                  `;
                }).join('')}
              </ul>
            </div>
            <div class="mobile-menu-products-view-subcategories">
              <div class="mobile-menu-products-subcategories-header">
                <button class="mobile-menu-products-back">
                  <span class="material-symbols-outlined">arrow_back_ios</span>
                </button>
                <span class="mobile-menu-products-current-category-title"></span>
                <a href="#" class="mobile-menu-products-view-all-link">Prikaži sve</a>
              </div>
              <div class="mobile-menu-products-subcategories-content"></div>
            </div>
          </div>
          <div class="mobile-menu-footer">
            <a href="/all-products" class="mobile-menu-view-all-btn">
              <span class="material-symbols-outlined">shopping_bag</span>
              <span>Prikaži sve proizvode</span>
            </a>
          </div>
        </div>

        <div class="right">
            <button id="openCart">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M6.29977 5H21L19 12H7.37671M20 16H8L6 3H3M9 20C9 20.5523 8.55228 21 8 21C7.44772 21 7 20.5523 7 20C7 19.4477 7.44772 19 8 19C8.55228 19 9 19.4477 9 20ZM20 20C20 20.5523 19.5523 21 19 21C18.4477 21 18 20.5523 18 20C18 19.4477 18.4477 19 19 19C19.5523 19 20 19.4477 20 20Z"
                stroke="#000000"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>

            <span class="btn-text">Moja korpa</span>
          </button>

          <button id="savedProduct">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M1.24264 8.24264L8 15L14.7574 8.24264C15.553 7.44699 16 6.36786 16 5.24264V5.05234C16 2.8143 14.1857 1 11.9477 1C10.7166 1 9.55233 1.55959 8.78331 2.52086L8 3.5L7.21669 2.52086C6.44767 1.55959 5.28338 1 4.05234 1C1.8143 1 0 2.8143 0 5.05234V5.24264C0 6.36786 0.44699 7.44699 1.24264 8.24264Z"
                fill="#000000"
              />
            </svg>

            <span class="btn-text">Sačuvano</span>
          </button>
        </div>

        <div class="hamburger">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
      </nav>
      <div class="mobile-menu-overlay"></div>
    </header>
    
    <!-- Products Modal (slides in from right) -->
    <div id="products-modal" class="products-modal">
      <div class="products-modal-header">
        <div class="products-modal-logo">
          <img src="/img/happy animal.png" alt="Happy Animals logo" />
          <span class="products-modal-logo-text">Happy Animals</span>
        </div>
        <button class="products-modal-close" aria-label="Zatvori">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="products-modal-content">
        <div class="products-modal-view products-modal-categories-view active">
          <ul class="products-modal-categories">
            ${Object.entries(categoryMap).map(([categoryName, categoryData]) => {
              const { icon, dataAttr, subcategories } = categoryData;
              const categorySlug = slugify(categoryName);
              // Store subcategories data as JSON for JavaScript access
              const subcategoriesData = JSON.stringify({
                categoryName,
                categorySlug,
                icon,
                subcategories: Object.keys(subcategories).map(subcatName => ({
                  name: subcatName,
                  slug: slugify(subcatName),
                  subcategories2: Array.from(subcategories[subcatName].subcategories2 || []).map(subcat2 => ({
                    name: subcat2,
                    slug: slugify(subcat2)
                  }))
                }))
              }).replace(/"/g, '&quot;');
              return `
                <li class="products-modal-category-item" data-category-data="${subcategoriesData}">
                  <a href="/${categorySlug}" class="products-modal-category-link">
                    <span class="products-modal-category-text">${categoryName}</span>
                    <span class="material-symbols-outlined products-modal-arrow">chevron_right</span>
                  </a>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
        <div class="products-modal-view products-modal-subcategories-view">
          <button class="products-modal-back">
            <span class="material-symbols-outlined">arrow_back</span>
            <span class="products-modal-back-text">Nazad</span>
          </button>
          <div class="products-modal-subcategories-content"></div>
        </div>
      </div>
    </div>
    <div class="products-modal-overlay"></div>
  `;

  // Footer HTML
  const footerHTML = `
    <footer>
      <div class="footerTopContent">
        <h4>Pratite nas:</h4>
        <div class="footerTopIcons">
          <a href="https://www.facebook.com/profile.php?id=100017595854060">
            <i class="fab fa-facebook ig" aria-hidden="true"></i>
          </a>
          <a href="https://www.instagram.com/savic_vet_shop_cuprija/">
            <i class="fab fa-instagram fb" aria-hidden="true"></i>
          </a>
        </div>
        <a href="#body" id="scrollToTop"
          >Povratak na vrh <i class="fa fa-arrow-up" aria-hidden="true"></i
        ></a>
      </div>

      <div class="footerBottomContent">
      <a href="/">Početna</a>
      <a href="/about">O Nama</a>
      <a href="/gallery">Galerija</a>
      <a href="/legal">Pravne informacije</a>
      </div>
    </footer>
  `;

  // Ubaci header na pocetak body-a
  document.body.insertAdjacentHTML("afterbegin", headerHTML);

  // Ubaci footer na kraj body-a (pre lightbox modala ako postoji)
  const lightboxModal = document.getElementById("lightbox-modal");
  if (lightboxModal) {
    lightboxModal.insertAdjacentHTML("beforebegin", footerHTML);
  } else {
    document.body.insertAdjacentHTML("beforeend", footerHTML);
  }

  // ========== UNIVERSAL QUICK PRODUCT OPTIONS MODAL ==========
  const quickModalHTML = `
    <div id="productQuickModal" class="quick-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="quickModalTitle">
      <div class="quick-modal-overlay" id="quickModalOverlay"></div>
      <div class="quick-modal-dialog">
        <button class="quick-modal-close" id="quickModalClose" type="button" aria-label="Zatvori izbor opcija">
          <span class="material-symbols-outlined">close</span>
        </button>

        <div class="quick-modal-header">
          <div class="quick-modal-thumb-wrap">
            <img id="quickModalImg" src="/img/happy animal.png" alt="Proizvod" />
          </div>
          <div class="quick-modal-info">
            <span class="quick-modal-brand" id="quickModalBrand"></span>
            <h3 id="quickModalTitle" class="quick-modal-title">Naslov proizvoda</h3>
            <div class="quick-modal-price-row">
              <span id="quickModalPrice" class="quick-modal-price">0 RSD</span>
              <span id="quickModalOldPrice" class="quick-modal-old-price" style="display: none;"></span>
              <span id="quickModalDiscount" class="quick-modal-discount" style="display: none;"></span>
            </div>
            <div class="quick-modal-selected-summary" id="quickModalSummary" style="display: none;"></div>
          </div>
        </div>

        <div id="quickModalAlert" class="quick-modal-alert" role="alert" style="display: none;">
          <span class="material-symbols-outlined">error_outline</span>
          <span id="quickModalAlertText">Molimo izaberite opcije</span>
        </div>

        <div class="quick-modal-body">
          <div class="quick-option-section" id="quickModalColorSection" style="display: none;">
            <label class="quick-option-label">Izaberite boju:</label>
            <div id="quickModalColorsGrid" class="quick-color-options"></div>
          </div>

          <div class="quick-option-section" id="quickModalSizeSection" style="display: none;">
            <label class="quick-option-label" id="quickModalSizeLabel">Izaberite pakovanje / veličinu:</label>
            <div id="quickModalSizesGrid" class="quick-size-options"></div>
          </div>

          <div class="quick-option-section" id="quickModalQtySection">
            <label class="quick-option-label">Količina:</label>
            <div class="quick-qty-control">
              <button type="button" class="quick-qty-btn" id="quickQtyMinus" aria-label="Smanji količinu">−</button>
              <input type="text" id="quickQtyVal" value="1" readonly aria-label="Količina" />
              <button type="button" class="quick-qty-btn" id="quickQtyPlus" aria-label="Povećaj količinu">+</button>
            </div>
            <p class="qty-stock-warning" id="quickModalStockNotice" style="display: none;"></p>
          </div>
        </div>

        <div class="quick-modal-footer">
          <button type="button" id="quickModalBtnAdd" class="quick-btn-primary">
            <span class="material-symbols-outlined">add_shopping_cart</span>
            Dodaj u korpu
          </button>
          <button type="button" id="quickModalBtnBuy" class="quick-btn-secondary" style="display: none;">
            Nastavi na korpu &rarr;
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", quickModalHTML);

  function updateCardVariantDisplay(card, activePill) {
    if (!card) return;
    const productId = card.getAttribute('data-product-id') || card.getAttribute('data-id');
    const product = productId ? window.__productsRegistry?.[productId] : null;
    const isCustomCard = card.classList.contains('custom-card');
    const isCatalogCard = card.classList.contains('product-card');
    const isRecCard = card.classList.contains('recommended-card');

    let displayPrice = 0;
    let displayOldPrice = null;
    let isRange = false;

    if (activePill) {
      const p = parseFloat(activePill.getAttribute('data-variant-price'));
      const o = parseFloat(activePill.getAttribute('data-variant-oldprice'));
      if (!isNaN(p) && p > 0) displayPrice = p;
      if (!isNaN(o) && o > displayPrice) displayOldPrice = o;
    } else if (product) {
      const summary = getProductPriceSummary(product);
      const variants = normalizeProductVariants(product);
      const firstV = variants[0] || null;
      displayPrice = summary.hasRange ? summary.minPrice : (firstV ? firstV.price : (parseFloat(formatPrice(product)) || 0));
      isRange = summary.hasRange;
      if (!isRange && firstV && firstV.oldPrice && firstV.oldPrice > displayPrice) {
        displayOldPrice = firstV.oldPrice;
      } else if (!isRange && product.oldPrice && Number(product.oldPrice) > displayPrice) {
        displayOldPrice = Number(product.oldPrice);
      }
    } else {
      return;
    }

    const formattedPrice = isRange
      ? `od ${formatPriceString(displayPrice)} RSD`
      : `${formatPriceString(displayPrice)} RSD`;
    const hasDisc = Boolean(displayOldPrice && displayPrice > 0 && displayOldPrice > displayPrice);
    const discPct = hasDisc ? Math.round(((displayOldPrice - displayPrice) / displayOldPrice) * 100) : 0;

    if (isCustomCard) {
      const priceEl = card.querySelector('.price');
      if (priceEl) priceEl.textContent = formattedPrice;
      const priceContainer = card.querySelector('.price-container');
      if (priceContainer) {
        let oldEl = priceContainer.querySelector('.price-old');
        if (hasDisc) {
          if (!oldEl) {
            oldEl = document.createElement('div');
            oldEl.className = 'price-old';
            priceContainer.insertBefore(oldEl, priceContainer.firstChild);
          }
          oldEl.textContent = `${formatPriceString(displayOldPrice)} RSD`;
        } else if (oldEl) {
          oldEl.remove();
        }
      }
      const imgWrap = card.querySelector('.image-c');
      if (imgWrap) {
        let badgeEl = imgWrap.querySelector('.discount-badge');
        if (hasDisc) {
          if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.className = 'discount-badge';
            imgWrap.appendChild(badgeEl);
          }
          badgeEl.textContent = `-${discPct}%`;
        } else if (badgeEl) {
          badgeEl.remove();
        }
      }
    } else if (isCatalogCard) {
      const priceEl = card.querySelector('.product-price');
      if (priceEl) {
        priceEl.innerHTML = `<div class="price-range">${escapeHtml(formattedPrice)}</div>`;
      }
      const imgWrap = card.querySelector('.product-image');
      if (imgWrap) {
        let oldEl = imgWrap.querySelector('.product-old-price-on-image');
        let badgeEl = imgWrap.querySelector('.product-badge');
        if (hasDisc) {
          if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.className = 'product-badge';
            imgWrap.appendChild(badgeEl);
          }
          badgeEl.textContent = `-${discPct}%`;
          if (!oldEl) {
            oldEl = document.createElement('div');
            oldEl.className = 'product-old-price-on-image';
            imgWrap.appendChild(oldEl);
          }
          oldEl.textContent = `${formatPriceString(displayOldPrice)} RSD`;
        } else {
          if (badgeEl) badgeEl.remove();
          if (oldEl) oldEl.remove();
        }
      }
    } else if (isRecCard) {
      const priceEl = card.querySelector('.recommended-price');
      if (priceEl) priceEl.textContent = formattedPrice;
      const priceContainer = card.querySelector('.recommended-price-container');
      if (priceContainer) {
        let oldEl = priceContainer.querySelector('.recommended-old-price');
        if (hasDisc) {
          if (!oldEl) {
            oldEl = document.createElement('div');
            oldEl.className = 'recommended-old-price';
            priceContainer.insertBefore(oldEl, priceContainer.firstChild);
          }
          oldEl.textContent = `${formatPriceString(displayOldPrice)} RSD`;
        } else if (oldEl) {
          oldEl.remove();
        }
      }
      const imgWrap = card.querySelector('.recommended-image-c');
      if (imgWrap) {
        let badgeEl = imgWrap.querySelector('.recommended-discount-badge');
        if (hasDisc) {
          if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.className = 'recommended-discount-badge';
            imgWrap.appendChild(badgeEl);
          }
          badgeEl.textContent = `-${discPct}%`;
        } else if (badgeEl) {
          badgeEl.remove();
        }
      }
    }
  }

  function handleInlineOptionActivation(e) {
    const colorDot = e.target.closest('.card-color-dot');
    const variantPill = e.target.closest('.card-variant-pill');
    if (!colorDot && !variantPill) return;

    e.preventDefault();
    e.stopPropagation();

    const card = e.target.closest('.custom-card, .product-card, .recommended-card');
    if (!card) return;

    if (colorDot) {
      if (colorDot.classList.contains('is-out-of-stock')) return;
      const row = colorDot.closest('.card-colors-row');
      const allDots = row ? Array.from(row.querySelectorAll('.card-color-dot')) : [];
      const wasActive = colorDot.classList.contains('active');
      allDots.forEach(d => d.classList.remove('active'));
      if (!wasActive) {
        colorDot.classList.add('active');
        card.setAttribute('data-selected-color', colorDot.getAttribute('data-color') || '');
      } else {
        card.removeAttribute('data-selected-color');
      }
      return;
    }

    if (variantPill) {
      if (variantPill.classList.contains('is-out-of-stock')) return;
      const row = variantPill.closest('.card-variants-row');
      const allPills = row ? Array.from(row.querySelectorAll('.card-variant-pill')) : [];
      const wasActive = variantPill.classList.contains('active');
      allPills.forEach(p => p.classList.remove('active'));
      if (!wasActive) {
        variantPill.classList.add('active');
        card.setAttribute('data-selected-variant', variantPill.getAttribute('data-variant-label') || '');
        updateCardVariantDisplay(card, variantPill);
      } else {
        card.removeAttribute('data-selected-variant');
        updateCardVariantDisplay(card, null);
      }
    }
  }

  document.addEventListener('click', handleInlineOptionActivation, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('.card-color-dot, .card-variant-pill');
    if (target) {
      handleInlineOptionActivation(e);
    }
  });

  function initializeProductQuickModal() {
    const modal = document.getElementById('productQuickModal');
    if (!modal) return;

    const overlay = document.getElementById('quickModalOverlay');
    const closeBtn = document.getElementById('quickModalClose');
    const imgEl = document.getElementById('quickModalImg');
    const brandEl = document.getElementById('quickModalBrand');
    const titleEl = document.getElementById('quickModalTitle');
    const priceEl = document.getElementById('quickModalPrice');
    const oldPriceEl = document.getElementById('quickModalOldPrice');
    const discountEl = document.getElementById('quickModalDiscount');
    const summaryEl = document.getElementById('quickModalSummary');
    const alertEl = document.getElementById('quickModalAlert');
    const alertTextEl = document.getElementById('quickModalAlertText');

    const colorSection = document.getElementById('quickModalColorSection');
    const colorsGrid = document.getElementById('quickModalColorsGrid');
    const sizeSection = document.getElementById('quickModalSizeSection');
    const sizeLabelEl = document.getElementById('quickModalSizeLabel');
    const sizesGrid = document.getElementById('quickModalSizesGrid');

    const qtyMinus = document.getElementById('quickQtyMinus');
    const qtyPlus = document.getElementById('quickQtyPlus');
    const qtyVal = document.getElementById('quickQtyVal');
    const stockNoticeEl = document.getElementById('quickModalStockNotice');

    const btnAdd = document.getElementById('quickModalBtnAdd');
    const btnBuy = document.getElementById('quickModalBtnBuy');

    let currentProduct = null;
    let currentActionType = 'add_cart';
    let currentExtraContext = {};
    let currentVariants = [];
    let currentColors = [];
    let selectedColor = null;
    let selectedVariant = null;
    let selectedQty = 1;
    let currentMaxStock = 99;
    let variantRequired = false;
    let colorRequired = false;
    let stockWarnTimer = null;

    function updateModalPricingUI() {
      if (!currentProduct) return;
      let priceNum = parseFloat(formatPrice(currentProduct)) || 0;
      let oldNum = currentProduct.oldPrice ? parseFloat(currentProduct.oldPrice) : null;
      let showRangePrefix = false;
      let variantMaxStock = typeof currentProduct.stock === 'number' ? currentProduct.stock : 99;
      let colorMaxStock = typeof currentProduct.stock === 'number' ? currentProduct.stock : 99;

      if (selectedVariant) {
        const matched = currentVariants.find(v => v.label === selectedVariant);
        if (matched) {
          priceNum = matched.price;
          oldNum = matched.oldPrice;
          variantMaxStock = Math.max(0, typeof matched.stock === 'number' ? matched.stock : 99);
        }
      } else if (currentVariants.length > 0) {
        const inStockVars = currentVariants.filter(v => v.stock > 0);
        const pool = inStockVars.length ? inStockVars : currentVariants;
        const prices = pool.map(v => v.price).filter(n => !isNaN(n) && n > 0);
        const minP = prices.length ? Math.min(...prices) : priceNum;
        const maxP = prices.length ? Math.max(...prices) : minP;
        priceNum = minP;
        showRangePrefix = maxP > minP;
        if (!showRangePrefix && pool.length === 1) {
          oldNum = pool[0].oldPrice;
        } else if (showRangePrefix) {
          oldNum = null;
        }
        variantMaxStock = Math.max(...pool.map(v => typeof v.stock === 'number' ? v.stock : 99));
      }

      if (selectedColor) {
        const matchedColor = currentColors.find(c => c.name === selectedColor);
        if (matchedColor) {
          colorMaxStock = Math.max(0, typeof matchedColor.stock === 'number' ? matchedColor.stock : 99);
        }
      } else if (currentColors.length > 0) {
        const inStockCols = currentColors.filter(c => c.stock > 0);
        const cPool = inStockCols.length ? inStockCols : currentColors;
        colorMaxStock = Math.max(...cPool.map(c => typeof c.stock === 'number' ? c.stock : 99));
      }

      currentMaxStock = Math.min(variantMaxStock, colorMaxStock);

      if (selectedQty > currentMaxStock && currentMaxStock > 0) {
        selectedQty = currentMaxStock;
        qtyVal.value = selectedQty;
      }

      priceEl.textContent = `${showRangePrefix ? 'od ' : ''}${formatPriceString(priceNum)} RSD`;

      if (oldNum && !isNaN(oldNum) && oldNum > priceNum && priceNum > 0) {
        const pct = Math.round(((oldNum - priceNum) / oldNum) * 100);
        oldPriceEl.textContent = `${formatPriceString(oldNum)} RSD`;
        oldPriceEl.style.display = 'inline-block';
        discountEl.textContent = `-${pct}%`;
        discountEl.style.display = 'inline-block';
      } else {
        oldPriceEl.style.display = 'none';
        discountEl.style.display = 'none';
      }

      // Summary line of chosen options
      const chosenParts = [];
      if (selectedVariant) chosenParts.push(selectedVariant);
      if (selectedColor) chosenParts.push(selectedColor);
      if (chosenParts.length > 0) {
        summaryEl.textContent = `Izabrano: ${chosenParts.join(' • ')}`;
        summaryEl.style.display = 'block';
      } else {
        summaryEl.style.display = 'none';
      }

      // Out of stock guard when selected or entire product unavailable
      const noVariantAvail = currentVariants.length > 0 && (selectedVariant ? variantMaxStock <= 0 : currentVariants.every(v => v.stock <= 0));
      const noColorAvail = currentColors.length > 0 && (selectedColor ? colorMaxStock <= 0 : currentColors.every(c => c.stock <= 0));
      const isOutOfStock = noVariantAvail || noColorAvail || currentMaxStock <= 0;

      if (isOutOfStock) {
        btnAdd.disabled = true;
        btnBuy.disabled = true;
        stockNoticeEl.textContent = 'Trenutno nema na stanju.';
        stockNoticeEl.style.display = 'block';
      } else {
        btnAdd.disabled = false;
        btnBuy.disabled = false;
        if (currentMaxStock > 0 && currentMaxStock <= 5 && (selectedVariant || selectedColor)) {
          stockNoticeEl.textContent = `Preostalo još samo ${currentMaxStock} kom.`;
          stockNoticeEl.style.display = 'block';
        } else {
          stockNoticeEl.style.display = 'none';
        }
      }
    }

    function showStockLimitWarning() {
      stockNoticeEl.textContent = `Maksimalna dostupna količina za ovu opciju je ${currentMaxStock}.`;
      stockNoticeEl.style.display = 'block';
      const ctrl = qtyPlus?.closest('.quick-qty-control');
      if (ctrl) {
        ctrl.classList.remove('input-shake');
        void ctrl.offsetWidth;
        ctrl.classList.add('input-shake');
      }
      clearTimeout(stockWarnTimer);
      stockWarnTimer = setTimeout(() => {
        if (!(currentMaxStock > 0 && currentMaxStock <= 5 && selectedVariant)) {
          stockNoticeEl.style.display = 'none';
        }
      }, 2800);
    }

    function hideAlert() {
      alertEl.style.display = 'none';
    }

    function showAlert(msg) {
      alertTextEl.textContent = msg;
      alertEl.style.display = 'flex';
      alertEl.classList.remove('shake');
      void alertEl.offsetWidth;
      alertEl.classList.add('shake');
    }

    function closeQuickModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeQuickModal);
    if (overlay) overlay.addEventListener('click', closeQuickModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeQuickModal();
      }
    });

    if (qtyMinus) {
      qtyMinus.addEventListener('click', () => {
        if (selectedQty > 1) {
          selectedQty--;
          qtyVal.value = selectedQty;
          if (!(currentMaxStock > 0 && currentMaxStock <= 5 && selectedVariant)) {
            stockNoticeEl.style.display = 'none';
          }
        }
      });
    }

    if (qtyPlus) {
      qtyPlus.addEventListener('click', () => {
        const effectiveMax = currentMaxStock > 0 ? currentMaxStock : 1;
        if (selectedQty < effectiveMax) {
          selectedQty++;
          qtyVal.value = selectedQty;
        } else {
          showStockLimitWarning();
        }
      });
    }

    function handleModalConfirm(targetAction) {
      if (!currentProduct) return;
      hideAlert();

      const missingVariant = variantRequired && !selectedVariant;
      const missingColor = colorRequired && !selectedColor;

      if (missingVariant && missingColor) {
        showAlert('Molimo izaberite pakovanje / veličinu i boju pre nastavka.');
        return;
      }
      if (missingVariant) {
        showAlert('Molimo izaberite pakovanje / veličinu pre nastavka.');
        return;
      }
      if (missingColor) {
        showAlert('Molimo izaberite boju pre nastavka.');
        return;
      }

      if (currentMaxStock <= 0) {
        showAlert('Izabrana opcija je trenutno rasprodata.');
        return;
      }

      const finalQty = Math.max(1, Math.min(selectedQty, currentMaxStock || 99));
      addToCart(currentProduct.id, finalQty, selectedVariant || '', selectedColor || '');
      if (typeof renderCartDrawer === 'function') renderCartDrawer();

      if (currentExtraContext.fromSavedDrawer && currentExtraContext.savedProductId) {
        removeFromSavedItems(currentExtraContext.savedProductId);
        updateHeartIconsForProduct(currentExtraContext.savedProductId);
        if (typeof renderSavedDrawer === 'function') renderSavedDrawer();
      }

      closeQuickModal();

      if (targetAction === 'buy_now') {
        window.location.href = '/shopping-cart';
        return;
      }

      const sourceBtn = currentProduct.cardElement?.querySelector('.add-to-cart, .cart-icon-btn, .recommended-add-to-cart');
      flyToCartAnimation(sourceBtn);
      showQuickToast(`${currentProduct.title || 'Proizvod'} je dodat u korpu!`);
    }

    if (btnAdd) {
      btnAdd.addEventListener('click', () => handleModalConfirm(currentActionType === 'buy_now' ? 'buy_now' : 'add_cart'));
    }
    if (btnBuy) {
      btnBuy.addEventListener('click', () => handleModalConfirm('buy_now'));
    }

    window.openProductOptionsModal = function (product, actionType = 'add_cart', extraContext = {}) {
      if (!product) return;
      if (product.id) window.__productsRegistry[String(product.id)] = product;

      currentProduct = product;
      currentActionType = actionType;
      currentExtraContext = extraContext || {};
      selectedQty = 1;
      qtyVal.value = 1;
      hideAlert();
      stockNoticeEl.style.display = 'none';

      // Image thumbnail (use already-loaded card image first, else product array, else fallback)
      const fallbackImg = (typeof pickImage === 'function') ? pickImage(product) : '/img/happy animal.png';
      const initialImg = product.preselectedImage || (Array.isArray(product.images) && product.images[0]) || product.image || fallbackImg;
      imgEl.src = initialImg;
      imgEl.alt = product.title || 'Proizvod';

      if ((!Array.isArray(product.images) || product.images.length === 0) && !product.preselectedImage && product.id && typeof fetchProductImagesBatch === 'function') {
        fetchProductImagesBatch([product.id]).then(results => {
          const imgs = results?.[product.id];
          if (imgs && imgs[0]?.url && currentProduct?.id === product.id) {
            imgEl.src = imgs[0].url;
          }
        }).catch(() => {});
      }

      brandEl.textContent = product.brand || 'Happy Animals';
      titleEl.textContent = product.title || 'Proizvod';

      currentVariants = normalizeProductVariants(product);
      currentColors = normalizeProductColors(product);

      // Determine pre-selected or single-choice defaults
      const inStockVariants = currentVariants.filter(v => v.stock > 0);
      variantRequired = currentVariants.length > 0;
      selectedVariant = null;
      if (product.preselectedVariant) {
        const foundPre = inStockVariants.find(v => v.label.toLowerCase() === String(product.preselectedVariant).trim().toLowerCase());
        if (foundPre) selectedVariant = foundPre.label;
      } else if (currentVariants.length === 1 && inStockVariants.length === 1) {
        selectedVariant = inStockVariants[0].label;
      }

      const inStockColors = currentColors.filter(c => typeof c.stock !== 'number' || c.stock > 0);
      colorRequired = currentColors.length > 0;
      selectedColor = null;
      if (product.preselectedColor) {
        const foundPreC = inStockColors.find(c => c.name.toLowerCase() === String(product.preselectedColor).trim().toLowerCase());
        if (foundPreC) selectedColor = foundPreC.name;
      } else if (currentColors.length === 1 && inStockColors.length === 1) {
        selectedColor = inStockColors[0].name;
      }

      // Render Colors Grid
      colorsGrid.innerHTML = '';
      if (currentColors.length > 0) {
        colorSection.style.display = 'block';
        currentColors.forEach(colorObj => {
          const isColorOos = typeof colorObj.stock === 'number' && colorObj.stock <= 0;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quick-color-option' + (selectedColor === colorObj.name ? ' active' : '') + (isColorOos ? ' is-out-of-stock' : '');
          btn.dataset.color = colorObj.name;
          btn.dataset.colorStock = String(typeof colorObj.stock === 'number' ? colorObj.stock : 99);
          btn.disabled = isColorOos;

          const circle = document.createElement('span');
          circle.className = 'quick-color-circle';
          circle.style.background = colorObj.hex;

          const textSpan = document.createElement('span');
          textSpan.textContent = isColorOos ? `${colorObj.name} (Rasprodato)` : colorObj.name;

          btn.appendChild(circle);
          btn.appendChild(textSpan);

          btn.addEventListener('click', () => {
            if (isColorOos) return;
            colorsGrid.querySelectorAll('.quick-color-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = colorObj.name;
            hideAlert();
            updateModalPricingUI();
          });

          colorsGrid.appendChild(btn);
        });
      } else {
        colorSection.style.display = 'none';
      }

      // Render Variants (Weights / Sizes) Grid
      sizesGrid.innerHTML = '';
      if (currentVariants.length > 0) {
        sizeSection.style.display = 'block';
        const looksLikeWeight = currentVariants.some(v => /\b\d+(?:[.,]\d+)?\s*(kg|g|gr|l|ml)\b/i.test(v.label) || /\d+(?:[.,]\d+)?(kg|g|gr|l|ml)\b/i.test(v.label));
        sizeLabelEl.textContent = looksLikeWeight
          ? 'Izaberite pakovanje / težinu:'
          : 'Izaberite veličinu / opciju:';

        currentVariants.forEach(variant => {
          const isOos = variant.stock <= 0;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quick-size-option' + (selectedVariant === variant.label ? ' active' : '') + (isOos ? ' is-out-of-stock' : '');
          btn.dataset.variantLabel = variant.label;
          btn.disabled = isOos;

          const lblSpan = document.createElement('span');
          lblSpan.className = 'quick-size-label';
          lblSpan.textContent = variant.label;
          btn.appendChild(lblSpan);

          const priceSub = document.createElement('span');
          priceSub.className = 'quick-size-subprice';
          priceSub.textContent = isOos ? 'Rasprodato' : `${formatPriceString(variant.price)} RSD`;
          btn.appendChild(priceSub);

          btn.addEventListener('click', () => {
            if (isOos) return;
            sizesGrid.querySelectorAll('.quick-size-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedVariant = variant.label;
            hideAlert();
            updateModalPricingUI();
          });

          sizesGrid.appendChild(btn);
        });
      } else {
        sizeSection.style.display = 'none';
      }

      // Button label / secondary action visibility
      if (actionType === 'buy_now') {
        btnAdd.innerHTML = '<span class="material-symbols-outlined">shopping_bag</span> Kupi odmah';
        btnBuy.style.display = 'none';
      } else {
        btnAdd.innerHTML = '<span class="material-symbols-outlined">add_shopping_cart</span> Dodaj u korpu';
        btnBuy.style.display = 'inline-flex';
      }

      updateModalPricingUI();
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };

    window.openProductModalFromCard = async function (cardElement, actionType = 'add_cart') {
      if (!cardElement) return;
      const productId = cardElement.getAttribute('data-product-id') || cardElement.getAttribute('data-id');
      if (!productId) return;

      let product = window.__productsRegistry?.[String(productId)];
      if (!product) {
        const allProducts = await loadProductsData();
        product = allProducts.find(p => String(p.id) === String(productId));
        if (product) window.__productsRegistry[String(productId)] = product;
      }
      if (!product) return;

      const activeColorDot = cardElement.querySelector('.card-color-dot.active');
      const activeVariantPill = cardElement.querySelector('.card-variant-pill.active');
      const cardImg = cardElement.querySelector('img[data-product-id], .image-c img, .product-image img, .recommended-image-c img');
      const loadedSrc = (cardImg && cardImg.src && !cardImg.src.startsWith('data:image/gif') && cardImg.style.display !== 'none')
        ? cardImg.src
        : '';

      window.openProductOptionsModal({
        ...product,
        preselectedColor: activeColorDot ? (activeColorDot.getAttribute('data-color') || '') : '',
        preselectedVariant: activeVariantPill ? (activeVariantPill.getAttribute('data-variant-label') || '') : '',
        preselectedImage: loadedSrc,
        cardElement
      }, actionType);
    };
  }

  initializeProductQuickModal();

  // Scroll effect za header
  const header = document.querySelector("header");
  window.addEventListener("scroll", function () {
    if (window.scrollY > 50) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  });

  // Set active nav link based on current path
  function setActiveNav() {
    let path = window.location.pathname || '/';
    // Normalize paths by removing .html
    const normalize = (p) => {
      if (!p) return '/';
      if (p.endsWith('/index.html')) return '/';
      return p.replace(/\.html$/, '');
    };
    path = normalize(path);
    const anchors = document.querySelectorAll('header nav .mid ul a');
    anchors.forEach((a) => {
      a.classList.remove('active');
      try {
        const hrefPath = normalize(new URL(a.href, window.location.origin).pathname);
        if (hrefPath === path) {
          a.classList.add('active');
        }
      } catch (e) {
        // ignore invalid URLs
      }
    });
  }

  setActiveNav();
  window.addEventListener('popstate', setActiveNav);

  // Mobile menu toggle
  const hamburger = document.querySelector(".hamburger");
  const navMenu = document.querySelector(".mid");
  const overlay = document.querySelector(".mobile-menu-overlay");
  const body = document.body;

  if (hamburger) {
    hamburger.addEventListener("click", () => {
      const isMenuOpen = navMenu.classList.contains("active");
      
      hamburger.classList.toggle("active");
      navMenu.classList.toggle("active");
      overlay.classList.toggle("active");
      body.classList.toggle("no-scroll");
      
      // Reset to main menu after menu is closed (wait for transition)
      if (isMenuOpen) {
        // Menu is being closed - wait for transition to complete then reset
        setTimeout(() => {
          if (!navMenu.classList.contains("active")) {
            resetMobileMenuToMain();
          }
        }, 400); // Wait for CSS transition (0.4s)
      }
    });
  }
  
  if (overlay) {
      overlay.addEventListener("click", () => {
          hamburger.classList.remove("active");
          navMenu.classList.remove("active");
          overlay.classList.remove("active");
          body.classList.remove("no-scroll");
          
          // Reset to main menu after menu is closed (wait for transition)
          setTimeout(() => {
            resetMobileMenuToMain();
          }, 400); // Wait for CSS transition (0.4s)
      });
  }

  // Mobile menu close button
  const mobileMenuClose = document.querySelector(".mobile-menu-close");
  if (mobileMenuClose && hamburger && navMenu && overlay) {
    mobileMenuClose.addEventListener("click", (e) => {
      // Close menu first
      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
      overlay.classList.remove("active");
      body.classList.remove("no-scroll");
      
      // Reset to main menu after menu is closed (wait for transition)
      setTimeout(() => {
        resetMobileMenuToMain();
      }, 400); // Wait for CSS transition (0.4s)
    });
  }

  // Products Modal - Open/Close functionality
  const productsModal = document.getElementById("products-modal");
  const productsModalOverlay = document.querySelector(".products-modal-overlay");
  const productsModalClose = document.querySelector(".products-modal-close");
  const productsDropdown = document.querySelector("header ul li.dropdown");
  const productsLink = productsDropdown?.querySelector("a");
  
  function openProductsModal() {
    if (productsModal) {
      productsModal.classList.add("active");
      if (productsModalOverlay) {
        productsModalOverlay.classList.add("active");
      }
      document.body.classList.add("no-scroll");
    }
  }
  
  function closeProductsModal() {
    if (productsModal) {
      productsModal.classList.remove("active");
      if (productsModalOverlay) {
        productsModalOverlay.classList.remove("active");
      }
      document.body.classList.remove("no-scroll");
    }
  }
  
  // Show categories view in hamburger menu when products link is clicked
  // Check if hamburger menu is active (mobile menu is open)
  function handleProductsClick(e) {
    // Only show categories view on mobile/tablet when hamburger menu is active
    const isMobile = window.innerWidth <= 1024;
    const isHamburgerActive = hamburger && hamburger.classList.contains("active");
    const isNavMenuActive = navMenu && navMenu.classList.contains("active");
    
    // Show categories view if we're on mobile and either hamburger or nav menu is active
    if (isMobile && (isHamburgerActive || isNavMenuActive)) {
      e.preventDefault();
      e.stopImmediatePropagation(); // Stop all other event handlers
      
      // Show products categories view in hamburger menu with animation
      const mobileMenuNav = document.querySelector('.mobile-menu-nav');
      const mobileMenuProductsView = document.querySelector('.mobile-menu-products-view');
      const categoriesView = document.querySelector('.mobile-menu-products-view-categories');
      
      if (mobileMenuNav && mobileMenuProductsView && categoriesView) {
        // Reset products view position
        mobileMenuProductsView.style.display = 'flex';
        mobileMenuProductsView.style.opacity = '0';
        mobileMenuProductsView.style.transform = 'translateX(100%)';
        
        // Reset categories view
        const subcategoriesView = document.querySelector('.mobile-menu-products-view-subcategories');
        if (subcategoriesView) {
          subcategoriesView.classList.remove('active');
        }
        categoriesView.classList.remove('active');
        categoriesView.style.transform = 'translateX(100%)';
        categoriesView.style.opacity = '0';
        
        // Animate: main menu slides left and disappears, categories view slides in from right
        mobileMenuNav.classList.add('slide-out-left');
        
        setTimeout(() => {
          // Hide main navigation menu after animation
          mobileMenuNav.style.display = 'none';
          mobileMenuNav.classList.remove('slide-out-left');
          
          // Show categories view and animate in
          categoriesView.classList.add('active');
          mobileMenuProductsView.classList.add('slide-in-right');
          
          setTimeout(() => {
            mobileMenuProductsView.style.opacity = '1';
            mobileMenuProductsView.style.transform = 'translateX(0)';
            categoriesView.style.transform = 'translateX(0)';
            categoriesView.style.opacity = '1';
            setTimeout(() => {
              mobileMenuProductsView.classList.remove('slide-in-right');
            }, 400);
          }, 50);
        }, 300);
      }
      return true;
    }
    return false;
  }
  
  // Reset hamburger menu to main menu (used when closing menu)
  function resetMobileMenuToMain() {
    const mobileMenuNav = document.querySelector('.mobile-menu-nav');
    const mobileMenuProductsView = document.querySelector('.mobile-menu-products-view');
    const categoriesView = document.querySelector('.mobile-menu-products-view-categories');
    const subcategoriesView = document.querySelector('.mobile-menu-products-view-subcategories');
    
    if (mobileMenuNav && mobileMenuProductsView) {
      // Reset all views to initial state
      if (subcategoriesView) {
        subcategoriesView.classList.remove('active');
      }
      if (categoriesView) {
        categoriesView.classList.remove('active');
        categoriesView.style.transform = '';
        categoriesView.style.opacity = '';
      }
      
      // Reset products view
      mobileMenuProductsView.style.display = 'none';
      mobileMenuProductsView.style.opacity = '';
      mobileMenuProductsView.style.transform = '';
      mobileMenuProductsView.classList.remove('slide-in-right');
      
      // Show main menu
      mobileMenuNav.style.display = 'block';
      mobileMenuNav.style.opacity = '';
      mobileMenuNav.style.transform = '';
      mobileMenuNav.classList.remove('slide-out-left');
    }
  }

  // Go back from products view to main menu with animation
  function goBackToMainMenu() {
    const mobileMenuNav = document.querySelector('.mobile-menu-nav');
    const mobileMenuProductsView = document.querySelector('.mobile-menu-products-view');
    const categoriesView = document.querySelector('.mobile-menu-products-view-categories');
    
    if (mobileMenuNav && mobileMenuProductsView && categoriesView) {
      // Reset to categories view first
      const subcategoriesView = document.querySelector('.mobile-menu-products-view-subcategories');
      if (subcategoriesView) {
        subcategoriesView.classList.remove('active');
      }
      categoriesView.classList.add('active');
      
      // Animate: products view slides right and disappears, main menu slides in from left
      mobileMenuProductsView.style.opacity = '0';
      mobileMenuProductsView.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        // Hide products view after animation
        mobileMenuProductsView.style.display = 'none';
        mobileMenuProductsView.classList.remove('slide-in-right');
        
        // Show main menu and animate in from left
        mobileMenuNav.style.display = 'block';
        mobileMenuNav.style.opacity = '0';
        mobileMenuNav.style.transform = 'translateX(-100%)';
        
        setTimeout(() => {
          mobileMenuNav.style.opacity = '1';
          mobileMenuNav.style.transform = 'translateX(0)';
        }, 50);
      }, 300);
    }
  }
  
  // Use event delegation on document to catch all clicks (most reliable)
  document.addEventListener("click", (e) => {
    // Check if click is on products dropdown or link
    const clickedDropdown = e.target.closest('li.dropdown');
    const clickedLink = e.target.closest('header ul li.dropdown a');
    const clickedMobileProductsLink = e.target.closest('.mobile-menu-products-link');
    
    if (clickedDropdown === productsDropdown || clickedLink === productsLink || clickedMobileProductsLink) {
      handleProductsClick(e);
    }
  }, true); // Use capture phase to catch event before other handlers
  
  // Also add listener directly to the dropdown and link as backup
  if (productsDropdown) {
    productsDropdown.addEventListener("click", handleProductsClick, true);
  }
  
  if (productsLink) {
    productsLink.addEventListener("click", handleProductsClick, true);
  }
  
  // Add listener for mobile menu products link
  const mobileMenuProductsLink = document.querySelector('.mobile-menu-products-link');
  if (mobileMenuProductsLink) {
    mobileMenuProductsLink.addEventListener("click", handleProductsClick, true);
  }
  
  // Close modal when close button is clicked
  if (productsModalClose) {
    productsModalClose.addEventListener("click", closeProductsModal);
  }
  
  // Close modal when overlay is clicked
  if (productsModalOverlay) {
    productsModalOverlay.addEventListener("click", closeProductsModal);
  }
  
  // Close modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && productsModal && productsModal.classList.contains("active")) {
      closeProductsModal();
    }
  });
  
  // Handle category clicks - show subcategories with animation (Products Modal)
  function showSubcategories(categoryItem) {
    const categoryDataStr = categoryItem.getAttribute('data-category-data');
    if (!categoryDataStr) return;
    
    try {
      const categoryData = JSON.parse(categoryDataStr.replace(/&quot;/g, '"'));
      const categoriesView = document.querySelector('.products-modal-categories-view');
      const subcategoriesView = document.querySelector('.products-modal-subcategories-view');
      const subcategoriesContent = document.querySelector('.products-modal-subcategories-content');
      
      if (!categoriesView || !subcategoriesView || !subcategoriesContent) return;
      
      // Generate subcategories HTML
      let subcategoriesHTML = '<ul class="products-modal-subcategories">';
      
      categoryData.subcategories.forEach(subcat => {
        subcategoriesHTML += `
          <li class="products-modal-subcategory-item">
            <a href="/${categoryData.categorySlug}/${subcat.slug}" class="products-modal-subcategory-link">
              <span class="products-modal-subcategory-text">${subcat.name}</span>
              ${subcat.subcategories2 && subcat.subcategories2.length > 0 ? 
                `<span class="material-symbols-outlined products-modal-arrow">chevron_right</span>` : ''}
            </a>
            ${subcat.subcategories2 && subcat.subcategories2.length > 0 ? `
              <ul class="products-modal-subcategories2">
                ${subcat.subcategories2.map(subcat2 => `
                  <li class="products-modal-subcategory2-item">
                    <a href="/${categoryData.categorySlug}/${subcat.slug}/${subcat2.slug}" class="products-modal-subcategory2-link">
                      ${subcat2.name}
                    </a>
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </li>
        `;
      });
      
      subcategoriesHTML += '</ul>';
      subcategoriesContent.innerHTML = subcategoriesHTML;
      
      // Animate: categories slide left and disappear, subcategories slide in from right
      categoriesView.classList.add('slide-out-left');
      setTimeout(() => {
        categoriesView.classList.remove('active');
        categoriesView.classList.remove('slide-out-left');
        subcategoriesView.classList.add('active');
        subcategoriesView.classList.add('slide-in-right');
        setTimeout(() => {
          subcategoriesView.classList.remove('slide-in-right');
        }, 400);
      }, 300);
    } catch (e) {
      console.error('Error parsing category data:', e);
    }
  }
  
  // Handle back button click (Products Modal)
  function goBackToCategories() {
    const categoriesView = document.querySelector('.products-modal-categories-view');
    const subcategoriesView = document.querySelector('.products-modal-subcategories-view');
    
    if (!categoriesView || !subcategoriesView) return;
    
    // Animate: subcategories slide right and disappear, categories slide in from left
    subcategoriesView.classList.add('slide-out-right');
    setTimeout(() => {
      subcategoriesView.classList.remove('active');
      subcategoriesView.classList.remove('slide-out-right');
      categoriesView.classList.add('active');
      categoriesView.classList.add('slide-in-left');
      setTimeout(() => {
        categoriesView.classList.remove('slide-in-left');
      }, 400);
    }, 300);
  }
  
  // Handle category clicks in hamburger menu - show subcategories with animation
  function showMobileMenuSubcategories(categoryItem) {
    const categoryDataStr = categoryItem.getAttribute('data-category-data');
    if (!categoryDataStr) return;
    
    try {
      const categoryData = JSON.parse(categoryDataStr.replace(/&quot;/g, '"'));
      const categoriesView = document.querySelector('.mobile-menu-products-view-categories');
      const subcategoriesView = document.querySelector('.mobile-menu-products-view-subcategories');
      const subcategoriesContent = document.querySelector('.mobile-menu-products-subcategories-content');
      const currentCategoryTitle = document.querySelector('.mobile-menu-products-current-category-title');
      
      if (!categoriesView || !subcategoriesView || !subcategoriesContent) return;
      
      // Set category title
      if (currentCategoryTitle) {
        currentCategoryTitle.textContent = categoryData.categoryName;
      }
      
      // Set View All link
      const viewAllLink = document.querySelector('.mobile-menu-products-view-all-link');
      if (viewAllLink) {
        viewAllLink.href = `/${categoryData.categorySlug}`;
      }
      
      // Generate subcategories HTML
      let subcategoriesHTML = '<ul class="mobile-menu-products-subcategories">';
      
      categoryData.subcategories.forEach(subcat => {
        subcategoriesHTML += `
          <li class="mobile-menu-products-subcategory-item">
            <a href="/${categoryData.categorySlug}/${subcat.slug}" class="mobile-menu-products-subcategory-link">
              <span class="mobile-menu-products-subcategory-text">${subcat.name}</span>
            </a>
            ${subcat.subcategories2 && subcat.subcategories2.length > 0 ? `
              <ul class="mobile-menu-products-subcategories2">
                ${subcat.subcategories2.map(subcat2 => `
                  <li class="mobile-menu-products-subcategory2-item">
                    <a href="/${categoryData.categorySlug}/${subcat.slug}/${subcat2.slug}" class="mobile-menu-products-subcategory2-link">
                      ${subcat2.name}
                    </a>
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </li>
        `;
      });
      
      subcategoriesHTML += '</ul>';
      subcategoriesContent.innerHTML = subcategoriesHTML;
      
      // Animate: categories slide left and disappear, subcategories slide in from right
      categoriesView.classList.add('slide-out-left');
      
      // Prepare subcategories view for animation (start off-screen)
      subcategoriesView.style.display = 'block';
      subcategoriesView.style.position = 'absolute';
      subcategoriesView.style.opacity = '0';
      subcategoriesView.style.transform = 'translateX(100%)';
      subcategoriesView.classList.remove('active');
      
      setTimeout(() => {
        categoriesView.classList.remove('active');
        categoriesView.classList.remove('slide-out-left');
        
        // Animate subcategories in from right
        setTimeout(() => {
          subcategoriesView.classList.add('slide-in-right');
          subcategoriesView.style.opacity = '1';
          subcategoriesView.style.transform = 'translateX(0)';
          
          setTimeout(() => {
            subcategoriesView.classList.remove('slide-in-right');
            subcategoriesView.classList.add('active');
            subcategoriesView.style.position = '';
            subcategoriesView.style.opacity = '';
            subcategoriesView.style.transform = '';
          }, 400);
        }, 50);
      }, 300);
    } catch (e) {
      console.error('Error parsing category data:', e);
    }
  }
  
  // Handle back button click in hamburger menu
  function goBackToMobileMenuCategories() {
    const categoriesView = document.querySelector('.mobile-menu-products-view-categories');
    const subcategoriesView = document.querySelector('.mobile-menu-products-view-subcategories');
    
    if (!categoriesView || !subcategoriesView) return;
    
    // Animate: subcategories slide right and disappear, categories slide in from left
    subcategoriesView.classList.add('slide-out-right');
    
    // Prepare categories view for animation (start off-screen left)
    categoriesView.style.display = 'block';
    categoriesView.style.position = 'absolute';
    categoriesView.style.opacity = '0';
    categoriesView.style.transform = 'translateX(-100%)';
    categoriesView.classList.remove('active');
    
    setTimeout(() => {
      subcategoriesView.classList.remove('active');
      subcategoriesView.classList.remove('slide-out-right');
      
      // Animate categories in from left
      setTimeout(() => {
        categoriesView.classList.add('slide-in-left');
        categoriesView.style.opacity = '1';
        categoriesView.style.transform = 'translateX(0)';
        
        setTimeout(() => {
          categoriesView.classList.remove('slide-in-left');
          categoriesView.classList.add('active');
          categoriesView.style.position = '';
          categoriesView.style.opacity = '';
          categoriesView.style.transform = '';
        }, 400);
      }, 50);
    }, 300);
  }
  
  // Add event listeners for category clicks (using event delegation)
  document.addEventListener('click', (e) => {
    // Products Modal category clicks
    const categoryLink = e.target.closest('.products-modal-category-link');
    if (categoryLink && document.querySelector('.products-modal-categories-view.active')) {
      e.preventDefault();
      const categoryItem = categoryLink.closest('.products-modal-category-item');
      if (categoryItem) {
        showSubcategories(categoryItem);
      }
    }
    
    // Products Modal back button
    const backButton = e.target.closest('.products-modal-back');
    if (backButton) {
      e.preventDefault();
      goBackToCategories();
    }
    
    // Hamburger Menu category clicks
    const mobileCategoryLink = e.target.closest('.mobile-menu-products-category-link');
    if (mobileCategoryLink && document.querySelector('.mobile-menu-products-view-categories.active')) {
      e.preventDefault();
      const categoryItem = mobileCategoryLink.closest('.mobile-menu-products-category-item');
      if (categoryItem) {
        showMobileMenuSubcategories(categoryItem);
      }
    }
    
    // Hamburger Menu back button (from subcategories to categories)
    const mobileBackButton = e.target.closest('.mobile-menu-products-back');
    if (mobileBackButton) {
      e.preventDefault();
      goBackToMobileMenuCategories();
    }
    
    // Hamburger Menu back button (from categories to main navigation) - whole header is clickable
    const categoriesBackButton = e.target.closest('.mobile-menu-categories-header');
    if (categoriesBackButton) {
      e.preventDefault();
      goBackToMainMenu();
    }
    
    // Mobile menu close button - reset to main menu if in products view
    const mobileMenuCloseBtn = e.target.closest('.mobile-menu-close');
    if (mobileMenuCloseBtn) {
      const mobileMenuProductsView = document.querySelector('.mobile-menu-products-view');
      if (mobileMenuProductsView && mobileMenuProductsView.style.display === 'flex') {
        // Reset to main menu before closing
        goBackToMainMenu();
      }
    }
  });

  // Desktop mega dropdown positioning + overflow guard (before hamburger kicks in)
  // productsDropdown is already defined above
  const megaDropdown = productsDropdown?.querySelector(".mega-dropdown");

  function resetMegaDropdownStyles() {
    if (!megaDropdown) return;
    megaDropdown.style.left = "";
    megaDropdown.style.right = "";
    megaDropdown.style.transform = "";
    megaDropdown.style.maxHeight = "";
    megaDropdown.style.overflowY = "";
    megaDropdown.classList.remove("enable-scroll");
    
    // Reset wrapper styles
    const wrapper = megaDropdown.querySelector('.mega-dropdown-wrapper');
    if (wrapper) {
      wrapper.style.height = "";
      wrapper.style.maxHeight = "";
    }
    
    // Reset sidebar styles
    const sidebar = megaDropdown.querySelector('.categories-sidebar');
    if (sidebar) {
      sidebar.style.height = "";
      sidebar.style.maxHeight = "";
      sidebar.style.overflowY = "";
      sidebar.style.overflowX = "";
    }
  }

  function adjustMegaDropdownPosition() {
    if (!megaDropdown || !productsDropdown) return;

    // Do not override mobile layout
    if (window.innerWidth <= 1024) {
      resetMegaDropdownStyles();
      return;
    }

    // Start from the centered default so measurements are correct
    megaDropdown.style.left = "50%";
    megaDropdown.style.transform = "translateX(-50%)";
    megaDropdown.style.right = "";
    megaDropdown.classList.remove("enable-scroll");

    const triggerRect = productsDropdown.getBoundingClientRect();
    const dropdownWidth = megaDropdown.offsetWidth;
    const viewportWidth = window.innerWidth;
    const safePadding = 16;

    const idealLeft = triggerRect.left + triggerRect.width / 2 - dropdownWidth / 2;
    const clampedLeft = Math.max(
      safePadding,
      Math.min(idealLeft, viewportWidth - dropdownWidth - safePadding)
    );
    const relativeLeft = clampedLeft - triggerRect.left;

    megaDropdown.style.left = `${relativeLeft}px`;
    megaDropdown.style.transform = "translateX(0)";

    // Available height based on dropdown trigger position
    const availableHeight = Math.max(
      200,
      window.innerHeight - triggerRect.bottom - safePadding
    );

    // Limit overall dropdown height
    megaDropdown.style.maxHeight = `${availableHeight}px`;

    // Use availableHeight directly for children so they don't exceed viewport
    const usableHeight = availableHeight;

    const needsScroll = megaDropdown.scrollHeight > usableHeight;
    megaDropdown.classList.toggle("enable-scroll", needsScroll);

    // Set height for wrapper and sidebar to enable overflow when needed
    const wrapper = megaDropdown.querySelector('.mega-dropdown-wrapper');
    const sidebar = megaDropdown.querySelector('.categories-sidebar');
    
    if (wrapper) {
      wrapper.style.height = `${usableHeight}px`;
      wrapper.style.maxHeight = `${usableHeight}px`;
    }
    
    if (sidebar) {
      // Match the dropdown height so the scrollbar appears whenever needed
      sidebar.style.height = `${usableHeight}px`;
      sidebar.style.maxHeight = `${usableHeight}px`;
      sidebar.style.overflowY = 'auto';
      sidebar.style.overflowX = 'hidden';
    }
  }

  if (productsDropdown && megaDropdown) {
    // Wrap adjustMegaDropdownPosition to ensure it runs after render
    const adjustMegaDropdownPositionDelayed = () => {
      requestAnimationFrame(() => {
        adjustMegaDropdownPosition();
        // Call again after a short delay to ensure it works after CSS transitions
        setTimeout(() => {
          adjustMegaDropdownPosition();
        }, 50);
      });
    };
    
    productsDropdown.addEventListener("mouseenter", adjustMegaDropdownPositionDelayed);
    productsDropdown.addEventListener("focusin", adjustMegaDropdownPositionDelayed);

    // Prevent default click behavior on products link ONLY on desktop
    // On mobile, the handleProductsClick function will handle it
    // Note: productsLink is already defined above, so we check if it exists and add desktop-only handler
    if (productsLink && window.innerWidth > 1024) {
      // Remove any existing click handlers and add desktop-only one
      const desktopLink = productsDropdown.querySelector('a');
      if (desktopLink) {
        desktopLink.addEventListener('click', function(e) {
          // Only prevent default on desktop when hamburger is not active
          const isHamburgerActive = hamburger && hamburger.classList.contains("active");
          if (!isHamburgerActive) {
            e.preventDefault();
          }
        });
      }
    }
  }

  window.addEventListener("resize", adjustMegaDropdownPosition);

  // ========== CATEGORY SWITCHING LOGIC ==========
  const categoryBtns = document.querySelectorAll('.category-btn');
  const categoryPanels = document.querySelectorAll('.category-panel');

  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.getAttribute('data-category');
      
      // Check if the button is already active
      if (btn.classList.contains('active')) {
        // If already active, navigate to the category page (like "View all →" link)
        const targetPanel = document.querySelector(`.category-panel[data-category="${category}"]`);
        if (targetPanel) {
          const viewAllLink = targetPanel.querySelector('.view-all-link');
          if (viewAllLink && viewAllLink.href) {
            window.location.href = viewAllLink.href;
            return;
          }
        }
      }
      
      // Remove active class from all buttons and panels
      categoryBtns.forEach(b => b.classList.remove('active'));
      categoryPanels.forEach(p => p.classList.remove('active'));
      
      // Add active class to clicked button and corresponding panel
      btn.classList.add('active');
      const targetPanel = document.querySelector(`.category-panel[data-category="${category}"]`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  // ========== SET ACTIVE CATEGORY BASED ON CURRENT URL ==========
  function setActiveCategoryFromURL() {
    const currentPath = window.location.pathname || '/';
    const normalize = (p) => {
      if (!p) return '/';
      if (p.endsWith('/index.html')) return '/';
      return p.replace(/\.html$/, '').replace(/\/$/, '');
    };
    const normalizedPath = normalize(currentPath);
    
    // Find all view-all-links and check if any matches current path
    const viewAllLinks = document.querySelectorAll('.view-all-link');
    let foundMatch = false;
    let matchedCategory = null;
    
    viewAllLinks.forEach(link => {
      try {
        const linkPath = normalize(new URL(link.href, window.location.origin).pathname);
        if (linkPath === normalizedPath) {
          // Found matching category
          foundMatch = true;
          const panel = link.closest('.category-panel');
          if (panel) {
            matchedCategory = panel.getAttribute('data-category');
          }
        }
      } catch (e) {
        // ignore invalid URLs
      }
    });
    
    // Remove active from all categories
    categoryBtns.forEach(b => b.classList.remove('active'));
    categoryPanels.forEach(p => p.classList.remove('active'));
    
    if (foundMatch && matchedCategory) {
      // Activate matching button and panel
      const matchingBtn = document.querySelector(`.category-btn[data-category="${matchedCategory}"]`);
      const matchingPanel = document.querySelector(`.category-panel[data-category="${matchedCategory}"]`);
      if (matchingBtn) {
        matchingBtn.classList.add('active');
      }
      if (matchingPanel) {
        matchingPanel.classList.add('active');
      }
    } else {
      // If no match found, activate first category (default)
      if (categoryBtns.length > 0 && categoryPanels.length > 0) {
        categoryBtns[0].classList.add('active');
        categoryPanels[0].classList.add('active');
      }
    }
  }

  setActiveCategoryFromURL();

  // ========== CART DRAWER LOGIC ==========
  const cartDrawerHTML = `
    <div class="cart-overlay-bg"></div>
    <div class="cart-drawer">
      <div class="cart-header">
        <h3>Vaša Korpa <span class="cart-count">(0)</span></h3>
        <button class="close-cart">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      
      <div class="cart-items">
        <!-- Cart items will be dynamically rendered here -->
      </div>

      <div class="cart-footer">
        <div class="subtotal-row">
          <span>Ukupno</span>
          <span class="total-price">0.00 RSD</span>
        </div>
        <p class="shipping-note">Dostava i takse se izračunavaju pri plaćanju</p>
        <button class="checkout-btn">Nastavi na plaćanje</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", cartDrawerHTML);

  // ========== SAVED ITEMS DRAWER LOGIC ==========
  const savedDrawerHTML = `
    <div class="saved-drawer">
      <div class="saved-header">
        <h3><span class="material-symbols-outlined">favorite</span> Lista želja <span class="saved-count">0</span></h3>
        <button class="close-saved">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      
      <div class="saved-items-grid">
        <!-- Saved items will be dynamically rendered here -->
      </div>

      <div class="saved-footer">
        <button class="move-all-btn">Premesti sve u korpu</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", savedDrawerHTML);

  // ========== TOAST NOTIFICATION CONTAINER ==========
  // Toast notification disabled - no longer creating the container
  // const toastContainerHTML = `
  //   <div class="toast-container position-fixed" style="top: 20px; right: 20px; z-index: 10000;">
  //     <div id="cartToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true" style="background-color: #000; color: #fff;">
  //       <div class="toast-body" style="background-color: #000; color: #fff;">
  //         <span id="toastMessage">Proizvod je dodat u korpu!</span>
  //       </div>
  //     </div>
  //   </div>
  // `;
  // document.body.insertAdjacentHTML("beforeend", toastContainerHTML);

  const openCartBtn = document.getElementById("openCart");
  const openSavedBtn = document.getElementById("savedProduct");
  
  const cartDrawer = document.querySelector(".cart-drawer");
  const savedDrawer = document.querySelector(".saved-drawer");
  const cartOverlay = document.querySelector(".cart-overlay-bg");
  
  const closeCartBtn = document.querySelector(".close-cart");
  const closeSavedBtn = document.querySelector(".close-saved");

  function closeAllDrawers() {
    cartDrawer.classList.remove("active");
    savedDrawer.classList.remove("active");
    cartOverlay.classList.remove("active");
    document.body.classList.remove("no-scroll");
    document.documentElement.classList.remove("no-scroll");
  }

  function toggleCart() {
    // If saved is open, close it first
    if (savedDrawer.classList.contains("active")) {
        savedDrawer.classList.remove("active");
        cartDrawer.classList.add("active");
        cartOverlay.classList.add("active");
        document.body.classList.add("no-scroll");
        document.documentElement.classList.add("no-scroll");
    } else {
        cartDrawer.classList.toggle("active");
        cartOverlay.classList.toggle("active");
        document.body.classList.toggle("no-scroll");
        document.documentElement.classList.toggle("no-scroll");
    }
    // Render cart when opened
    if (cartDrawer.classList.contains("active")) {
      renderCartDrawer();
    }
  }

  function toggleSaved() {
    // If cart is open, close it first
    if (cartDrawer.classList.contains("active")) {
        cartDrawer.classList.remove("active");
        savedDrawer.classList.add("active");
        cartOverlay.classList.add("active");
        document.body.classList.add("no-scroll");
        document.documentElement.classList.add("no-scroll");
    } else {
        savedDrawer.classList.toggle("active");
        cartOverlay.classList.toggle("active");
        document.body.classList.toggle("no-scroll");
        document.documentElement.classList.toggle("no-scroll");
    }
    // Render saved items when opened
    if (savedDrawer.classList.contains("active")) {
      renderSavedDrawer();
    }
  }

  if (openCartBtn) {
    openCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleCart();
    });
  }

  if (openSavedBtn) {
    openSavedBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSaved();
    });
  }

  if (closeCartBtn) {
    closeCartBtn.addEventListener("click", closeAllDrawers);
  }

  if (closeSavedBtn) {
    closeSavedBtn.addEventListener("click", closeAllDrawers);
  }

  if (cartOverlay) {
    cartOverlay.addEventListener("click", closeAllDrawers);
  }

  // Checkout button - redirect to shopping cart page with payment info
  const checkoutBtn = document.querySelector(".checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function() {
      // Close cart drawer first
      closeAllDrawers();
      // Redirect to shopping cart page
      window.location.href = "/shopping-cart";
    });
  }

  // Quantity logic is now handled in renderCartDrawer() with localStorage integration

  // Move all to cart button
  const moveAllBtn = document.querySelector(".move-all-btn");
  if (moveAllBtn) {
    moveAllBtn.addEventListener("click", function() {
      const savedCards = document.querySelectorAll('.saved-item-card');
      const savedItems = getSavedItems();
      
      if (savedItems.length === 0) return;

      // Disable button during animation
      moveAllBtn.style.pointerEvents = 'none';
      moveAllBtn.style.opacity = '0.7';
      moveAllBtn.textContent = 'Moving...';

      // Staggered animation
      savedCards.forEach((card, index) => {
        setTimeout(() => {
          card.classList.add('bulk-removing');
        }, index * 70); // 70ms delay between each item
      });

      // Calculate total time needed
      // (N-1) * stagger + animation_duration (300ms) + buffer
      const totalAnimationTime = (savedCards.length > 0 ? (savedCards.length - 1) * 70 : 0) + 300;

      setTimeout(async () => {
        // Move items to cart logic with default variant
        const allProducts = await loadProductsData();
        const productById = {};
        allProducts.forEach(p => { productById[p.id] = p; });
        savedItems.forEach(id => {
          const defaultVar = getDefaultVariantLabel(productById[id]);
          addToCart(id, 1, defaultVar);
        });

        // Clear saved items
        localStorage.setItem('savedItems', JSON.stringify([]));
        
        // Update all heart icons
        savedItems.forEach(id => updateHeartIconsForProduct(id));

        // Close Saved Drawer
        if (savedDrawer.classList.contains("active")) {
            savedDrawer.classList.remove("active");
            cartOverlay.classList.remove("active");
            document.body.classList.remove("no-scroll");
            document.documentElement.classList.remove("no-scroll");
        }

        // Wait a brief moment for drawer closing animation, then open cart
        setTimeout(() => {
            // Re-render UI
            renderSavedDrawer();
            renderCartDrawer();
            
            // Open Cart Drawer
            cartDrawer.classList.add("active");
            cartOverlay.classList.add("active");
            document.body.classList.add("no-scroll");
            document.documentElement.classList.add("no-scroll");
            
            // Show notification
            showCartNotification("All saved items");

            // Reset button state
            moveAllBtn.style.pointerEvents = '';
            moveAllBtn.style.opacity = '';
            moveAllBtn.textContent = 'Move All to Cart';
        }, 400); // Wait for saved drawer close animation

      }, totalAnimationTime);
    });
  }

  // Reload button on 404 page (without inline onclick for CSP security)
  const reloadPageBtn = document.getElementById("reloadPageBtn");
  if (reloadPageBtn) {
    reloadPageBtn.addEventListener("click", () => window.location.reload());
  }

  // Delegated navigation for accessible standalone CTA buttons
  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest("button[data-nav-href]");
    if (!navBtn) return;
    const targetUrl = navBtn.getAttribute("data-nav-href");
    if (!targetUrl) return;
    if (targetUrl.startsWith("#")) {
      const targetEl = document.querySelector(targetUrl);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth" });
      } else {
        window.location.hash = targetUrl;
      }
    } else {
      window.location.href = targetUrl;
    }
  });
});
