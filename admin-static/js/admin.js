const adminsMap = new Map();

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCachedCurrentUser() {
  try {
    const raw = sessionStorage.getItem("adminAuthCache");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.user || null;
    }
  } catch (e) {}
  return null;
}

async function ensureCurrentUser() {
  let u = getCachedCurrentUser();
  if (u && u.adminType) return u;
  try {
    const resp = await fetch("/auth/verify", { credentials: "same-origin" });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.authenticated && data.user) {
        sessionStorage.setItem("adminAuthCache", JSON.stringify(data));
        sessionStorage.setItem("adminAuthCacheTs", String(Date.now()));
        return data.user;
      }
    }
  } catch (e) {}
  return u;
}

document.addEventListener("DOMContentLoaded", () => {
  loadAdmins();

  const switchBtn = document.getElementById("adminTypeSwitch");

  // Toggle switch promena
  if (switchBtn) {
    switchBtn.addEventListener("change", function () {
      handleAdminTypeSwitch(this.checked);
    });
  }

  // Klik na celu karticu switch-a
  const mainCard = document.getElementById("mainAdminCard");
  if (mainCard && switchBtn) {
    mainCard.addEventListener("click", function (e) {
      if (e.target.closest(".custom-switch")) return;
      if (switchBtn.disabled) return;
      switchBtn.checked = !switchBtn.checked;
      handleAdminTypeSwitch(switchBtn.checked);
    });
  }

  // Klik na .permission-card selektuje checkbox i ažurira stil
  document.querySelectorAll(".permission-card").forEach((card) => {
    card.addEventListener("click", function (e) {
      if (e.target.tagName === "INPUT" || (e.target.closest && e.target.closest("label"))) {
        // Klik je direktno na input ili unutar label-a, samo ažuriramo klasu posle native eventa
        setTimeout(() => updateCardStyle(card), 10);
        return;
      }
      const checkbox = this.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        updateCardStyle(card);
      }
    });

    const chk = card.querySelector('input[type="checkbox"]');
    if (chk) {
      chk.addEventListener("change", () => updateCardStyle(card));
    }
  });

  document.getElementById("adminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("adminId").value;
    const name = document.getElementById("adminName").value.trim();
    const mail = document.getElementById("adminMail").value.trim();
    const password = document.getElementById("adminPassword").value;
    const isMain = document.getElementById("adminTypeSwitch").checked;
    const adminType = isMain ? "main" : "standard";

    let permissions = [];
    if (isMain) {
      permissions = ["proizvodi", "narudzbine", "admini"];
    } else {
      document.querySelectorAll(".perm-check:checked").forEach((chk) => {
        permissions.push(chk.value);
      });
    }

    const payload = { name, mail, adminType, permissions };
    if (password) payload.password = password;

    const url = id ? `/api/updateAdmin/${encodeURIComponent(id)}` : "/api/addAdmin";
    const method = id ? "PUT" : "POST";

    const saveBtn = document.getElementById("saveAdminBtn");
    const saveBtnText = document.getElementById("saveAdminBtnText");
    const saveBtnSpinner = document.getElementById("saveAdminBtnSpinner");
    const cancelBtn = document.getElementById("cancelAdminBtn");

    // Loading feedback pri slanju forme
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (saveBtnSpinner) saveBtnSpinner.style.display = "inline-block";
    if (saveBtnText) saveBtnText.textContent = id ? "Čuvanje izmena..." : "Dodavanje admina...";

    try {
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
        throw new Error(data.message || "Greška pri čuvanju administratora.");
      }

      $("#adminModal").modal("hide");
      window.showBootstrapAlert(
        id ? "Podaci administratora su uspešno ažurirani!" : "Novi administrator je uspešno dodat u sistem!",
        "success"
      );
      loadAdmins();
    } catch (err) {
      window.showBootstrapAlert(err.message || "Greška pri čuvanju administratora.", "danger");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (saveBtnSpinner) saveBtnSpinner.style.display = "none";
      if (saveBtnText) saveBtnText.textContent = id ? "Sačuvaj izmene" : "Sačuvaj administratora";
    }
  });
});

function updateCardStyle(card) {
  const chk = card.querySelector('input[type="checkbox"]');
  if (chk && chk.checked) {
    card.classList.add("active-perm");
  } else {
    card.classList.remove("active-perm");
  }
}

function handleAdminTypeSwitch(isMain) {
  const permSection = document.getElementById("permissionsSection");
  const infoSection = document.getElementById("mainAdminInfo");
  const permCheckboxes = document.querySelectorAll(".perm-check");

  if (isMain) {
    permCheckboxes.forEach((checkbox) => {
      checkbox.checked = true;
      checkbox.disabled = true;
      const card = checkbox.closest(".permission-card");
      if (card) {
        card.classList.add("disabled");
        card.classList.remove("active-perm");
      }
    });

    if (permSection) permSection.style.display = "none";
    if (infoSection) infoSection.style.display = "block";
  } else {
    permCheckboxes.forEach((checkbox) => {
      if (checkbox.id === "permAdmini") {
        checkbox.checked = false;
        checkbox.disabled = true;
      } else {
        checkbox.disabled = false;
      }
      const card = checkbox.closest(".permission-card");
      if (card) {
        if (checkbox.id !== "permAdmini") card.classList.remove("disabled");
        updateCardStyle(card);
      }
    });

    if (permSection) permSection.style.display = "block";
    if (infoSection) infoSection.style.display = "none";
  }
}

function renderAdminsSkeleton(count = 4) {
  const tbody = document.getElementById("adminsList");
  if (!tbody) return;
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-text" style="width: 120px; height: 16px;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 160px; height: 14px;"></div></td>
        <td><div class="skeleton skeleton-badge" style="width: 80px;"></div></td>
        <td><div class="skeleton skeleton-text" style="width: 150px; height: 13px;"></div></td>
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

async function loadAdmins() {
  const tbody = document.getElementById("adminsList");
  renderAdminsSkeleton(4);
  const currentUser = await ensureCurrentUser();
  const callerIsMain = Boolean(currentUser && currentUser.adminType === "main");

  try {
    const res = await fetch("/api/admins");
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    adminsMap.clear();

    if (!data.admins.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">Nema administratora.</td></tr>`;
      return;
    }

    data.admins.forEach((adm) => adminsMap.set(String(adm._id), adm));

    tbody.innerHTML = data.admins
      .map((adm) => {
        const adminId = escapeHtml(adm._id);
        const name = escapeHtml(adm.name);
        const mail = escapeHtml(adm.mail);
        const isMain = adm.adminType === "main";
        const roleBadge = isMain
          ? '<span class="badge badge-primary">Superadmin</span>'
          : '<span class="badge badge-secondary">Standard</span>';
        const permsStr = escapeHtml((adm.permissions || []).join(", ") || "-");

        // Ako ulogovani korisnik nije main, a ovaj nalog jeste main, onemogući opasne akcije
        const disableActions = !callerIsMain && isMain;

        const editBtn = disableActions
          ? `<button class="btn btn-sm btn-outline-secondary" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" disabled title="Samo Superadmin može menjati ovaj nalog"><i class="fas fa-lock"></i></button>`
          : `<button class="btn btn-sm btn-outline-primary" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" onclick="editAdmin('${adminId}')" title="Izmeni administratora"><i class="fas fa-edit"></i></button>`;

        const deleteBtn = disableActions
          ? `<button class="btn btn-sm btn-outline-secondary" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" disabled title="Samo Superadmin može obrisati ovaj nalog"><i class="fas fa-lock"></i></button>`
          : `<button class="btn btn-sm btn-outline-danger" style="flex: 0 0 34px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;" onclick="deleteAdmin('${adminId}', this)" title="Obriši administratora"><i class="fas fa-trash"></i></button>`;

        return `
          <tr>
            <td class="font-weight-bold" style="color: #1e293b;">${name}</td>
            <td>${mail}</td>
            <td>${roleBadge}</td>
            <td><small class="text-muted font-weight-500">${permsStr}</small></td>
            <td style="text-align: center; white-space: nowrap; min-width: 120px; width: 120px;">
              <div class="table-action-btns" style="display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap;">
                ${editBtn}
                ${deleteBtn}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4 font-weight-bold"><i class="fas fa-exclamation-triangle mr-2"></i>${escapeHtml(err.message)}</td></tr>`;
    window.showBootstrapAlert("Greška pri učitavanju administratora: " + err.message, "danger");
  }
}

async function prepareAddAdmin() {
  document.getElementById("adminForm").reset();
  document.getElementById("adminId").value = "";
  document.getElementById("adminName").value = "";
  document.getElementById("adminMail").value = "";

  const saveBtn = document.getElementById("saveAdminBtn");
  const saveBtnText = document.getElementById("saveAdminBtnText");
  const saveBtnSpinner = document.getElementById("saveAdminBtnSpinner");
  const cancelBtn = document.getElementById("cancelAdminBtn");

  if (saveBtn) saveBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;
  if (saveBtnSpinner) saveBtnSpinner.style.display = "none";
  if (saveBtnText) saveBtnText.textContent = "Sačuvaj administratora";

  const titleEl = document.getElementById("adminModalTitle");
  if (titleEl) {
    titleEl.innerHTML = '<i class="fas fa-user-plus mr-2"></i><span>Dodaj novog administratora</span>';
  }

  const passInput = document.getElementById("adminPassword");
  const passReq = document.getElementById("passReq");
  const passHelp = document.getElementById("passHelp");

  if (passInput) {
    passInput.value = "";
    passInput.required = true;
  }
  if (passReq) passReq.style.display = "inline";
  if (passHelp) passHelp.style.display = "none";

  const currentUser = await ensureCurrentUser();
  const callerIsMain = Boolean(currentUser && currentUser.adminType === "main");

  const switchBtn = document.getElementById("adminTypeSwitch");
  if (switchBtn) {
    switchBtn.checked = false;
    switchBtn.disabled = !callerIsMain;
  }

  // Podrazumevano selektovane osnovne dozvole za novog admina
  const permProizvodi = document.getElementById("permProizvodi");
  const permNarudzbe = document.getElementById("permNarudzbe");
  if (permProizvodi) permProizvodi.checked = true;
  if (permNarudzbe) permNarudzbe.checked = true;

  handleAdminTypeSwitch(false);
  document.querySelectorAll(".permission-card").forEach(updateCardStyle);

  $("#adminModal").modal("show");
}

async function editAdmin(idOrAdm) {
  const adm = typeof idOrAdm === "string" ? adminsMap.get(idOrAdm) : idOrAdm;
  if (!adm) return;

  const currentUser = await ensureCurrentUser();
  const callerIsMain = Boolean(currentUser && currentUser.adminType === "main");

  if (!callerIsMain && adm.adminType === "main") {
    window.showBootstrapAlert("Nemate ovlašćenje da menjate nalog glavnog administratora.", "danger");
    return;
  }

  const saveBtn = document.getElementById("saveAdminBtn");
  const saveBtnText = document.getElementById("saveAdminBtnText");
  const saveBtnSpinner = document.getElementById("saveAdminBtnSpinner");
  const cancelBtn = document.getElementById("cancelAdminBtn");

  if (saveBtn) saveBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;
  if (saveBtnSpinner) saveBtnSpinner.style.display = "none";
  if (saveBtnText) saveBtnText.textContent = "Sačuvaj izmene";

  document.getElementById("adminId").value = adm._id;
  document.getElementById("adminName").value = adm.name;
  document.getElementById("adminMail").value = adm.mail;

  const passInput = document.getElementById("adminPassword");
  const passReq = document.getElementById("passReq");
  const passHelp = document.getElementById("passHelp");

  if (passInput) {
    passInput.value = "";
    passInput.required = false;
  }
  if (passReq) passReq.style.display = "none";
  if (passHelp) passHelp.style.display = "inline";

  const isMain = adm.adminType === "main";
  const switchBtn = document.getElementById("adminTypeSwitch");
  if (switchBtn) {
    switchBtn.checked = isMain;
    switchBtn.disabled = !callerIsMain;
  }

  // Ažuriraj selektovane dozvole
  document.querySelectorAll(".perm-check").forEach((chk) => {
    chk.checked = (adm.permissions || []).includes(chk.value);
  });

  handleAdminTypeSwitch(isMain);

  document.querySelectorAll(".permission-card").forEach(updateCardStyle);

  const titleEl = document.getElementById("adminModalTitle");
  if (titleEl) {
    titleEl.innerHTML = '<i class="fas fa-user-edit mr-2"></i><span>Izmeni administratora</span>';
  }

  $("#adminModal").modal("show");
}

async function deleteAdmin(id, btn) {
  const adm = adminsMap.get(String(id));
  const admName = adm ? ` "${adm.name}"` : "";

  if (!confirm(`Da li ste sigurni da želite da obrišete administratora${admName}?`)) return;

  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.style.pointerEvents = "none";
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.title = "Brisanje...";
  }

  try {
    const res = await fetch(`/api/deleteAdmin/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Greška pri brisanju administratora.");
    }

    window.showBootstrapAlert(data.message || "Administrator je uspešno obrisan!", "success");
    loadAdmins();
  } catch (err) {
    window.showBootstrapAlert(err.message || "Greška pri brisanju administratora.", "danger");
    if (btn) {
      btn.disabled = false;
      btn.style.pointerEvents = "";
      btn.innerHTML = originalHtml;
      btn.title = "Obriši administratora";
    }
  }
}

