// shopping-cart.js - Dinamičko učitavanje proizvoda u korpi

// Slugify function (same as in other files)
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

// fallbackImages, pickImage, and formatPrice are defined in clone.js which loads before this file
// We'll use those functions directly

// Store productMap globally for use in event handlers
let productMap = {};

function safeEscHtml(val) {
  if (typeof escapeHtml === "function") return escapeHtml(val);
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render cart items dynamically
async function renderCartItems() {
  // Check if functions are available
  if (typeof getCartItems === 'undefined' || typeof loadProductsData === 'undefined') {
    console.warn('Shopping cart: Waiting for clone.js to load...');
    setTimeout(renderCartItems, 200);
    return;
  }
  
  const cartItems = getCartItems();
  console.log('Cart items from localStorage:', cartItems);
  
  if (!cartItems || cartItems.length === 0) {
    console.log('Cart is empty');
  }
  
  const allProducts = await loadProductsData();
  console.log('Loaded products:', allProducts.length);
  
  if (!allProducts || allProducts.length === 0) {
    console.error('No products loaded from JSON');
    return;
  }
  
  // Create a map for quick product lookup (handle both string and number IDs)
  productMap = {};
  allProducts.forEach(p => {
    // Store with both string and number keys to handle type mismatches
    const id = p.id;
    productMap[id] = p;
    productMap[String(id)] = p;
    productMap[Number(id)] = p;
  });
  
  // Filter cart items to only include products that exist
  const validCartItems = cartItems.filter(item => {
    // Try both string and number ID lookups
    const id = item.id;
    const exists = productMap[id] || productMap[String(id)] || productMap[Number(id)];
    if (!exists) {
      console.warn('Product not found in JSON:', id, 'Type:', typeof id);
      // Log available IDs for debugging
      const availableIds = Object.keys(productMap).slice(0, 5);
      console.log('Sample available product IDs:', availableIds);
    }
    return exists;
  });
  console.log('Valid cart items:', validCartItems.length, 'out of', cartItems.length);
  
  const orderDetails = document.querySelector('.order-details');
  const orderTitle = document.querySelector('.order-title');
  const productCount = document.querySelector('.product-count');
  const orderTotal = document.querySelector('.order-total');
  
  if (!orderDetails) {
    console.warn('Shopping cart: .order-details not found');
    return;
  }
  
  // If cart is empty, show empty state
  if (validCartItems.length === 0) {
    orderDetails.innerHTML = `
      <div class="empty-cart-message" style="text-align: center; padding: 60px 20px; color: #e0e0e0;">
        <span class="material-symbols-outlined" style="font-size: 64px; color: #009900; margin-bottom: 20px; display: block;">shopping_cart</span>
        <h3 style="margin-bottom: 10px;">Vaša korpa je prazna</h3>
        <p style="margin-bottom: 30px; color: #a0a0a0;">Izgleda da još niste dodali ništa u korpu.</p>
        <a href="/all-products" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #009900, #007700); color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">Nastavi kupovinu</a>
      </div>
    `;
    if (productCount) productCount.textContent = '0';
    if (orderTotal) orderTotal.textContent = 'Ukupno: 0.00 RSD';
    return;
  }
  
  // Calculate totals
  let total = 0;
  let totalItems = 0; // Total quantity of all items
  let uniqueProducts = validCartItems.length; // Number of different products
  let html = '';
  
  validCartItems.forEach(cartItem => {
    const product = productMap[cartItem.id];
    if (!product) return;
    
    const quantity = cartItem.quantity || 1;
    const resolvedVar = typeof resolveProductVariant === 'function'
      ? resolveProductVariant(product, cartItem.variant)
      : { label: cartItem.variant || '', price: parseFloat(formatPrice(product)) || 0 };
    const price = parseFloat(resolvedVar.price) || 0;
    const variantLabel = String(cartItem.variant || resolvedVar.label || '').trim();
    const colorLabel = String(cartItem.color || '').trim();
    const escId = safeEscHtml(product.id);
    const escTitle = safeEscHtml(product.title);
    const escBrand = safeEscHtml(product.brand || '');
    const escVar = safeEscHtml(variantLabel);
    const escColor = safeEscHtml(colorLabel);
    const brandVariantText = [
      escBrand,
      escVar ? `<strong>${escVar}</strong>` : '',
      escColor ? `<span>${escColor}</span>` : ''
    ].filter(Boolean).join(' • ');
    const itemTotal = price * quantity;
    total += itemTotal;
    totalItems += quantity;
    const productSlug = slugify(product.title);
    
    html += `
      <div class="order-item" data-product-id="${escId}" data-variant="${escVar}">
        <button class="remove-item" aria-label="Ukloni proizvod" data-product-id="${escId}" data-variant="${escVar}">×</button>
        <div class="item-image">
          <div class="item-image-skeleton"></div>
          <div class="item-image-error" style="display: none;">
            <span class="material-symbols-outlined">image_not_supported</span>
          </div>
          <img src="" alt="${escTitle}" loading="lazy" style="opacity: 0; display: block;">
        </div>
        <div class="item-info">
          <h4 class="item-title">${escTitle}</h4>
          <p class="item-brand">${brandVariantText}</p>
          <div class="item-footer">
            <span class="item-price">${formatPriceNumber(itemTotal)} RSD</span>
            <div class="quantity-controls">
              <button class="quantity-btn minus" aria-label="Smanji količinu" data-product-id="${escId}" data-variant="${escVar}">-</button>
              <span class="quantity" data-product-id="${escId}" data-variant="${escVar}">${quantity}</span>
              <button class="quantity-btn plus" aria-label="Povećaj količinu" data-product-id="${escId}" data-variant="${escVar}">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  orderDetails.innerHTML = html;
  
  const shippingAmount = total >= 3000 || total === 0 ? 0 : 350;
  const grandTotal = Math.max(0, total) + shippingAmount;

  // Update totals - show number of different products, plus server-matching shipping
  if (productCount) productCount.textContent = uniqueProducts;
  if (orderTotal) {
    orderTotal.textContent = `Ukupno: ${formatPriceNumber(grandTotal)} RSD`;
  }
  const shippingInfo = document.getElementById('shippingInfo');
  if (shippingInfo) {
    shippingInfo.textContent = total > 0
      ? `Dostava: ${shippingAmount === 0 ? 'Besplatna (0.00 RSD)' : `${formatPriceNumber(shippingAmount)} RSD`}`
      : '';
  }
  
  // Use local images already present in API product data, fallback to batch only if missing
  if (validCartItems.length > 0) {
    loadShoppingCartImagesFromCloudinary(validCartItems, productMap);
  }
  
  // Attach event handlers
  attachCartEventHandlers();
}

// Attach event handlers for cart items
function attachCartEventHandlers() {
  // Quantity controls
  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const productId = this.getAttribute('data-product-id');
      const variant = this.getAttribute('data-variant') || '';
      const orderItem = this.closest('.order-item');
      const quantitySpan = orderItem?.querySelector('.quantity');
      let quantity = parseInt(quantitySpan?.textContent || '1', 10) || 1;
      
      if (this.classList.contains('plus')) {
        quantity++;
        updateCartQuantity(productId, quantity, variant);
      } else if (this.classList.contains('minus') && quantity > 1) {
        quantity--;
        updateCartQuantity(productId, quantity, variant);
      }
      
      // Re-render to update prices
      renderCartItems();
    });
  });
  
  // Remove item functionality with FLIP animation (same as cart drawer)
  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const productId = this.getAttribute('data-product-id');
      const variant = this.getAttribute('data-variant') || '';
      const orderItem = this.closest('.order-item');
      const orderDetails = document.querySelector('.order-details');
      
      if (!orderItem || !orderDetails) return;
      
      // Add removing class to trigger animation
      orderItem.classList.add('removing');
      
      // Wait for animation to complete before actually removing
      setTimeout(() => {
        // Use performFlipDelete from clone.js if available, otherwise use simple removal
        if (typeof performFlipDelete !== 'undefined') {
          performFlipDelete(
            orderDetails,
            orderItem,
            () => removeFromCart(productId, variant), // Update Data
            () => renderCartItems()                   // Update UI
          );
        } else {
          // Fallback: simple removal and re-render
          removeFromCart(productId, variant);
          renderCartItems();
        }
      }, 300); // Match animation duration
    });
  });
  
  // Make order items clickable to navigate to product page
  document.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('click', function(e) {
      // Don't navigate if clicking on buttons
      if (e.target.closest('.remove-item') || 
          e.target.closest('.quantity-btn') || 
          e.target.closest('.quantity-controls')) {
        return;
      }
      
      const productId = this.getAttribute('data-product-id');
      const product = productMap && productMap[productId];
      if (product && product.title) {
        const productSlug = slugify(product.title);
        window.location.href = `/${productSlug}`;
      }
    });
  });
}

// Initialize on page load
function initializeShoppingCart() {
  // Wait for clone.js to load (which provides getCartItems, updateCartQuantity, removeFromCart, loadProductsData)
  if (typeof getCartItems === 'undefined' || typeof loadProductsData === 'undefined') {
    // Retry after a short delay
    setTimeout(initializeShoppingCart, 100);
    return;
  }
  
  // Make sure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderCartItems);
  } else {
    // DOM already loaded
    renderCartItems();
  }
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

// Load shopping cart images (uses local /uploads WebP URLs directly, falls back to batch API if needed)
async function loadShoppingCartImagesFromCloudinary(cartItems, productMap) {
  const missingIds = cartItems
    .filter(ci => {
      const p = productMap[ci.id];
      return !p || !Array.isArray(p.images) || p.images.length === 0;
    })
    .map(ci => ci.id);
  const imagesData = missingIds.length > 0 ? await fetchProductImagesBatch(missingIds) : {};
  
  const renderedOrderEls = new Set();
  cartItems.forEach(cartItem => {
    const product = productMap[cartItem.id];
    if (!product) return;
    
    const orderItem = Array.from(document.querySelectorAll(`.order-item[data-product-id="${product.id}"]`)).find(el => !renderedOrderEls.has(el));
    if (!orderItem) return;
    renderedOrderEls.add(orderItem);
    
    const imgElement = orderItem.querySelector('.item-image img');
    const skeleton = orderItem.querySelector('.item-image-skeleton');
    const itemImageContainer = orderItem.querySelector('.item-image');
    
    if (!imgElement) return;
    
    const directImgs = Array.isArray(product.images) ? product.images : [];
    const productImages = imagesData[product.id] || [];
    const imageUrls = directImgs.length > 0
      ? directImgs
      : productImages.map(img => img.url);
    
    let itemError = itemImageContainer?.querySelector('.item-image-error');
    
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
        itemError.className = 'item-image-error';
        itemError.innerHTML = `
          <span class="material-symbols-outlined">image_not_supported</span>
        `;
        itemImageContainer.appendChild(itemError);
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
      imgElement.style.transition = 'opacity 0.3s ease';
      
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
        itemError.className = 'item-image-error';
        itemError.innerHTML = `
          <span class="material-symbols-outlined">image_not_supported</span>
        `;
        itemImageContainer.appendChild(itemError);
      }
      itemError.style.display = 'flex';
      imgElement.style.display = 'none';
    };
    imageLoader.src = imageUrls[0];
  });
}

// Initialize checkout form submission via /api/send-order
function setupCheckoutSubmission() {
  const paymentBtns = document.querySelectorAll('.payment-btn');
  if (!paymentBtns.length) return;

  paymentBtns.forEach(btn => {
    btn.addEventListener('click', async function () {
      const form = document.querySelector('.shipping-form');
      if (form && !form.reportValidity()) {
        return;
      }

      const cartItems = typeof getCartItems === 'function' ? getCartItems() : [];
      if (!cartItems.length) {
        alert('Vaša korpa je prazna.');
        return;
      }

      const firstName = (document.getElementById('firstName')?.value || '').trim();
      const lastName = (document.getElementById('lastName')?.value || '').trim();
      const phoneNumber = (document.getElementById('phone')?.value || '').trim();
      const email = (document.getElementById('email')?.value || '').trim();
      const postalCode = (document.getElementById('zipCode')?.value || '').trim();
      const city = (document.getElementById('city')?.value || '').trim();
      const streetName = (document.getElementById('streetAddress')?.value || '').trim();
      const apartment = (document.getElementById('apartment')?.value || '').trim();
      const note = (document.getElementById('notes')?.value || '').trim();
      const selectedPayment = document.querySelector('input[name="payment"]:checked')?.value || 'cod';

      const payloadItems = cartItems.map(ci => {
        const p = productMap[ci.id] || {};
        const resolvedVar = typeof resolveProductVariant === 'function'
          ? resolveProductVariant(p, ci.variant)
          : { label: ci.variant || '' };
        const chosenVariant = String(ci.variant || resolvedVar.label || '').trim();
        return {
          id: ci.id,
          productId: p._id || '',
          code: p.code || ci.id,
          slug: p.slug || '',
          title: p.title || '',
          variant: chosenVariant,
          size: chosenVariant,
          color: String(ci.color || '').trim() || 'Standard',
          quantity: parseInt(ci.quantity, 10) || 1,
          image: (Array.isArray(p.images) && p.images[0]) || p.imageUrl || ''
        };
      });

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Obrada porudžbine...';

      try {
        const res = await fetch('/api/send-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            lastName,
            phoneNumber,
            email,
            streetName,
            apartment,
            city,
            postalCode,
            note,
            paymentMethod: selectedPayment,
            items: payloadItems,
            acceptTerms: true
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          alert(data.message || 'Greška pri slanju porudžbine. Proverite unete podatke.');
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }

        localStorage.setItem('cart', JSON.stringify([]));
        if (typeof updateCartBadge === 'function') updateCartBadge();

        const orderDetails = document.querySelector('.order-details');
        if (orderDetails) {
          const orderNumDisplay = data.orderNumber || data.orderId || '';
          orderDetails.innerHTML = `
            <div class="empty-cart-message" style="text-align: center; padding: 50px 20px; color: #e0e0e0;">
              <span class="material-symbols-outlined" style="font-size: 64px; color: #009900; margin-bottom: 16px; display: block;">check_circle</span>
              <h3 style="margin-bottom: 10px;">Hvala na porudžbini!</h3>
              <p style="margin-bottom: 8px;">Broj porudžbine: <strong>#${orderNumDisplay}</strong></p>
              <p style="margin-bottom: 24px; color: #a0a0a0;">Ukupno za plaćanje: <strong>${formatPriceNumber(data.totalAmount || 0)} RSD</strong>. Potvrda je poslata na vaš email.</p>
              <a href="/all-products" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #009900, #007700); color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">Nastavi kupovinu</a>
            </div>
          `;
        }
        const productCount = document.querySelector('.product-count');
        const orderTotal = document.querySelector('.order-total');
        if (productCount) productCount.textContent = '0';
        if (orderTotal) orderTotal.textContent = 'Ukupno: 0.00 RSD';
        if (form) form.reset();
      } catch (err) {
        console.error('Order submission error:', err);
        alert('Greška u komunikaciji sa serverom. Pokušajte ponovo.');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

// Start initialization
initializeShoppingCart();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCheckoutSubmission);
} else {
  setupCheckoutSubmission();
}

// Also try after window load as fallback
window.addEventListener('load', function() {
  if (typeof getCartItems !== 'undefined' && typeof loadProductsData !== 'undefined') {
    renderCartItems();
  }
});

