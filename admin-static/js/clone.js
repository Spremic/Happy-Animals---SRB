/**
 * HAPPY ANIMALS — CLASSIC ADMIN CONTROLLER
 * Pure Vanilla JavaScript (0 Dependencies, No jQuery, No Bootstrap JS)
 * Handles:
 * 1. Instant Auth Verification & Cached Sidebar Navigation
 * 2. Sidebar Desktop Collapse & Mobile Slide-Out Drawer
 * 3. User Topbar Dropdown Menu
 * 4. Lightweight Native Modal Dialogs (open, close, escape key, backdrop)
 * 5. Backwards-compatible $('#modal').modal('show|hide') shim
 */

const navContainer = document.querySelector("#accordionSidebar");
const logoutBTN = document.querySelector("#logoutBTN");

// Ako se nalazi na login stranici, očisti privremeni keš sesije i ne radi nikakav redirect
if (window.location.pathname === "/login") {
  try {
    sessionStorage.removeItem("adminAuthCache");
    sessionStorage.removeItem("adminAuthCacheTs");
  } catch (e) {}
} else {
  // Execute immediately without waiting for window load to eliminate flicker
  checkAuthAndLoadNav();
  setupAdminUIInteractions();
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.adminType === "main") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

async function checkAuthAndLoadNav() {
  if (window.location.pathname === "/login") return;

  // 1. Instantly load navigation from cache if available AND fresh (< 5 min)
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const cachedDataStr = sessionStorage.getItem("adminAuthCache");
  const cachedTimestamp = parseInt(sessionStorage.getItem("adminAuthCacheTs") || "0", 10);
  const cacheIsFresh = cachedDataStr && Date.now() - cachedTimestamp < CACHE_TTL_MS;

  if (cacheIsFresh && navContainer) {
    try {
      const cachedData = JSON.parse(cachedDataStr);
      if (cachedData && cachedData.user) {
        const firstName = (cachedData.user.name || "").split(" ")[0] || "Admin";
        loadNav(firstName, cachedData.user);
        const topbarUser = document.querySelector("#userDropdown .small");
        if (topbarUser) {
          topbarUser.textContent = firstName;
        }
      }
    } catch (e) {
      console.error("Cache parsing error", e);
    }
  }

  // 2. Fetch from backend to verify auth silently
  try {
    const resp = await fetch("/auth/verify", { credentials: "same-origin" });
    if (!resp.ok) {
      sessionStorage.removeItem("adminAuthCache");
      sessionStorage.removeItem("adminAuthCacheTs");
      window.location.href = "/login";
      return;
    }

    const data = await resp.json();
    if (!data.authenticated) {
      sessionStorage.removeItem("adminAuthCache");
      sessionStorage.removeItem("adminAuthCacheTs");
      window.location.href = "/login";
      return;
    }

    // 3. Update cache + timestamp
    sessionStorage.setItem("adminAuthCache", JSON.stringify(data));
    sessionStorage.setItem("adminAuthCacheTs", String(Date.now()));

    // 4. Render if it wasn't cached
    if (!cacheIsFresh && navContainer) {
      const firstName = (data.user.name || "").split(" ")[0] || "Admin";
      loadNav(firstName, data.user);

      const topbarUser = document.querySelector("#userDropdown .small");
      if (topbarUser) {
        topbarUser.textContent = firstName;
      }
    }
  } catch (err) {
    console.error("Auth check failed", err);
    sessionStorage.removeItem("adminAuthCache");
    sessionStorage.removeItem("adminAuthCacheTs");
    window.location.href = "/login";
  }
}

function loadNav(name, user) {
  if (!navContainer) return;
  const hasProizvodi = hasPermission(user, "proizvodi");
  const hasNarudzbine = hasPermission(user, "narudzbine");
  const hasAdmini = hasPermission(user, "admini");

  const showManagementHeading = hasProizvodi || hasNarudzbine;

  navContainer.innerHTML = `
    <a class="sidebar-brand d-flex align-items-center justify-content-center" href="/admin">
      <div class="sidebar-brand-icon">
        <i class="fas fa-paw" style="color: #d76a92;"></i>
      </div>
      <div class="sidebar-brand-text mx-3">Happy Animals</div>
    </a>

    <hr class="sidebar-divider my-0" />

    <li class="nav-item ${window.location.pathname === "/admin" ? "active" : ""}">
      <a class="nav-link" href="/admin">
        <i class="fas fa-fw fa-tachometer-alt"></i>
        <span>Kontrolna tabla</span>
      </a>
    </li>

    <hr class="sidebar-divider" />

    ${showManagementHeading ? '<div class="sidebar-heading">E-Prodavnica</div>' : ""}

    ${
      hasProizvodi
        ? `
    <li class="nav-item ${window.location.pathname.startsWith("/admin/proizvodi") ? "active" : ""}">
      <a class="nav-link" href="/admin/proizvodi">
        <i class="fas fa-boxes"></i>
        <span>Svi proizvodi</span>
      </a>
    </li>
    `
        : ""
    }

    ${
      hasNarudzbine
        ? `
    <li class="nav-item ${window.location.pathname.startsWith("/admin/narudzbe") ? "active" : ""}">
      <a class="nav-link" href="/admin/narudzbe">
        <i class="fas fa-shopping-bag"></i>
        <span>Porudžbine</span>
      </a>
    </li>
    `
        : ""
    }

    ${hasAdmini ? '<hr class="sidebar-divider" />' : ""}
    ${hasAdmini ? '<div class="sidebar-heading">Sistem</div>' : ""}

    ${
      hasAdmini
        ? `
    <li class="nav-item ${window.location.pathname.startsWith("/admin/admini") ? "active" : ""}">
      <a class="nav-link" href="/admin/admini">
        <i class="fas fa-fw fa-user-shield"></i>
        <span>Administratori</span>
      </a>
    </li>
    `
        : ""
    }

    <hr class="sidebar-divider d-none d-md-block" />

    <li class="nav-item">
      <a class="nav-link" href="/" target="_blank">
        <i class="fas fa-external-link-alt"></i>
        <span>Pogledaj sajt</span>
      </a>
    </li>

    <div class="text-center d-none d-md-inline mt-3">
      <button class="rounded-circle border-0" id="sidebarToggle" title="Smanji meni"></button>
    </div>
  `;
}

/* ==========================================================================
   VANILLA UI INTERACTIONS: SIDEBAR, DROPDOWNS, MODALS
   ========================================================================== */
function setupAdminUIInteractions() {
  // Mobile backdrop element
  let mobileBackdrop = document.querySelector(".sidebar-mobile-backdrop");
  if (!mobileBackdrop) {
    mobileBackdrop = document.createElement("div");
    mobileBackdrop.className = "sidebar-mobile-backdrop";
    document.body.appendChild(mobileBackdrop);
  }

  function toggleSidebar() {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      document.body.classList.toggle("sidebar-open");
    } else {
      document.body.classList.toggle("sidebar-toggled");
      document.querySelector("#accordionSidebar")?.classList.toggle("toggled");
    }
  }

  function closeMobileSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  // Global Click Delegator
  document.addEventListener("click", (e) => {
    // 0. Logout klik - instant čišćenje sessionStorage keša
    if (e.target.closest("#logoutBTN") || e.target.closest('a[href="/logout"]') || e.target.closest('a[href*="logout"]')) {
      try {
        sessionStorage.removeItem("adminAuthCache");
        sessionStorage.removeItem("adminAuthCacheTs");
      } catch (_) {}
    }

    // 1. Sidebar togglers
    if (e.target.closest("#sidebarToggle") || e.target.closest("#sidebarToggleTop")) {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // 2. Mobile sidebar backdrop tap
    if (e.target.closest(".sidebar-mobile-backdrop")) {
      closeMobileSidebar();
      return;
    }

    // 3. Dropdowns
    const dropdownToggle = e.target.closest('[data-toggle="dropdown"]');
    if (dropdownToggle) {
      e.preventDefault();
      const parent = dropdownToggle.closest(".dropdown") || dropdownToggle.parentElement;
      const menu = parent ? parent.querySelector(".dropdown-menu") : null;
      if (menu) {
        const isOpen = menu.classList.contains("show");
        document.querySelectorAll(".dropdown-menu.show").forEach((m) => m.classList.remove("show"));
        if (!isOpen) menu.classList.add("show");
      }
      return;
    }

    // Close any open dropdown if clicking outside
    if (!e.target.closest(".dropdown-menu")) {
      document.querySelectorAll(".dropdown-menu.show").forEach((m) => m.classList.remove("show"));
    }

    // 4. Modal Triggers
    const modalTrigger = e.target.closest('[data-toggle="modal"]');
    if (modalTrigger) {
      e.preventDefault();
      const targetSelector = modalTrigger.getAttribute("data-target") || modalTrigger.getAttribute("href");
      if (targetSelector) {
        window.openModal(targetSelector);
      }
      return;
    }

    // 5. Modal Dismiss
    const dismissBtn = e.target.closest('[data-dismiss="modal"]');
    if (dismissBtn) {
      e.preventDefault();
      const modal = dismissBtn.closest(".modal");
      if (modal) window.closeModal(modal);
      return;
    }

    // 6. Modal Backdrop click
    if (e.target.classList.contains("modal")) {
      window.closeModal(e.target);
    }
  });

  // Keyboard accessibility: ESC key closes open modals and dropdowns
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".dropdown-menu.show").forEach((m) => m.classList.remove("show"));
      const openModal = document.querySelector(".modal.show");
      if (openModal) window.closeModal(openModal);
      closeMobileSidebar();
    }
  });
}

/* ==========================================================================
   PURE VANILLA MODAL CONTROLLER & COMPATIBILITY SHIM
   ========================================================================== */
window.openModal = function (modalOrId) {
  const el = typeof modalOrId === "string" ? document.querySelector(modalOrId.startsWith("#") ? modalOrId : "#" + modalOrId) : modalOrId;
  if (!el) return;

  el.style.display = "block";
  // Force browser reflow for smooth animation
  void el.offsetWidth;
  el.classList.add("show");
  document.body.classList.add("modal-open");

  let backdrop = document.querySelector(".modal-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop fade show";
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", () => window.closeModal(el));
  }
};

window.closeModal = function (modalOrId) {
  const el = modalOrId ? (typeof modalOrId === "string" ? document.querySelector(modalOrId.startsWith("#") ? modalOrId : "#" + modalOrId) : modalOrId) : null;

  if (el) {
    el.classList.remove("show");
    setTimeout(() => {
      el.style.display = "none";
    }, 150);
  } else {
    document.querySelectorAll(".modal.show").forEach((m) => {
      m.classList.remove("show");
      setTimeout(() => {
        m.style.display = "none";
      }, 150);
    });
  }

  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop) {
    backdrop.classList.remove("show");
    setTimeout(() => {
      backdrop.remove();
    }, 150);
  }
  document.body.classList.remove("modal-open");
};

// Backwards-compatibility helper so existing code like $("#productModal").modal("show") works 100%
if (!window.$) {
  window.$ = function (selector) {
    const el = document.querySelector(selector);
    return {
      modal: function (action) {
        if (action === "show") {
          window.openModal(el);
        } else if (action === "hide") {
          window.closeModal(el);
        }
      },
    };
  };
}

// ==========================================================================
// UNIVERSAL RESPONSIVE BOOTSTRAP ALERT SYSTEM (ADMIN)
// Zamenjuje običan browser alert sa Bootstrap alert obaveštenjima
// ==========================================================================
function detectBootstrapAlertType(msg) {
  if (!msg) return "info";
  const str = String(msg).toLowerCase();
  if (
    str.includes("grešk") ||
    str.includes("gresk") ||
    str.includes("error") ||
    str.includes("nije") ||
    str.includes("neisprav") ||
    str.includes("zabranj") ||
    str.includes("nemate") ||
    str.includes("istek") ||
    str.includes("odbij") ||
    str.includes("rasprodat") ||
    str.includes("failed")
  ) {
    return "danger";
  }
  if (
    str.includes("obavezn") ||
    str.includes("morate") ||
    str.includes("unesite") ||
    str.includes("pažnj") ||
    str.includes("paznj") ||
    str.includes("upozor") ||
    str.includes("sačekajte") ||
    str.includes("sacekajte") ||
    str.includes("maksimal") ||
    str.includes("prazna") ||
    str.includes("warning")
  ) {
    return "warning";
  }
  if (
    str.includes("uspešn") ||
    str.includes("uspesn") ||
    str.includes("sačuvan") ||
    str.includes("sacuvan") ||
    str.includes("dodat") ||
    str.includes("kreiran") ||
    str.includes("kopiran") ||
    str.includes("ažuriran") ||
    str.includes("azuriran") ||
    str.includes("poslat") ||
    str.includes("success")
  ) {
    return "success";
  }
  return "info";
}

window.showBootstrapAlert = function (message, type = "auto", duration = 4500) {
  if (message === undefined || message === null) return;
  const rawMsg = typeof message === "object" ? message.message || JSON.stringify(message) : String(message);
  if (!rawMsg.trim()) return;

  const resolvedType = !type || type === "auto" ? detectBootstrapAlertType(rawMsg) : type;

  let container = document.getElementById("adminAlertContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "adminAlertContainer";
    container.className = "bootstrap-alert-container";
    document.body.appendChild(container);
  }

  let iconClass = "fas fa-info-circle";
  if (resolvedType === "danger") iconClass = "fas fa-exclamation-circle";
  else if (resolvedType === "success") iconClass = "fas fa-check-circle";
  else if (resolvedType === "warning") iconClass = "fas fa-exclamation-triangle";

  const safeContent = rawMsg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");

  const alertEl = document.createElement("div");
  alertEl.className = `alert alert-${resolvedType} alert-dismissible fade show`;
  alertEl.setAttribute("role", "alert");
  alertEl.innerHTML = `
    <div class="alert-icon-wrap"><i class="${iconClass}"></i></div>
    <div class="alert-message">${safeContent}</div>
    <button type="button" class="alert-close-btn" aria-label="Zatvori">&times;</button>
  `;

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    alertEl.classList.add("fade-out");
    setTimeout(() => {
      if (alertEl.parentElement) alertEl.remove();
    }, 260);
  }

  const closeBtn = alertEl.querySelector(".alert-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    });
  }

  alertEl.addEventListener("click", () => dismiss());

  while (container.children.length >= 4) {
    container.firstElementChild.remove();
  }

  container.appendChild(alertEl);

  if (duration && duration > 0) {
    setTimeout(dismiss, duration);
  }
};

window.showAlert = window.showBootstrapAlert;
window.showToast = window.showBootstrapAlert;

// Globalno presretanje običnog window.alert() tako da NIKADA ne iskače sivi sistemski prozor
window.alert = function (msg) {
  window.showBootstrapAlert(msg);
};
