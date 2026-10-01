/* =============================================================
 * Banda - ui.js
 * Funzioni di supporto per l'interfaccia: navigazione tra
 * schermate, loader, toast, gestione errori di campo e
 * rendering dei chip strumenti.
 * ============================================================= */

window.UI = (function () {
  "use strict";

  /* ----------------------------------------------------------
   * Utility DOM
   * -------------------------------------------------------- */
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function byId(id) {
    return document.getElementById(id);
  }

  /* ----------------------------------------------------------
   * Gestione schermate
   * -------------------------------------------------------- */
  var currentScreenId = null;

  function showScreen(id) {
    var next = byId(id);
    if (!next || currentScreenId === id) return;

    if (currentScreenId) {
      var prev = byId(currentScreenId);
      if (prev) {
        prev.classList.remove("screen--active");
        prev.setAttribute("aria-hidden", "true");
      }
    }

    next.classList.add("screen--active");
    next.setAttribute("aria-hidden", "false");
    currentScreenId = id;

    var scrollable = next.querySelector(".viewport");
    if (scrollable) scrollable.scrollTop = 0;
  }

  function getCurrentScreenId() {
    return currentScreenId;
  }

  /* ----------------------------------------------------------
   * Loader a schermo intero (supporta chiamate annidate)
   * -------------------------------------------------------- */
  var loaderDepth = 0;

  function showLoader(text) {
    loaderDepth += 1;
    var overlay = byId("loader-overlay");
    var label = byId("loader-text");
    if (label && text) label.textContent = text;
    if (overlay) overlay.hidden = false;
  }

  function hideLoader() {
    loaderDepth = Math.max(0, loaderDepth - 1);
    if (loaderDepth === 0) {
      var overlay = byId("loader-overlay");
      if (overlay) overlay.hidden = true;
    }
  }

  /* ----------------------------------------------------------
   * Toast di notifica
   * -------------------------------------------------------- */
  function toast(message, type, duration) {
    var container = byId("toast-container");
    if (!container) return;

    var el = document.createElement("div");
    el.className = "toast toast--" + (type || "info");
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.textContent = message;
    container.appendChild(el);

    var life = duration || 2800;
    window.setTimeout(function () {
      el.classList.add("toast--out");
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 280);
    }, life);
  }

  /* ----------------------------------------------------------
   * Stato di caricamento sui bottoni
   * -------------------------------------------------------- */
  function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
    } else {
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }
  }

  /* ----------------------------------------------------------
   * Errori di campo
   * -------------------------------------------------------- */
  function errorFor(inputId) {
    return document.querySelector('[data-error-for="' + inputId + '"]');
  }

  function setFieldError(inputId, message) {
    var input = byId(inputId);
    var field = input ? input.closest(".field") : null;
    var errorEl = errorFor(inputId);

    if (field) field.classList.add("has-error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("is-visible");
    }
  }

  function clearFieldError(inputId) {
    var input = byId(inputId);
    var field = input ? input.closest(".field") : null;
    var errorEl = errorFor(inputId);

    if (field) field.classList.remove("has-error");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.remove("is-visible");
    }
  }

  function clearAllFieldErrors(rootId) {
    var root = (rootId && byId(rootId)) || document;
    qsa("[data-error-for]", root).forEach(function (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.remove("is-visible");
    });
    qsa(".field.has-error", root).forEach(function (field) {
      field.classList.remove("has-error");
    });
  }

  /* ----------------------------------------------------------
   * Rendering chip strumenti
   * groups   : [{ label, items: ["..."] }]
   * selected : ["..."]
   * onToggle : function(name, isSelected)
   * -------------------------------------------------------- */
  function renderInstruments(container, groups, selected, onToggle) {
    if (!container) return;
    var chosen = selected || [];
    container.innerHTML = "";

    groups.forEach(function (group, groupIndex) {
      var wrap = document.createElement("div");
      wrap.className = "chip-group";

      var label = document.createElement("p");
      label.className = "chip-group__label";
      label.textContent = group.label;
      wrap.appendChild(label);

      var row = document.createElement("div");
      row.className = "chips";

      group.items.forEach(function (name, itemIndex) {
        var isOn = chosen.indexOf(name) !== -1;

        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (isOn ? " chip--selected" : "");
        chip.dataset.instrument = name;
        chip.setAttribute("role", "switch");
        chip.setAttribute("aria-checked", isOn ? "true" : "false");
        chip.style.animationDelay = groupIndex * 20 + itemIndex * 14 + "ms";

        var dot = document.createElement("span");
        dot.className = "chip__dot";

        var text = document.createElement("span");
        text.textContent = name;

        chip.appendChild(dot);
        chip.appendChild(text);

        chip.addEventListener("click", function () {
          var nowSelected = !chip.classList.contains("chip--selected");
          chip.classList.toggle("chip--selected", nowSelected);
          chip.setAttribute("aria-checked", nowSelected ? "true" : "false");
          if (typeof onToggle === "function") onToggle(name, nowSelected);
        });

        row.appendChild(chip);
      });

      wrap.appendChild(row);
      container.appendChild(wrap);
    });
  }

  function getSelectedInstruments(container) {
    if (!container) return [];
    return qsa(".chip--selected", container).map(function (chip) {
      return chip.dataset.instrument;
    });
  }

  /* ----------------------------------------------------------
   * Helper vari
   * -------------------------------------------------------- */
  function initials(firstName, lastName) {
    var a = (firstName || "").trim().charAt(0);
    var b = (lastName || "").trim().charAt(0);
    var value = (a + b).toUpperCase();
    return value || "--";
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  /* Crea un elemento con classe e testo, utile per costruire
     liste e schede senza usare innerHTML. */
  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ----------------------------------------------------------
   * Modale di conferma (promise based)
   * -------------------------------------------------------- */
  function confirmDialog(options) {
    var opts = options || {};
    var modal = byId("modal");
    if (!modal) return Promise.resolve(false);

    var titleEl = byId("modal-title");
    var textEl = byId("modal-text");
    var cancelBtn = byId("modal-cancel");
    var confirmBtn = byId("modal-confirm");
    var backdrop = modal.querySelector(".modal__backdrop");

    if (titleEl) titleEl.textContent = opts.title || "Conferma";
    if (textEl) textEl.textContent = opts.text || "";
    if (cancelBtn) cancelBtn.textContent = opts.cancelLabel || "Annulla";
    if (confirmBtn) {
      confirmBtn.textContent = opts.confirmLabel || "Conferma";
      confirmBtn.className = "btn " + (opts.danger ? "btn--danger" : "btn--primary");
    }

    modal.hidden = false;

    return new Promise(function (resolve) {
      function cleanup(result) {
        modal.hidden = true;
        if (cancelBtn) cancelBtn.removeEventListener("click", onCancel);
        if (confirmBtn) confirmBtn.removeEventListener("click", onConfirm);
        if (backdrop) backdrop.removeEventListener("click", onCancel);
        modal.removeEventListener("keydown", onKey);
        resolve(result);
      }

      function onCancel() {
        cleanup(false);
      }

      function onConfirm() {
        cleanup(true);
      }

      function onKey(event) {
        if (event.key === "Escape") cleanup(false);
      }

      if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
      if (confirmBtn) confirmBtn.addEventListener("click", onConfirm);
      if (backdrop) backdrop.addEventListener("click", onCancel);
      modal.addEventListener("keydown", onKey);

      if (confirmBtn) confirmBtn.focus();
    });
  }

  return {
    qs: qs,
    qsa: qsa,
    byId: byId,
    showScreen: showScreen,
    getCurrentScreenId: getCurrentScreenId,
    showLoader: showLoader,
    hideLoader: hideLoader,
    toast: toast,
    setButtonLoading: setButtonLoading,
    setFieldError: setFieldError,
    clearFieldError: clearFieldError,
    clearAllFieldErrors: clearAllFieldErrors,
    renderInstruments: renderInstruments,
    getSelectedInstruments: getSelectedInstruments,
    initials: initials,
    setText: setText,
    create: create,
    clear: clear,
    confirm: confirmDialog
  };
})();
