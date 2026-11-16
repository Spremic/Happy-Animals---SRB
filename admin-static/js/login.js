// Odmah očisti zaostali keš sesije pri dolasku na login stranicu
try {
  sessionStorage.removeItem("adminAuthCache");
  sessionStorage.removeItem("adminAuthCacheTs");
} catch (_) {}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const alertBox = document.getElementById("loginAlert");
  const loginBtn = document.getElementById("loginBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.style.display = "none";
    loginBtn.disabled = true;
    btnText.textContent = "Prijava u toku...";
    btnSpinner.style.display = "inline-block";

    const mail = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mail, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Neuspešna prijava.");
      }

      // Clear cached admin state to force fresh load
      sessionStorage.removeItem("adminAuthCache");
      sessionStorage.removeItem("adminAuthCacheTs");

      window.location.href = "/admin";
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.style.display = "block";
      loginBtn.disabled = false;
      btnText.textContent = "Prijavite se";
      btnSpinner.style.display = "none";
    }
  });
});

