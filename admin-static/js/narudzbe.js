let currentOrderPage = 1;
let currentOrderStatus = "";
const ordersMap = new Map();

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  initOrderStatusSlider();
  loadOrders(1);

  let searchTimer;
  const searchInput = document.getElementById("orderSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadOrders(1), 300);
    });
  }
});

function initOrderStatusSlider() {
  const pills = document.querySelectorAll(".order-status-pill");
  const activeBadge = document.getElementById("orderActiveFilterBadge");
  const hiddenSelect = document.getElementById("orderStatusFilter");

  pills.forEach((pill) => {
    pill.addEventListener("click", function () {
      pills.forEach((p) => p.classList.remove("active"));
      this.classList.add("active");

      const statusVal = this.getAttribute("data-status") || "";
      currentOrderStatus = statusVal;

      if (hiddenSelect) {
        hiddenSelect.value = statusVal;
      }

      if (activeBadge) {
        const label = this.querySelector(".pill-label")?.textContent?.trim() || "Sve porudžbine";
        activeBadge.textContent = label;
      }

      loadOrders(1);
    });
  });
}

function renderOrdersSkeleton(count = 8) {
  const tbody = document.getElementById("ordersList");
  if (!tbody) return;
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-text" style="width: 140px; height: 16px;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 110px; height: 15px;"></div></td>
        <td>
          <div class="skeleton skeleton-text" style="width: 80px; height: 14px; margin-bottom: 4px;"></div>
          <div class="skeleton skeleton-text" style="width: 95px; height: 12px;"></div>
        </td>
        <td><div class="skeleton skeleton-text" style="width: 105px; height: 14px;"></div></td>
        <td><div class="skeleton skeleton-badge" style="width: 55px;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 85px; height: 15px;"></div></td>
        <td><div class="skeleton skeleton-badge" style="width: 85px;"></div></td>
        <td style="text-align: center; white-space: nowrap; width: 120px; min-width: 120px;">
          <div class="table-action-btns" style="display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap;">
            <div class="skeleton skeleton-btn" style="flex: 0 0 34px; width: 34px; height: 34px;"></div>
            <div class="skeleton skeleton-btn" style="flex: 0 0 34px; width: 34px; height: 34px;"></div>
          </div>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

async function loadOrders(page = 1) {
  currentOrderPage = page;
  const tbody = document.getElementById("ordersList");
  const searchInput = document.getElementById("orderSearchInput");
  const search = searchInput ? searchInput.value.trim() : "";
  const status = currentOrderStatus;

  renderOrdersSkeleton(8);
  if (!tbody) return;

  try {
    let url = `/api/orders?page=${page}&limit=20`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const orders = data.orders || [];
    const count = data.totalCount || 0;
    const totalPages = data.totalPages || 1;

    // Ažuriranje bedževa na slajderu statusa
    if (data.statusCounts) {
      const sc = data.statusCounts;
      const setCnt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? val : 0;
      };
      setCnt("count-all", sc.all);
      setCnt("count-na_cekanju", sc.na_cekanju);
      setCnt("count-obradjeno", sc.obradjeno);
      setCnt("count-poslato", sc.poslato);
      setCnt("count-isporuceno", sc.isporuceno);
      setCnt("count-otkazano", sc.otkazano);
    }

    const countBadge = document.getElementById("orderTotalCount");
    if (countBadge) {
      countBadge.textContent = `Prikazano: ${count}`;
    }

    ordersMap.clear();

    if (!orders.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="fas fa-shopping-bag fa-3x mb-3 text-gray-300"></i>
            <p>Nema pronađenih porudžbina za izabrani status.</p>
          </td>
        </tr>`;
      renderOrderPagination(1, 1, 0);
      return;
    }

    orders.forEach((o) => ordersMap.set(String(o._id), o));

    tbody.innerHTML = orders
      .map((o) => {
        const orderId = escapeHtml(o._id);
        const orderNum = escapeHtml(o.orderNumber || o._id);
        const fullName = escapeHtml(`${o.firstName || ""} ${o.lastName || ""}`.trim() || "-");
        const city = escapeHtml(o.city || "-");
        const phone = escapeHtml(o.phoneNumber || "-");
        const date = new Date(o.createdAt);
        const dateStr = !isNaN(date)
          ? `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
          : "-";
        const itemsCount = (o.items || []).reduce((acc, it) => acc + (parseInt(it.quantity) || 1), 0);
        const cleanStatus = (o.status || "na_cekanju").trim().toLowerCase().replace(/-/g, "_");
        const statusClass = `badge-status-${escapeHtml(cleanStatus)}`;
        const totalAmountStr = (Number(o.totalAmount) || 0).toLocaleString("sr-RS");

        return `
          <tr>
            <td class="font-weight-bold" style="color: #009900;">${orderNum}</td>
            <td><strong>${fullName}</strong></td>
            <td>${city}<br><small class="text-muted">${phone}</small></td>
            <td><small>${dateStr}</small></td>
            <td><span class="badge badge-light border" style="background: #f8fafc; color: #1e293b; border-color: var(--color-border) !important;">${itemsCount} kom</span></td>
            <td><strong style="color: #1e293b;">${totalAmountStr} RSD</strong></td>
            <td><span class="${statusClass}">${formatStatusName(o.status)}</span></td>
            <td style="text-align: center; white-space: nowrap; width: 120px; min-width: 120px;">
              <div class="table-action-btns" style="display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap;">
                <button class="btn btn-sm btn-outline-primary" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" onclick="viewOrderDetails('${orderId}')" title="Pregledaj detalje">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" onclick="deleteOrder('${orderId}', '${orderNum}')" title="Obriši">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    renderOrderPagination(page, totalPages, count);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${escapeHtml(err.message)}</td></tr>`;
  }
}

function formatStatusName(status) {
  if (!status) return "Na čekanju";
  const clean = String(status).trim().toLowerCase().replace(/-/g, "_");
  const map = {
    na_cekanju: "Na čekanju",
    cekanje: "Na čekanju",
    pending: "Na čekanju",
    aktivne: "Na čekanju",
    obradjeno: "Obrađeno",
    processing: "Obrađeno",
    poslato: "Poslato",
    shipped: "Poslato",
    isporuceno: "Isporučeno",
    delivered: "Isporučeno",
    otkazano: "Otkazano",
    cancelled: "Otkazano",
    canceled: "Otkazano",
  };
  return map[clean] || status || "Na čekanju";
}

function renderOrderPagination(page, totalPages, totalCount) {
  const info = document.getElementById("orderPaginationInfo");
  const controls = document.getElementById("orderPaginationControls");

  info.textContent = `Strana ${page} od ${totalPages} (ukupno ${totalCount})`;

  let html = "";
  if (page > 1) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="loadOrders(${page - 1})">&laquo;</a></li>`;
  } else {
    html += `<li class="page-item disabled"><span class="page-link">&laquo;</span></li>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === page) {
      html += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
    } else if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="loadOrders(${i})">${i}</a></li>`;
    }
  }

  if (page < totalPages) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="loadOrders(${page + 1})">&raquo;</a></li>`;
  } else {
    html += `<li class="page-item disabled"><span class="page-link">&raquo;</span></li>`;
  }

  controls.innerHTML = html;
}

function viewOrderDetails(orderOrId) {
  const o = typeof orderOrId === "string" ? ordersMap.get(orderOrId) : orderOrId;
  if (!o) return;

  const orderNum = escapeHtml(o.orderNumber || o._id);
  document.getElementById("orderDetailsTitle").textContent = `Porudžbina #${orderNum}`;

  const itemsHtml = (o.items || [])
    .map((it) => {
      const title = escapeHtml(it.title || "Artikal");
      const size = escapeHtml(it.variant || it.size || "-");
      const color = escapeHtml(it.color || "-");
      const price = (Number(it.price) || 0).toLocaleString("sr-RS");
      const total = (Number(it.total) || 0).toLocaleString("sr-RS");
      const qty = parseInt(it.quantity) || 1;
      const rawImg = it.image || "";
      const imgSafe = (rawImg.startsWith("/uploads/") || rawImg.startsWith("/img/") || rawImg.startsWith("http://") || rawImg.startsWith("https://"))
        ? escapeHtml(rawImg)
        : "/img/customPageBcg.png";
      const colorMeta = color && color !== "-" && color !== "Standard" ? ` | Boja: <strong>${color}</strong>` : "";

      return `
      <tr>
        <td>
          <img src="${imgSafe}" style="width: 45px; height: 58px; object-fit: cover; border-radius: 6px;" alt="${title}" />
        </td>
        <td>
          <strong>${title}</strong>
          <div class="small text-muted">Opcija / Pakovanje: <strong>${size}</strong>${colorMeta}</div>
        </td>
        <td class="text-center">${qty}</td>
        <td class="text-right">${price} RSD</td>
        <td class="text-right"><strong>${total} RSD</strong></td>
      </tr>
    `;
    })
    .join("");

  const firstName = escapeHtml(o.firstName || "");
  const lastName = escapeHtml(o.lastName || "");
  const phone = escapeHtml(o.phoneNumber || "-");
  const email = escapeHtml(o.email || "-");
  const street = escapeHtml(o.streetName || "");
  const house = escapeHtml(o.houseNumber || "");
  const apt = escapeHtml(o.apartment || "");
  const postal = escapeHtml(o.postalCode || "");
  const city = escapeHtml(o.city || "");
  const note = escapeHtml(o.note || "");
  const addressLine = `${street} ${house}${apt ? ", stan " + apt : ""}`.trim() || "-";
  const paymentMethodText = o.paymentMethod === "pouzecem" ? "Plaćanje pouzećem (gotovinom kuriru)" : escapeHtml(o.paymentMethod || "Pouzećem");
  const totalAmountNum = Number(o.totalAmount) || 0;
  const totalAmountStr = totalAmountNum.toLocaleString("sr-RS");
  const orderId = escapeHtml(o._id);
  const orderDisplayId = escapeHtml(o.orderNumber || o.trackingNumber || o._id.substring(0, 10));

  const createdDate = new Date(o.createdAt);
  const dateFormatted = !isNaN(createdDate)
    ? `${String(createdDate.getDate()).padStart(2, "0")}.${String(createdDate.getMonth() + 1).padStart(2, "0")}.${createdDate.getFullYear()} ${String(createdDate.getHours()).padStart(2, "0")}:${String(createdDate.getMinutes()).padStart(2, "0")}`
    : "-";

  const couponCode = escapeHtml(o.couponCode || "");
  const discountAmount = Number(o.discountAmount || 0);

  const orderIdDisplayEl = document.getElementById("orderIdDisplay");
  if (orderIdDisplayEl) {
    orderIdDisplayEl.textContent = `(#${orderDisplayId})`;
  }

  document.getElementById("orderDetailsBody").innerHTML = `
    <div class="row">
      <!-- 1. Informacije o kupcu -->
      <div class="col-md-6 mb-4">
        <div class="card modal-info-card">
          <div class="card-header">
            <h6><i class="fas fa-user"></i> Informacije o kupcu</h6>
          </div>
          <div class="card-body">
            <div class="mb-2">
              <span class="text-muted small d-block">Ime i prezime:</span>
              <strong class="text-dark font-weight-bold" style="font-size: 1rem;">${firstName} ${lastName}</strong>
            </div>
            <div class="mb-2">
              <span class="text-muted small d-block">Email adresa:</span>
              <span class="text-dark">${email}</span>
            </div>
            <div>
              <span class="text-muted small d-block">Broj telefona:</span>
              <strong class="text-dark"><i class="fas fa-phone-alt fa-xs text-muted mr-1"></i>${phone}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Adresa dostave -->
      <div class="col-md-6 mb-4">
        <div class="card modal-info-card">
          <div class="card-header">
            <h6><i class="fas fa-map-marker-alt"></i> Adresa dostave</h6>
          </div>
          <div class="card-body">
            <div class="mb-2">
              <span class="text-muted small d-block">Ulica i kućni broj:</span>
              <strong class="text-dark">${addressLine}</strong>
            </div>
            <div class="mb-2">
              <span class="text-muted small d-block">Grad i poštanski broj:</span>
              <span class="text-dark font-weight-bold">${postal} ${city}</span>
            </div>
            <div>
              <span class="text-muted small d-block">Država:</span>
              <span class="text-dark">Srbija</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Status i plaćanje -->
      <div class="col-md-6 mb-4">
        <div class="card modal-info-card">
          <div class="card-header">
            <h6><i class="fas fa-tasks"></i> Status i plaćanje</h6>
          </div>
          <div class="card-body">
            <div class="form-group mb-3">
              <label class="font-weight-bold small mb-1" for="modalOrderStatus">Status narudžbine:</label>
              <select id="modalOrderStatus" class="form-control" style="border-radius: 8px;">
                <option value="na_cekanju" ${o.status === "na_cekanju" ? "selected" : ""}>Na čekanju</option>
                <option value="obradjeno" ${o.status === "obradjeno" ? "selected" : ""}>Obrađeno</option>
                <option value="poslato" ${o.status === "poslato" ? "selected" : ""}>Poslato</option>
                <option value="isporuceno" ${o.status === "isporuceno" ? "selected" : ""}>Isporučeno</option>
                <option value="otkazano" ${o.status === "otkazano" ? "selected" : ""}>Otkazano</option>
              </select>
            </div>
            <div class="mb-3">
              <span class="text-muted small d-block">Način plaćanja:</span>
              <span class="font-weight-bold text-dark">${paymentMethodText}</span>
            </div>
            <button class="btn btn-primary btn-block btn-sm" id="modalSaveStatusBtn" onclick="saveModalOrderStatus('${orderId}')" style="border-radius: 6px; padding: 7px;">
              <i class="fas fa-save mr-1"></i> Sačuvaj izmenu statusa
            </button>
          </div>
        </div>
      </div>

      <!-- 4. Dodatne informacije -->
      <div class="col-md-6 mb-4">
        <div class="card modal-info-card">
          <div class="card-header">
            <h6><i class="fas fa-sticky-note"></i> Dodatne informacije</h6>
          </div>
          <div class="card-body">
            <div class="mb-2">
              <span class="text-muted small d-block">Napomena kupca:</span>
              <p class="mb-0 text-dark" style="font-size: 0.9rem;">
                ${note ? `<i class="fas fa-quote-left fa-xs text-muted mr-1"></i>${note}` : '<span class="text-muted font-italic">Nema dodatne napomene</span>'}
              </p>
            </div>
            <div class="mb-2">
              <span class="text-muted small d-block">Kupon kod:</span>
              ${couponCode ? `<span class="badge badge-success font-weight-bold">${couponCode}</span>` : '<span class="text-muted small">Nije unet kupon</span>'}
            </div>
            <div>
              <span class="text-muted small d-block">Datum i vreme kreiranja:</span>
              <span class="text-dark font-weight-bold small">${dateFormatted}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Stavke porudžbine -->
      <div class="col-12 mb-4">
        <div class="card modal-info-card">
          <div class="card-header">
            <h6><i class="fas fa-box-open"></i> Stavke narudžbine</h6>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover mb-0" style="font-size: 0.92rem;">
                <thead style="background: #eef8ee; color: #009900; font-size: 0.8rem; text-transform: uppercase;">
                  <tr>
                    <th style="width: 70px; text-align: center;">Slika</th>
                    <th>Naziv artikla i varijanta</th>
                    <th class="text-center" style="width: 90px;">Količina</th>
                    <th class="text-right" style="width: 140px;">Cena</th>
                    <th class="text-right" style="width: 140px;">Ukupno</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Finansijski pregled -->
      <div class="col-12">
        <div class="card modal-info-card" style="border: 1px solid var(--color-border); background: #ffffff;">
          <div class="card-header">
            <h6><i class="fas fa-receipt"></i> Finansijski pregled</h6>
          </div>
          <div class="card-body py-3">
            <div class="row align-items-center">
              <div class="col-md-4 mb-2 mb-md-0">
                <span class="text-muted small d-block">Način dostave:</span>
                <span class="font-weight-bold" style="color: #1e293b;">Standardna kurirska dostava</span>
              </div>
              <div class="col-md-4 mb-2 mb-md-0 text-md-center">
                ${discountAmount > 0 ? `
                  <span class="text-muted small d-block">Ostvareni popust:</span>
                  <span class="text-danger font-weight-bold">-${discountAmount.toLocaleString("sr-RS")} RSD</span>
                ` : `
                  <span class="text-muted small d-block">Popust:</span>
                  <span class="text-muted small">0 RSD</span>
                `}
              </div>
              <div class="col-md-4 text-md-right">
                <span class="text-muted small d-block">Ukupan iznos za naplatu:</span>
                <div class="h4 mb-0 font-weight-bold" style="color: #009900;">
                  ${totalAmountStr} RSD
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#orderDetailsModal").modal("show");
}

async function saveModalOrderStatus(orderId) {
  const select = document.getElementById("modalOrderStatus");
  const saveBtn = document.getElementById("modalSaveStatusBtn");
  if (!select) return;

  const newStatus = select.value;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-1"></span> Čuvanje...';
  }

  try {
    await updateOrderStatus(orderId, newStatus);
    if (saveBtn) {
      saveBtn.innerHTML = '<i class="fas fa-check mr-1"></i> Uspešno sačuvano!';
      saveBtn.classList.remove("btn-primary");
      saveBtn.classList.add("btn-success");
      setTimeout(() => {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Sačuvaj izmenu statusa';
          saveBtn.classList.remove("btn-success");
          saveBtn.classList.add("btn-primary");
        }
      }, 1500);
    }
  } catch (err) {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Sačuvaj izmenu statusa';
    }
  }
}

async function updateOrderStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message);
    loadOrders(currentOrderPage);
  } catch (err) {
    alert("Greška pri ažuriranju statusa: " + err.message);
    const existing = ordersMap.get(String(id));
    const selectEl = document.getElementById("modalOrderStatus");
    if (existing && selectEl) {
      selectEl.value = existing.status || "na_cekanju";
    }
  }
}

async function deleteOrder(id, orderNum) {
  if (!confirm(`Da li ste sigurni da želite da obrišete porudžbinu #${orderNum}?`)) return;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message);
    loadOrders(currentOrderPage);
  } catch (err) {
    alert(err.message);
  }
}

