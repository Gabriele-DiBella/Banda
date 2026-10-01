/* =============================================================
 * Banda - scores.js
 * Fase 5: archivio spartiti. Navigazione a cartelle con briciole
 * (breadcrumb), lista dei PDF con apertura e download e gestione
 * completa per gli amministratori (crea, rinomina, elimina,
 * carica).
 * ============================================================= */

window.Scores = (function () {
  "use strict";

  var ROOT_LABEL = "Tutti gli spartiti";
  var MAX_FOLDER_NAME = 60;
  var MAX_FILE_NAME = 76;

  var state = {
    loaded: false,
    folders: [],
    files: [],
    currentId: null,
    creating: false,
    renaming: null /* { type: "folder" | "file", id } */
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
    el.toolbar = UI.byId("scores-toolbar");
    el.btnNewFolder = UI.byId("btn-new-folder");
    el.btnUpload = UI.byId("btn-upload-score");
    el.fileInput = UI.byId("score-file-input");
    el.crumbs = UI.byId("scores-crumbs");
    el.folders = UI.byId("scores-folders");
    el.files = UI.byId("scores-files");
    el.empty = UI.byId("scores-empty");
    el.emptyTitle = UI.byId("scores-empty-title");
    el.emptyText = UI.byId("scores-empty-text");
  }

  function bind() {
    if (el.btnNewFolder) {
      el.btnNewFolder.addEventListener("click", startCreate);
    }

    if (el.btnUpload && el.fileInput) {
      el.btnUpload.addEventListener("click", function () {
        el.fileInput.click();
      });
    }

    if (el.fileInput) {
      el.fileInput.addEventListener("change", handleFileSelection);
    }
  }

  /* ----------------------------------------------------------
   * Dati
   * -------------------------------------------------------- */
  function load(options) {
    var opts = options || {};
    if (opts.showLoader) UI.showLoader("Caricamento spartiti");

    return Promise.all([API.getFolders(), API.getScores(state.currentId)])
      .then(function (results) {
        state.folders = results[0] || [];
        state.files = (results[1] && results[1].files) || [];
        state.loaded = true;
        if (opts.showLoader) UI.hideLoader();
        render();
        return state;
      })
      .catch(function () {
        if (opts.showLoader) UI.hideLoader();
        UI.toast("Impossibile caricare l'archivio spartiti.", "error");
        return state;
      });
  }

  function onViewEnter() {
    if (!state.loaded) return load({ showLoader: true });
    return load({});
  }

  /* Ricarica la vista senza nuove richieste (cambio ruolo). */
  function refresh() {
    if (state.loaded) render();
  }

  function navigate(folderId) {
    var next = folderId || null;
    if (next === state.currentId) return Promise.resolve(state);

    state.currentId = next;
    state.creating = false;
    state.renaming = null;

    var viewport = UI.byId("viewport");
    if (viewport) viewport.scrollTop = 0;

    return load({});
  }

  function findFolder(id) {
    for (var i = 0; i < state.folders.length; i++) {
      if (state.folders[i].id === id) return state.folders[i];
    }
    return null;
  }

  function findFile(id) {
    for (var i = 0; i < state.files.length; i++) {
      if (state.files[i].id === id) return state.files[i];
    }
    return null;
  }

  function childFolders() {
    return state.folders.filter(function (folder) {
      return (folder.parentId || null) === state.currentId;
    });
  }

  /* Catena radice -> cartella corrente, per il breadcrumb. */
  function trail() {
    var chain = [];
    var id = state.currentId;
    var guard = 0;

    while (id && guard < 100) {
      var folder = findFolder(id);
      if (!folder) break;
      chain.unshift(folder);
      id = folder.parentId || null;
      guard += 1;
    }

    return chain;
  }

  function countLabel(count, singular, pluralForm) {
    return count + " " + (count === 1 ? singular : pluralForm);
  }

  function formatSize(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1048576) return Math.round(value / 1024) + " KB";
    return (value / 1048576).toFixed(1).replace(".", ",") + " MB";
  }

  /* ----------------------------------------------------------
   * Rendering
   * -------------------------------------------------------- */
  function render() {
    renderToolbar();
    renderCrumbs();
    renderFolders();
    renderFiles();
    renderEmpty();
  }

  function renderToolbar() {
    if (el.toolbar) el.toolbar.hidden = !Auth.isAdmin();
  }

  function crumbNode(label, folderId, current) {
    if (current) {
      var span = UI.create("span", "crumbs__item crumbs__item--current", label);
      span.setAttribute("aria-current", "page");
      return span;
    }

    var button = UI.create("button", "crumbs__item", label);
    button.type = "button";
    button.dataset.folderId = folderId || "";
    button.addEventListener("click", function () {
      navigate(folderId || null);
    });
    return button;
  }

  function renderCrumbs() {
    if (!el.crumbs) return;
    UI.clear(el.crumbs);

    var chain = trail();
    el.crumbs.appendChild(crumbNode(ROOT_LABEL, null, chain.length === 0));

    chain.forEach(function (folder, index) {
      el.crumbs.appendChild(UI.create("span", "crumbs__sep", "/"));
      el.crumbs.appendChild(
        crumbNode(folder.name, folder.id, index === chain.length - 1)
      );
    });
  }

  function svgNode(markup) {
    /* Solo costanti statiche: nessun dato utente passa da innerHTML. */
    var wrap = document.createElement("span");
    wrap.innerHTML = markup;
    return wrap.firstChild;
  }

  function folderIcon() {
    return svgNode(
      '<svg class="folder-card__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8A1.5 1.5 0 0 1 20.5 10v7A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17Z" ' +
        'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
        "</svg>"
    );
  }

  function pdfIcon() {
    return svgNode(
      '<svg class="file-row__icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
        '<path d="M6.5 3.5h8L19 8v12.5H6.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<path d="M14 3.5V8h4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M9.5 13h5M9.5 16.5h3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
        "</svg>"
    );
  }

  function actionButton(label, variant, action, onClick) {
    var button = UI.create("button", "btn " + variant + " btn--sm", label);
    button.type = "button";
    button.dataset.action = action;
    button.addEventListener("click", onClick);
    return button;
  }

  function buildFolderCard(folder) {
    var card = UI.create("div", "folder-card");
    card.dataset.folderId = folder.id;

    var renamingThis =
      state.renaming &&
      state.renaming.type === "folder" &&
      state.renaming.id === folder.id;

    if (renamingThis) {
      card.appendChild(buildRenameBox());
      return card;
    }

    var open = UI.create("button", "folder-card__open");
    open.type = "button";
    open.dataset.action = "open-folder";
    open.appendChild(folderIcon());

    var text = UI.create("span", "folder-card__text");
    text.appendChild(UI.create("span", "folder-card__name", folder.name));
    text.appendChild(
      UI.create(
        "span",
        "folder-card__meta",
        countLabel(folder.subfolderCount || 0, "cartella", "cartelle") +
          ", " +
          (folder.fileCount || 0) +
          " PDF"
      )
    );
    open.appendChild(text);

    open.addEventListener("click", function () {
      navigate(folder.id);
    });
    card.appendChild(open);

    if (Auth.isAdmin()) {
      var tools = UI.create("div", "folder-card__tools");
      tools.appendChild(
        actionButton("Rinomina", "btn--ghost", "rename-folder", function () {
          startRename("folder", folder.id);
        })
      );
      tools.appendChild(
        actionButton("Elimina", "btn--danger", "delete-folder", function () {
          confirmDeleteFolder(folder);
        })
      );
      card.appendChild(tools);
    }

    return card;
  }

  function buildFileRow(file) {
    var row = UI.create("div", "file-row");
    row.dataset.fileId = file.id;

    var renamingThis =
      state.renaming &&
      state.renaming.type === "file" &&
      state.renaming.id === file.id;

    if (renamingThis) {
      row.appendChild(buildRenameBox());
      return row;
    }

    row.appendChild(pdfIcon());

    var body = UI.create("div", "file-row__body");
    body.appendChild(UI.create("p", "file-row__name", file.name));
    body.appendChild(
      UI.create(
        "p",
        "file-row__meta",
        "PDF" + (file.size ? " · " + formatSize(file.size) : "")
      )
    );
    row.appendChild(body);

    var actions = UI.create("div", "file-row__actions");
    actions.appendChild(
      actionButton("Apri", "btn--ghost", "open", function () {
        openFile(file);
      })
    );
    actions.appendChild(
      actionButton("Scarica", "btn--ghost", "download", function () {
        downloadFile(file);
      })
    );

    if (Auth.isAdmin()) {
      actions.appendChild(
        actionButton("Rinomina", "btn--ghost", "rename-file", function () {
          startRename("file", file.id);
        })
      );
      actions.appendChild(
        actionButton("Elimina", "btn--danger", "delete-file", function () {
          confirmDeleteFile(file);
        })
      );
    }

    row.appendChild(actions);
    return row;
  }

  function renderFolders() {
    if (!el.folders) return;
    UI.clear(el.folders);

    if (state.creating) el.folders.appendChild(buildCreateBox());

    var children = childFolders();
    children.forEach(function (folder) {
      el.folders.appendChild(buildFolderCard(folder));
    });

    el.folders.hidden = !children.length && !state.creating;
  }

  function renderFiles() {
    if (!el.files) return;
    UI.clear(el.files);

    state.files.forEach(function (file) {
      el.files.appendChild(buildFileRow(file));
    });

    el.files.hidden = state.files.length === 0;
  }

  function renderEmpty() {
    if (!el.empty) return;

    var hasFolders = childFolders().length > 0;
    el.empty.hidden = hasFolders || state.files.length > 0;

    if (el.emptyTitle) {
      el.emptyTitle.textContent = state.currentId ? "Cartella vuota" : "Archivio vuoto";
    }

    if (el.emptyText) {
      el.emptyText.textContent = Auth.isAdmin()
        ? "Crea una cartella o carica un PDF per iniziare."
        : "Gli spartiti pubblicati dall'amministratore compariranno qui.";
    }
  }

  /* ----------------------------------------------------------
   * Creazione e rinomina (amministratore)
   * -------------------------------------------------------- */
  function validateName(raw, siblings, currentId) {
    var name = String(raw || "").trim();
    if (!name) return { error: "Inserisci un nome." };
    if (name.length > MAX_FOLDER_NAME) {
      return { error: "Massimo " + MAX_FOLDER_NAME + " caratteri." };
    }

    var duplicate = siblings.some(function (item) {
      return (
        item.id !== currentId &&
        String(item.name || "").toLowerCase() === name.toLowerCase()
      );
    });
    if (duplicate) return { error: "Esiste già una cartella con questo nome." };
    return { name: name };
  }

  function validateFileName(raw, siblings, currentId) {
    var name = String(raw || "").trim().replace(/\.pdf$/i, "");
    if (!name) return { error: "Inserisci un nome." };
    if (name.length > MAX_FILE_NAME) {
      return { error: "Massimo " + MAX_FILE_NAME + " caratteri." };
    }

    var full = name + ".pdf";
    var duplicate = siblings.some(function (item) {
      return (
        item.id !== currentId &&
        String(item.name || "").toLowerCase() === full.toLowerCase()
      );
    });
    if (duplicate) return { error: "Esiste già un file con questo nome." };
    return { name: full };
  }

  function startCreate() {
    if (!Auth.isAdmin()) return;
    state.creating = true;
    state.renaming = null;
    renderFolders();
  }

  function buildCreateBox() {
    var wrap = UI.create("div", "folder-create");

    var field = UI.create("div", "field");
    var input = UI.create("input", "field__input");
    input.type = "text";
    input.id = "scores-folder-input";
    input.maxLength = MAX_FOLDER_NAME;
    input.placeholder = "Nome della cartella";
    input.setAttribute("aria-label", "Nome della cartella");

    var errorEl = UI.create("p", "field__error");
    errorEl.setAttribute("data-error-for", "scores-folder-input");

    field.appendChild(input);
    field.appendChild(errorEl);
    wrap.appendChild(field);

    var actions = UI.create("div", "folder-create__actions");
    var save = UI.create("button", "btn btn--primary btn--sm", "Crea");
    save.type = "button";
    save.id = "scores-folder-save";
    var cancel = UI.create("button", "btn btn--ghost btn--sm", "Annulla");
    cancel.type = "button";
    cancel.id = "scores-folder-cancel";
    actions.appendChild(save);
    actions.appendChild(cancel);
    wrap.appendChild(actions);

    save.addEventListener("click", submitCreate);
    cancel.addEventListener("click", function () {
      state.creating = false;
      renderFolders();
    });

    input.addEventListener("input", function () {
      UI.clearFieldError("scores-folder-input");
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        submitCreate();
      } else if (event.key === "Escape") {
        state.creating = false;
        renderFolders();
      }
    });

    window.setTimeout(function () {
      input.focus();
    }, 0);

    return wrap;
  }

  function submitCreate() {
    var input = UI.byId("scores-folder-input");
    if (!input) return;

    var check = validateName(input.value, childFolders(), null);
    if (check.error) {
      UI.setFieldError("scores-folder-input", check.error);
      return;
    }
    UI.clearFieldError("scores-folder-input");

    var save = UI.byId("scores-folder-save");
    UI.setButtonLoading(save, true);

    API.createFolder({ name: check.name, parentId: state.currentId })
      .then(function (saved) {
        UI.setButtonLoading(save, false);
        if (!saved) {
          UI.toast("Cartella non creata: spazio insufficiente.", "error");
          return null;
        }

        state.creating = false;
        UI.toast("Cartella creata.", "success");
        return load({});
      })
      .catch(function () {
        UI.setButtonLoading(save, false);
        UI.toast("Cartella non creata.", "error");
      });
  }

  function startRename(type, id) {
    if (!Auth.isAdmin()) return;
    state.creating = false;
    state.renaming = { type: type, id: id };
    render();
  }

  function buildRenameBox() {
    var wrap = UI.create("div", "rename-box");
    var target = state.renaming;
    var isFolder = target && target.type === "folder";
    var entity = isFolder ? findFolder(target.id) : findFile(target.id);

    var field = UI.create("div", "field");
    var input = UI.create("input", "field__input rename-box__input");
    input.type = "text";
    input.id = "scores-rename-input";
    input.maxLength = isFolder ? MAX_FOLDER_NAME : MAX_FILE_NAME + 4;
    input.value = entity ? entity.name : "";
    input.setAttribute("aria-label", "Nuovo nome");

    var errorEl = UI.create("p", "field__error");
    errorEl.setAttribute("data-error-for", "scores-rename-input");

    field.appendChild(input);
    field.appendChild(errorEl);
    wrap.appendChild(field);

    var actions = UI.create("div", "rename-box__actions");
    var save = UI.create("button", "btn btn--primary btn--sm", "Salva");
    save.type = "button";
    save.id = "scores-rename-save";
    var cancel = UI.create("button", "btn btn--ghost btn--sm", "Annulla");
    cancel.type = "button";
    cancel.id = "scores-rename-cancel";
    actions.appendChild(save);
    actions.appendChild(cancel);
    wrap.appendChild(actions);

    save.addEventListener("click", submitRename);
    cancel.addEventListener("click", function () {
      state.renaming = null;
      render();
    });

    input.addEventListener("input", function () {
      UI.clearFieldError("scores-rename-input");
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        submitRename();
      } else if (event.key === "Escape") {
        state.renaming = null;
        render();
      }
    });

    window.setTimeout(function () {
      input.focus();
      input.select();
    }, 0);

    return wrap;
  }

  function submitRename() {
    var target = state.renaming;
    var input = UI.byId("scores-rename-input");
    if (!target || !input) return;

    var isFolder = target.type === "folder";
    var siblings = isFolder ? childFolders() : state.files;
    var check = isFolder
      ? validateName(input.value, siblings, target.id)
      : validateFileName(input.value, siblings, target.id);

    if (check.error) {
      UI.setFieldError("scores-rename-input", check.error);
      return;
    }
    UI.clearFieldError("scores-rename-input");

    var save = UI.byId("scores-rename-save");
    UI.setButtonLoading(save, true);

    var action = isFolder
      ? API.renameFolder(target.id, check.name)
      : API.renameScore(target.id, check.name);

    action
      .then(function (updated) {
        UI.setButtonLoading(save, false);
        if (!updated) {
          UI.toast("Rinomina non riuscita.", "error");
          return null;
        }

        state.renaming = null;
        UI.toast("Nome aggiornato.", "success");
        return load({});
      })
      .catch(function () {
        UI.setButtonLoading(save, false);
        UI.toast("Rinomina non riuscita.", "error");
      });
  }

  /* ----------------------------------------------------------
   * Caricamento PDF ed eliminazioni
   * -------------------------------------------------------- */
  function isPdf(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf("pdf") !== -1) return true;
    return /\.pdf$/i.test(file.name || "");
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Lettura file fallita."));
      };
      reader.readAsDataURL(file);
    });
  }

  function handleFileSelection() {
    var file = el.fileInput && el.fileInput.files && el.fileInput.files[0];
    if (el.fileInput) el.fileInput.value = "";
    if (!file || !Auth.isAdmin()) return;

    if (!isPdf(file)) {
      UI.toast("Seleziona un file PDF.", "error");
      return;
    }

    if (file.size > API.MAX_SCORE_BYTES) {
      UI.toast("Il file supera il limite di 1 MB del mock locale.", "error");
      return;
    }

    UI.showLoader("Caricamento PDF");

    readFileAsDataUrl(file)
      .then(function (content) {
        return API.createScore({
          folderId: state.currentId,
          name: file.name,
          size: file.size,
          mime: "application/pdf",
          content: content
        });
      })
      .then(function (saved) {
        UI.hideLoader();
        if (!saved) {
          UI.toast("Caricamento non riuscito: spazio insufficiente.", "error");
          return null;
        }

        UI.toast("PDF caricato.", "success");
        return load({});
      })
      .catch(function () {
        UI.hideLoader();
        UI.toast("Caricamento non riuscito.", "error");
      });
  }

  function confirmDeleteFolder(folder) {
    if (!Auth.isAdmin()) return;

    UI.confirm({
      title: "Eliminare la cartella?",
      text:
        "“" + (folder.name || "Cartella") +
        "” e tutto il suo contenuto verranno rimossi per tutti i membri.",
      confirmLabel: "Elimina",
      cancelLabel: "Annulla",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;

      UI.showLoader("Eliminazione");

      API.deleteFolder(folder.id)
        .then(function (removed) {
          UI.hideLoader();
          if (!removed) {
            UI.toast("Eliminazione non riuscita.", "error");
            return null;
          }

          UI.toast("Cartella eliminata.", "info");
          return load({});
        })
        .catch(function () {
          UI.hideLoader();
          UI.toast("Eliminazione non riuscita.", "error");
        });
    });
  }

  function confirmDeleteFile(file) {
    if (!Auth.isAdmin()) return;

    UI.confirm({
      title: "Eliminare il PDF?",
      text: "“" + (file.name || "File") + "” verrà rimosso per tutti i membri.",
      confirmLabel: "Elimina",
      cancelLabel: "Annulla",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;

      UI.showLoader("Eliminazione");

      API.deleteScore(file.id)
        .then(function (removed) {
          UI.hideLoader();
          if (!removed) {
            UI.toast("Eliminazione non riuscita.", "error");
            return null;
          }

          UI.toast("PDF eliminato.", "info");
          return load({});
        })
        .catch(function () {
          UI.hideLoader();
          UI.toast("Eliminazione non riuscita.", "error");
        });
    });
  }

  /* ----------------------------------------------------------
   * Apertura e download PDF
   * -------------------------------------------------------- */
  /* Converte un data URL (base64 o testuale) in Blob. */
  function dataUrlToBlob(dataUrl) {
    var comma = dataUrl.indexOf(",");
    if (comma === -1) return null;

    var header = dataUrl.slice(0, comma);
    var mimeMatch = header.match(/^data:([^;,]+)/);
    var mime = (mimeMatch && mimeMatch[1]) || "application/pdf";
    var isBase64 = /;base64$/i.test(header);

    try {
      var raw = dataUrl.slice(comma + 1);
      var bin = isBase64 ? atob(raw) : decodeURIComponent(raw);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch (e) {
      return null;
    }
  }

  /* Apre il PDF in una pagina con il nome del file come titolo della
   * scheda (il titolo di un blob/data URL sarebbe "Untitled"). */
  function renderPdfPage(win, objectUrl, name) {
    try {
      var doc = win.document;
      if (!doc || !doc.head || !doc.body) throw new Error("finestra non pronta");

      doc.title = name;

      var style = doc.createElement("style");
      style.textContent =
        "html,body{margin:0;width:100%;height:100%;background:#525659}" +
        "embed{display:block;width:100%;height:100%;border:0}";

      var embed = doc.createElement("embed");
      embed.setAttribute("src", objectUrl);
      embed.setAttribute("type", "application/pdf");

      doc.head.appendChild(style);
      doc.body.appendChild(embed);
    } catch (e) {
      /* Fallback: navigazione diretta all'oggetto. */
      try {
        win.location = objectUrl;
      } catch (e2) {
        /* Nessuna azione possibile. */
      }
    }
  }

  function openFile(file) {
    UI.showLoader("Apertura PDF");

    API.getScoreContent(file.id)
      .then(function (content) {
        UI.hideLoader();
        if (!content) {
          UI.toast("Contenuto PDF non disponibile.", "error");
          return;
        }

        var name = file.name || "spartito.pdf";
        if (!/\.pdf$/i.test(name)) name += ".pdf";

        /* I data: URL non possono essere aperti in una nuova scheda
         * (navigazioni top-frame bloccate da Chrome e Firefox): si
         * converte in Blob e si apre una pagina che incastona il PDF. */
        var target = content;
        var objectUrl = null;
        if (content.indexOf("data:") === 0) {
          var blob = dataUrlToBlob(content);
          if (blob && window.URL && URL.createObjectURL) {
            objectUrl = URL.createObjectURL(blob);
            target = "about:blank";
          }
        }

        var win = window.open(target, "_blank");
        if (!win) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          UI.toast("Consenti le finestre popup per aprire il PDF.", "error");
          return;
        }

        if (objectUrl) {
          if (win.document) {
            renderPdfPage(win, objectUrl, name);
          } else {
            win.location = objectUrl;
          }
          /* L'URL viene rilasciato dopo l'avvio del caricamento: la
           * scheda resta valida, ogni nuova apertura genera un nuovo
           * Blob. */
          setTimeout(function () {
            try {
              URL.revokeObjectURL(objectUrl);
            } catch (e) {
              /* Nessuna azione possibile. */
            }
          }, 15000);
        }
      })
      .catch(function () {
        UI.hideLoader();
        UI.toast("Impossibile aprire il PDF.", "error");
      });
  }

  function downloadFile(file) {
    UI.showLoader("Preparazione PDF");

    API.getScoreContent(file.id)
      .then(function (content) {
        UI.hideLoader();
        if (!content) {
          UI.toast("Contenuto PDF non disponibile.", "error");
          return;
        }

        var name = file.name || "spartito.pdf";
        if (!/\.pdf$/i.test(name)) name += ".pdf";

        var link = document.createElement("a");
        link.href = content;
        link.download = name;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch(function () {
        UI.hideLoader();
        UI.toast("Download non riuscito.", "error");
      });
  }

  /* ----------------------------------------------------------
   * API pubblica
   * -------------------------------------------------------- */
  return {
    init: init,
    onViewEnter: onViewEnter,
    refresh: refresh
  };
})();