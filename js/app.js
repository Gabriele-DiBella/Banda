/* =============================================================
 * Banda - app.js
 * Avvio dell'applicazione: splash, onboarding, gate notifiche,
 * navigazione tra le viste, sezione Profilo e installazione PWA.
 * Le sezioni Eventi e Presenze vivono nei moduli dedicati
 * (js/events.js e js/attendance.js).
 * ============================================================= */

window.App = (function () {
  "use strict";

  var SPLASH_MIN_MS = 900;
  var DEFAULT_VIEW = "home";
  var VIEWS = ["home", "events", "scores", "attendance", "profile"];

  var state = {
    step: 1,
    draft: { firstName: "", lastName: "", email: "", instruments: [] },
    view: DEFAULT_VIEW,
    pendingAttendanceEvent: null
  };

  var el = {};
  var initialized = false;

  /* ----------------------------------------------------------
   * Riferimenti DOM
   * -------------------------------------------------------- */
  function cacheDom() {
    el.onbProgressBar = UI.byId("onb-progress-bar");
    el.onbStepLabel = UI.byId("onb-step-label");
    el.onbPanel1 = UI.qs('.onb__panel[data-step="1"]');
    el.onbPanel2 = UI.qs('.onb__panel[data-step="2"]');

    el.onbFormIdentity = UI.byId("onb-form-identity");
    el.onbFirstName = UI.byId("onb-first-name");
    el.onbLastName = UI.byId("onb-last-name");
    el.onbEmail = UI.byId("onb-email");
    el.onbInstruments = UI.byId("onb-instruments");
    el.onbInstrumentsBack = UI.byId("onb-instruments-back");
    el.onbInstrumentsConfirm = UI.byId("onb-instruments-confirm");

    el.accessForm = UI.byId("access-form");
    el.accessCode = UI.byId("access-code");

    el.gateEnable = UI.byId("gate-enable");
    el.gateContinue = UI.byId("gate-continue");
    el.gateStatus = UI.byId("gate-status");
    el.gateStatusText = UI.byId("gate-status-text");
    el.gateHint = UI.byId("gate-hint");

    el.installPanel = UI.byId("install-panel");
    el.btnInstall = UI.byId("btn-install");

    el.topbarInitials = UI.byId("topbar-initials");
    el.topbarName = UI.byId("topbar-name");
    el.topbarRole = UI.byId("topbar-role");
    el.btnOpenProfile = UI.byId("btn-open-profile");

    el.statInstruments = UI.byId("stat-instruments");
    el.statEvents = UI.byId("stat-events");
    el.statNotifications = UI.byId("stat-notifications");

    el.profileForm = UI.byId("profile-form");
    el.profileFirstName = UI.byId("profile-first-name");
    el.profileLastName = UI.byId("profile-last-name");
    el.profileEmail = UI.byId("profile-email");
    el.profileInstruments = UI.byId("profile-instruments");
    el.profileRole = UI.byId("profile-role");
    el.btnResetProfile = UI.byId("btn-reset-profile");
    el.btnLogout = UI.byId("btn-logout");

    el.notifBanner = UI.byId("notif-banner");
    el.notifBannerText = UI.byId("notif-banner-text");
    el.notifBannerFix = UI.byId("notif-banner-fix");

    el.tabbar = UI.qs(".tabbar");
    el.tabs = UI.qsa(".tab");
    el.views = UI.qsa(".view");
  }

  /* ----------------------------------------------------------
   * Avvio
   * -------------------------------------------------------- */
  function init() {
    if (initialized) return;
    initialized = true;

    cacheDom();
    Auth.migrate();
    API.syncLocalMember(Auth.getUser());

    bindOnboarding();
    bindAccess();
    bindNotificationGate();
    bindShell();
    bindProfile();

    Events.init({ onDataChanged: handleDataChanged });
    Attendance.init();
    Scores.init();

    updateTabbar();
    UI.showScreen("screen-splash");
    PushManager.registerServiceWorker();

    /* Fase 6: intercettazione revoca permessi e banner persistente. */
    PushManager.onPermissionChange(handlePermissionChange);
    PushManager.startPermissionWatch();

    window.setTimeout(function () {
      if (Auth.hasProfile() && Auth.isLoggedIn()) {
        requireNotifications();
      } else {
        /* Nessun profilo oppure sessione chiusa: accesso solo invito. */
        requireAccess();
      }
    }, SPLASH_MIN_MS);
  }

  /* Richiamato dai moduli quando eventi o presenze cambiano. */
  function handleDataChanged() {
    renderHomeStats();
    Attendance.refresh();
  }

  /* ----------------------------------------------------------
   * Onboarding (nome, cognome, strumenti)
   * -------------------------------------------------------- */
  function startOnboarding() {
    state.step = 1;
    state.draft = { firstName: "", lastName: "", email: "", instruments: [] };

    if (el.onbFirstName) el.onbFirstName.value = "";
    if (el.onbLastName) el.onbLastName.value = "";

    UI.clearAllFieldErrors("screen-onboarding");
    UI.renderInstruments(el.onbInstruments, Auth.INSTRUMENT_GROUPS, [], toggleDraftInstrument);
    setOnboardingStep(1);
    UI.showScreen("screen-onboarding");
  }

  function setOnboardingStep(step) {
    state.step = step;

    if (el.onbProgressBar) el.onbProgressBar.style.width = step === 1 ? "50%" : "100%";
    if (el.onbStepLabel) el.onbStepLabel.textContent = "Passo " + step + " di 2";

    if (step === 1) {
      if (el.onbPanel2) el.onbPanel2.hidden = true;
      if (el.onbPanel1) {
        el.onbPanel1.hidden = false;
        playPanel(el.onbPanel1, "right");
      }
    } else {
      if (el.onbPanel1) el.onbPanel1.hidden = true;
      if (el.onbPanel2) {
        el.onbPanel2.hidden = false;
        playPanel(el.onbPanel2, "left");
      }
    }
  }

  /* Riavvia l'animazione di ingresso del pannello. */
  function playPanel(panel, direction) {
    if (!panel) return;
    panel.style.animation = "none";
    void panel.offsetWidth;
    panel.style.animation = "";
    panel.classList.toggle("onb__panel--enter-left", direction === "left");
  }

  function toggleDraftInstrument(name, isSelected) {
    var list = state.draft.instruments;
    var index = list.indexOf(name);

    if (isSelected && index === -1) list.push(name);
    else if (!isSelected && index !== -1) list.splice(index, 1);
  }

  function validateName(input, inputId, label) {
    var value = (input && input.value ? input.value : "").trim();

    if (value.length < 2) {
      UI.setFieldError(inputId, "Inserisci " + label + " (minimo 2 caratteri).");
      return null;
    }

    UI.clearFieldError(inputId);
    return value;
  }

  /* Email: identificativo univoco dell'account (obbligatoria). */
  function validateEmail(input, inputId, required) {
    var value = (input && input.value ? input.value : "").trim();

    if (!value) {
      if (required) {
        UI.setFieldError(
          inputId,
          "Inserisci un'email: e il tuo identificativo univoco."
        );
        return null;
      }
      UI.clearFieldError(inputId);
      return "";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      UI.setFieldError(inputId, "Inserisci un'email valida.");
      return null;
    }

    UI.clearFieldError(inputId);
    return value.toLowerCase();
  }

  function submitIdentity() {
    var firstName = validateName(el.onbFirstName, "onb-first-name", "un nome valido");
    var lastName = validateName(el.onbLastName, "onb-last-name", "un cognome valido");
    var email = validateEmail(el.onbEmail, "onb-email", true);

    if (!firstName || !lastName || !email) return;

    state.draft.firstName = firstName;
    state.draft.lastName = lastName;
    state.draft.email = email;
    setOnboardingStep(2);
  }

  function submitInstruments() {
    var selected = UI.getSelectedInstruments(el.onbInstruments);

    if (selected.length === 0) {
      UI.setFieldError("onb-instruments", "Seleziona almeno uno strumento.");
      return;
    }
    UI.clearFieldError("onb-instruments");

    state.draft.instruments = selected;
    UI.setButtonLoading(el.onbInstrumentsConfirm, true);
    UI.showLoader("Salvataggio profilo");

    var saved = Auth.saveUser({
      firstName: state.draft.firstName,
      lastName: state.draft.lastName,
      email: state.draft.email,
      instruments: selected,
      role: Auth.ROLES.USER
    });

    window.setTimeout(function () {
      UI.setButtonLoading(el.onbInstrumentsConfirm, false);
      UI.hideLoader();

      if (!saved) {
        UI.toast("Impossibile salvare il profilo su questo dispositivo.", "error");
        return;
      }

      API.syncLocalMember(saved);
      UI.toast("Profilo salvato. Benvenuto!", "success");
      requireNotifications();
    }, 520);
  }

  function bindOnboarding() {
    if (el.onbFormIdentity) {
      el.onbFormIdentity.addEventListener("submit", function (event) {
        event.preventDefault();
        submitIdentity();
      });
    }

    if (el.onbFirstName) {
      el.onbFirstName.addEventListener("input", function () {
        UI.clearFieldError("onb-first-name");
      });
    }

    if (el.onbLastName) {
      el.onbLastName.addEventListener("input", function () {
        UI.clearFieldError("onb-last-name");
      });
    }

    if (el.onbInstrumentsBack) {
      el.onbInstrumentsBack.addEventListener("click", function () {
        setOnboardingStep(1);
      });
    }

    if (el.onbInstrumentsConfirm) {
      el.onbInstrumentsConfirm.addEventListener("click", submitInstruments);
    }

    if (el.onbInstruments) {
      el.onbInstruments.addEventListener("click", function () {
        UI.clearFieldError("onb-instruments");
      });
    }
  }

  /* ----------------------------------------------------------
   * Gate notifiche
   * -------------------------------------------------------- */
  /* ----------------------------------------------------------
   * Accesso riservato (solo invito)
   * -------------------------------------------------------- */
  /* Nessuna strada di registrazione autonoma: serve il codice del
     link d'invito (?invite= precompila il campo). */
  function requireAccess() {
    if (el.accessCode) {
      el.accessCode.value = "";
      UI.clearFieldError("access-code");
    }
    prefillInviteFromUrl();
    UI.showScreen("screen-access");
  }

  function prefillInviteFromUrl() {
    if (!el.accessCode) return;
    try {
      var params = new URLSearchParams(window.location.search);
      var invite = (params.get("invite") || "").trim();
      if (invite) el.accessCode.value = invite;
    } catch (error) {
      /* URL non interpretabile: nessuna azione. */
    }
  }

  function submitAccess() {
    var code = ((el.accessCode && el.accessCode.value) || "").trim();

    if (!code) {
      UI.setFieldError("access-code", "Inserisci il codice d'invito.");
      return;
    }

    if (!Auth.validateInvite(code)) {
      UI.setFieldError(
        "access-code",
        "Codice non valido. L'accesso e riservato ai membri invitati."
      );
      return;
    }

    UI.clearFieldError("access-code");
    Auth.login();

    if (Auth.hasProfile()) {
      /* Rientro dopo il logout: il profilo e gia sul dispositivo. */
      requireNotifications();
    } else {
      startOnboarding();
    }
  }

  function bindAccess() {
    if (el.accessForm) {
      el.accessForm.addEventListener("submit", function (event) {
        event.preventDefault();
        submitAccess();
      });
    }

    if (el.accessCode) {
      el.accessCode.addEventListener("input", function () {
        UI.clearFieldError("access-code");
      });
    }
  }

  function requireNotifications() {
    UI.showScreen("screen-notifications");
    renderNotificationGate();
  }

  /* Badge di stato del gate: aggiorna classe, hidden e testo. */
  function setGateStatus(type, text) {
    if (el.gateStatus) {
      el.gateStatus.hidden = false;
      el.gateStatus.className = "gate__status gate__status--" + type;
    }
    if (el.gateStatusText) el.gateStatusText.textContent = text;
  }

  function setGateHint(text) {
    if (!el.gateHint) return;
    el.gateHint.hidden = !text;
    el.gateHint.textContent = text || "";
  }

  function setEnabled(node, enabled) {
    if (node) node.disabled = !enabled;
  }

  function renderNotificationGate() {
    var permission = PushManager.getPermission();

    if (permission === "granted") {
      setGateStatus("ok", "Notifiche attive: riceverai un avviso per ogni nuovo evento.");
      setGateHint("");
      setEnabled(el.gateEnable, false);
      setEnabled(el.gateContinue, true);
    } else if (permission === "denied") {
      setGateStatus("error", "Notifiche bloccate dal browser per questo sito.");
      setGateHint("Apri le impostazioni del browser, consenti le notifiche e aggiorna la pagina.");
      setEnabled(el.gateEnable, false);
      setEnabled(el.gateContinue, true);
    } else if (permission === "default") {
      setGateStatus("warn", "Autorizzazione necessaria: attiva le notifiche per gli annunci della banda.");
      setGateHint("Servirà una singola conferma del browser.");
      setEnabled(el.gateEnable, true);
      setEnabled(el.gateContinue, true);
    } else {
      var insecure = PushManager.getContext() === "insecure";

      setGateStatus("warn", insecure
        ? "Le notifiche richiedono una connessione HTTPS."
        : "Le notifiche non sono disponibili su questo dispositivo.");
      setGateHint(insecure
        ? "Apri il sito in HTTPS per attivarle: nel frattempo puoi usare l'app."
        : "Potrai comunque usare l'app e consultare gli eventi.");
      setEnabled(el.gateEnable, false);
      setEnabled(el.gateContinue, true);
    }

    if (el.gateContinue) {
      el.gateContinue.hidden = false;
      el.gateContinue.textContent =
        permission === "granted" ? "Entra nell'app" : "Continua senza notifiche";
    }
  }

  function bindNotificationGate() {
    if (el.gateEnable) {
      el.gateEnable.addEventListener("click", function () {
        setEnabled(el.gateEnable, false);
        UI.showLoader("Attivazione notifiche");

        PushManager.requestPermission()
          .then(function () {
            UI.hideLoader();
            renderNotificationGate();
            renderStatNotifications();
          })
          .catch(function () {
            UI.hideLoader();
            renderNotificationGate();
            UI.toast("Non è stato possibile attivare le notifiche.", "error");
          });
      });
    }

    if (el.gateContinue) {
      el.gateContinue.addEventListener("click", enterApp);
    }
  }

  /* ----------------------------------------------------------
   * Ingresso nell'app
   * -------------------------------------------------------- */
  /* Deep link ?view= (shortcut installata, push). */
  function resolveInitialView() {
    var requested = null;

    try {
      var params = new URLSearchParams(window.location.search);
      requested = params.get("view");
    } catch (error) {
      requested = null;
    }

    if (requested && VIEWS.indexOf(requested) !== -1) {
      if (requested === "attendance" && !Auth.isAdmin()) return DEFAULT_VIEW;
      return requested;
    }

    return state.view === "attendance" && !Auth.isAdmin() ? DEFAULT_VIEW : state.view;
  }

  function enterApp() {
    var user = Auth.getUser();
    if (!user) {
      startOnboarding();
      return;
    }

    API.syncLocalMember(user);
    UI.showScreen("screen-main");

    updateTabbar();
    renderTopbar();
    renderRoleControl();
    renderHomeStats();
    renderProfileForm();
    renderStatNotifications();
    renderInstallState();

    /* Fase 6: allinea la preferenza, mostra il banner se serve e
     * garantisce l'iscrizione push di questo dispositivo. */
    syncNotifPreference();
    renderNotifBanner();
    PushManager.ensurePushSubscription();

    Events.ensureLoaded().then(function () {
      setActiveView(resolveInitialView());
    });
  }

  function updateTabbar() {
    var isAdmin = Auth.isAdmin();
    var attendanceTab = UI.qs('.tab[data-tab="attendance"]');

    if (attendanceTab) attendanceTab.hidden = !isAdmin;
    if (el.tabbar) el.tabbar.classList.toggle("tabbar--five", isAdmin);
  }

  function setActiveView(name) {
    var view = VIEWS.indexOf(name) !== -1 ? name : DEFAULT_VIEW;

    if (view === "attendance" && !Auth.isAdmin()) view = DEFAULT_VIEW;

    state.view = view;

    if (el.views) {
      el.views.forEach(function (pane) {
        pane.classList.toggle("view--active", pane.getAttribute("data-view") === view);
      });
    }

    if (el.tabs) {
      el.tabs.forEach(function (tab) {
        tab.classList.toggle("tab--active", tab.getAttribute("data-tab") === view);
      });
    }

    if (view === "home") {
      renderHomeStats();
      Events.renderHome();
    } else if (view === "events") {
      Events.onViewEnter();
    } else if (view === "scores") {
      Scores.onViewEnter();
    } else if (view === "attendance") {
      var target = state.pendingAttendanceEvent;
      state.pendingAttendanceEvent = null;
      Attendance.onViewEnter(target);
    } else if (view === "profile") {
      renderProfileForm();
    }
  }

  /* Apre direttamente la dashboard presenze su un evento. */
  function openAttendance(eventId) {
    if (!Auth.isAdmin()) return;
    state.pendingAttendanceEvent = eventId || null;
    setActiveView("attendance");
  }

  /* ----------------------------------------------------------
   * Topbar, home e statistiche
   * -------------------------------------------------------- */
  function renderTopbar() {
    var user = Auth.getUser();
    if (!user) return;

    if (el.topbarInitials) {
      el.topbarInitials.textContent = UI.initials(user.firstName, user.lastName) || "--";
    }
    if (el.topbarName) el.topbarName.textContent = Format.fullName(user) || "Utente";
    if (el.topbarRole) el.topbarRole.textContent = Auth.isAdmin() ? "Amministratore" : "Membro";
  }

  function renderHomeStats() {
    var user = Auth.getUser();
    var instruments = user && user.instruments ? user.instruments.length : 0;

    if (el.statInstruments) el.statInstruments.textContent = String(instruments);
    if (el.statEvents) el.statEvents.textContent = String(Events.upcoming().length);
    renderStatNotifications();
  }

  function renderStatNotifications() {
    if (el.statNotifications) el.statNotifications.textContent = PushManager.getStatusLabel();
  }

  /* ----------------------------------------------------------
   * Profilo e ruolo
   * -------------------------------------------------------- */
  function renderProfileForm() {
    var user = Auth.getUser();
    if (!user) return;

    if (el.profileFirstName) el.profileFirstName.value = user.firstName || "";
    if (el.profileLastName) el.profileLastName.value = user.lastName || "";
    if (el.profileEmail) el.profileEmail.value = user.email || "";

    UI.renderInstruments(el.profileInstruments, Auth.INSTRUMENT_GROUPS, user.instruments || [], null);
    UI.clearFieldError("profile-first-name");
    UI.clearFieldError("profile-last-name");
    UI.clearFieldError("profile-email");
    UI.clearFieldError("profile-instruments");
    renderRoleControl();
  }

  function renderRoleControl() {
    if (!el.profileRole) return;

    var role = Auth.getRole();
    UI.qsa(".segmented__item", el.profileRole).forEach(function (item) {
      var active = item.getAttribute("data-role") === role;
      item.classList.toggle("segmented__item--active", active);
      item.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function saveProfile(event) {
    if (event && event.preventDefault) event.preventDefault();

    var firstName = validateName(el.profileFirstName, "profile-first-name", "un nome valido");
    var lastName = validateName(el.profileLastName, "profile-last-name", "un cognome valido");
    var email = validateEmail(el.profileEmail, "profile-email", true);
    var instruments = UI.getSelectedInstruments(el.profileInstruments);

    if (!firstName || !lastName || !email) return;

    if (instruments.length === 0) {
      UI.setFieldError("profile-instruments", "Seleziona almeno uno strumento.");
      return;
    }
    UI.clearFieldError("profile-instruments");

    var saveButton = UI.byId("profile-save");
    UI.setButtonLoading(saveButton, true);

    var saved = Auth.updateUser({
      firstName: firstName,
      lastName: lastName,
      email: email,
      instruments: instruments
    });

    UI.setButtonLoading(saveButton, false);

    if (!saved) {
      UI.toast("Salvataggio non riuscito.", "error");
      return;
    }

    UI.toast("Profilo aggiornato.", "success");
    renderTopbar();
    renderHomeStats();

    /* L'anagrafica locale viene aggiornata in background. */
    API.syncLocalMember(saved).then(function () {
      Attendance.refresh();
    });
  }

  function resetProfile() {
    UI.confirm({
      title: "Azzerare il profilo?",
      text: "Verranno rimossi nome, strumenti e preferenze salvati su questo dispositivo.",
      confirmLabel: "Azzera",
      cancelLabel: "Annulla",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;

      Auth.clearUser();
      state.view = DEFAULT_VIEW;
      requireAccess();
    });
  }

  /* Chiude la sessione: il profilo resta sul dispositivo, per
     rientrare serve di nuovo il codice d'invito. */
  function logoutAccount() {
    UI.confirm({
      title: "Uscire dall'account?",
      text: "Il profilo resta su questo dispositivo: per rientrare serve il codice d'invito.",
      confirmLabel: "Esci",
      cancelLabel: "Annulla"
    }).then(function (confirmed) {
      if (!confirmed) return;

      Auth.logout();
      state.view = DEFAULT_VIEW;
      requireAccess();
      UI.toast("Sessione chiusa.", "info");
    });
  }

  function changeRole(role) {
    if (!role || role === Auth.getRole()) return;

    Auth.setRole(role);
    renderRoleControl();
    renderTopbar();
    updateTabbar();

    UI.toast(
      role === Auth.ROLES.ADMIN
        ? "Modalità amministratore attiva."
        : "Tornato alle funzioni base.",
      "success"
    );

    /* Ricarica forzata: da amministratore servono anche i contatori per evento. */
    Events.ensureLoaded(true);

    /* La toolbar spartiti dipende dal ruolo. */
    Scores.refresh();

    if (!Auth.isAdmin() && state.view === "attendance") setActiveView(DEFAULT_VIEW);
  }

  function bindProfile() {
    if (el.profileForm) {
      el.profileForm.addEventListener("submit", saveProfile);
    }

    ["profile-first-name", "profile-last-name", "profile-email"].forEach(function (id) {
      var node = UI.byId(id);
      if (node) {
        node.addEventListener("input", function () {
          UI.clearFieldError(id);
        });
      }
    });

    if (el.profileInstruments) {
      el.profileInstruments.addEventListener("click", function () {
        UI.clearFieldError("profile-instruments");
      });
    }

    if (el.btnLogout) {
      el.btnLogout.addEventListener("click", logoutAccount);
    }

    if (el.btnResetProfile) {
      el.btnResetProfile.addEventListener("click", resetProfile);
    }

    if (el.profileRole) {
      UI.qsa(".segmented__item", el.profileRole).forEach(function (item) {
        item.addEventListener("click", function () {
          changeRole(item.getAttribute("data-role"));
        });
      });
    }
  }

  /* ----------------------------------------------------------
   * Banner notifiche revocate (Fase 6)
   * -------------------------------------------------------- */
  /* Allinea la preferenza locale al permesso effettivo: serve a
   * riconoscere gli account che hanno gia attivato le notifiche
   * (anche se la preferenza non e stata scritta esplicitamente). */
  function syncNotifPreference() {
    if (PushManager.isEnabled() && !Auth.getNotificationPreference()) {
      Auth.setNotificationPreference(true);
    }
  }

  /* Banner persistente: visibile solo con preferenza attiva e
   * permesso diverso da granted. Nessun pulsante di chiusura. */
  function renderNotifBanner() {
    if (!el.notifBanner) return;

    var show =
      Auth.hasProfile() &&
      Auth.getNotificationPreference() &&
      PushManager.getPermission() !== "granted";

    el.notifBanner.hidden = !show;
    if (!show || !el.notifBannerText) return;

    var permission = PushManager.getPermission();
    if (permission === "denied") {
      el.notifBannerText.textContent =
        "Notifiche disattivate dalle impostazioni: non riceverai gli annunci della banda.";
    } else if (permission === "unsupported") {
      el.notifBannerText.textContent =
        "Notifiche non disponibili: apri l'app in HTTPS per riattivarle.";
    } else {
      el.notifBannerText.textContent =
        "Notifiche non attive: concedi il consenso per ricevere gli annunci della banda.";
    }
  }

  /* Istruzioni di riattivazione per il browser in uso. */
  function notificationInstructions() {
    var ua = window.navigator.userAgent || "";
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

    if (/Firefox/.test(ua)) {
      return "Firefox: tocca l'icona a sinistra dell'indirizzo, apri Permessi, scegli Notifiche > Consenti e ricarica la pagina.";
    }
    if (/Edg/.test(ua)) {
      return "Edge: tocca la campanella nella barra degli indirizzi, consenti le notifiche e ricarica la pagina.";
    }
    if (/Chrome/.test(ua)) {
      return isMobile
        ? "Chrome Android: tieni premuto il sito, scegli Informazioni > Notifiche > Consentite, poi ricarica la pagina."
        : "Chrome: clicca la campanella nella barra degli indirizzi, scegli Consenti e ricarica la pagina.";
    }
    if (/Safari/.test(ua)) {
      return isMobile
        ? "iPhone: apri Impostazioni > Safari > Notifiche, consenti il sito e ricarica la pagina."
        : "Safari: apri Preferenze > Siti web > Notifiche, consenti il sito e ricarica la pagina.";
    }
    return "Apri le impostazioni del browser, consenti le notifiche per questo sito e ricarica la pagina.";
  }

  function afterNotifFix(result) {
    UI.hideLoader();
    renderNotificationGate();
    renderStatNotifications();
    renderNotifBanner();

    if (result === "granted") {
      PushManager.ensurePushSubscription();
      UI.toast("Notifiche attive.", "success");
    }
  }

  function handleNotifBannerFix() {
    var permission = PushManager.getPermission();

    if (permission === "default") {
      UI.showLoader("Attivazione notifiche");
      PushManager.requestPermission()
        .then(afterNotifFix)
        .catch(function () {
          UI.hideLoader();
          UI.toast("Non e stato possibile attivare le notifiche.", "error");
        });
      return;
    }

    if (permission === "denied") {
      UI.confirm({
        title: "Riattiva le notifiche",
        text: notificationInstructions(),
        confirmLabel: "Riprova",
        cancelLabel: "Chiudi"
      }).then(function (confirmed) {
        if (!confirmed) return;
        UI.showLoader("Verifica notifiche");
        PushManager.requestPermission()
          .then(afterNotifFix)
          .catch(function () {
            UI.hideLoader();
          });
      });
      return;
    }

    /* Contesto non sicuro o API non disponibili. */
    UI.confirm({
      title: "Notifiche non disponibili",
      text:
        PushManager.getContext() === "insecure"
          ? "Le notifiche richiedono HTTPS: apri il sito con un indirizzo https:// e riprova."
          : "Questo dispositivo non supporta le notifiche: potrai comunque usare l'app.",
      confirmLabel: "Ho capito",
      cancelLabel: "Chiudi"
    });
  }

  function handlePermissionChange(permission) {
    if (permission === "granted") {
      syncNotifPreference();
      PushManager.ensurePushSubscription();
    }
    renderStatNotifications();
    renderNotifBanner();
  }

  /* ----------------------------------------------------------
   * Installazione PWA
   * -------------------------------------------------------- */
  function renderInstallState() {
    if (!el.installPanel) return;

    if (PushManager.isInstalled()) {
      el.installPanel.hidden = true;
      return;
    }

    var canInstall = PushManager.canInstall();
    var insecure = PushManager.getContext() === "insecure";

    el.installPanel.hidden = false;
    if (el.installBadge) el.installBadge.textContent = canInstall ? "Consigliato" : "Guida";

    if (el.installText) {
      if (insecure) {
        el.installText.textContent = "Apri il sito in HTTPS per poterlo installare sul dispositivo.";
      } else if (PushManager.needsIosInstructions()) {
        el.installText.textContent = "Su iPhone tocca Condividi e scegli \"Aggiungi a Home\".";
      } else if (canInstall) {
        el.installText.textContent =
          "Installa Banda per averla a portata di mano e usarla anche offline.";
      } else {
        el.installText.textContent =
          "Usa il menu del browser e scegli \"Installa app\" o \"Aggiungi a Home\".";
      }
    }

    if (el.btnInstall) el.btnInstall.hidden = !canInstall;
  }

  function bindShell() {
    if (el.btnOpenProfile) {
      el.btnOpenProfile.addEventListener("click", function () {
        setActiveView("profile");
      });
    }

    if (el.tabs) {
      el.tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          setActiveView(tab.getAttribute("data-tab"));
        });
      });
    }

    if (el.btnInstall) {
      el.btnInstall.addEventListener("click", function () {
        UI.setButtonLoading(el.btnInstall, true);

        PushManager.promptInstall().then(function (outcome) {
          UI.setButtonLoading(el.btnInstall, false);
          renderInstallState();

          if (outcome === "accepted") UI.toast("Installazione avviata.", "success");
          else if (outcome === "dismissed") UI.toast("Installazione annullata.", "info");
          else if (outcome === "unavailable") {
            UI.toast("Usa il menu del browser per installare l'app.", "info");
          }
        });
      });
    }

    if (el.notifBannerFix) {
      el.notifBannerFix.addEventListener("click", handleNotifBannerFix);
    }

    PushManager.onInstallChange(renderInstallState);
  }

  /* ----------------------------------------------------------
   * API pubblica
   * -------------------------------------------------------- */
  return {
    init: init,
    setActiveView: setActiveView,
    openAttendance: openAttendance,
    state: state
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    window.App.init();
  });
} else {
  window.App.init();
}
