/* =============================================================
 * Banda - api.js
 * Livello di accesso ai dati. In questa fase il backend e
 * simulato: eventi e presenze vengono letti e scritti nel
 * localStorage del dispositivo. Le funzioni mantengono una firma
 * asincrona (Promise) cosi, collegando gli endpoint reali nelle
 * fasi successive, l'interfaccia non dovra cambiare.
 * ============================================================= */

window.API = (function () {
  "use strict";

  /* Endpoint base del futuro backend. */
  var BASE_URL = "";
  var USE_MOCK = true;

  /* Ritardo simulato per rendere visibili i loader. */
  var MOCK_DELAY = 420;
  var WRITE_DELAY = 300;

  var STORAGE = {
    events: "banda.events",
    presences: "banda.presences",
    members: "banda.members",
    demo: "banda.demoMode",
    folders: "banda.folders",
    scores: "banda.scores",
    pushSubscriptions: "banda.pushSubscriptions",
    deviceId: "banda.deviceId"
  };

  /* Anagrafica dimostrativa: serve a rendere esplorabile il riepilogo
     presenze finche il backend reale non fornisce i membri della banda. */
  var DEMO_MEMBERS = [
    { firstName: "Giulia", lastName: "Bianchi", instruments: ["Clarinetto", "Sax contralto"] },
    { firstName: "Marco", lastName: "Ferrari", instruments: ["Tromba"] },
    { firstName: "Sara", lastName: "Conti", instruments: ["Flauto", "Ottavino"] },
    { firstName: "Luca", lastName: "Moretti", instruments: ["Trombone"] },
    { firstName: "Elena", lastName: "Ricci", instruments: ["Percussioni"] },
    { firstName: "Paolo", lastName: "Greco", instruments: ["Tuba"] },
    { firstName: "Chiara", lastName: "Marino", instruments: ["Corno"] },
    { firstName: "Davide", lastName: "Bruno", instruments: ["Sax tenore"] }
  ];

  function delay(value, ms) {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve(value);
      }, ms == null ? MOCK_DELAY : ms);
    });
  }

  /* ----------------------------------------------------------
   * Storage locale (mock del database)
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

  function readCollection(key) {
    var raw = readRaw(key);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function readMap(key) {
    var raw = readRaw(key);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function newId(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  /* ----------------------------------------------------------
   * Membri della banda (roster)
   * -------------------------------------------------------- */
  function isDemoMode() {
    return readRaw(STORAGE.demo) !== "false";
  }

  function ensureDemoMembers() {
    if (!isDemoMode()) return;

    var members = readCollection(STORAGE.members);
    var hasDemo = members.some(function (member) {
      return member.demo;
    });
    if (hasDemo) return;

    DEMO_MEMBERS.forEach(function (member, index) {
      members.push({
        id: "demo_" + (index + 1),
        firstName: member.firstName,
        lastName: member.lastName,
        instruments: member.instruments.slice(),
        role: "user",
        demo: true
      });
    });

    writeRaw(STORAGE.members, JSON.stringify(members));
  }

  function removeDemoMembers() {
    var members = readCollection(STORAGE.members).filter(function (member) {
      return !member.demo;
    });
    writeRaw(STORAGE.members, JSON.stringify(members));
  }

  function setDemoMode(on) {
    var enabled = on !== false;
    writeRaw(STORAGE.demo, enabled ? "true" : "false");
    if (enabled) ensureDemoMembers();
    else removeDemoMembers();
    return enabled;
  }

  /* Registra (o aggiorna) il membro corrispondente al profilo locale. */
  function syncLocalMember(profile) {
    if (!profile || !profile.id) return Promise.resolve(null);

    var members = readCollection(STORAGE.members);
    var found = null;

    members.forEach(function (member) {
      if (member.id === profile.id) found = member;
    });

    var next = {
      id: profile.id,
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      instruments: profile.instruments || [],
      role: profile.role === "admin" ? "admin" : "user",
      local: true
    };

    if (found) Object.assign(found, next);
    else members.push(next);

    writeRaw(STORAGE.members, JSON.stringify(members));
    return Promise.resolve(next);
  }

  function getMembers() {
    return delay(null, MOCK_DELAY).then(function () {
      ensureDemoMembers();

      var members = readCollection(STORAGE.members);
      return members.sort(function (a, b) {
        if (a.local && !b.local) return -1;
        if (b.local && !a.local) return 1;
        return (a.lastName || "").localeCompare(b.lastName || "");
      });
    });
  }

  /* Stato simulato per i membri dimostrativi: deterministico, cosi
     non cambia tra un caricamento e l'altro. */
  function demoStatus(eventId, memberId) {
    var source = String(eventId) + "|" + String(memberId);
    var hash = 0;

    for (var i = 0; i < source.length; i++) {
      hash = (hash * 31 + source.charCodeAt(i)) % 100003;
    }

    var bucket = hash % 10;
    if (bucket < 6) return "yes";
    if (bucket < 8) return "no";
    return null;
  }

  function request(path, options) {
    if (USE_MOCK) {
      return Promise.reject(new Error("Backend non ancora collegato (mock attivo)."));
    }
    var opts = options || {};
    return fetch(BASE_URL + path, {
      method: opts.method || "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error("Richiesta fallita: " + res.status);
      return res.json();
    });
  }

  /* ----------------------------------------------------------
   * Eventi (Fase 3)
   * -------------------------------------------------------- */
  function eventTimestamp(event) {
    var date = (event && event.date) || "";
    var time = (event && event.time) || "00:00";
    var value = new Date(date + "T" + time).getTime();
    return isNaN(value) ? 0 : value;
  }

  function sortEvents(list) {
    return list.slice().sort(function (a, b) {
      return eventTimestamp(a) - eventTimestamp(b);
    });
  }

  function normalizeEvent(payload, existing) {
    var source = payload || {};
    var base = existing || {};

    function pick(value, fallback) {
      return value != null ? value : fallback;
    }

    return {
      id: base.id || source.id || newId("evt"),
      title: String(pick(source.title, base.title) || "").trim(),
      date: String(pick(source.date, base.date) || ""),
      time: String(pick(source.time, base.time) || ""),
      location: String(pick(source.location, base.location) || "").trim(),
      setlist: String(pick(source.setlist, base.setlist) || ""),
      notes: String(pick(source.notes, base.notes) || ""),
      createdAt: base.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function getEvents() {
    return delay(null, MOCK_DELAY).then(function () {
      return sortEvents(readCollection(STORAGE.events));
    });
  }

  function getEvent(id) {
    return getEvents().then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    });
  }

  function createEvent(payload) {
    return delay(null, WRITE_DELAY).then(function () {
      var list = readCollection(STORAGE.events);
      var event = normalizeEvent(payload, null);
      list.push(event);
      writeRaw(STORAGE.events, JSON.stringify(list));
      return event;
    });
  }

  function updateEvent(id, payload) {
    return delay(null, WRITE_DELAY).then(function () {
      var list = readCollection(STORAGE.events);
      var updated = null;

      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          updated = normalizeEvent(payload, list[i]);
          list[i] = updated;
        }
      }

      if (updated) writeRaw(STORAGE.events, JSON.stringify(list));
      return updated;
    });
  }

  function deleteEvent(id) {
    return delay(null, WRITE_DELAY).then(function () {
      var list = readCollection(STORAGE.events);
      var next = list.filter(function (item) {
        return item.id !== id;
      });

      writeRaw(STORAGE.events, JSON.stringify(next));

      var presences = readMap(STORAGE.presences);
      if (presences[id]) {
        delete presences[id];
        writeRaw(STORAGE.presences, JSON.stringify(presences));
      }

      return next.length !== list.length;
    });
  }

  /* ----------------------------------------------------------
   * Presenze (Fase 3/4)
   * Struttura: { [eventId]: { [memberId]: { status, note, updatedAt } } }
   * -------------------------------------------------------- */
  function normalizePresences(map, members) {
    var localMember = null;
    members.forEach(function (member) {
      if (member.local) localMember = member;
    });

    var changed = false;

    Object.keys(map).forEach(function (eventId) {
      var entry = map[eventId];

      /* Formato precedente: la presenza era registrata direttamente
         sull'evento, senza riferimento al membro. */
      if (entry && (entry.status !== undefined || entry.note !== undefined)) {
        var key = (localMember && localMember.id) || "local";
        var migrated = {};
        migrated[key] = {
          status: entry.status != null ? entry.status : null,
          note: entry.note || "",
          updatedAt: entry.updatedAt || new Date().toISOString()
        };
        map[eventId] = migrated;
        changed = true;
      }
    });

    if (changed) writeRaw(STORAGE.presences, JSON.stringify(map));
    return map;
  }

  function getPresences() {
    return delay(null, MOCK_DELAY).then(function () {
      return normalizePresences(readMap(STORAGE.presences), readCollection(STORAGE.members));
    });
  }

  function getPresence(eventId, memberId) {
    return getPresences().then(function (map) {
      var forEvent = map[eventId] || {};
      return forEvent[memberId] || null;
    });
  }

  function savePresence(eventId, memberId, payload) {
    return delay(null, 220).then(function () {
      var map = readMap(STORAGE.presences);
      var forEvent = map[eventId] || {};
      var current = forEvent[memberId] || {};
      var source = payload || {};

      forEvent[memberId] = {
        status: source.status != null ? source.status : current.status || null,
        note: source.note != null ? source.note : current.note || "",
        updatedAt: new Date().toISOString()
      };

      map[eventId] = forEvent;
      writeRaw(STORAGE.presences, JSON.stringify(map));
      return forEvent[memberId];
    });
  }

  /* ----------------------------------------------------------
   * Riepilogo presenze (Fase 4)
   * -------------------------------------------------------- */
  function buildSummary(eventId, presences, members) {
    var forEvent = presences[eventId] || {};
    var present = [];
    var absent = [];
    var pending = [];

    members.forEach(function (member) {
      var record = forEvent[member.id] || null;
      var status = record ? record.status : null;

      if (!status && member.demo) status = demoStatus(eventId, member.id);

      var entry = {
        member: member,
        status: status,
        note: record ? record.note || "" : ""
      };

      if (status === "yes") present.push(entry);
      else if (status === "no") absent.push(entry);
      else pending.push(entry);
    });

    return {
      eventId: eventId,
      present: present,
      absent: absent,
      pending: pending,
      counts: {
        yes: present.length,
        no: absent.length,
        pending: pending.length,
        total: members.length,
        responded: present.length + absent.length
      }
    };
  }

  function getAttendanceSummary(eventId) {
    return Promise.all([getPresences(), getMembers()]).then(function (results) {
      return buildSummary(eventId, results[0], results[1]);
    });
  }

  /* Conteggi di tutti gli eventi, per i badge nella lista admin. */
  function getAttendanceOverviews() {
    return Promise.all([getEvents(), getPresences(), getMembers()]).then(function (results) {
      var events = results[0];
      var presences = results[1];
      var members = results[2];
      var overviews = {};

      events.forEach(function (event) {
        overviews[event.id] = buildSummary(event.id, presences, members).counts;
      });

      return overviews;
    });
  }

  /* ----------------------------------------------------------
   * Spartiti (Fase 5)
   * Cartelle: { id, name, parentId, createdAt, updatedAt }
   * File:     { id, folderId, name, size, mime, content, ... }
   * Il contenuto dei PDF e salvato come data URL nel mock: con il
   * backend reale sara il riferimento al file caricato.
   * -------------------------------------------------------- */
  var MAX_SCORE_BYTES = 1048576; /* 1 MB per file */

  function byName(a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  function normalizeFolderName(name) {
    var value = String(name || "").trim().replace(/[\/\\]/g, "-");
    if (value.length > 60) value = value.slice(0, 60);
    return value;
  }

  /* I nomi dei PDF vengono normalizzati con suffisso ".pdf". */
  function normalizeFileName(name) {
    var value = String(name || "").trim().replace(/[\/\\]/g, "-").replace(/\.pdf$/i, "");
    if (!value) value = "spartito";
    if (value.length > 76) value = value.slice(0, 76);
    return value + ".pdf";
  }

  function stripContent(file) {
    var copy = {};
    Object.keys(file).forEach(function (key) {
      if (key !== "content") copy[key] = file[key];
    });
    return copy;
  }

  /* PDF minimale (una pagina con il titolo), usato per i file
     dimostrativi: e un documento valido, non un segnaposto. */
  function buildDemoPdf(title) {
    var safeTitle = String(title || "Banda")
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/([\\()])/g, "\\$1");

    var objects = [
      "<</Type/Catalog/Pages 2 0 R>>",
      "<</Type/Pages/Kids[3 0 R]/Count 1>>",
      "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842] /Resources<</Font<</F1 5 0 R>>>> /Contents 4 0 R>>",
      null, /* quarto oggetto: flusso di contenuto, costruito sotto */
      "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"
    ];

    var stream = "BT /F1 26 Tf 60 760 Td (" + safeTitle + ") Tj ET";
    objects[3] = "<</Length " + stream.length + ">>\nstream\n" + stream + "\nendstream";

    var body = "%PDF-1.4\n";
    var offsets = [];

    objects.forEach(function (content, index) {
      offsets.push(body.length);
      body += (index + 1) + " 0 obj\n" + content + "\nendobj\n";
    });

    var xrefOffset = body.length;
    var xref = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";

    offsets.forEach(function (offset) {
      xref += ("0000000000" + offset).slice(-10) + " 00000 n \n";
    });

    body += xref +
      "trailer\n<</Size " + (objects.length + 1) + " /Root 1 0 R>>\n" +
      "startxref\n" + xrefOffset + "\n%%EOF";

    return body;
  }

  function demoScore(folderId, title, stamp) {
    var pdf = buildDemoPdf(title);
    return {
      id: newId("sco"),
      folderId: folderId || null,
      name: title + ".pdf",
      size: pdf.length,
      mime: "application/pdf",
      content: "data:application/pdf;base64," + window.btoa(pdf),
      createdAt: stamp,
      updatedAt: stamp
    };
  }

  /* Archivio dimostrativo: creato solo alla prima apertura, poi
     modificabile dall'amministratore come i dati reali. */
  function ensureDemoArchive() {
    if (readRaw(STORAGE.folders) !== null) return;

    var stamp = new Date().toISOString();

    var folders = [
      { id: "fld_demo_concerti", name: "Concerti", parentId: null, createdAt: stamp, updatedAt: stamp },
      { id: "fld_demo_prove", name: "Prove", parentId: null, createdAt: stamp, updatedAt: stamp },
      { id: "fld_demo_archivio", name: "Archivio storico", parentId: null, createdAt: stamp, updatedAt: stamp },
      { id: "fld_demo_natale", name: "Concerto di Natale", parentId: "fld_demo_concerti", createdAt: stamp, updatedAt: stamp }
    ];

    var files = [
      demoScore(null, "Esercizi di warm-up", stamp),
      demoScore("fld_demo_concerti", "Programma concerti", stamp),
      demoScore("fld_demo_natale", "Ordine del concerto", stamp),
      demoScore("fld_demo_prove", "Punto di partenza", stamp)
    ];

    /* Le due scritture sostituiscono interamente le chiavi: un
       eventuale errore di quota viene riprovato alla lettura
       successiva senza duplicare i record. */
    writeRaw(STORAGE.scores, JSON.stringify(files));
    writeRaw(STORAGE.folders, JSON.stringify(folders));
  }

  function getFolders() {
    return delay(null, MOCK_DELAY).then(function () {
      ensureDemoArchive();

      var folders = readCollection(STORAGE.folders);
      var scores = readCollection(STORAGE.scores);
      var subCount = {};
      var fileCount = {};

      folders.forEach(function (folder) {
        var parent = folder.parentId || "";
        subCount[parent] = (subCount[parent] || 0) + 1;
      });

      scores.forEach(function (file) {
        var parent = file.folderId || "";
        fileCount[parent] = (fileCount[parent] || 0) + 1;
      });

      return folders.map(function (folder) {
        return {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId || null,
          subfolderCount: subCount[folder.id] || 0,
          fileCount: fileCount[folder.id] || 0,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt
        };
      }).sort(byName);
    });
  }

  function getScores(folderId) {
    return delay(null, MOCK_DELAY).then(function () {
      ensureDemoArchive();

      var id = folderId || null;
      var files = readCollection(STORAGE.scores).filter(function (file) {
        return (file.folderId || null) === id;
      });

      files.sort(byName);
      return { folderId: id, files: files.map(stripContent) };
    });
  }

  function createFolder(payload) {
    return delay(null, WRITE_DELAY).then(function () {
      ensureDemoArchive();

      var source = payload || {};
      var name = normalizeFolderName(source.name);
      if (!name) return null;

      var stamp = new Date().toISOString();
      var folder = {
        id: newId("fld"),
        name: name,
        parentId: source.parentId || null,
        createdAt: stamp,
        updatedAt: stamp
      };

      var list = readCollection(STORAGE.folders);
      list.push(folder);
      return writeRaw(STORAGE.folders, JSON.stringify(list)) ? folder : null;
    });
  }

  function renameFolder(id, name) {
    return delay(null, WRITE_DELAY).then(function () {
      ensureDemoArchive();

      var value = normalizeFolderName(name);
      if (!value) return null;

      var list = readCollection(STORAGE.folders);
      var updated = null;

      list.forEach(function (folder) {
        if (folder.id === id) {
          folder.name = value;
          folder.updatedAt = new Date().toISOString();
          updated = folder;
        }
      });

      if (!updated) return null;
      return writeRaw(STORAGE.folders, JSON.stringify(list)) ? updated : null;
    });
  }

  /* Elimina la cartella, le sottocartelle e tutti i PDF che
     contengono, con un solo intervento. */
  function deleteFolder(id) {
    return delay(null, WRITE_DELAY).then(function () {
      ensureDemoArchive();

      var folders = readCollection(STORAGE.folders);
      var doomed = {};

      (function collect(current) {
        doomed[current] = true;
        folders.forEach(function (folder) {
          if ((folder.parentId || null) === current) collect(folder.id);
        });
      })(id);

      var nextFolders = folders.filter(function (folder) {
        return !doomed[folder.id];
      });

      if (nextFolders.length === folders.length) return false;

      var scores = readCollection(STORAGE.scores).filter(function (file) {
        return !doomed[file.folderId || ""];
      });

      writeRaw(STORAGE.scores, JSON.stringify(scores));
      writeRaw(STORAGE.folders, JSON.stringify(nextFolders));
      return true;
    });
  }

  function createScore(payload) {
    return delay(null, WRITE_DELAY).then(function () {
      ensureDemoArchive();

      var source = payload || {};
      if (source.size != null && Number(source.size) > MAX_SCORE_BYTES) return null;

      var stamp = new Date().toISOString();
      var record = {
        id: newId("sco"),
        folderId: source.folderId || null,
        name: normalizeFileName(source.name),
        size: Math.max(0, parseInt(source.size, 10) || 0),
        mime: "application/pdf",
        content: typeof source.content === "string" && source.content ? source.content : null,
        createdAt: stamp,
        updatedAt: stamp
      };

      var list = readCollection(STORAGE.scores);
      list.push(record);
      return writeRaw(STORAGE.scores, JSON.stringify(list)) ? stripContent(record) : null;
    });
  }

  function renameScore(id, name) {
    return delay(null, WRITE_DELAY).then(function () {
      ensureDemoArchive();

      var value = normalizeFileName(name);
      if (!value || value === ".pdf") return null;

      var list = readCollection(STORAGE.scores);
      var updated = null;

      list.forEach(function (file) {
        if (file.id === id) {
          file.name = value;
          file.updatedAt = new Date().toISOString();
          updated = file;
        }
      });

      if (!updated) return null;
      return writeRaw(STORAGE.scores, JSON.stringify(list)) ? stripContent(updated) : null;
    });
  }

  function deleteScore(id) {
    return delay(null, WRITE_DELAY).then(function () {
      ensureDemoArchive();

      var list = readCollection(STORAGE.scores);
      var next = list.filter(function (file) {
        return file.id !== id;
      });

      if (next.length === list.length) return false;
      writeRaw(STORAGE.scores, JSON.stringify(next));
      return true;
    });
  }

  /* Contenuto di un PDF (data URL), usato per apertura e download. */
  function getScoreContent(id) {
    return delay(null, 160).then(function () {
      var list = readCollection(STORAGE.scores);

      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i].content || null;
      }
      return null;
    });
  }

  /* ----------------------------------------------------------
   * Push: sottoscrizioni per dispositivo (Fase 6)
   * -------------------------------------------------------- */
  /* Identificativo stabile di questa installazione: servira per
   * collegare piu dispositivi allo stesso account quando il backend
   * reale sara attivo. */
  function getDeviceId() {
    var id = readRaw(STORAGE.deviceId);
    if (!id) {
      id = newId("dev");
      writeRaw(STORAGE.deviceId, id);
    }
    return id;
  }

  function savePushSubscription(subscription) {
    if (!subscription) return delay(false, 160);

    var data =
      typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;

    if (!data || !data.endpoint) return delay(false, 160);

    var list = readCollection(STORAGE.pushSubscriptions).filter(function (item) {
      return item.endpoint !== data.endpoint;
    });

    list.push({
      endpoint: data.endpoint,
      expirationTime: data.expirationTime || null,
      keys: data.keys || null,
      deviceId: getDeviceId(),
      userAgent: (window.navigator && window.navigator.userAgent) || "",
      updatedAt: Date.now()
    });

    writeRaw(STORAGE.pushSubscriptions, JSON.stringify(list));
    return delay(true, 160);
  }

  function removePushSubscription(endpoint) {
    if (!endpoint) return delay(false, 160);

    var list = readCollection(STORAGE.pushSubscriptions).filter(function (item) {
      return item.endpoint !== endpoint;
    });

    writeRaw(STORAGE.pushSubscriptions, JSON.stringify(list));
    return delay(true, 160);
  }

  function getPushSubscriptions() {
    return delay(readCollection(STORAGE.pushSubscriptions), 120);
  }

  return {
    BASE_URL: BASE_URL,
    isMock: function () {
      return USE_MOCK;
    },
    request: request,
    getEvents: getEvents,
    getEvent: getEvent,
    createEvent: createEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    getMembers: getMembers,
    syncLocalMember: syncLocalMember,
    isDemoMode: isDemoMode,
    setDemoMode: setDemoMode,
    getPresences: getPresences,
    getPresence: getPresence,
    savePresence: savePresence,
    getAttendanceSummary: getAttendanceSummary,
    getAttendanceOverviews: getAttendanceOverviews,
    getFolders: getFolders,
    getScores: getScores,
    createFolder: createFolder,
    renameFolder: renameFolder,
    deleteFolder: deleteFolder,
    createScore: createScore,
    renameScore: renameScore,
    deleteScore: deleteScore,
    getScoreContent: getScoreContent,
    getDeviceId: getDeviceId,
    savePushSubscription: savePushSubscription,
    removePushSubscription: removePushSubscription,
    getPushSubscriptions: getPushSubscriptions,
    MAX_SCORE_BYTES: MAX_SCORE_BYTES
  };
})();
