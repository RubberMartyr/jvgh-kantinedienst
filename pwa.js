(function () {
  'use strict';

  const installButton = document.getElementById('pwa-install-button');
  const offlineBanner = document.getElementById('pwa-offline-banner');
  const updateBanner = document.getElementById('pwa-update-banner');
  const updateButton = document.getElementById('pwa-update-button');
  const iosDialog = document.getElementById('pwa-ios-dialog');
  const iosClose = document.getElementById('pwa-ios-close');
  const networkButtons = [
    'send-availability-mails-button', 'send-parent-availability-button'
  ].map((id) => document.getElementById(id)).filter(Boolean);
  let deferredInstallPrompt = null;
  let registration = null;
  let reloadingForUpdate = false;

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IOS_HINT_KEY = 'jvgh_pwa_ios_hint_closed';

  function setOnlineState() {
    const offline = !navigator.onLine;
    offlineBanner.hidden = !offline;
    document.documentElement.classList.toggle('is-offline', offline);
    networkButtons.forEach((button) => {
      button.disabled = offline;
      button.setAttribute('aria-disabled', String(offline));
    });
  }

  function updateInstallButton() {
    if (installButton) installButton.hidden = isStandalone() || (!deferredInstallPrompt && !isIos());
  }

  function showWaitingWorker(worker) {
    if (!worker) return;
    if (!updateBanner || !updateButton) return;
    updateBanner.hidden = false;
    updateButton.onclick = () => worker.postMessage({ type: 'SKIP_WAITING' });
  }

  window.addEventListener('online', setOnlineState);
  window.addEventListener('offline', setOnlineState);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
  });

  installButton?.addEventListener('click', async () => {
    if (isIos() && !deferredInstallPrompt) {
      if (iosDialog) iosDialog.hidden = false;
      iosClose?.focus();
      return;
    }
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButton();
  });
  iosClose?.addEventListener('click', () => {
    if (iosDialog) iosDialog.hidden = true;
    localStorage.setItem(IOS_HINT_KEY, '1');
    installButton?.focus();
  });
  iosDialog?.addEventListener('click', (event) => {
    if (event.target === iosDialog) iosClose.click();
  });

  setOnlineState();
  updateInstallButton();
  if (isIos() && !isStandalone() && localStorage.getItem(IOS_HINT_KEY) !== '1') {
    if (iosDialog) iosDialog.hidden = false;
  }

  // Covers send/save controls that existing application code creates dynamically.
  document.addEventListener('click', (event) => {
    if (navigator.onLine) return;
    const button = event.target.closest('button, input[type="submit"]');
    if (!button || button === installButton || button === iosClose) return;
    const action = `${button.id} ${button.name || ''} ${button.textContent || button.value || ''}`;
    if (/(send|verstuur|verzend|bewaar|opslaan|save|beschikbaarheid|whatsapp)/i.test(action)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      offlineBanner.hidden = false;
    }
  }, true);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        registration = await navigator.serviceWorker.register('./service-worker.js');
        if (registration.waiting) showWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) showWaitingWorker(worker);
          });
        });
      } catch (error) {
        console.warn('PWA-serviceworker kon niet worden geregistreerd.', error.message);
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && registration) registration.update();
    });
  }
}());
