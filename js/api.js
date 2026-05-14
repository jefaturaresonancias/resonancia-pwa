// js/api.js — Comunicación con Apps Script

const API = (() => {
  // ── helpers de fecha ──────────────────────────────────────
  function hoy() {
    return fechaAStr(new Date());
  }

  function fechaAStr(d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  // ── fetch GET ────────────────────────────────────────────
  async function get(params) {
    const url  = Config.getUrl();
    if (!url) throw new Error("URL de API no configurada");
    const qs   = new URLSearchParams(params).toString();
    const resp = await fetch(`${url}?${qs}`, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Error desconocido del servidor");
    return json.data;
  }

  // ── fetch POST ───────────────────────────────────────────
  // Enviamos como text/plain para evitar preflight CORS
  async function post(body) {
    const url = Config.getUrl();
    if (!url) throw new Error("URL de API no configurada");
    // Enviar cada campo como parámetro GET individual — evita JSON parsing en Apps Script
    const params = {};
    for (const [k, v] of Object.entries(body)) {
      params[k] = v !== null && v !== undefined ? String(v) : "";
    }
    const qs   = new URLSearchParams(params).toString();
    const resp = await fetch(`${url}?${qs}`, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Error desconocido del servidor");
    return json.data;
  }

  // ── métodos públicos ─────────────────────────────────────

  return {
    hoy,
    fechaAStr,

    /** Verifica conexión con el servidor. */
    ping() {
      return get({ action: "ping" });
    },

    /** Carga lista de estudios y configuración de calendario. */
    config() {
      return get({ action: "config" });
    },

    /**
     * Grilla semanal para vista administrativa.
     * @param {string} desde  dd/MM/yyyy
     * @param {number} dias   cantidad de días (default 7)
     * @param {number} paso   minutos por slot (20 / 40 / 60)
     */
    agenda(desde, dias = 7, paso = 40) {
      return get({ action: "agenda", desde, dias, paso });
    },

    /**
     * Lista de turnos del día para técnicos.
     * @param {string} fecha  dd/MM/yyyy
     */
    turnos(fecha) {
      return get({ action: "turnos", fecha });
    },

    /**
     * Horarios disponibles para un estudio en una fecha.
     * @param {string} fecha   dd/MM/yyyy
     * @param {string} estudio nombre exacto del estudio (puede ser comma-separated)
     * @param {string} origen  AMBULATORIO | INTERNACIÓN | etc.
     */
    slots(fecha, estudio, origen = "AMBULATORIO") {
      return get({ action: "slots", fecha, estudio, origen });
    },

    /**
     * Busca turnos por apellido y/o DNI.
     * @param {string} apellido
     * @param {string} dni
     */
    buscar(apellido, dni) {
      const p = { action: "buscar" };
      if (apellido) p.apellido = apellido;
      if (dni)      p.dni      = dni;
      return get(p);
    },

    /**
     * Asigna un nuevo turno.
     * @param {object} datos  { nombre, apellido, dni, estudio, origen, fecha, hora, observaciones }
     */
    asignar(datos) {
      return post({ action: "asignar", ...datos });
    },

    /**
     * Registra presente de un paciente.
     * @param {number} fila  Número de fila en Base de datos
     */
    presente(fila) {
      return post({ action: "presente", fila });
    },

    /**
     * Anula un turno existente.
     * @param {number} fila  Número de fila en Base de datos
     */
    anular(fila) {
      return post({ action: "anular", fila });
    },

    // ── RIS ────────────────────────────────────────────────

    /** Turnos RIS de una fecha. */
    leerRIS(fecha) {
      return get({ action: "leerRIS", fecha });
    },

    /** Turnos RIS de un rango de fechas → { "dd/MM/yyyy": [...] } */
    leerRISRango(desde, dias = 7) {
      return get({ action: "leerRISRango", desde, dias });
    },

    /** Hashes existentes para una fecha (dedup). */
    verificarRIS(fecha) {
      return get({ action: "verificarRIS", fecha });
    },

    /**
     * Escribe filas RIS. Solo agrega las nuevas (por hash).
     * @param {string} fecha  dd/MM/yyyy
     * @param {Array}  filas  [{ hora, documento, apellido_nombre, practica }]
     */
    escribirRIS(fecha, filas) {
      // Datos complejos (array) — usar parámetro JSON especial
      return get({ action: "escribirRIS", fecha, filas: JSON.stringify(filas) });
    }
  };
})();