/* =============================================================
 * Banda - auth.js
 * Gestione locale del profilo utente (nessun login reale):
 * salvataggio in localStorage di nome, cognome, strumenti e
 * ruolo (utente base / admin). Predisposto per i ruoli assegnati
 * lato backend nelle fasi successive.
 * ============================================================= */

window.Auth = (function () {
  "use strict";

  var STORAGE_KEYS = {
    user: "banda.user",
    schema: "banda.schemaVersion",
    notifications: "banda.notifications",
    session: "banda.session"
  };

  var SCHEMA_VERSION = 2;

  /* Codice d'invito del mock: con il backend reale il controllo
     passa a una API lato server (token per membro, rigenerabili).
     NON e una sicurezza (e visibile nel sorgente): serve a impedire
     l'accesso casuale al sito, come richiesto dal piano di rilascio. */
  var MOCK_INVITE_CODE = "BND-2026";
  var ROLES = { USER: "user", ADMIN: "admin" };

  function newUserId() {
    return "usr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  /* Elenco strumenti tipici di una banda, raggruppati per famiglia. */
  var INSTRUMENT_GROUPS = [
    {
      label: "Legni",
      items: [
        "Clarinetto",
        "Clarinetto basso",
        "Fagotto",
        "Flauto Traverso",
        "Oboe",
        "Sax baritono",
        "Sax contralto",
        "Sax soprano",
        "Sax tenore"
      ]
    },
    {
      label: "Ottoni",
      items: [
        "Tromba",
        "Corno",
        "Trombone",
        "Flicorno",
        "Eufonio"
      ]
    },
    {
      label: "Percussioni",
      items: [
        "Batteria", 
        "Cassa", 
        "Percussioni",
        "Piatti",
        "Timpani"
      ]
    },
    {
      label: "Altro",
      items: [
        "Basso elettrico",
        "Direttore"
      ]
    }
  ];

  /* ----------------------------------------------------------
   * Accesso sicuro al localStorage (evita crash in contesti
   * dove lo storage non e disponibile o e pieno).
   * -------------------------------------------------------- */
  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function removeRaw(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      /* ignora */
    }
  }

  /* ----------------------------------------------------------
   * Profilo utente
   * -------------------------------------------------------- */
  function normalize(profile) {
    var data = profile || {};
    return {
      id: typeof data.id === "string" && data.id ? data.id : null,
      firstName: typeof data.firstName === "string" ? data.firstName.trim() : "",
      lastName: typeof data.lastName === "string" ? data.lastName.trim() : "",
      email: typeof data.email === "string" ? data.email.trim().toLowerCase() : "",
      instruments: Array.isArray(data.instruments) ? data.instruments.slice() : [],
      role: data.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  }

  function getUser() {
    var raw = readRaw(STORAGE_KEYS.user);
    if (!raw) return null;
    try {
      var parsed = normalize(JSON.parse(raw));
      return parsed.firstName || parsed.lastName ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function hasProfile() {
    return getUser() !== null;
  }

  function pick(value, fallback) {
    return value != null ? value : fallback;
  }

  function saveUser(profile) {
    var existing = getUser();
    var now = new Date().toISOString();

    var merged = normalize({
      id: (existing && existing.id) || (profile && profile.id) || newUserId(),
      firstName: pick(profile && profile.firstName, (existing && existing.firstName) || ""),
      lastName: pick(profile && profile.lastName, (existing && existing.lastName) || ""),
      email: pick(profile && profile.email, (existing && existing.email) || ""),
      instruments: pick(profile && profile.instruments, (existing && existing.instruments) || []),
      role: pick(profile && profile.role, (existing && existing.role) || ROLES.USER),
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now
    });

    var ok = writeRaw(STORAGE_KEYS.user, JSON.stringify(merged));
    writeRaw(STORAGE_KEYS.schema, String(SCHEMA_VERSION));
    return ok ? merged : null;
  }

  function updateUser(patch) {
    var current = getUser();
    if (!current) return null;
    var next = Object.assign({}, current, patch || {});
    return saveUser(next);
  }

  function clearUser() {
    removeRaw(STORAGE_KEYS.user);
    removeRaw(STORAGE_KEYS.notifications);
    removeRaw(STORAGE_KEYS.schema);
    removeRaw(STORAGE_KEYS.session);
  }

  /* ----------------------------------------------------------
   * Accesso con invito (sessione locale)
   * -------------------------------------------------------- */
  function validateInvite(code) {
    return (
      typeof code === "string" && code.trim().toUpperCase() === MOCK_INVITE_CODE
    );
  }

  function login() {
    return writeRaw(STORAGE_KEYS.session, "true");
  }

  function logout() {
    return writeRaw(STORAGE_KEYS.session, "false");
  }

  /* Nessun valore = profilo legacy o app sessione appena creata:
     considerata attiva. Solo un logout esplicito ("false") richiede
     di reinserire il codice d'invito. */
  function isLoggedIn() {
    return readRaw(STORAGE_KEYS.session) !== "false";
  }

  /* ----------------------------------------------------------
   * Ruoli
   * -------------------------------------------------------- */
  function getRole() {
    var user = getUser();
    return (user && user.role) || ROLES.USER;
  }

  function getUserId() {
    var user = getUser();
    return (user && user.id) || null;
  }

  function isAdmin() {
    return getRole() === ROLES.ADMIN;
  }

  function setRole(role) {
    return updateUser({ role: role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER });
  }

  /* ----------------------------------------------------------
   * Preferenza notifiche (impostata dal gate di Fase 2)
   * -------------------------------------------------------- */
  function setNotificationPreference(enabled) {
    return writeRaw(STORAGE_KEYS.notifications, enabled ? "true" : "false");
  }

  function getNotificationPreference() {
    return readRaw(STORAGE_KEYS.notifications) === "true";
  }

  /* ----------------------------------------------------------
   * Utility strumenti
   * -------------------------------------------------------- */
  function getAllInstruments() {
    var list = [];
    INSTRUMENT_GROUPS.forEach(function (group) {
      group.items.forEach(function (item) {
        if (list.indexOf(item) === -1) list.push(item);
      });
    });
    return list;
  }

  function fullName(profile) {
    var user = profile || getUser();
    if (!user) return "";
    return (user.firstName + " " + user.lastName).trim();
  }

  function migrate() {
    var user = getUser();

    /* I profili creati prima della versione 2 non hanno un id:
       senza id non sarebbe possibile collegare le presenze al membro. */
    if (user && !user.id) {
      user.id = newUserId();
      saveUser(user);
    }

    var version = parseInt(readRaw(STORAGE_KEYS.schema) || "0", 10) || 0;
    if (version === SCHEMA_VERSION) return;

    writeRaw(STORAGE_KEYS.schema, String(SCHEMA_VERSION));
  }

  return {
    ROLES: ROLES,
    SCHEMA_VERSION: SCHEMA_VERSION,
    INSTRUMENT_GROUPS: INSTRUMENT_GROUPS,
    getUser: getUser,
    hasProfile: hasProfile,
    saveUser: saveUser,
    updateUser: updateUser,
    clearUser: clearUser,
    getRole: getRole,
    getUserId: getUserId,
    isAdmin: isAdmin,
    setRole: setRole,
    setNotificationPreference: setNotificationPreference,
    getNotificationPreference: getNotificationPreference,
    MOCK_INVITE_CODE: MOCK_INVITE_CODE,
    validateInvite: validateInvite,
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getAllInstruments: getAllInstruments,
    fullName: fullName,
    migrate: migrate
  };
})();
