/* =============================================================
 * Banda - attendance.js
 * Fase 4: dashboard presenze per gli amministratori.
 * Mostra, per ogni evento, quante persone hanno risposto e
 * l'elenco dei membri diviso tra presenti, assenti e in attesa.
 * ============================================================= */

window.Attendance = (function () {
  "use strict";

  var state = {
    loaded: false,
    events: [],
    members: [],
    overviews: {},
    summary: null,
    selectedId: null
  };

  var el = {};

  /* ----------------------------------------------------------
   * Inizializzazione
   * -------------------------------------------------------- */
  function init() {
    cacheDom();
    bind();
  }

  function cacheDom() {
    el.picker = UI.byId("attendance-events");
    el.empty = UI.byId("attendance-empty");
    el.panel = UI.byId("attendance-panel");
    el.demo = UI.byId("attendance-demo");
    el.demoBadge = UI.byId("attendance-demo-badge");
    el.demoButton = UI.byId("btn-demo-toggle");
  }

  function bind() {
    if (el.demoButton) {
      el.demoButton.addEventListener("click", toggleDemo);
    }
  }

  /* ----------------------------------------------------------
   * Dati
   * -------------------------------------------------------- */
  function findEvent(id) {
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].id === id) return state.events[i];
    }
    return null;
  }

  function pickDefaultEvent() {
    var upcoming = state.events.filter(function (event) {
      return !Format.isPastEvent(event);
    });

    if (upcoming.length) return upcoming[0].id;
    if (state.events.length) return state.events[state.events.length - 1].id;
    return null;
  }

  function load(options) {
    var opts = options || {};
    if (opts.showLoader) UI.showLoader("Caricamento presenze");

    return Promise.all([API.getEvents(), API.getMembers(), API.getAttendanceOverviews()])
      .then(function (results) {
        state.events = results[0] || [];
        state.members = results[1] || [];
        state.overviews = results[2] || {};
        state.loaded = true;

        if (!state.selectedId || !findEvent(state.selectedId)) {
          state.selectedId = pickDefaultEvent();
        }

        return loadSummary();
      })
      .then(function () {
        if (opts.showLoader) UI.hideLoader();
        return state;
      })
      .catch(function () {
        if (opts.showLoader) UI.hideLoader();
        UI.toast("Impossibile caricare il riepilogo presenze.", "error");
        return state;
      });
  }

  function loadSummary() {
    if (!state.selectedId) {
      state.summary = null;
      return Promise.resolve(null);
    }

    return API.getAttendanceSummary(state.selectedId).then(function (summary) {
      state.summary = summary;
      return summary;
    });
  }

  function onViewEnter(eventId) {
    /* Il chiamante può indicare l'evento di riferimento anche prima
       che questa sezione abbia caricato i suoi dati. */
    if (eventId) state.selectedId = eventId;

    if (!state.loaded) {
      return load({ showLoader: true, silent: true }).then(render);
    }

    return load().then(render);
  }

  /* Richiamato quando gli eventi cambiano altrove nell'app. */
  function refresh() {
    if (!state.loaded) return Promise.resolve();

    state.loaded = false;
    return load().then(function () {
      if (UI.getCurrentScreenId() === "screen-main") render();
    });
  }

  function selectEvent(id) {
    state.selectedId = id;
    load().then(render);
  }

  function toggleDemo() {
    var enabled = !API.isDemoMode();
    API.setDemoMode(enabled);
    UI.toast(
      enabled ? "Dati dimostrativi riattivati." : "Dati dimostrativi rimossi.",
      "info"
    );
    load().then(render);
  }

  /* ----------------------------------------------------------
   * Rendering
   * -------------------------------------------------------- */
  function render() {
    renderPicker();
    renderDemoBar();
    renderPanel();
  }

  function countLabel(counts) {
    if (!counts) return "0/0";
    return counts.responded + "/" + counts.total;
  }

  function renderPicker() {
    if (!el.picker) return;

    UI.clear(el.picker);

    if (el.empty) el.empty.hidden = state.events.length > 0;
    if (!state.events.length) return;

    state.events.forEach(function (event) {
      var row = UI.create("button", "event-row");
      row.type = "button";
      if (event.id === state.selectedId) row.classList.add("event-row--active");

      var text = UI.create("div", "event-row__text");
      text.appendChild(UI.create("p", "event-row__title", event.title || "Evento"));
      text.appendChild(UI.create("p", "event-row__meta", Format.formatEventDateTime(event)));

      row.appendChild(text);
      row.appendChild(UI.create("span", "status status--count", countLabel(state.overviews[event.id])));

      row.addEventListener("click", function () {
        selectEvent(event.id);
      });

      el.picker.appendChild(row);
    });
  }

  function renderDemoBar() {
    if (!el.demo) return;

    var enabled = API.isDemoMode();
    el.demo.hidden = false;

    if (el.demoBadge) el.demoBadge.textContent = enabled ? "Attivi" : "Disattivati";
    if (el.demoButton) {
      el.demoButton.textContent = enabled
        ? "Rimuovi dati dimostrativi"
        : "Mostra dati dimostrativi";
    }
  }

  function buildCounter(value, label, variant) {
    var box = UI.create("div", "counter" + (variant ? " counter--" + variant : ""));
    box.appendChild(UI.create("span", "counter__value", String(value)));
    box.appendChild(UI.create("span", "counter__label", label));
    return box;
  }

  function buildBar(counts) {
    var bar = UI.create("div", "cbar");

    [
      { variant: "yes", value: counts.yes },
      { variant: "no", value: counts.no },
      { variant: "pending", value: counts.pending }
    ].forEach(function (part) {
      if (!part.value) return;
      var segment = UI.create("span", "cbar__part cbar__part--" + part.variant);
      segment.style.width = Format.percent(part.value, counts.total) + "%";
      bar.appendChild(segment);
    });

    return bar;
  }

  function buildMemberRow(entry) {
    var member = entry.member;
    var row = UI.create("div", "member");

    row.appendChild(UI.create("span", "member__dot member__dot--" + (entry.status || "pending")));

    var text = UI.create("div", "member__text");
    text.appendChild(UI.create("p", "member__name", Format.fullName(member) || "Membro"));

    var instruments = (member.instruments || []).join(", ");
    if (instruments) text.appendChild(UI.create("p", "member__meta", instruments));
    if (entry.note) text.appendChild(UI.create("p", "member__note", entry.note));

    row.appendChild(text);

    if (member.local) row.appendChild(UI.create("span", "member__tag", "Tu"));

    return row;
  }

  function buildMemberGroup(title, entries, emptyText) {
    var section = UI.create("section", "detail__section");
    section.appendChild(UI.create("h4", "detail__section-title", title + " (" + entries.length + ")"));

    if (!entries.length) {
      section.appendChild(UI.create("p", "detail__text", emptyText));
      return section;
    }

    var list = UI.create("div", "member-list");
    entries.forEach(function (entry) {
      list.appendChild(buildMemberRow(entry));
    });
    section.appendChild(list);

    return section;
  }

  function renderPanel() {
    if (!el.panel) return;

    UI.clear(el.panel);

    var event = findEvent(state.selectedId);
    var summary = state.summary;

    if (!event || !summary) {
      el.panel.appendChild(UI.create("p", "detail__text", "Seleziona un evento per vedere il riepilogo."));
      return;
    }

    var counts = summary.counts;
    var panel = UI.create("div", "detail");

    panel.appendChild(UI.create("h3", "detail__title", event.title || "Evento"));
    panel.appendChild(UI.create("p", "detail__meta", Format.formatEventDateTime(event)));
    if (event.location) panel.appendChild(UI.create("p", "detail__meta", event.location));

    var counters = UI.create("div", "counters");
    counters.appendChild(buildCounter(counts.yes, "Presenti", "yes"));
    counters.appendChild(buildCounter(counts.no, "Assenti", "no"));
    counters.appendChild(buildCounter(counts.pending, "In attesa", "pending"));
    panel.appendChild(counters);

    panel.appendChild(buildBar(counts));

    panel.appendChild(UI.create("p", "detail__text",
      counts.responded + " risposte su " + counts.total + " membri (" +
      Format.percent(counts.responded, counts.total) + "%)."));

    panel.appendChild(buildMemberGroup("Presenti", summary.present, "Nessuna conferma."));
    panel.appendChild(buildMemberGroup("Assenti", summary.absent, "Nessuna assenza."));
    panel.appendChild(buildMemberGroup("In attesa", summary.pending, "Tutti hanno risposto."));

    el.panel.appendChild(panel);
  }

  return {
    init: init,
    onViewEnter: onViewEnter,
    refresh: refresh,
    selectEvent: selectEvent,
    render: render
  };
})();
