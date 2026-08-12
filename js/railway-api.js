// js/railway-api.js — Cliente para la API de sistema2-node (Railway).
// El token se pide una sola vez vía Apps Script (API.obtenerTokenRailway,
// que guarda el PIN de servicio server-side — nunca llega al navegador) y
// se cachea en sessionStorage; las llamadas de datos van directo del
// navegador a Railway, sin pasar por Apps Script en cada request.
const RailwayAPI = (() => {
  const RAILWAY_URL = "https://jefatura-rmn-sistema2-production.up.railway.app";
  const KEY_TOKEN = "railway_token";

  async function _getToken(forzar = false) {
    if (!forzar) {
      const cacheado = sessionStorage.getItem(KEY_TOKEN);
      if (cacheado) return cacheado;
    }
    const data = await API.obtenerTokenRailway();
    sessionStorage.setItem(KEY_TOKEN, data.token);
    return data.token;
  }

  async function _post(fn, args, token) {
    const resp = await fetch(`${RAILWAY_URL}/api/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ args })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  /**
   * Llama a una función RPC de Railway (POST /api/rpc/:fn).
   * @param {string} fn     Nombre de la función (ej. "api_bot_obtenerEstado")
   * @param {Array}  args   Argumentos posicionales, mismo orden que espera el RPC
   */
  async function rpc(fn, args = []) {
    let token = await _getToken();
    let json = await _post(fn, args, token);

    // Token vencido/inválido — pedir uno nuevo una sola vez y reintentar.
    if (json.ok === false && /no autorizado|sesi[oó]n inv[aá]lida/i.test(json.error || "")) {
      token = await _getToken(true);
      json = await _post(fn, args, token);
    }

    if (json.ok === false) throw new Error(json.error || "Error desconocido de Railway");
    return json;
  }

  // ── Fase 1: lecturas de agenda migradas a Railway ──────────────

  /**
   * Turnos RIS de un rango de fechas → { "dd/MM/yyyy": [...] }.
   * Mismo contrato que API.leerRISRango (que leía BD_RIS vía Apps Script) —
   * reemplaza esa llamada en js/views/agenda.js.
   */
  async function leerRISRango(desde, dias = 7) {
    const data = await rpc('api_leerRISRango', [desde, dias]);
    return data.porFecha;
  }

  /**
   * Turnos de Cardiología (franja 08-14hs) de un rango de fechas.
   * Mismo contrato que API.leerCardiologia (que leía la planilla externa
   * vía Apps Script) — reemplaza esa llamada en js/views/agenda.js.
   */
  async function leerCardiologia(desde, dias = 7) {
    const data = await rpc('api_leerCardiologiaRango', [desde, dias]);
    return data.porFecha;
  }

  // ── Fase 2a: alta de turnos migrada a Railway ──────────────────

  /**
   * Asigna un nuevo turno (incluye sobreturnos sobre un slot de RIS).
   * Mismo contrato que API.asignar — Railway lo guarda en Postgres y lo
   * refleja en la hoja "Base de datos" para que Portada lo vea igual.
   * @param {object} datos  { nombre, apellido, dni, estudio, origen, fecha, hora, observaciones }
   */
  async function asignar(datos) {
    sessionStorage.clear();
    return rpc('api_turnos_asignar', [datos]);
  }

  // ── Fase 2b: anular/presente/modificar migradas a Railway ──────
  // `fila` acá sigue siendo el número de fila del Sheet — las lecturas
  // (agenda/lista/buscar) todavía vienen de Apps Script, así que es lo
  // único que la PWA tiene en la mano. Railway lo usa como fila_sheet
  // para ubicar el turno correspondiente (ver rpc/turnos.js).

  /** Anula un turno existente. @param {number} fila Fila en "Base de datos" */
  async function anular(fila) {
    sessionStorage.clear();
    return rpc('api_turnos_anular', [{ filaSheet: fila }]);
  }

  /** Registra presente de un paciente. @param {number} fila Fila en "Base de datos" */
  async function presente(fila) {
    return rpc('api_turnos_presente', [{ filaSheet: fila }]);
  }

  /**
   * Reprograma un turno existente (fecha y/o estudio) en una sola operación.
   * @param {number} fila   Fila original en "Base de datos"
   * @param {object} datos  { tipo, nombre, apellido, dni, estudio, origen, fecha, hora, observaciones }
   */
  async function modificar(fila, datos) {
    sessionStorage.clear();
    return rpc('api_turnos_modificar', [{ filaSheet: fila, ...datos }]);
  }

  // ── Etapa 2b (migración de lecturas): grilla semanal ────────────

  /**
   * Grilla semanal para vista administrativa.
   * Mismo contrato que API.agenda — reemplaza esa llamada en agenda.js/lista.js/stats.js.
   * @param {string} desde  dd/MM/yyyy
   * @param {number} dias   cantidad de días (default 7)
   * @param {number} paso   minutos por slot (20 / 40 / 60)
   */
  async function agenda(desde, dias = 7, paso = 40) {
    const data = await rpc('api_agenda_grilla', [{ desde, dias, paso }]);
    return data.dias;
  }

  // ── Etapa 2c (migración de lecturas): horarios disponibles ──────

  /**
   * Horarios disponibles para un estudio en una fecha.
   * Mismo contrato que API.slots — reemplaza esa llamada en js/views/turno.js.
   * @param {string} fecha   dd/MM/yyyy
   * @param {string} estudio nombre exacto del estudio (puede ser comma-separated)
   * @param {string} origen  AMBULATORIO | INTERNACIÓN | etc.
   */
  async function slots(fecha, estudio, origen = "AMBULATORIO") {
    return rpc('api_agenda_slots', [{ fecha, estudio, origen }]);
  }

  // ── Etapa 2a (migración de lecturas): lista del día y búsqueda ──

  /**
   * Lista de turnos del día para técnicos.
   * Mismo contrato que API.turnos — reemplaza esa llamada en js/views/lista.js.
   * @param {string} fecha dd/MM/yyyy
   */
  async function turnos(fecha) {
    const data = await rpc('api_agenda_turnos', [fecha]);
    return data.turnos;
  }

  /**
   * Busca turnos por apellido y/o DNI.
   * Mismo contrato que API.buscar — reemplaza esa llamada en js/views/turno.js.
   */
  async function buscar(apellido, dni) {
    const data = await rpc('api_agenda_buscar', [{ apellido, dni }]);
    return data.turnos;
  }

  // ── Migración de Validaciones Agenda ────────────────────────────

  /**
   * Lista completa de validaciones de agenda (histórico + activas).
   * Mismo contrato que API.leerValidacionesAgenda (que leía la pestaña
   * "Validaciones Agenda" vía Apps Script) — reemplaza esa llamada en
   * js/views/validaciones.js.
   */
  async function leerValidacionesAgenda() {
    const data = await rpc('api_validacionesAgenda_leer');
    return data.filas;
  }

  /**
   * Marca (o desmarca) una validación como reportada. Railway-first: graba
   * en Postgres y refleja hacia la Sheet (ver rpc/validacionesAgenda.js).
   */
  async function marcarValidacionReportada(hash, reportado = true) {
    return rpc('api_validacionesAgenda_marcarReportada', [{ hash, reportado }]);
  }

  // ── Migración de Reglas Agenda ──────────────────────────────────
  // Acá Railway sí es la fuente de verdad (a diferencia de Config): esta
  // pestaña del Sheet solo se edita desde este modal, nunca a mano.

  /** Mismo contrato que API.leerReglasAgenda. */
  async function leerReglasAgenda() {
    const data = await rpc('api_reglasAgenda_leer');
    return data.reglas;
  }

  /** Upsert de una regla. Mismo contrato que API.guardarReglaAgenda. */
  async function guardarReglaAgenda(regla) {
    return rpc('api_reglasAgenda_guardar', [regla]);
  }

  /** Mismo contrato que API.eliminarReglaAgenda. */
  async function eliminarReglaAgenda(id) {
    return rpc('api_reglasAgenda_eliminar', [{ id }]);
  }

  return {
    rpc, leerRISRango, leerCardiologia, asignar, anular, presente, modificar, turnos, buscar, agenda, slots,
    leerValidacionesAgenda, marcarValidacionReportada, leerReglasAgenda, guardarReglaAgenda, eliminarReglaAgenda
  };
})();
