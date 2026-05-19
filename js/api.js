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
      sessionStorage.clear();
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
      sessionStorage.clear();
      return post({ action: "anular", fila });
    },

    // ── RIS ────────────────────────────────────────────────

    /** Pacientes de agenda cardiología para un rango de fechas */
    leerCardiologia(desde, dias = 7) {
      return get({ action: "leerCardiologia", desde, dias });
    },

    /** Turnos RIS de una fecha. */
    leerRIS(fecha) {
      return get({ action: "leerRIS", fecha });
    },

    /** Turnos RIS de un rango de fechas → { "dd/MM/yyyy": [...] } */
    leerRISRango(desde, dias = 7) {
      return get({ action: "leerRISRango", desde, dias });
    },

    /** Actualiza estados de turnos existentes en BD_RIS */
    async actualizarEstadosRIS(fecha, items) {
      const CHUNK = 10;
      let actualizadas = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        const res = await get({ action: "actualizarEstadosRIS", fecha, items: JSON.stringify(chunk) });
        actualizadas += res.actualizadas || 0;
      }
      return { actualizadas, mensaje: `${actualizadas} estados actualizados` };
    },

    /** Hashes existentes para una fecha (dedup). */
    verificarRIS(fecha) {
      return get({ action: "verificarRIS", fecha });
    },

    /** Lee secciones del Config */
    leerConfig(seccion) {
      return get({ action: "leerConfig", seccion: seccion || "all" });
    },

    /** Escribe una sección del Config */
    async escribirConfig(seccion, datos) {
      return get({ action: "escribirConfig", seccion, datos: JSON.stringify(datos) });
    },

    async escribirRIS(fecha, filas) {
      // Dividir en chunks de 10 para no superar el límite de URL
      const CHUNK = 10;
      let agregadas = 0, descartadas = 0;
      for (let i = 0; i < filas.length; i += CHUNK) {
        const chunk = filas.slice(i, i + CHUNK);
        const res = await get({ action: "escribirRIS", fecha, filas: JSON.stringify(chunk) });
        agregadas   += res.agregadas   || 0;
        descartadas += res.descartadas || 0;
      }
      return {
        agregadas,
        descartadas,
        mensaje: agregadas === 0
          ? "Sin cambios — todos los registros ya existían"
          : `${agregadas} registros nuevos agregados, ${descartadas} ya existían`
      };
    },

    /** Log del bot — últimas ejecuciones */
    leerLog(limite = 20) {
      return get({ action: 'leerLog', limite });
    }

  };
})();