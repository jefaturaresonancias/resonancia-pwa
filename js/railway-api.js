// js/railway-api.js — Cliente para la API de sistema2-node (Railway).
// El token se pide directo a Railway (api_login, que es pública — ver
// FUNCIONES_PUBLICAS en server.js) pidiendo el PIN de servicio con
// prompt(); ya no pasa por Apps Script (corte de Sheets, 25/8/2026). Se
// cachea en localStorage (27/8/2026, antes sessionStorage) — el token dura
// 30 días del lado del servidor (ver rpc/auth.js), pero sessionStorage se
// borra al cerrar la pestaña/app, pidiendo el PIN de nuevo en cada
// apertura sin aprovechar esos 30 días. localStorage persiste entre
// cierres; sigue expirando solo (rechazado por el servidor) a los 30 días
// o si cambia el PIN compartido.
const RailwayAPI = (() => {
  const RAILWAY_URL = "https://jefatura-rmn-sistema2-production.up.railway.app";
  const KEY_TOKEN = "railway_token";

  async function _login(pin) {
    const resp = await fetch(`${RAILWAY_URL}/api/rpc/api_login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: [pin] })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  // Config.cargar() y otras pantallas piden varios RPCs en paralelo
  // (Promise.all) — sin esta guarda, cada uno vería "no hay token todavía"
  // al mismo tiempo y abriría su propio prompt() del PIN, superpuestos.
  // _tokenPromise deja que todos esperen el mismo login en curso.
  let _tokenPromise = null;

  async function _getToken(forzar = false) {
    if (!forzar) {
      const cacheado = localStorage.getItem(KEY_TOKEN);
      if (cacheado) return cacheado;
    }
    if (_tokenPromise) return _tokenPromise;

    _tokenPromise = (async () => {
      let mensaje = "PIN de acceso:";
      for (let intentos = 0; intentos < 3; intentos++) {
        const pin = prompt(mensaje);
        if (pin === null) throw new Error("Login cancelado");
        const json = await _login(pin);
        if (json.ok) {
          localStorage.setItem(KEY_TOKEN, json.token);
          return json.token;
        }
        mensaje = "PIN incorrecto, reintentar:";
      }
      throw new Error("No se pudo iniciar sesión");
    })();

    try {
      return await _tokenPromise;
    } finally {
      _tokenPromise = null;
    }
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

  // Un alta/anulación/modificación deja obsoleta la cache de la grilla
  // semanal/mensual (agenda.js) — se borra puntual (nunca sessionStorage.
  // clear() liso) desde que un bug real (26/8/2026) forzaba el prompt()
  // del PIN de servicio después de CADA turno cargado. El token ahora
  // vive en localStorage (27/8/2026), así que ya ni corre ese riesgo, pero
  // sigue sin tener sentido tocar más que las claves de agenda acá.
  function _invalidarCacheAgenda() {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('agenda_sem_') || key.startsWith('agenda_mes_'))) {
        sessionStorage.removeItem(key);
      }
    }
  }

  /**
   * Asigna un nuevo turno (incluye sobreturnos sobre un slot de RIS).
   * Mismo contrato que API.asignar — Railway lo guarda en Postgres y lo
   * refleja en la hoja "Base de datos" para que Portada lo vea igual.
   * @param {object} datos  { nombre, apellido, dni, estudio, origen, fecha, hora, observaciones }
   */
  async function asignar(datos) {
    _invalidarCacheAgenda();
    return rpc('api_turnos_asignar', [datos]);
  }

  // ── Fase 2b: anular/presente/modificar migradas a Railway ──────
  // `fila` acá sigue siendo el número de fila del Sheet — las lecturas
  // (agenda/lista/buscar) todavía vienen de Apps Script, así que es lo
  // único que la PWA tiene en la mano. Railway lo usa como fila_sheet
  // para ubicar el turno correspondiente (ver rpc/turnos.js).

  /** Anula un turno existente. @param {number} fila Fila en "Base de datos" */
  async function anular(fila) {
    _invalidarCacheAgenda();
    return rpc('api_turnos_anular', [{ filaSheet: fila }]);
  }

  /** Registra presente de un paciente. @param {number} fila Fila en "Base de datos" */
  async function presente(fila) {
    return rpc('api_turnos_presente', [{ filaSheet: fila }]);
  }

  // ── Carga manual en Suitestensa (25/8/2026, ver plan "Disparo manual
  // de carga en Suitestensa") — dispara bot-cargar-suitestensa.js en modo
  // manual para uno o más turnos puntuales (identificados por hash real
  // de `estudios`, no por documento+fecha, para no ambigüar cuando un
  // mismo paciente tiene más de un turno el mismo día). ────────────────
  /** @param {string[]} hashes @param {string} fecha YYYY-MM-DD */
  async function cargarEnSuitestensa(hashes, fecha) {
    return rpc('api_bot_solicitarComando', [
      'bot-ris', 'ejecutar_ahora', 'bot-cargar-suitestensa.js',
      ['--hashes=' + hashes.join(','), '--fecha=' + fecha]
    ]);
  }
  /** @param {string[]} hashes */
  async function estadoSuitestensa(hashes) {
    const data = await rpc('api_suitestensa_estadoPorHashes', [hashes]);
    return data.filas;
  }

  // ── Excepción horaria (28/8/2026) — válvula de escape auditable para
  // cuando falta el administrativo dentro de su propio horario (07-17hs
  // aprox., ver _sinAdministrativo en bot-cargar-suitestensa.js): el botón
  // de carga manual queda bloqueado en ese horario salvo que haya una
  // excepción vigente. ─────────────────────────────────────────────────
  /** @returns {Promise<object|null>} la excepción vigente, o null si no hay ninguna activa */
  async function estadoExcepcionSuitestensa() {
    const data = await rpc('api_suitestensa_estadoExcepcion', []);
    return data.excepcion;
  }
  /** @param {string} motivo @param {string} activadoPor */
  async function activarExcepcionSuitestensa(motivo, activadoPor) {
    return rpc('api_suitestensa_activarExcepcion', [motivo, activadoPor]);
  }
  /** @param {string} desactivadoPor */
  async function desactivarExcepcionSuitestensa(desactivadoPor) {
    return rpc('api_suitestensa_desactivarExcepcion', [desactivadoPor]);
  }

  /**
   * Reprograma un turno existente (fecha y/o estudio) en una sola operación.
   * @param {number} fila   Fila original en "Base de datos"
   * @param {object} datos  { tipo, nombre, apellido, dni, estudio, origen, fecha, hora, observaciones }
   */
  async function modificar(fila, datos) {
    _invalidarCacheAgenda();
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

  // ── Límites de sobreturno ────────────────────────────────────────
  // Igual que Reglas Agenda, Railway es la fuente de verdad acá (no hay
  // pestaña de Sheet equivalente) — panel "Límites de sobreturno" en
  // Config. El rechazo real ocurre server-side dentro de asignar/modificar
  // de arriba (llega como error de rpc()).

  async function leerLimitesSobreturno() {
    const data = await rpc('api_limitesSobreturno_leer');
    return data.limites;
  }

  async function guardarLimiteSobreturno(limite) {
    return rpc('api_limitesSobreturno_guardar', [limite]);
  }

  async function eliminarLimiteSobreturno(id) {
    return rpc('api_limitesSobreturno_eliminar', [{ id }]);
  }

  async function leerLimitesTurnosFranja() {
    const data = await rpc('api_limitesTurnosFranja_leer');
    return data.limites;
  }

  async function guardarLimiteTurnosFranja(limite) {
    return rpc('api_limitesTurnosFranja_guardar', [limite]);
  }

  async function eliminarLimiteTurnosFranja(id) {
    return rpc('api_limitesTurnosFranja_eliminar', [{ id }]);
  }

  // ── Sugeridor de horario de sobreturno ──────────────────────────
  // Recomendación, no bloqueo: reusa el mismo verificarLimite/reglas que
  // ya corren server-side, más una heurística de "no encadenar dos
  // estudios pesados seguidos" (ver rpc/sobreturnoSugerir.js).

  /**
   * @param {object} datos { estudio, dni?, fecha? (dd/MM/yyyy), dias? }
   */
  async function sugerirSobreturno(datos) {
    return rpc('api_sobreturno_sugerir', [datos]);
  }

  /** Parámetros de la heurística del sugeridor — panel Config → "Reglas de asignación de sobreturno". */
  async function leerConfigSugerirSobreturno() {
    const data = await rpc('api_sobreturnoSugerir_leerConfig');
    return data.config;
  }

  async function guardarConfigSugerirSobreturno(config) {
    return rpc('api_sobreturnoSugerir_guardarConfig', [config]);
  }

  /** Reglas propias del sugeridor (origen/estudio + ventana) — exclusivas de acá, nunca llegan al bot de Validaciones. */
  async function leerReglasSugerirSobreturno() {
    const data = await rpc('api_sobreturnoSugerir_leerReglas');
    return data.reglas;
  }

  async function guardarReglaSugerirSobreturno(regla) {
    return rpc('api_sobreturnoSugerir_guardarRegla', [regla]);
  }

  async function eliminarReglaSugerirSobreturno(id) {
    return rpc('api_sobreturnoSugerir_eliminarRegla', [{ id }]);
  }

  /** Bloqueos/franjas exclusivas de Config (equipo parado, descompresión) — mismo blob que ya consulta el sugeridor server-side. Solo lectura. */
  async function obtenerAgendaConfig() {
    return rpc('api_agendaConfig_obtener');
  }

  async function obtenerAgendaPreviewSemanal() {
    const data = await rpc('api_agenda_previewSemanal');
    return data.dias;
  }

  // ── Franjas preferidas por estudio (sugeridor) ──────────────────
  async function leerFranjasPreferidasSugerir() {
    const data = await rpc('api_sobreturnoSugerir_leerFranjasPreferidas');
    return data.franjas;
  }

  async function guardarFranjaPreferidaSugerir(franja) {
    return rpc('api_sobreturnoSugerir_guardarFranjaPreferida', [franja]);
  }

  async function eliminarFranjaPreferidaSugerir(id) {
    return rpc('api_sobreturnoSugerir_eliminarFranjaPreferida', [{ id }]);
  }

  // ── Categorías de estudio (#MSK, #NEURO, etc.) ──────────────────
  // Reutilizables desde "Reglas específicas" y "Franjas preferidas" del
  // sugeridor (no desde Reglas Agenda compartida — ver rpc/categoriasEstudio.js).
  async function leerCategoriasEstudio() {
    const data = await rpc('api_categoriasEstudio_leer');
    return data.categorias;
  }

  async function guardarCategoriaEstudio(categoria) {
    return rpc('api_categoriasEstudio_guardar', [categoria]);
  }

  async function eliminarCategoriaEstudio(codigo) {
    return rpc('api_categoriasEstudio_eliminar', [{ codigo }]);
  }

  // ── Quién asigna el turno ────────────────────────────────────────
  // Lista editable de personas que pueden figurar como "quién está dando
  // el turno" — obligatorio en el panel de turno, mismo criterio que ya
  // usa Portada. Separada de la tabla de técnicos de guardias.

  async function leerAsignadoresTurno() {
    const data = await rpc('api_asignadoresTurno_leer');
    return data.nombres;
  }

  async function guardarAsignadoresTurno(nombres) {
    return rpc('api_asignadoresTurno_guardar', [{ nombres }]);
  }

  // ── Config de agenda (corte de Sheets, 25/8/2026) ───────────────
  // Feriados, franjas recurrentes, bloqueos, restricciones por
  // código/origen/propia y catálogo de estudios — antes vivían en la hoja
  // "Config" del Sheet, ahora son tablas propias en Postgres (Config →
  // Fase 4 del corte). Cada una es CRUD directo por id (o por clave natural
  // en feriados/estudios), sin el paso intermedio de reescribir un array
  // completo que usaba el Sheet.

  async function leerAgendaFeriados() {
    const data = await rpc('api_agendaFeriados_leer');
    return data.feriados;
  }
  async function guardarAgendaFeriado(feriado) {
    return rpc('api_agendaFeriados_guardar', [feriado]);
  }
  async function eliminarAgendaFeriado(id) {
    return rpc('api_agendaFeriados_eliminar', [{ id }]);
  }

  async function leerAgendaFranjas() {
    const data = await rpc('api_agendaFranjas_leer');
    return data.franjas;
  }
  async function guardarAgendaFranja(franja) {
    return rpc('api_agendaFranjas_guardar', [franja]);
  }
  async function eliminarAgendaFranja(id) {
    return rpc('api_agendaFranjas_eliminar', [{ id }]);
  }

  async function leerAgendaBloqueos() {
    const data = await rpc('api_agendaBloqueos_leer');
    return data.bloqueos;
  }
  async function guardarAgendaBloqueo(bloqueo) {
    return rpc('api_agendaBloqueos_guardar', [bloqueo]);
  }
  async function eliminarAgendaBloqueo(id) {
    return rpc('api_agendaBloqueos_eliminar', [{ id }]);
  }

  async function leerAgendaRestriccionesHorarias() {
    const data = await rpc('api_agendaRestriccionesHorarias_leer');
    return data.restricciones;
  }
  async function guardarAgendaRestriccionHoraria(restriccion) {
    return rpc('api_agendaRestriccionesHorarias_guardar', [restriccion]);
  }
  async function eliminarAgendaRestriccionHoraria(id) {
    return rpc('api_agendaRestriccionesHorarias_eliminar', [{ id }]);
  }

  async function leerAgendaRestriccionesOrigen() {
    const data = await rpc('api_agendaRestriccionesOrigen_leer');
    return data.restricciones;
  }
  async function guardarAgendaRestriccionOrigen(restriccion) {
    return rpc('api_agendaRestriccionesOrigen_guardar', [restriccion]);
  }
  async function eliminarAgendaRestriccionOrigen(id) {
    return rpc('api_agendaRestriccionesOrigen_eliminar', [{ id }]);
  }

  async function leerAgendaRestriccionesPropia() {
    const data = await rpc('api_agendaRestriccionesPropia_leer');
    return data.restricciones;
  }
  async function guardarAgendaRestriccionPropia(restriccion) {
    return rpc('api_agendaRestriccionesPropia_guardar', [restriccion]);
  }
  async function eliminarAgendaRestriccionPropia(id) {
    return rpc('api_agendaRestriccionesPropia_eliminar', [{ id }]);
  }

  async function leerAgendaEstudiosCatalogo() {
    const data = await rpc('api_agendaEstudiosCatalogo_leer');
    return data.estudios;
  }
  async function guardarAgendaEstudio(estudio) {
    return rpc('api_agendaEstudiosCatalogo_guardar', [estudio]);
  }
  async function eliminarAgendaEstudio(id) {
    return rpc('api_agendaEstudiosCatalogo_eliminar', [{ id }]);
  }

  // ── PIN por rol (corte de Sheets, 25/8/2026) ────────────────────
  async function validarPinRol(rol, pin) {
    return rpc('api_pinRoles_validar', [{ rol, pin }]);
  }
  async function cambiarPinRol(rol, pinActual, pinNuevo) {
    return rpc('api_pinRoles_cambiar', [{ rol, pinActual, pinNuevo }]);
  }

  // ── Parte diario (corte de Sheets, 25/8/2026) ───────────────────
  // Reemplaza a API.escribirRIS/verificarRIS/actualizarEstadosRIS/
  // actualizarPracticasRIS (Apps Script, escribían a BD_RIS — hoja que ya
  // nadie lee). Mismo contrato de entrada/salida, ahora contra Postgres.
  async function verificarParteRIS(fecha) {
    return rpc('api_parte_verificarRis', [fecha]);
  }
  async function escribirParteRIS(fecha, filas) {
    return rpc('api_parte_escribirRis', [fecha, filas]);
  }
  async function actualizarEstadosParteRIS(fecha, items) {
    return rpc('api_parte_actualizarEstados', [fecha, items]);
  }
  async function actualizarPracticasParteRIS(fecha, items) {
    return rpc('api_parte_actualizarPracticas', [fecha, items]);
  }

  // ── Actualizar agenda para todos (27/8/2026) ────────────────────
  // leerAgendaRefrescarPublico: polling sin sesión (App.init lo llama antes
  // de saber si hay token). marcarAgendaRefrescar: solo lo usa el botón de
  // jefatura/admin en el topbar.
  async function leerAgendaRefrescarPublico() {
    return _rpcPublico('api_agendaRefrescar_leer');
  }
  async function marcarAgendaRefrescar() {
    return rpc('api_agendaRefrescar_marcar');
  }

  // ── Agendas especiales NCX/Neurología (26/8/2026) ───────────────
  // Uso desde el SPA principal (login normal, sesión ya abierta) — para
  // Config (editar ventana) y "Verificar agendas especiales" (sidebar).
  async function leerAgendaEspecialConfig() {
    const data = await rpc('api_agendaEspecial_leerConfig');
    return data.config;
  }
  async function guardarAgendaEspecialConfig(datos) {
    return rpc('api_agendaEspecial_guardarConfig', [datos]);
  }
  async function leerAgendaEspecialTurnos(pendientesSolo = true) {
    const data = await rpc('api_agendaEspecial_leerTurnos', [{ pendientesSolo }]);
    return data.turnos;
  }
  async function marcarAgendaEspecialCargado(id, cargado = true) {
    return rpc('api_agendaEspecial_marcarCargado', [{ id, cargado }]);
  }

  // ── Botones del sidebar por rol (27/8/2026) ─────────────────────
  // leerMenuRolesPublico (sin login) la usa App al arrancar para armar el
  // sidebar de cualquier rol; guardar/cambiarPin están en Config
  // (protegido con el PIN propio de este panel, distinto del de
  // jefatura/admin).
  async function leerMenuRolesPublico() {
    const data = await _rpcPublico('api_menuRoles_leer');
    return data.config;
  }
  async function guardarMenuRoles(pin, config) {
    return rpc('api_menuRoles_guardar', [{ pin, config }]);
  }
  async function cambiarPinMenuRoles(pinActual, pinNuevo) {
    return rpc('api_menuRoles_cambiarPin', [{ pinActual, pinNuevo }]);
  }

  // ── Agendas especiales — llamadas públicas (sin login de Railway) ──
  // Las usan ncx.html/neurologia.html: páginas propias para coordinadores
  // externos que solo tienen el PIN de su especialidad, no una sesión de
  // la app. Van directo por fetch, sin pasar por _getToken()/rpc() (que
  // pedirían el PIN de servicio interno, algo que esta gente no debería
  // ni necesita conocer).
  async function _rpcPublico(fn, args = []) {
    const resp = await fetch(`${RAILWAY_URL}/api/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (json.ok === false) throw new Error(json.error || 'Error desconocido de Railway');
    return json;
  }
  async function agendaEspecialConfigPublico() {
    const data = await _rpcPublico('api_agendaEspecial_leerConfig');
    return data.config;
  }
  async function agendaEspecialEstudiosPublico(tipo, pin) {
    const data = await _rpcPublico('api_agendaEspecial_leerEstudios', [{ tipo, pin }]);
    return data.estudios;
  }
  async function agendaEspecialPropiosPublico(tipo, pin) {
    const data = await _rpcPublico('api_agendaEspecial_leerPropios', [{ tipo, pin }]);
    return data.turnos;
  }
  async function agendaEspecialAsignarPublico(datos) {
    return _rpcPublico('api_turnos_asignarEspecialPublico', [datos]);
  }

  return {
    rpc, leerRISRango, leerCardiologia, asignar, anular, presente, cargarEnSuitestensa, estadoSuitestensa,
    estadoExcepcionSuitestensa, activarExcepcionSuitestensa, desactivarExcepcionSuitestensa,
    modificar, turnos, buscar, agenda, slots,
    leerValidacionesAgenda, marcarValidacionReportada, leerReglasAgenda, guardarReglaAgenda, eliminarReglaAgenda,
    leerLimitesSobreturno, guardarLimiteSobreturno, eliminarLimiteSobreturno,
    leerLimitesTurnosFranja, guardarLimiteTurnosFranja, eliminarLimiteTurnosFranja,
    sugerirSobreturno,
    leerConfigSugerirSobreturno, guardarConfigSugerirSobreturno,
    leerReglasSugerirSobreturno, guardarReglaSugerirSobreturno, eliminarReglaSugerirSobreturno,
    obtenerAgendaConfig, leerAsignadoresTurno, guardarAsignadoresTurno,
    leerFranjasPreferidasSugerir, guardarFranjaPreferidaSugerir, eliminarFranjaPreferidaSugerir,
    leerCategoriasEstudio, guardarCategoriaEstudio, eliminarCategoriaEstudio,
    leerAgendaFeriados, guardarAgendaFeriado, eliminarAgendaFeriado,
    obtenerAgendaPreviewSemanal,
    leerAgendaFranjas, guardarAgendaFranja, eliminarAgendaFranja,
    leerAgendaBloqueos, guardarAgendaBloqueo, eliminarAgendaBloqueo,
    leerAgendaRestriccionesHorarias, guardarAgendaRestriccionHoraria, eliminarAgendaRestriccionHoraria,
    leerAgendaRestriccionesOrigen, guardarAgendaRestriccionOrigen, eliminarAgendaRestriccionOrigen,
    leerAgendaRestriccionesPropia, guardarAgendaRestriccionPropia, eliminarAgendaRestriccionPropia,
    leerAgendaEstudiosCatalogo, guardarAgendaEstudio, eliminarAgendaEstudio,
    validarPinRol, cambiarPinRol,
    verificarParteRIS, escribirParteRIS, actualizarEstadosParteRIS, actualizarPracticasParteRIS,
    leerAgendaEspecialConfig, guardarAgendaEspecialConfig, leerAgendaEspecialTurnos, marcarAgendaEspecialCargado,
    agendaEspecialConfigPublico, agendaEspecialEstudiosPublico, agendaEspecialPropiosPublico, agendaEspecialAsignarPublico,
    leerMenuRolesPublico, guardarMenuRoles, cambiarPinMenuRoles,
    leerAgendaRefrescarPublico, marcarAgendaRefrescar
  };
})();
