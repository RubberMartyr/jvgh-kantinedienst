(function () {
  const storageKey = "jvgh_access_granted";
  const accessDurationMs = 30 * 24 * 60 * 60 * 1000;

  function getSavedAccess() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch (err) {
      localStorage.removeItem(storageKey);
      return null;
    }
  }

  function hasValidAccess() {
    const saved = getSavedAccess();

    if (saved && saved.granted && saved.expires > Date.now()) {
      return true;
    }

    if (saved && saved.expires <= Date.now()) {
      localStorage.removeItem(storageKey);
    }

    return false;
  }

  function unlockPage(overlay) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        granted: true,
        expires: Date.now() + accessDurationMs
      })
    );

    document.documentElement.classList.remove("jvgh-access-locked");
    overlay.classList.add("is-leaving");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
  }

  function mountAccessOverlay({
    title = "Kantinedienst Planning",
    subtitle = "Voer de toegangscode in",
    buttonText = "Toegang verkrijgen"
  } = {}) {
    if (hasValidAccess()) {
      document.documentElement.classList.remove("jvgh-access-locked");
      return;
    }

    document.documentElement.classList.add("jvgh-access-locked");

    if (document.querySelector(".jvgh-access-overlay")) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "jvgh-access-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "jvgh-access-title");
    overlay.innerHTML = `
      <div class="jvgh-access-card">
        <img
          src="https://goldbug.be/wp-content/uploads/2024/11/cropped-logo-klein-zwart-2.png"
          alt="JVGH logo"
          class="jvgh-access-logo"
        />
        <h1 class="jvgh-access-title" id="jvgh-access-title"></h1>
        <p class="jvgh-access-subtitle"></p>
        <input
          class="jvgh-access-input"
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          aria-label="Toegangscode"
        />
        <button class="jvgh-access-button" type="button"></button>
        <div class="jvgh-access-error" aria-live="polite"></div>
      </div>
    `;

    overlay.querySelector(".jvgh-access-title").textContent = title;
    overlay.querySelector(".jvgh-access-subtitle").textContent = subtitle;
    overlay.querySelector(".jvgh-access-button").textContent = buttonText;
    document.body.appendChild(overlay);

    const input = overlay.querySelector(".jvgh-access-input");
    const button = overlay.querySelector(".jvgh-access-button");
    const error = overlay.querySelector(".jvgh-access-error");
    const defaultButtonText = button.textContent;

    requestAnimationFrame(() => {
      overlay.classList.add("is-visible");
      input.focus();
    });

    function setLoading(isLoading) {
      input.disabled = isLoading;
      button.disabled = isLoading;
      button.textContent = isLoading ? "Controleren..." : defaultButtonText;
    }

    function showError(message) {
      error.textContent = message;
      input.focus();
      input.select();
    }

    async function verifyAccessCode() {
      const code = input.value.trim();

      if (!code) {
        showError("Onjuiste toegangscode");
        return;
      }

      error.textContent = "";
      setLoading(true);

      try {
        const response = await jvghRequest("/verify-access-code", {
          method: "POST",
          body: { code }
        });

        if (response && response.success === true) {
          unlockPage(overlay);
          return;
        }

        showError("Onjuiste toegangscode");
      } catch (err) {
        showError("Onjuiste toegangscode");
      } finally {
        if (document.body.contains(overlay)) {
          setLoading(false);
        }
      }
    }

    button.addEventListener("click", verifyAccessCode);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        verifyAccessCode();
      }
    });
  }

  window.JVGHAccessControl = {
    mount: mountAccessOverlay,
    hasValidAccess
  };
})();
