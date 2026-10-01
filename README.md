# Banda - PWA di gestione logistica

PWA per la gestione logistica di una banda musicale (50-60 utenti). Nessun
login: il profilo dell'utente viene salvato localmente sul dispositivo.

## Stato dello sviluppo

| Fase | Contenuto | Stato |
| ---- | --------- | ----- |
| 1 | Setup ambiente e PWA shell (manifest, service worker, UI base, loader, animazioni) | Completata |
| 2 | Onboarding locale (nome, cognome, strumenti), gate notifiche, sezione profilo | Completata |
| 3 | Sezione Eventi (lista, dettaglio, presenze, gestione admin) | Completata (su mock locale) |
| 4 | Dashboard admin e riepilogo presenze | Completata (su mock locale) |
| 5 | Archivio spartiti (cartelle + PDF) | Completata (su mock locale) |
| 6 | Permessi notifiche, Service Worker e installazione PWA | Completata lato client (l'invio push reale richiede il backend) |
| 7 | Rifinitura UI/UX e voci "Coming soon" | Parziale |

## Struttura dei file

```
/
├── index.html                 # App shell (tutte le schermate)
├── manifest.json              # Configurazione PWA
├── service-worker.js          # Cache offline e notifiche
├── /css
│   ├── style.css              # Design token, layout, animazioni
│   └── components.css         # Bottoni, campi, chip, loader, toast, modale, archivio spartiti
├── /js
│   ├── app.js                 # Avvio, onboarding, gate notifiche, navigazione, profilo, install
│   ├── auth.js                # Profilo locale (schema v2), strumenti, ruoli
│   ├── ui.js                  # Helper UI (loader, toast, chip, modale)
│   ├── format.js              # Date e stati di presenza condivisi
│   ├── api.js                 # Livello dati (mock, roster membri, riepiloghi presenze)
│   ├── events.js              # Sezione Eventi (lista, dettaglio, gestione admin)
│   ├── attendance.js          # Dashboard presenze (Fase 4)
│   ├── scores.js              # Archivio spartiti (Fase 5)
│   ├── push-config.js         # Chiave pubblica VAPID (condivisa con il SW)
│   └── push-notifications.js  # Permessi, iscrizione push, banner, installazione PWA
├── /assets
│   ├── /icons                 # Icone PWA (PNG + SVG sorgente)
│   └── /images
└── README.md
```

## Flusso applicativo

1. Splash screen.
2. Lettura del profilo da `localStorage`.
   - Se assente: onboarding (nome, cognome, selezione strumenti).
   - Se presente: si passa direttamente al punto 3.
3. Gate notifiche bloccante.
4. Dashboard principale con navigazione a schede (Home, Eventi, Spartiti,
   Presenze solo per gli admin, Profilo).

## Dati salvati su `localStorage`

| Chiave | Contenuto |
| ------ | --------- |
| `banda.user` | Profilo v2: `{ id, firstName, lastName, instruments[], role, createdAt, updatedAt }` |
| `banda.events` | Elenco eventi: `{ id, title, date, time, location, setlist, notes, createdAt, updatedAt }` |
| `banda.presences` | Mappa `eventId -> { [memberId]: { status: "yes" \| "no" \| null, note, updatedAt } }` |
| `banda.members` | Roster della banda (membri demo + membro del dispositivo, flag `local`) |
| `banda.folders` | Cartelle dell'archivio spartiti: `{ id, name, parentId, createdAt, updatedAt }` |
| `banda.scores` | PDF dell'archivio: `{ id, folderId, name, size, mime, content, createdAt, updatedAt }` (`content` = data URL) |
| `banda.pushSubscriptions` | Sottoscrizioni push di questo dispositivo: `{ endpoint, expirationTime, keys, deviceId, userAgent, updatedAt }` |
| `banda.deviceId` | Identificativo stabile della installazione (base per l'account multi-dispositivo) |
| `banda.demoMode` | `"true"` / `"false"`: dati dimostrativi del roster |
| `banda.notifications` | `"true"` / `"false"` |
| `banda.schemaVersion` | Versione dello schema dati |

## Ruoli

- `user` (Membro): uso base dell'app.
- `admin` (Amministratore): gestione eventi, presenze e spartiti.

Il ruolo e gia presente nel profilo locale (`Auth.isAdmin()`), verra assegnato
lato backend nelle fasi successive. Nel frattempo il selettore "Ruolo" nella
sezione Profilo permette di passare da Membro ad Amministratore per provare le
funzioni di gestione eventi.

## Sezione Eventi (Fase 3)

- **Lista**: eventi raggruppati in "In programma" e "Conclusi", con data,
  orario, luogo e badge della propria presenza.
- **Dettaglio**: data e luogo, conferma presenza ("Ci sono" / "Assente"),
  nota personale, scaletta e note dell'evento.
- **Admin**: pulsante "Nuovo evento", form (titolo, data, ora, luogo, scaletta,
  note), modifica ed eliminazione con conferma. Alla pubblicazione viene
  mostrata una notifica locale (l'invio push ai membri arrivera dal backend).
- **Home**: pannello "Prossimi eventi" con i tre impegni piu vicini e conteggio
  nel badge; la statistica "Eventi" conta gli eventi in programma.

Dati e presenze sono persistiti su `localStorage` tramite il mock di `api.js`,
quindi restano dopo la chiusura dell'app sullo stesso dispositivo.

## Dashboard presenze (Fase 4)

Accessibile solo con ruolo `admin`, dalla scheda "Presenze" o dal pulsante
"Apri il riepilogo presenze" nel dettaglio di un evento.

- **Selettore eventi**: elenco eventi con badge risposte (`risposte/totali`) ed
  evidenziazione di quello attivo.
- **Contatori**: presenti, assenti e in attesa, con barra composta e percentuale
  di risposta.
- **Elenco membri**: diviso in tre gruppi (Presenti, Assenti, In attesa) con
  strumento, eventuale nota personale e tag "Tu" per il membro del dispositivo.
- **Dati dimostrativi**: finché il backend non espone il roster, il riepilogo usa
  un'anagrafica di esempio; il pannello in fondo permette di attivarla o
  rimuoverla (chiave `banda.demoMode`).

I conteggi per evento sono gli stessi usati dai badge della lista eventi e dal
riepilogo nel dettaglio (`API.getAttendanceOverviews()` /
`API.getAttendanceSummary()`).

## Archivio spartiti (Fase 5)

Accessibile a tutti dalla scheda "Spartiti"; le azioni di gestione compaiono
solo con ruolo `admin`.

- **Navigazione**: cartelle annidate con briciole di percorso (breadcrumb) a
  partire dalla radice "Tutti gli spartiti"; ogni cartella indica il numero di
  sottocartelle e di PDF contenuti.
- **Membro**: sfoglia le cartelle, apre il PDF in una nuova scheda (con il nome
  del file come titolo) e puo scaricarlo in locale. L'apertura usa un Blob
  (`URL.createObjectURL`) perche i `data:` URL non possono essere navigati in
  una scheda top-level (bloccati da Chrome e Firefox).
- **Amministratore**: crea cartelle, rinomina ed elimina (con conferma; una
  cartella eliminata porta con se anche sottocartelle e PDF) e carica nuovi
  PDF nella cartella corrente.
- **Vincoli upload**: solo file `.pdf` entro il limite di 1 MB; il nome viene
  normalizzato (barre sostituite, suffisso `.pdf` garantito, max 76 caratteri)
  e i duplicati nella stessa cartella vengono rifiutati.
- **Mock locale**: il contenuto del PDF viene salvato come data URL
  (`data:application/pdf;base64,...`) nella chiave `banda.scores`; con il
  backend reale sara il riferimento al file caricato. Le cartelle di
  dimostrazione vengono create alla prima apertura (`API.getFolders()`).
- **Deep link**: `?view=scores` apre direttamente la sezione (utile per le
  shortcut installate e le notifiche push).

API di riferimento: `API.getFolders`, `API.getScores`, `API.createFolder`,
`API.renameFolder`, `API.deleteFolder` (cascata), `API.createScore`,
`API.renameScore`, `API.deleteScore`, `API.getScoreContent`. Il modulo UI e
`window.Scores` (`init`, `onViewEnter`, `refresh`); il Service Worker
pre-cache `js/scores.js` con la versione cache `banda-v5`.

## Notifiche push (Fase 6)

- **Intercettazione permessi**: `PushManager.startPermissionWatch()` osserva
  `visibilitychange`, `focus` e `pageshow` (la revoca avviene nelle
  impostazioni di sistema mentre l'app e in background) piu il controllo
  esplicito `PushManager.checkPermission()`. Le variazioni notificano i
  listener registrati con `PushManager.onPermissionChange()`.
- **Banner persistente** (`#notif-banner`, sotto la topbar, visibile in tutte
  le schermate): compare quando la preferenza attiva e il permesso diventa
  diverso da `granted`. Non ha pulsante di chiusura; il pulsante "Riattiva"
  richiede il consenso (permesso `default`) o mostra le istruzioni
  specifiche per browser (permesso `denied`), con prova di riattivazione.
- **Iscrizione push reale**: `PushManager.ensurePushSubscription()` e
  idempotente: crea l'iscrizione `pushManager.subscribe` con la chiave
  VAPID pubblica di `js/push-config.js` (condivisa con il Service Worker
  tramite `importScripts`) e la salva in `banda.pushSubscriptions` insieme
  a `banda.deviceId` (una riga per dispositivo, chiave `endpoint`).
  `disablePushSubscription()` fa il reverse.
- **Rinnovo automatico**: l'evento `pushsubscriptionchange` del Service
  Worker ricrea la sottoscrizione con la stessa chiave; il livello dati la
  registrera alla prossima apertura dell'app.
- **Invio**: con il mock locale, la creazione di un evento mostra la
  notifica solo sul dispositivo dell'amministratore
  (`PushManager.showLocalNotification`). L'invio a tutti i membri arriva
  con il backend (vedi piano sotto): la chiave privata VAPID NON e nel
  repository, va caricata sul server (web-push) e la coppia va rigenerata
  lì se necessario.

## Accesso dei membri e rilascio (piano)

Requisiti: accessibile a tutti i membri da qualsiasi rete (non solo in una
zona), accessibile **solo** ai membri, piu dispositivi sullo stesso account e
un identificativo non ambiguo (nome + cognome da soli non bastano: due membri
possono chiamarsi uguali).

### Verifica di fattibilita

- **Accessibile ovunque**: fattibile subito. La PWA e statica: basta
  pubblicarla su un hosting HTTPS (Netlify, Vercel, Cloudflare Pages, GitHub
  Pages). Service Worker, notifiche e installazione richiedono proprio HTTPS,
  quindi nessun vincolo di rete resta.
- **Solo i membri**: NON fattibile con l'architettura attuale. Senza login
  non esiste alcun controllo server: chiunque apra l'URL puo usare l'app e i
  dati (localStorage) sono manipolabili dal client. Un codice d'invito
  nascosto nel sorgente e solo un deterrente (lo vede chiunque apra il
  codice). Serve un backend con autenticazione.
- **Account multi-dispositivo**: NON fattibile con l'architettura attuale
  (il profilo vive nel localStorage del singolo dispositivo). Serve il login
  lato server; la struttura e pero gia predisposta: `Auth.migrate()`
  conserva il profilo locale e `API.getDeviceId()` identifica ogni
  installazione.
- **Identificativo univoco**: da aggiungere con l'accesso. Consiglio
  l'email (univoca, utile anche per recupero credenziali e inviti);
  alternativa per chi non la usa: username tipo `m.rossi` o codice membro
  generato dall'amministratore (es. `BND-4821`). Nome e cognome restano
  campi di visualizzazione, mai chiave di accesso: due "Marco Rossi"
  convivono senza ambiguita.

### Percorso proposto

1. **Step 1 - Rilascio ovunque (subito, costo 0)**: deploy statico su
   hosting HTTPS con dominio. Accessibile da casa, prove, concerti e dati
   mobili. Resta "aperto a chiunque con il link".
2. **Step 2 - Account e appartenenza (modifiche al codice)**:
   - schermata "Accedi" al posto dell'onboarding diretto (invito via email
     o codice membri + password oppure magic link);
   - `js/auth.js` diventa il wrapper di sessione lato server (stessa API
     pubblica: le view non cambiano);
   - `js/api.js` passa da localStorage a `fetch` con token (il layer e gia
     isolato: si sostituisce la sorgente, non le schermate);
   - identificativo univoco (email/username/codice) piu `banda.deviceId`
     (gia pronto) per collegare piu dispositivi allo stesso account.
3. **Step 3 - Dati e notifiche condivisi (backend)**:
   - database: eventi, presenze, cartelle e spartiti (i PDF non entrano nel
     localStorage: quota 5-10 MB, serve uno storage di oggetti);
   - invio push reale a tutti i dispositivi: chiave privata VAPID sul
     server (web-push) piu tabella sottoscrizioni (una riga per dispositivo,
     gia prodotta da `API.savePushSubscription`);
   - l'amministratore che crea un evento genera l'invio a tutti (oggi il
     mock mostra la notifica solo sul dispositivo locale).

### Scelte tecnologiche valutate

| Opzione | Pro | Contro |
| ------- | --- | ------ |
| **A. Supabase** (consigliata) | Postgres + Auth + Storage + RLS + Edge Functions serverless; tier gratuito per 60 utenti; app resta statica | servizio esterno |
| B. Node/Express + Postgres | controllo totale | gestione server, backup, TLS |
| C. Cloudflare Pages + Workers + D1 | economico e veloce | push e code da configurare a mano |

Raccomandazione: **A**. Integrazione minimale: due adapter (`js/auth.js` e
`js/api.js`) piu una funzione server per l'invio push.

## Come avviare in locale

Il Service Worker richiede `http`/`https` (non funziona con `file://`).

```powershell
# Opzione 1 - Python
python -m http.server 8080

# Opzione 2 - Node
npx serve -l 8080
```

Poi apri `http://localhost:8080`.

## Requisiti per PWA, notifiche e installazione

Service Worker, notifiche push e installazione dell'app richiedono un
**contesto sicuro**: `https://` oppure `http://localhost`. Se apri la pagina da
`http://` usando un indirizzo di rete (es. `http://192.168.1.10:8080`) il
browser disabilita tutte queste funzioni: l'app lo rileva e mostra un avviso
con le istruzioni al posto dei messaggi generici.

Modi corretti per provarla da smartphone:

1. Pubblicarla su un hosting con HTTPS (GitHub Pages, Netlify, Vercel,
   Cloudflare Pages).
2. Tunnel HTTPS verso il server locale (es. ngrok, cloudflared).
3. Sul computer, `http://localhost` (localhost e considerato sicuro).

Comportamento per piattaforma:

| Piattaforma | Notifiche | Installazione |
| ----------- | --------- | ------------- |
| Chrome / Edge desktop | si, dopo il consenso | riquadro in-app con pulsante "Installa sul dispositivo" |
| Chrome Android | si, dopo il consenso | riquadro in-app con pulsante di installazione |
| Safari iOS 16.4+ | solo con app installata | manuale: Condividi > Aggiungi a Home (istruzioni in-app) |
| Safari iOS < 16.4 | non supportate | manuale: Condividi > Aggiungi a Home |
| Contesto non sicuro (HTTP) | non supportate | non disponibile: serve HTTPS |

Nota: nessun browser mostra piu il prompt di installazione automatico. L'app
espone quindi un riquadro "Installa l'app" in Home che, se il browser ha reso
disponibile il prompt, mostra il pulsante di installazione; altrimenti spiega
la procedura manuale (menu del browser su Android/desktop, Condividi su iOS).

## Convenzioni UI/UX

- Design minimale, nessuna emoji.
- Animazione per ogni interazione (pressione, transizione, caricamento).
- Stati di caricamento espliciti (loader inline, overlay, spinner sui bottoni).
- Accento unico blu `#005bae`, con tinte dello stesso colore (`--accent`,
  `--accent-strong`, `--accent-light`) definite come design token in
  `css/style.css`. Il blu base viene usato per le superfici piene (bottoni,
  chip selezionati, barra di progresso); la tinta chiara `--accent-light` serve
  per testi e icone su fondo scuro, dove il blu base non avrebbe contrasto
  sufficiente.
- Rispetto di `prefers-reduced-motion`.

## Prossimi passi

- Step 1 del piano "Accesso dei membri": deploy su hosting HTTPS (Netlify,
  Vercel o Cloudflare Pages) con dominio dedicato.
- Step 2/3 del piano: backend con account (email o codice membri + password
  o magic link), sync di eventi/presenze/spartiti e invio push reale.
- Fase 7: rifinitura UI/UX e voci "Coming soon".
