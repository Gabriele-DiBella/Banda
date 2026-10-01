/* ==============================================================
 * Banda - push-config.js
 * Configurazione push condivisa tra pagina e Service Worker.
 * ---------------------------------------------------------------
 * La chiave privata VAPID corrispondente NON va mai inclusa nel
 * repository: verrà caricata sul backend (web-push) quando si
 * attiverà l'invio reale. Se si rigenera la coppia, basta
 * sostituire qui la chiave pubblica (le iscrizioni locali mock
 * non ne risentono).
 * ============================================================ */
self.PUSH_CONFIG = {
  /* Chiave pubblica VAPID (base64url, punto non compresso 0x04||X||Y). */
  vapidPublicKey:
    "BPJX8OMMtABT-QdMkvlCYjEp4rzb-6NA8Bgc8MKkP6ANvfCiGLZOBTz7s3D7SVXBzc1fGb4hBkpeFdyEdjfrGpc"
};
