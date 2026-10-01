/* =============================================================
 * Banda - format.js
 * Utilità condivise su date e stati di presenza, usate dalle
 * sezioni Eventi e Presenze.
 * ============================================================= */

window.Format = (function () {
  "use strict";

  var MONTHS_SHORT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU",
                      "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

  var MONTHS_FULL = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
                     "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  var WEEKDAYS_SHORT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  /* ----------------------------------------------------------
   * Date
   * -------------------------------------------------------- */
  function parseDateParts(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    return {
      y: parseInt(match[1], 10),
      m: parseInt(match[2], 10) - 1,
      d: parseInt(match[3], 10)
    };
  }

  function toLocalDate(value) {
    var parts = parseDateParts(value);
    return parts ? new Date(parts.y, parts.m, parts.d) : null;
  }

  function monthShort(index) {
    return MONTHS_SHORT[index] || "";
  }

  function dayShort(date) {
    return WEEKDAYS_SHORT[date.getDay()] || "";
  }

  function formatEventDate(value) {
    var date = toLocalDate(value);
    if (!date) return value || "";

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Oggi";
    if (diff === 1) return "Domani";
    if (diff === -1) return "Ieri";

    return dayShort(date) + " " + date.getDate() + " " + monthFull(date.getMonth()) + " " + date.getFullYear();
  }

  function monthFull(index) {
    return MONTHS_FULL[index] || "";
  }

  function formatEventDateTime(event) {
    var when = formatEventDate(event && event.date);
    if (event && event.time) when += " - ore " + event.time;
    return when;
  }

  function eventTimestamp(event) {
    var parts = parseDateParts(event && event.date);
    if (!parts) return 0;

    var time = /^\d{1,2}:\d{2}$/.test((event && event.time) || "") ? event.time : "00:00";
    var hm = time.split(":");
    return new Date(parts.y, parts.m, parts.d, parseInt(hm[0], 10), parseInt(hm[1], 10), 0, 0).getTime();
  }

  function isPastEvent(event) {
    var parts = parseDateParts(event && event.date);
    if (!parts) return false;

    var time = /^\d{1,2}:\d{2}$/.test((event && event.time) || "") ? event.time : "23:59";
    var hm = time.split(":");
    var when = new Date(parts.y, parts.m, parts.d, parseInt(hm[0], 10), parseInt(hm[1], 10), 0, 0);
    return when.getTime() < Date.now();
  }

  /* ----------------------------------------------------------
   * Stati di presenza
   * -------------------------------------------------------- */
  function presenceLabel(status) {
    if (status === "yes") return "Ci sono";
    if (status === "no") return "Assente";
    return "In attesa";
  }

  function presenceClass(status) {
    if (status === "yes") return "status status--yes";
    if (status === "no") return "status status--no";
    return "status";
  }

  function buildStatusBadge(presence) {
    var status = presence && presence.status;
    return window.UI.create("span", presenceClass(status), presenceLabel(status));
  }

  function percent(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  function fullName(member) {
    var source = member || {};
    return ((source.firstName || "") + " " + (source.lastName || "")).trim();
  }

  return {
    MONTHS_SHORT: MONTHS_SHORT,
    parseDateParts: parseDateParts,
    toLocalDate: toLocalDate,
    monthShort: monthShort,
    formatEventDate: formatEventDate,
    formatEventDateTime: formatEventDateTime,
    eventTimestamp: eventTimestamp,
    isPastEvent: isPastEvent,
    presenceLabel: presenceLabel,
    presenceClass: presenceClass,
    buildStatusBadge: buildStatusBadge,
    percent: percent,
    fullName: fullName
  };
})();
