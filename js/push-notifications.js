/* =============================================================
 * Banda - push-notifications.js
 * Capacita PWA: contesto sicuro, Service Worker, permessi
 * Notification e installazione dell'app sul dispositivo.
 * ============================================================= */

window.PushManager = (function () {
  "use strict";

  var swRegistration = null;
  var deferredInstallPrompt = null;
  var installListeners = [];

  /* ----------------------------------------------------------
   * Rilevamento dell'ambiente
   * -------------------------------------------------------- */
  function isSecureContext() {
    return window.isSecureContext === true;
  }

  function hasServiceWorker() {
    return "serviceWorker" in navigator;
  }

  function hasNotificationApi() {
    return "Notification" in window;
  }

  function isStandalone() {
    if (window.navigator.standalone === true) return true;
    return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function isIOS() {
    var ua = window.navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    /* iPadOS 13 e successivi si presentano come Macintosh con touch */
    return /Macintosh/.test(ua) && "ontouchend" in document;
  }

  /* ----------------------------------------------------------
   * Contesto: ok | insecure | no-sw | ios-needs-install | unsupported
   * -------------------------------------------------------- */
  function getContext() {
    if (!isSecureContext()) return "insecure";
    if (!hasServiceWorker()) return "no-sw";
    if (isIOS() && !isStandalone()) return "ios-needs-install";
    if (!hasNotificationApi()) return "unsupported";
    return "ok";
  }

  function isSupported() {
    return getContext() === "ok";
  }

  /* ----------------------------------------------------------
   * Stato del permesso: granted | denied | default | unsupported
   * -------------------------------------------------------- */
  function getPermission() {
    if (getContext() !== "ok") return "unsupported";
    return window.Notification.permission || "default";
  }

  function isEnabled() {
    return getPermission() === "granted";
  }

  function getStatusLabel() {
    var permission = getPermission();
    if (permission === "granted") return "On";
    if (permission === "denied") return "No";
    return "Off";
  }

  /* ----------------------------------------------------------
   * Richiesta del permesso all'utente
   * -------------------------------------------------------- */
  function requestPermission() {
    if (getContext() !== "ok") return Promise.resolve("unsupported");

    var result;
    try {
      result = window.Notification.requestPermission();
    } catch (err) {
      /* Browser molto vecchi basati su callback */
      return new Promise(function (resolve) {
        window.Notification.requestPermission(function (perm) {
          resolve(perm);
        });
      });
    }

    return Promise.resolve(result).then(function (perm) {
      if (perm === "granted" && window.Auth) {
        window.Auth.setNotificationPreference(true);
        /* Iscrizione push: idempotente, non blocca la risposta. */
        ensurePushSubscription();
      }
      return perm;
    });
  }

  /* ----------------------------------------------------------
   * Registrazione del Service Worker
   * -------------------------------------------------------- */
  function registerServiceWorker() {
    if (!isSecureContext()) {
      console.info("[Push] Contesto non sicuro: Service Worker e notifiche richiedono HTTPS.");
      return Promise.resolve(null);
    }

    if (!hasServiceWorker()) {
      return Promise.resolve(null);
    }

    return navigator.serviceWorker
      .register("./service-worker.js")
      .then(function (registration) {
        swRegistration = registration;
        return registration;
      })
      .catch(function (err) {
        console.warn("[Push] Registrazione Service Worker non riuscita:", err);
        return null;
      });
  }

  function getRegistration() {
    return swRegistration;
  }

  /* ----------------------------------------------------------
   * Installazione dell'app sul dispositivo
   * -------------------------------------------------------- */
  function canInstall() {
    return deferredInstallPrompt !== null;
  }

  function isInstalled() {
    return isStandalone();
  }

  function needsIosInstructions() {
    return isIOS() && !isStandalone();
  }

  function promptInstall() {
    if (!deferredInstallPrompt) return Promise.resolve("unavailable");

    var promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;

    var shown;
    try {
      shown = promptEvent.prompt();
    } catch (err) {
      return Promise.resolve("error");
    }

    return Promise.resolve(shown)
      .then(function () {
        return promptEvent.userChoice;
      })
      .then(function (choice) {
        notifyInstallChange();
        return (choice && choice.outcome) || "dismissed";
      })
      .catch(function () {
        notifyInstallChange();
        return "error";
      });
  }

  function onInstallChange(listener) {
    if (typeof listener === "function") installListeners.push(listener);
  }

  function notifyInstallChange() {
    installListeners.forEach(function (listener) {
      try {
        listener();
      } catch (err) {
        /* ignora gli errori dei singoli listener */
      }
    });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    notifyInstallChange();
  });

  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    notifyInstallChange();
  });

  /* ----------------------------------------------------------
   * Notifica locale (mock dell'invio push dal backend)
   * -------------------------------------------------------- */
  function getReadyRegistration() {
    if (swRegistration) return Promise.resolve(swRegistration);
    if (!hasServiceWorker()) return Promise.resolve(null);

    return navigator.serviceWorker.ready.then(
      function (registration) {
        swRegistration = registration;
        return registration;
      },
      function () {
        return null;
      }
    );
  }

  function showLocalNotification(payload) {
    var data = payload || {};

    if (!isEnabled()) return Promise.resolve(false);

    return getReadyRegistration().then(function (registration) {
      if (!registration) return false;

      return registration
        .showNotification(data.title || "Banda", {
          body: data.body || "",
          icon: "./assets/icons/icon-192.png",
          badge: "./assets/icons/icon-192.png",
          tag: data.tag || "banda-event",
          data: data.data || {}
        })
        .then(function () {
          return true;
        })
        .catch(function () {
          return false;
        });
    });
  }

  /* ----------------------------------------------------------
   * Iscrizione push reale - VAPID (Fase 6)
   * -------------------------------------------------------- */
  function getVapidKey() {
    var config = window.PUSH_CONFIG;
    return (config && config.vapidPublicKey) || null;
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  /* Idempotente: crea l'iscrizione solo se manca e la salva nel
   * livello dati (una per dispositivo, chiave endpoint). */
  function ensurePushSubscription() {
    if (!isEnabled()) return Promise.resolve(null);
    var key = getVapidKey();

    return getReadyRegistration().then(function (registration) {
      if (!registration || !registration.pushManager || !key) return null;

      return registration.pushManager.getSubscription().then(function (existing) {
        if (existing) {
          if (window.API) API.savePushSubscription(existing);
          return existing;
        }

        return registration.pushManager
          .subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key)
          })
          .then(function (subscription) {
            if (window.API && subscription) API.savePushSubscription(subscription);
            return subscription || null;
          })
          .catch(function () {
            return null;
          });
      });
    });
  }

  function disablePushSubscription() {
    return getReadyRegistration()
      .then(function (registration) {
        if (!registration || !registration.pushManager) return null;

        return registration.pushManager.getSubscription().then(function (subscription) {
          if (!subscription) return null;
          if (window.API) API.removePushSubscription(subscription.endpoint);
          return subscription.unsubscribe().then(function () {
            return true;
          });
        });
      })
      .catch(function () {
        return null;
      });
  }

  /* ----------------------------------------------------------
   * Intercezione variazioni di permesso (Fase 6)
   * -------------------------------------------------------- */
  var permissionListeners = [];
  var watchedPermission = null;

  function onPermissionChange(listener) {
    if (typeof listener === "function") permissionListeners.push(listener);
  }

  function checkPermission() {
    var current = getPermission();
    if (current === watchedPermission) return current;

    watchedPermission = current;
    permissionListeners.forEach(function (listener) {
      try {
        listener(current);
      } catch (err) {
        /* ignora gli errori dei singoli listener */
      }
    });
    return current;
  }

  /* La revoca avviene nelle impostazioni di sistema mentre l'app e
   * in background: visibilitychange/focus/pageshow coprono il ritorno
   * sul tab, il cambio scheda e la navigazione bfcache. */
  function startPermissionWatch() {
    if (watchedPermission !== null) return;
    watchedPermission = getPermission();

    var onChange = function () {
      checkPermission();
    };
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener("pageshow", onChange);
  }

  return {
    isSecureContext: isSecureContext,
    isStandalone: isStandalone,
    isIOS: isIOS,
    getContext: getContext,
    isSupported: isSupported,
    getPermission: getPermission,
    isEnabled: isEnabled,
    getStatusLabel: getStatusLabel,
    requestPermission: requestPermission,
    registerServiceWorker: registerServiceWorker,
    getRegistration: getRegistration,
    canInstall: canInstall,
    isInstalled: isInstalled,
    needsIosInstructions: needsIosInstructions,
    promptInstall: promptInstall,
    onInstallChange: onInstallChange,
    getReadyRegistration: getReadyRegistration,
    showLocalNotification: showLocalNotification,
    getVapidKey: getVapidKey,
    ensurePushSubscription: ensurePushSubscription,
    disablePushSubscription: disablePushSubscription,
    onPermissionChange: onPermissionChange,
    checkPermission: checkPermission,
    startPermissionWatch: startPermissionWatch
  };
})();
