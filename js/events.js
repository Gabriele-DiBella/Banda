/* =============================================================
 * Banda - events.js
 * Sezione Eventi: lista, dettaglio, conferma presenza, nota
 * personale e gestione (creazione, modifica, eliminazione) per
 * gli amministratori.
 * ============================================================= */

window.Events = (function () {
  "use strict";

  var state = {
    list: [],
    presences: {},
    overviews: {},
    promise: null,
    pane: "list",
    currentId: null,
    formMode: "create",
    editingId: null
  };

  var el = {};
  var onDataChanged = null;

  /* ----------------------------------------------------------
   * Inizializzazione
   * -------------------------------------------------------- */
  function init(options) {
    var opts = options || {};
    onDataChanged = typeof opts.onDataChanged === "function" ? opts.onDataChanged : null;

    cacheDom();
    bind();
  }

  function cacheDom() {
    el.list = UI.byId("events-list");
    el.empty = UI.byId("events-empty");
    el.newButton = UI.byId("btn-new-event");
    el.detail = UI.byId("event-detail");
    el.backButton = UI.byId("btn-event-back");
    el.form = UI.byId("event-form");
    el.formTitle = UI.byId("event-form-title");
    el.formBack = UI.byId("btn-event-form-back");
    el.formSave = UI.byId("event-form-save");
    el.title = UI.byId("event-title");
    el.date = UI.byId("event-date");
    el.time = UI.byId("event-time");
    el.location = UI.byId("event-location");
    el.setlist = UI.byId("event-setlist");
    el.notes = UI.byId("event-notes");
    el.homeList = UI.byId("home-events");
    el.homeEmpty = UI.byId("home-events-empty");
    el.homeBadge = UI.byId("home-events-badge");
  }

  function bind() {
    if (el.newButton) {
      el.newButton.addEventListener("click", function () {
        openForm("create", null);
      });
    }

    if (el.backButton) {
      el.backButton.addEventListener("click", function () {
        setPane("list");
      });
    }

    if (el.formBack) {
      el.formBack.addEventListener("click", function () {
        if (state.formMode === "edit" && state.editingId) openDetail(state.editingId);
        else setPane("list");
      });
    }

    if (el.form) {
      el.form.addEventListener("submit", function (event) {
        event.preventDefault();
        submitForm();
      });
    }

    ["event-title", "event-date", "event-time"].forEach(function (id) {
      var node = UI.byId(id);
      if (node) {
        node.addEventListener("input", function () {
          UI.clearFieldError(id);
        });
      }
    });
  }

  function notifyDataChanged() {
    if (onDataChanged) onDataChanged();
  }

  /* ----------------------------------------------------------
   * Dati
   * -------------------------------------------------------- */
  function load(options) {
    var opts = options || {};

    if (opts.showLoader) UI.showLoader("Caricamento eventi");

    var tasks = [API.getEvents(), API.getPresences()];
    if (Auth.isAdmin()) tasks.push(API.getAttendanceOverviews());

    return Promise.all(tasks)
      .then(function (results) {
        state.list = results[0] || [];
        state.presences = results[1] || {};
        state.overviews = results[2] || {};
        if (opts.showLoader) UI.hideLoader();
        refresh();
        return state.list;
      })
      .catch(function () {
        state.promise = null;
        if (opts.showLoader) UI.hideLoader();
        UI.toast("Impossibile caricare gli eventi.", "error");
        return [];
      });
  }

  function ensureLoaded(force) {
    if (force) state.promise = null;
    if (state.promise) return state.promise;

    state.promise = load({ showLoader: true });
    return state.promise;
  }

  function all() {
    return state.list;
  }

  function upcoming() {
    return state.list.filter(function (event) {
      return !Format.isPastEvent(event);
    });
  }

  function past() {
    return state.list.filter(function (event) {
      return Format.isPastEvent(event);
    });
  }

  function find(id) {
    for (var i = 0; i < state.list.length; i++) {
      if (state.list[i].id === id) return state.list[i];
    }
    return null;
  }

  /* Presenza del dispositivo corrente su un evento. */
  function localPresence(eventId) {
    var forEvent = state.presences[eventId] || {};
    return forEvent[Auth.getUserId()] || null;
  }

  function countsFor(eventId) {
    return state.overviews[eventId] || null;
  }

  /* ----------------------------------------------------------
   * Pannelli (lista / dettaglio / form)
   * -------------------------------------------------------- */
  function setPane(name) {
    state.pane = name;

    var root = UI.qs('[data-view="events"]');
    UI.qsa("[data-pane]", root).forEach(function (pane) {
      var active = pane.dataset.pane === name;
      pane.hidden = !active;
      pane.classList.toggle("pane--active", active);
    });

    var viewport = UI.byId("viewport");
    if (viewport) viewport.scrollTop = 0;
  }

  function onViewEnter() {
    ensureLoaded();
    setPane("list");
  }

  function renderAdminControls() {
    if (el.newButton) el.newButton.hidden = !Auth.isAdmin();
  }

  function refresh() {
    renderAdminControls();
    renderList();
    renderHome();
    if (state.pane === "detail") renderDetail();
    notifyDataChanged();
  }

  /* ----------------------------------------------------------
   * Lista eventi
   * -------------------------------------------------------- */
  function buildCard(event) {
    var card = UI.create("button", "event-card");
    card.type = "button";
    card.dataset.eventId = event.id;

    var parts = Format.parseDateParts(event.date);
    var dateBox = UI.create("div", "event-card__date");
    dateBox.appendChild(UI.create("span", "event-card__day", parts ? String(parts.d) : "--"));
    dateBox.appendChild(UI.create("span", "event-card__month", parts ? Format.monthShort(parts.m) : ""));

    var body = UI.create("div", "event-card__body");
    body.appendChild(UI.create("p", "event-card__title", event.title || "Evento"));
    body.appendChild(UI.create("p", "event-card__meta", Format.formatEventDateTime(event)));
    if (event.location) body.appendChild(UI.create("p", "event-card__meta", event.location));

    var foot = UI.create("div", "event-card__foot");
    foot.appendChild(Format.buildStatusBadge(localPresence(event.id)));

    var counts = countsFor(event.id);
    if (Auth.isAdmin() && counts) {
      foot.appendChild(UI.create("span", "status status--count",
        counts.responded + "/" + counts.total + " risposte"));
    }

    body.appendChild(foot);
    card.appendChild(dateBox);
    card.appendChild(body);

    card.addEventListener("click", function () {
      openDetail(event.id);
    });

    return card;
  }

  function renderGroup(label, list) {
    var group = UI.create("div", "event-group");
    group.appendChild(UI.create("p", "event-group__label", label));
    list.forEach(function (event) {
      group.appendChild(buildCard(event));
    });
    return group;
  }

  function renderList() {
    if (!el.list) return;

    UI.clear(el.list);
    if (el.empty) el.empty.hidden = state.list.length > 0;

    var next = upcoming();
    var done = past();

    if (next.length) el.list.appendChild(renderGroup("In programma", next));
    if (done.length) el.list.appendChild(renderGroup("Conclusi", done));
  }

  function renderHome() {
    if (!el.homeList) return;

    UI.clear(el.homeList);

    var next = upcoming();
    var top = next.slice(0, 3);

    if (el.homeBadge) el.homeBadge.textContent = String(next.length);
    if (el.homeEmpty) el.homeEmpty.hidden = top.length > 0;

    top.forEach(function (event) {
      var row = UI.create("button", "event-row");
      row.type = "button";

      var text = UI.create("div", "event-row__text");
      text.appendChild(UI.create("p", "event-row__title", event.title || "Evento"));

      var meta = Format.formatEventDate(event.date);
      if (event.time) meta += " - " + event.time;
      if (event.location) meta += " - " + event.location;
      text.appendChild(UI.create("p", "event-row__meta", meta));

      row.appendChild(text);
      row.appendChild(Format.buildStatusBadge(localPresence(event.id)));

      row.addEventListener("click", function () {
        if (window.App && App.setActiveView) App.setActiveView("events");
        openDetail(event.id);
      });

      el.homeList.appendChild(row);
    });
  }

  /* ----------------------------------------------------------
   * Dettaglio evento
   * -------------------------------------------------------- */
  function openDetail(id) {
    state.currentId = id;
    renderDetail();
    setPane("detail");
  }

  function buildSection(title) {
    var section = UI.create("section", "detail__section");
    section.appendChild(UI.create("h3", "detail__section-title", title));
    return section;
  }

  function renderDetail() {
    if (!el.detail) return;

    UI.clear(el.detail);

    var event = find(state.currentId);
    if (!event) {
      el.detail.appendChild(UI.create("p", "detail__text", "Evento non disponibile."));
      return;
    }

    var presence = localPresence(event.id);
    var detail = UI.create("div", "detail");

    detail.appendChild(UI.create("h2", "detail__title", event.title || "Evento"));
    detail.appendChild(UI.create("p", "detail__meta", Format.formatEventDateTime(event)));
    if (event.location) detail.appendChild(UI.create("p", "detail__meta", event.location));

    /* --- Conferma presenza --- */
    var presenceSection = buildSection("La tua presenza");

    var presenceBox = UI.create("div", "presence");
    ["yes", "no"].forEach(function (status) {
      var button = UI.create("button", "presence__btn", Format.presenceLabel(status));
      button.type = "button";
      button.dataset.status = status;
      if (presence && presence.status === status) {
        button.classList.add(status === "yes" ? "is-yes" : "is-no");
      }
      button.addEventListener("click", function () {
        setPresence(status);
      });
      presenceBox.appendChild(button);
    });
    presenceSection.appendChild(presenceBox);

    var noteField = UI.create("div", "field");
    var noteLabel = UI.create("label", "field__label", "Nota personale");
    noteLabel.setAttribute("for", "event-personal-note");

    var noteInput = UI.create("textarea", "field__input field__input--area");
    noteInput.id = "event-personal-note";
    noteInput.rows = 2;
    noteInput.placeholder = "Es. arrivo in ritardo";
    noteInput.value = (presence && presence.note) || "";

    var noteSave = UI.create("button", "btn btn--ghost btn--block", "Salva nota");
    noteSave.type = "button";
    noteSave.id = "event-note-save";
    noteSave.addEventListener("click", function () {
      saveNote(noteInput.value);
    });

    noteField.appendChild(noteLabel);
    noteField.appendChild(noteInput);
    noteField.appendChild(noteSave);
    presenceSection.appendChild(noteField);
    detail.appendChild(presenceSection);

    /* --- Scaletta --- */
    var setlistLines = String(event.setlist || "")
      .split(/\r?\n/)
      .filter(function (line) {
        return line.trim().length > 0;
      });

    if (setlistLines.length) {
      var setlistSection = buildSection("Scaletta");
      var list = UI.create("ol", "setlist");
      setlistLines.forEach(function (line) {
        list.appendChild(UI.create("li", null, line.trim()));
      });
      setlistSection.appendChild(list);
      detail.appendChild(setlistSection);
    }

    /* --- Note dell'evento --- */
    if (String(event.notes || "").trim()) {
      var notesSection = buildSection("Note");
      notesSection.appendChild(UI.create("p", "detail__text", event.notes));
      detail.appendChild(notesSection);
    }

    /* --- Riepilogo presenze e azioni (amministratori) --- */
    if (Auth.isAdmin()) {
      var counts = countsFor(event.id);
      var summarySection = buildSection("Presenze");

      var summaryText = counts
        ? counts.yes + " presenti, " + counts.no + " assenti, " + counts.pending +
          " in attesa su " + counts.total + " membri."
        : "Riepilogo non disponibile.";
      summarySection.appendChild(UI.create("p", "detail__text", summaryText));

      var openSummary = UI.create("button", "btn btn--ghost btn--block", "Apri il riepilogo presenze");
      openSummary.type = "button";
      openSummary.addEventListener("click", function () {
        if (window.App && App.openAttendance) App.openAttendance(event.id);
      });
      summarySection.appendChild(openSummary);
      detail.appendChild(summarySection);

      var actions = UI.create("div", "detail__actions");

      var editButton = UI.create("button", "btn btn--ghost", "Modifica");
      editButton.type = "button";
      editButton.addEventListener("click", function () {
        openForm("edit", event);
      });

      var deleteButton = UI.create("button", "btn btn--danger", "Elimina");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", function () {
        confirmDelete(event);
      });

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      detail.appendChild(actions);
    }

    el.detail.appendChild(detail);
  }

  /* ----------------------------------------------------------
   * Presenza e nota personale
   * -------------------------------------------------------- */
  function reloadSilently() {
    state.promise = null;
    return load({});
  }

  function setPresence(status) {
    var event = find(state.currentId);
    if (!event) return;

    var memberId = Auth.getUserId();
    if (!memberId) {
      UI.toast("Profilo non disponibile su questo dispositivo.", "error");
      return;
    }

    var buttons = UI.qsa("#event-detail .presence__btn");
    buttons.forEach(function (button) {
      button.disabled = true;
      button.classList.remove("is-yes", "is-no");
      if (button.dataset.status === status) {
        button.classList.add(status === "yes" ? "is-yes" : "is-no");
      }
    });

    API.savePresence(event.id, memberId, { status: status })
      .then(function () {
        UI.toast(status === "yes" ? "Presenza confermata." : "Assenza registrata.", "success");
        return reloadSilently();
      })
      .catch(function () {
        UI.toast("Salvataggio non riuscito.", "error");
        renderDetail();
      });
  }

  function saveNote(text) {
    var event = find(state.currentId);
    if (!event) return;

    var memberId = Auth.getUserId();
    if (!memberId) {
      UI.toast("Profilo non disponibile su questo dispositivo.", "error");
      return;
    }

    var button = UI.byId("event-note-save");
    UI.setButtonLoading(button, true);

    API.savePresence(event.id, memberId, { note: text || "" })
      .then(function () {
        UI.setButtonLoading(button, false);
        UI.toast("Nota salvata.", "success");
        return reloadSilently();
      })
      .catch(function () {
        UI.setButtonLoading(button, false);
        UI.toast("Salvataggio non riuscito.", "error");
      });
  }

  /* ----------------------------------------------------------
   * Creazione / modifica evento (amministratori)
   * -------------------------------------------------------- */
  function openForm(mode, event) {
    state.formMode = mode;
    state.editingId = event ? event.id : null;

    UI.clearAllFieldErrors("event-form");

    if (el.formTitle) {
      el.formTitle.textContent = mode === "edit" ? "Modifica evento" : "Nuovo evento";
    }
    if (el.formSave) {
      el.formSave.textContent = mode === "edit" ? "Salva modifiche" : "Pubblica evento";
    }

    el.title.value = event ? event.title || "" : "";
    el.date.value = event ? event.date || "" : "";
    el.time.value = event ? event.time || "" : "";
    el.location.value = event ? event.location || "" : "";
    el.setlist.value = event ? event.setlist || "" : "";
    el.notes.value = event ? event.notes || "" : "";

    setPane("form");
  }

  function validateTitle() {
    var value = (el.title && el.title.value ? el.title.value : "").trim();

    if (value.length < 2) {
      UI.setFieldError("event-title", "Inserisci un titolo valido (minimo 2 caratteri).");
      return null;
    }

    UI.clearFieldError("event-title");
    return value;
  }

  function submitForm() {
    var title = validateTitle();
    var date = (el.date.value || "").trim();
    var time = (el.time.value || "").trim();

    if (!title) return;

    if (!date) {
      UI.setFieldError("event-date", "Indica la data dell'evento.");
      return;
    }
    UI.clearFieldError("event-date");

    if (!time) {
      UI.setFieldError("event-time", "Indica l'orario di ritrovo.");
      return;
    }
    UI.clearFieldError("event-time");

    var payload = {
      title: title,
      date: date,
      time: time,
      location: (el.location.value || "").trim(),
      setlist: el.setlist.value || "",
      notes: el.notes.value || ""
    };

    var isEdit = state.formMode === "edit";
    UI.setButtonLoading(el.formSave, true);

    var action = isEdit
      ? API.updateEvent(state.editingId, payload)
      : API.createEvent(payload);

    action
      .then(function (saved) {
        if (!saved) {
          UI.setButtonLoading(el.formSave, false);
          UI.toast("Salvataggio non riuscito.", "error");
          return null;
        }

        UI.toast(isEdit ? "Evento aggiornato." : "Evento pubblicato.", "success");

        return reloadSilently().then(function () {
          UI.setButtonLoading(el.formSave, false);

          if (isEdit) {
            openDetail(saved.id);
          } else {
            setPane("list");
            notifyNewEvent(saved);
          }
        });
      })
      .catch(function () {
        UI.setButtonLoading(el.formSave, false);
        UI.toast("Salvataggio non riuscito.", "error");
      });
  }

  /* ----------------------------------------------------------
   * Eliminazione evento e notifica di pubblicazione
   * -------------------------------------------------------- */
  function confirmDelete(event) {
    UI.confirm({
      title: "Eliminare l'evento?",
      text: '"' + (event.title || "Evento") + '" verra rimosso per tutti i membri.',
      confirmLabel: "Elimina",
      cancelLabel: "Annulla",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;

      UI.showLoader("Eliminazione");

      API.deleteEvent(event.id)
        .then(function () {
          state.currentId = null;
          return reloadSilently();
        })
        .then(function () {
          UI.hideLoader();
          UI.toast("Evento eliminato.", "info");
          setPane("list");
        })
        .catch(function () {
          UI.hideLoader();
          UI.toast("Eliminazione non riuscita.", "error");
        });
    });
  }

  /* L'invio push ai membri avverra dal backend: qui viene mostrata una
     notifica locale se i permessi sono attivi sul dispositivo. */
  function notifyNewEvent(event) {
    var body = Format.formatEventDateTime(event);
    if (event.location) body += " - " + event.location;

    PushManager.showLocalNotification({
      title: event.title || "Nuovo evento",
      body: body,
      tag: event.id,
      data: { url: "./index.html?view=events" }
    }).then(function (shown) {
      if (!shown) UI.toast("Notifiche non attive su questo dispositivo.", "info");
    });
  }

  return {
    init: init,
    onViewEnter: onViewEnter,
    ensureLoaded: ensureLoaded,
    refresh: refresh,
    renderHome: renderHome,
    openDetail: openDetail,
    all: all,
    upcoming: upcoming,
    countsFor: countsFor
  };
})();
