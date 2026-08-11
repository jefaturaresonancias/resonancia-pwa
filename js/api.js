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
    // Google cachea las respuestas de doGet por combinación exacta de parámetros
    // (independiente de los headers Cache-Control que ponga el propio script) —
    // un valor único por request evita que sirva una respuesta vieja.
    const qs   = new URLSearchParams({ ...params, _ts: Date.now() }).toString();
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
    const qs   = new URLSearchParams({ ...params, _ts: Date.now() }).toString();
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

    /**
     * Reprograma un turno existente (fecha y/o estudio) en una sola operación atómica.
     * @param {number} fila   Fila original en Base de datos
     * @param {object} datos  { tipo, nombre, apellido, dni, estudio, origen, fecha, hora, observaciones }
     */
    modificar(fila, datos) {
      sessionStorage.clear();
      return post({ action: "modificar", fila, ...datos });
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

    /** Actualiza prácticas de turnos existentes en BD_RIS */
    async actualizarPracticasRIS(fecha, items) {
      const CHUNK = 10;
      let actualizadas = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        const res = await get({ action: "actualizarPracticasRIS", fecha, items: JSON.stringify(chunk) });
        actualizadas += res.actualizadas || 0;
      }
      return { actualizadas, mensaje: `${actualizadas} prácticas actualizadas` };
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

    /**
     * Escribe la lista completa de estudios. A diferencia de escribirConfig,
     * va en chunks: con ~130 estudios el JSON no entra en una sola URL
     * (todo viaja como querystring, no hay body real — mismo motivo por el
     * que escribirRIS ya chunkea). El primer chunk limpia el rango entero
     * en el servidor; los siguientes agregan a partir de `offset`.
     *
     * Cada chunk reintenta con backoff: el rango ya quedó limpio desde el
     * primer chunk, así que un chunk que falla a mitad de camino (ej. un
     * bloqueo temporal de tráfico automatizado de Google) deja la hoja con
     * MENOS estudios de los que había — no es un error cosmético, hay que
     * insistir en vez de devolver un resultado parcial silencioso.
     */
    async escribirEstudios(estudios) {
      const CHUNK = 25;
      const REINTENTOS = 3;
      const ESPERA_MS = 3000;

      async function escribirChunk(offset, datos) {
        let ultimoError;
        for (let intento = 1; intento <= REINTENTOS; intento++) {
          try {
            return await get({ action: "escribirConfig", seccion: "estudios", offset, datos: JSON.stringify(datos) });
          } catch (err) {
            ultimoError = err;
            if (intento < REINTENTOS) await new Promise(r => setTimeout(r, ESPERA_MS * intento));
          }
        }
        throw new Error(`No se pudo guardar el bloque de estudios en la fila ${2 + offset} tras ${REINTENTOS} intentos: ${ultimoError.message}. Revisá la hoja Config antes de reintentar — puede haber quedado con menos estudios de los que había.`);
      }

      let escritos = 0;
      if (estudios.length === 0) {
        // Sin chunks que disparen el offset=0 — mandar uno vacío igual,
        // para que el servidor limpie el rango.
        await escribirChunk(0, []);
        return { escritos: 0 };
      }
      for (let i = 0; i < estudios.length; i += CHUNK) {
        const chunk = estudios.slice(i, i + CHUNK);
        const res = await escribirChunk(i, chunk);
        escritos += res.escritos || 0;
      }
      // El rango se limpia una sola vez en el primer chunk (offset=0); si
      // la lista quedó más corta que antes, no queda basura residual porque
      // clearContent ya borró todo el rango A2:D500 al principio.
      return { escritos };
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
    },

    /** Valida el PIN de jefatura/admin. @returns {Promise<{valido:boolean}>} */
    validarPin(rol, pin) {
      return get({ action: 'validarPin', rol, pin });
    },

    /** Cambia el PIN de jefatura/admin. */
    cambiarPin(rol, pinActual, pinNuevo) {
      return get({ action: 'cambiarPin', rol, pinActual, pinNuevo });
    },

    /** Token de sesión para pegarle directo a la API de Railway (sistema2-node). */
    obtenerTokenRailway() {
      return get({ action: 'obtenerTokenRailway' });
    },

    /** Validaciones de agenda (reglas.js del bot) — turnos que violan
     *  restricciones operativas fijas (horarios de contraste, cardio, etc). */
    leerValidacionesAgenda() {
      return get({ action: 'leerValidacionesAgenda' });
    },

    /** Reglas de agenda editables — las que arma el motor genérico de
     *  reglas.js. regla va como JSON string (mismo patrón que escribirConfig,
     *  necesario porque todo viaja como querystring, no body real). */
    leerReglasAgenda() {
      return get({ action: 'leerReglasAgenda' });
    },
    guardarReglaAgenda(regla) {
      return get({ action: 'guardarReglaAgenda', regla: JSON.stringify(regla) });
    },
    eliminarReglaAgenda(id) {
      return get({ action: 'eliminarReglaAgenda', id });
    },
    marcarValidacionReportada(hash, reportado = true) {
      return get({ action: 'marcarValidacionReportada', hash, reportado });
    }

  };
})();