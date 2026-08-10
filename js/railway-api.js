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

  return { rpc, leerRISRango };
})();
