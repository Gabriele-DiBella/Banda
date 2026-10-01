/* =============================================================
 * Banda - Service Worker
 * -------------------------------------------------------------
 * Responsabilita:
 *  - Cache dell'app shell (Fase 1)
 *  - Strategia: cache-first con revalidation per gli asset statici,
 *    network-only per le future chiamate API.
 *  - Predisposizione per le notifiche push (gestione click notifica).
 * ============================================================= */

/* Configurazione push condivisa con la pagina. */
importScripts("./js/push-config.js");

const CACHE_VERSION = "banda-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/components.css",
  "./js/ui.js",
  "./js/format.js",
  "./js/auth.js",
  "./js/api.js",
  "./js/push-config.js",
  "./js/push-notifications.js",
  "./js/events.js",
  "./js/attendance.js",
  "./js/scores.js",
  "./js/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

/* ---------- Install: precache dell'app shell ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[SW] Precache parziale:", err))
  );
});

/* ---------- Activate: pulizia delle cache vecchie ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- Fetch: strategia di caching ---------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET e solo richieste same-origin vengono gestite dal SW.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Le future chiamate API (path /api/) non vengono mai cachate.
  if (url.pathname.includes("/api/")) return;

  // Navigazioni: network-first con fallback offline all'app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("./index.html").then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Asset statici: cache-first + aggiornamento in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* ---------- Push: ricezione notifica (Fase 6) ---------- */
self.addEventListener("push", (event) => {
  let payload = { title: "Banda", body: "Nuovo aggiornamento disponibile." };

  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (err) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./assets/icons/icon-192.png",
      badge: "./assets/icons/icon-192.png",
      data: payload.data || {},
      tag: payload.tag || "banda-event"
    })
  );
});

/* ---------- Click sulla notifica: apre/focalizza l'app ---------- */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./index.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if (client.navigate && target) client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/* ---------- pushsubscriptionchange: rinnovo automatico ---------- */
/* Quando il browser rigenera la sottoscrizione (rotazione endpoint,
 * rotta del browser, ecc.) la ricreiamo con la stessa chiave VAPID.
 * Il livello dati la registrerà alla prossima apertura dell'app. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const config = self.PUSH_CONFIG || {};
  if (!config.vapidPublicKey || !self.registration.pushManager) return;

  const padding = "=".repeat((4 - (config.vapidPublicKey.length % 4)) % 4);
  const base64 = (config.vapidPublicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const applicationServerKey = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) applicationServerKey[i] = raw.charCodeAt(i);

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .catch(() => null)
  );
});
