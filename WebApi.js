// ============================================================
//  WebAPI.gs — Endpoints HTTP para la PWA
//  AGREGAR ESTE ARCHIVO al proyecto Apps Script existente
//  (botón "+" en panel Archivos → nuevo archivo → WebAPI)
// ============================================================

// ─────────────────────────────────────────────────────────────
//  ENTRY POINTS HTTP
// ─────────────────────────────────────────────────────────────

function doGet(e) {
  const p      = e && e.parameter || {};
  const action = p.action || "ping";

  try {
    // Intentar como acción GET primero
    // Si es acción de mutación, routear a _routePost con los mismos parámetros
    const mutaciones = ["asignar","presente","anular","modificar"];
    if (mutaciones.indexOf(action) >= 0) {
      return _jsonOk(_routePost(action, p));
    }
    return _jsonOk(_routeGet(action, p));
  } catch (err) {
    Logger.log("doGet error [" + action + "]: " + err);
    return _jsonErr(err.message);
  }
  
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return _jsonOk(_routePost(body.action, body));
  } catch (err) {
    Logger.log("doPost error: " + err);
    return _jsonErr(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  ROUTER
// ─────────────────────────────────────────────────────────────

function _routeGet(action, p) {
  switch (action) {
    case "ping":         return { version: "3.0-pwa", status: "ok" };
    case "config":       return _apiConfig();
    case "agenda":       return _apiAgenda(p);
    case "turnos":       return _apiTurnos(p);
    case "slots":        return _apiSlots(p);
    case "buscar":       return _apiBuscar(p);
    case "leerRIS":          return _apiLeerRIS(p);
    case "leerCardiologia":  return _apiLeerCardiologia(p);
    case "leerRISRango": return _apiLeerRISRango(p);
    case "verificarRIS":   return _apiVerificarRIS(p);
    case "escribirRIS":         return _apiEscribirRIS({ fecha: p.fecha, filas: JSON.parse(p.filas || "[]") });
    case "actualizarPracticasRIS": return _apiActualizarPracticasRIS({ fecha: p.fecha, items: JSON.parse(p.items || "[]") });
    case "actualizarEstadosRIS": return _apiActualizarEstadosRIS(p);
    case "normalizarRIS":  return _apiNormalizarRIS();
    case "ordenarRIS":     return _apiOrdenarRIS();
    case "leerConfig":     return _apiLeerConfig(p);
    case "escribirConfig": return _apiEscribirConfig(p);
    case "consolidarRIS":  return _apiConsolidarRIS();
    case 'escribirLog':    return _escribirLog(p);
    case 'leerLog':     return _leerLog(p);
    case 'validarPin':  return _apiValidarPin(p);
    case 'cambiarPin':  return _apiCambiarPin(p);
    case 'listarFilasCrudasRIS': return _apiListarFilasCrudasRIS(p)
    case 'eliminarFilaRIS': return _apiEliminarFilaRIS(p)
    case 'leerCardiacas':   return _apiLeerCardiacas(p)
    case 'eliminarFilaCardiacas': return _apiEliminarFilaCardiacas(p)
    case 'leerValidacionesAgenda': return _apiLeerValidacionesAgenda()
    default:            throw new Error("Acción no reconocida: " + action);
  }
}

function _routePost(action, body) {
  switch (action) {
    case "asignar":              return _apiAsignar(body);
    case "presente":             return _apiPresente(body);
    case "anular":               return _apiAnular(body);
    case "modificar":            return _apiModificar(body);
    case "escribirRIS":          return _apiEscribirRIS(body);
    case "actualizarEstadosRIS": return _apiActualizarEstadosRIS(body);  
    case "registrarValidacionesAgenda": return _apiRegistrarValidacionesAgenda(body);
    default: throw new Error("Acción POST no reconocida: " + action);
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS DE RESPUESTA
// ─────────────────────────────────────────────────────────────

function _jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
//  GET config — estudios + calendario completo
// ─────────────────────────────────────────────────────────────

function _apiConfig() {
  return {
    estudios:   cargarConfigEstudios(),
    calendario: cargarConfigCalendario()
  };
}

// ─────────────────────────────────────────────────────────────
//  GET agenda — grilla de N días (para vista administrativa)
//  Parámetros: desde=dd/MM/yyyy, dias=7, paso=40
// ─────────────────────────────────────────────────────────────

function _apiAgenda(p) {
  const tz        = Session.getScriptTimeZone();
  const diasCount = parseInt(p.dias || "7");
  const paso      = parseInt(p.paso || "40");

  let desde;
  if (p.desde) {
    const pt = p.desde.split("/");
    desde = new Date(parseInt(pt[2]), parseInt(pt[1]) - 1, parseInt(pt[0]));
  } else {
    desde = new Date();
  }
  desde.setHours(0, 0, 0, 0);

  const dias = [];
  for (let i = 0; i < diasCount; i++) {
    const d = new Date(desde);
    d.setDate(desde.getDate() + i);
    dias.push(d);
  }

  const cfg       = cargarConfigCalendario();
  const configMap = cargarConfigEstudios();
  const { feriados, bloqueos, bloqueosRecurrentes, restriccionesHorarias, restriccionesOrigen } = cfg;

  const todasFechas = dias.map(d => fechaAStr(d, tz));
  const turnosBD    = leerTurnosBD({ soloActivos: true });
  const turnosMap   = {};

  // ── 1) Cargar turnos locales (Base de datos) — tienen prioridad ──
  for (const t of turnosBD) {
    if (!todasFechas.includes(t.fechaStr)) continue;
    const listaEst = t.estudio.split(",").map(s => s.trim()).filter(s => s);
    let dur = 0;
    for (const e of listaEst) { if (configMap[e]) dur += configMap[e].duracion; }
    if (dur === 0) dur = 10;

    for (let m = t.mins; m < t.mins + dur; m += 10) {
      const clave = t.fechaStr + "_" + m;
      turnosMap[clave] = {
        esInicio:      m === t.mins,
        nombre:        t.nombre,
        apellido:      t.apellido,
        dni:           t.dni,
        estudio:       t.estudio,
        origen:        t.origen,
        presente:      t.presente,
        observaciones: t.observaciones,
        fila:          t.fila
      };
    }
  }

  // RIS (SIGEHOS) NO se mergea acá — el frontend (agenda.js) ya trae BD_RIS por su
  // cuenta con API.leerRISRango() y dibuja la celda de "guía / sobreturno" en los
  // slots libres. Mergearlo también en turnosMap lo hacía indistinguible de un
  // turno local real: quedaba con tipo "turno" clickeable, exponiendo "Modificar"/
  // "Anular" sobre una fila de RIS que no existe en Base de datos.

  // ── 2) Armar la grilla de días/slots ──
  const result = [];
  const NOMBRES_DIA = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const NOMBRES_MES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  for (const d of dias) {
    const fStr      = fechaAStr(d, tz);
    const diaSemana = d.getDay();
    const esFeriado = !!feriados[fStr];

    const slots = [];
    for (let m = 0; m < 24 * 60; m += paso) {
      const slot = _evaluarSlotAgenda(
        m, paso, fStr, diaSemana, esFeriado, feriados,
        bloqueos, bloqueosRecurrentes, restriccionesHorarias,
        restriccionesOrigen, turnosMap
      );
      slots.push({ mins: m, hora: minutosAHora(m), ...slot });
    }

    result.push({
      fecha:      fStr,
      diaSemana:  diaSemana,
      label:      NOMBRES_DIA[diaSemana] + " " + d.getDate() + " " + NOMBRES_MES[d.getMonth()],
      esFeriado:  esFeriado,
      feriado:    feriados[fStr] || null,
      slots:      slots
    });
  }

  return result;
}

function _evaluarSlotAgenda(m, paso, fStr, diaSemana, esFeriado, feriados, bloqueos, bloqueosRecurrentes, restriccionesHorarias, restriccionesOrigen, turnosMap) {
  if (esFeriado) return { tipo: "feriado", label: feriados[fStr], color: "#e06666" };

  for (const b of bloqueos) {
    if (b.fechaStr === fStr) {
      for (let sub = 0; sub < paso; sub += 10) {
        if ((m + sub) >= b.minDesde && (m + sub) <= b.minHasta)
          return { tipo: "bloqueo", label: b.concepto, color: "#e06666" };
      }
    }
  }

  // Turno de paciente — buscar el primer sub-slot con datos
  for (let sub = 0; sub < paso; sub += 10) {
    const t = turnosMap[fStr + "_" + (m + sub)];
    if (t) {
      if (t.esInicio || sub === 0) {
        return {
          tipo: "turno", nombre: t.nombre, apellido: t.apellido,
          dni: t.dni, estudio: t.estudio, origen: t.origen,
          presente: t.presente, observaciones: t.observaciones,
          fila: t.fila, color: _colorOrigenHex(t.origen)
        };
      }
      return { tipo: "continuacion", origen: t.origen, color: _colorContinuacionHex(t.origen) };
    }
  }

  // Bloqueo recurrente
  for (const b of bloqueosRecurrentes) {
    if (b.diasSemana.includes(diaSemana)) {
      for (let sub = 0; sub < paso; sub += 10) {
        if ((m + sub) >= b.minDesde && (m + sub) <= b.minHasta)
          return { tipo: "bloqueo_rec", label: b.concepto, color: b.color };
      }
    }
  }

  // Franja por código
  for (const reglas of Object.values(restriccionesHorarias)) {
    for (const r of reglas) {
      if (r.diasSemana.includes(diaSemana)) {
        for (let sub = 0; sub < paso; sub += 10) {
          if ((m + sub) >= r.minDesde && (m + sub) < r.minHasta)
            return { tipo: "franja", label: r.leyenda, color: r.color };
        }
      }
    }
  }

  // Franja por origen
  for (const reglas of Object.values(restriccionesOrigen)) {
    for (const r of reglas) {
      if (r.diasSemana.includes(diaSemana)) {
        for (let sub = 0; sub < paso; sub += 10) {
          if ((m + sub) >= r.minDesde && (m + sub) < r.minHasta)
            return { tipo: "franja_origen", label: r.leyenda, color: r.color };
        }
      }
    }
  }

  return { tipo: "libre", color: "#ffffff" };
}

function _colorOrigenHex(o) {
  switch ((o || "").toUpperCase()) {
    case "AMBULATORIO": return "#a8d5a2";
    case "GUARDIA":     return "#5ba4cf";
    case "INTERNACIÓN":
    case "INTERNACION": return "#ffd966";
    case "DIRECCIÓN":
    case "DIRECCION":   return "#a98fd4";
    case "TRASLADO":    return "#3c9ab8";
    case "RIS":         return "#8899aa"; 
    default:            return "#e8a09a";
  }
}

function _colorContinuacionHex(o) {
  switch ((o || "").toUpperCase()) {
    case "AMBULATORIO": return "#cdebc9";
    case "GUARDIA":     return "#a8d0ed";
    case "INTERNACIÓN":
    case "INTERNACION": return "#ffebaf";
    case "DIRECCIÓN":
    case "DIRECCION":   return "#cec0ea";
    case "TRASLADO":    return "#74b9d4";
    case "RIS":         return "#c5cdd6";
    default:            return "#f2c8c5";
  }
}

// ─────────────────────────────────────────────────────────────
//  GET turnos — lista del día para técnicos
//  Parámetros: fecha=dd/MM/yyyy
// ─────────────────────────────────────────────────────────────

function _apiTurnos(p) {
  if (!p.fecha) throw new Error("Falta parámetro fecha");
  const turnos = leerTurnosBD({ fechaStr: p.fecha, soloActivos: true });
  turnos.sort((a, b) => a.mins - b.mins);
  return turnos.map(t => ({
    fila:          t.fila,
    fecha:         t.fechaStr,
    hora:          minutosAHora(t.mins),
    mins:          t.mins,
    nombre:        t.nombre,
    apellido:      t.apellido,
    dni:           t.dni,
    estudio:       t.estudio,
    origen:        t.origen,
    confirma:      t.confirma,
    presente:      t.presente,
    tsPresente:    t.tsPresente,
    observaciones: t.observaciones
  }));
}

// ─────────────────────────────────────────────────────────────
//  GET slots — horarios disponibles para un estudio/fecha
//  Parámetros: fecha=dd/MM/yyyy, estudio=X,Y, origen=AMBULATORIO
// ─────────────────────────────────────────────────────────────

function _apiSlots(p) {
  const { fecha, estudio, origen } = p;
  if (!fecha || !estudio) throw new Error("Faltan parámetros fecha o estudio");

  const tz  = Session.getScriptTimeZone();
  const pt  = fecha.split("/");
  const fechaDate = new Date(parseInt(pt[2]), parseInt(pt[1]) - 1, parseInt(pt[0]));
  fechaDate.setHours(12, 0, 0, 0);
  const fechaStr = fechaAStr(fechaDate, tz);
  const dia      = fechaDate.getDay();

  const cfg       = cargarConfigCalendario();
  const configMap = cargarConfigEstudios();

  if (cfg.feriados[fechaStr]) {
    return { libres: [], esFeriado: true, feriado: cfg.feriados[fechaStr] };
  }

  const listaEstudios    = str(estudio).split(",").map(s => s.trim()).filter(s => s);
  let duracion           = 0;
  const restriccionesSet = new Set();
  const noEncontrados    = [];

  for (const est of listaEstudios) {
    if (configMap[est]) {
      if (configMap[est].restriccion) restriccionesSet.add(configMap[est].restriccion);
      duracion += configMap[est].duracion;
    } else {
      noEncontrados.push(est);
    }
  }

  if (noEncontrados.length > 0) throw new Error("Estudio no encontrado: " + noEncontrados.join(", "));
  if (duracion === 0) throw new Error("Duración total es 0. Revisar Config.");

  const restricciones = Array.from(restriccionesSet);
  const ocupadosMap   = _construirOcupadosMap(fechaStr, configMap);

  const { validacionesFilas } = _calcularSlots(
    dia, duracion, restricciones, ocupadosMap, cfg,
    fechaStr, origen || "AMBULATORIO", configMap
  );

  // validacionesFilas: row numbers donde row = slot_index + 2
  // slot_index * 10 = minutos desde medianoche
  const libres = validacionesFilas.map(filaNum => {
    const mins = (filaNum - 2) * 10;
    return { mins, hora: minutosAHora(mins) };
  });

  return { libres, duracion, total: libres.length, esFeriado: false };
}

// ─────────────────────────────────────────────────────────────
//  GET buscar — búsqueda de turnos por apellido o DNI
//  Parámetros: apellido=X, dni=Y
// ─────────────────────────────────────────────────────────────

function _apiBuscar(p) {
  if (!p.apellido && !p.dni) throw new Error("Falta apellido o DNI");
  const turnos = leerTurnosBD({
    apellido: p.apellido || undefined,
    dni:      p.dni      || undefined
  });
  turnos.sort((a, b) => a.fechaDate - b.fechaDate || a.mins - b.mins);
  return turnos.map(t => ({
    fila:          t.fila,
    fecha:         t.fechaStr,
    hora:          minutosAHora(t.mins),
    nombre:        t.nombre,
    apellido:      t.apellido,
    dni:           t.dni,
    estudio:       t.estudio,
    origen:        t.origen,
    tipoMod:       t.tipoMod,
    fechaMod:      t.fechaMod ? String(t.fechaMod) : "",
    observaciones: t.observaciones,
    presente:      t.presente
  }));
}

// ─────────────────────────────────────────────────────────────
//  POST asignar — crea un nuevo turno en Base de datos
// ─────────────────────────────────────────────────────────────

function _apiAsignar(body) {
  const { nombre, apellido, dni, estudio, origen, fecha, hora, observaciones } = body;
  if (!nombre || !apellido || !dni || !estudio || !fecha || !hora)
    throw new Error("Faltan campos obligatorios: nombre, apellido, dni, estudio, fecha, hora");

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const baseDatos = ss.getSheetByName("Base de datos");
  const tz        = Session.getScriptTimeZone();

  const pt        = fecha.split("/");
  const fechaDate = new Date(parseInt(pt[2]), parseInt(pt[1]) - 1, parseInt(pt[0]));
  fechaDate.setHours(12, 0, 0, 0);

  // Hora como fracción de día (formato nativo de Sheets para tiempo)
  const hp    = hora.split(":");
  const mins  = parseInt(hp[0]) * 60 + parseInt(hp[1]);
  const horaFraccion = mins / (24 * 60);

  const otorgado   = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
  const ultimaFila = Math.max(baseDatos.getLastRow() + 1, 2);

  baseDatos.getRange(ultimaFila, 1, 1, 9).setValues([[
    fechaDate, horaFraccion,
    capitalizar(nombre), capitalizar(apellido),
    String(dni), estudio,
    origen || "AMBULATORIO", "Ok", otorgado
  ]]);

  if (observaciones) baseDatos.getRange(ultimaFila, 17).setValue(observaciones);

  const turnoId = "t_" + new Date().getTime();
  baseDatos.getRange(ultimaFila, 18).setValue(turnoId);

  // Sincronizar BD central
  try {
    const bdC     = _bdCentral();
    const filaBDC = bdC.getLastRow() + 1;
    bdC.getRange(filaBDC, 1, 1, 9).setValues([[
      fechaDate, horaFraccion,
      capitalizar(nombre), capitalizar(apellido),
      String(dni), estudio,
      origen || "AMBULATORIO", "Ok", otorgado
    ]]);
    if (observaciones) bdC.getRange(filaBDC, 17).setValue(observaciones);
    bdC.getRange(filaBDC, 18).setValue(turnoId);
    bdC.getRange(filaBDC, 19).setValue("PWA");
  } catch (err) {
    Logger.log("Error BD central [asignar]: " + err);
  }

  try {
    vistaPrevia();
  } catch (err) {
    Logger.log("Error refrescando vistaPrevia tras asignar: " + err);
  }

  return { turnoId, fila: ultimaFila, mensaje: "Turno asignado correctamente" };
}

// ─────────────────────────────────────────────────────────────
//  POST presente — registra asistencia del paciente
// ─────────────────────────────────────────────────────────────

function _apiPresente(body) {
  const { fila } = body;
  if (!fila) throw new Error("Falta campo fila");

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const baseDatos = ss.getSheetByName("Base de datos");
  const tz        = Session.getScriptTimeZone();
  const ahora     = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");

  baseDatos.getRange(fila, 13).setValue("Presente");
  baseDatos.getRange(fila, 14).setValue(ahora);

  try {
    const turnoId = str(baseDatos.getRange(fila, 18).getValue());
    if (turnoId) {
      const bdC      = _bdCentral();
      const filaCent = _buscarFilaBDCentral(bdC, turnoId);
      if (filaCent > 0) {
        bdC.getRange(filaCent, 13).setValue("Presente");
        bdC.getRange(filaCent, 14).setValue(ahora);
      }
    }
  } catch (err) {
    Logger.log("Error BD central [presente]: " + err);
  }

  return { mensaje: "Presente registrado", timestamp: ahora };
}

// ─────────────────────────────────────────────────────────────
//  POST anular — anula un turno existente
// ─────────────────────────────────────────────────────────────

function _apiAnular(body) {
  const { fila } = body;
  if (!fila) throw new Error("Falta campo fila");

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const baseDatos = ss.getSheetByName("Base de datos");
  const tz        = Session.getScriptTimeZone();
  const ahora     = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");

  baseDatos.getRange(fila, 10).setValue("Anular");
  baseDatos.getRange(fila, 11).setValue(ahora);

  try {
    const turnoId = str(baseDatos.getRange(fila, 18).getValue());
    if (turnoId) {
      const bdC     = _bdCentral();
      const filaBDC = _buscarFilaBDCentral(bdC, turnoId);
      if (filaBDC > 0) bdC.deleteRow(filaBDC);
    }
  } catch (err) {
    Logger.log("Error BD central [anular]: " + err);
  }

  // ✅ Refrescar la grilla dibujada en Portada
  try {
    vistaPrevia();
  } catch (err) {
    Logger.log("Error refrescando vistaPrevia tras asignar: " + err);
  }

  return { mensaje: "Turno anulado", timestamp: ahora };
}

// ─────────────────────────────────────────────────────────────
//  POST modificar — reprograma un turno (fecha o estudio),
//  vinculando el turno original y el nuevo con un modId,
//  igual que hace Portada (Code.js modificarTurno + confirmarTurno)
// ─────────────────────────────────────────────────────────────

function _apiModificar(body) {
  const { fila, tipo, nombre, apellido, dni, estudio, origen, fecha, hora, observaciones } = body;
  if (!fila || !tipo) throw new Error("Faltan campos: fila, tipo");
  if (!nombre || !apellido || !dni || !estudio || !fecha || !hora)
    throw new Error("Faltan campos obligatorios del nuevo turno");

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const baseDatos = ss.getSheetByName("Base de datos");
  const tz        = Session.getScriptTimeZone();
  const ahora     = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
  const modId     = "mod_" + new Date().getTime();

  // 1. Marcar la fila original como modificada (mismas columnas que Code.js modificarTurno)
  baseDatos.getRange(fila, 10).setValue(tipo);   // tipoMod: "Fecha" | "Estudio"
  baseDatos.getRange(fila, 11).setValue(ahora);  // fechaMod
  baseDatos.getRange(fila, 12).setValue(modId);

  // 2. Borrar el turnoId original de BD central (igual que _apiAnular)
  try {
    const turnoIdOriginal = str(baseDatos.getRange(fila, 18).getValue());
    if (turnoIdOriginal) {
      const bdC       = _bdCentral();
      const filaVieja = _buscarFilaBDCentral(bdC, turnoIdOriginal);
      if (filaVieja > 0) bdC.deleteRow(filaVieja);
    }
  } catch (err) {
    Logger.log("Error BD central [modificar/borrar]: " + err);
  }

  // 3. Insertar la fila nueva (mismo patrón que _apiAsignar) + modId de vínculo
  const pt        = fecha.split("/");
  const fechaDate = new Date(parseInt(pt[2]), parseInt(pt[1]) - 1, parseInt(pt[0]));
  fechaDate.setHours(12, 0, 0, 0);
  const hp            = hora.split(":");
  const horaFraccion  = (parseInt(hp[0]) * 60 + parseInt(hp[1])) / (24 * 60);
  const ultimaFila    = Math.max(baseDatos.getLastRow() + 1, 2);

  baseDatos.getRange(ultimaFila, 1, 1, 9).setValues([[
    fechaDate, horaFraccion,
    capitalizar(nombre), capitalizar(apellido),
    String(dni), estudio,
    origen || "AMBULATORIO", "Ok", ahora
  ]]);
  baseDatos.getRange(ultimaFila, 12).setValue(modId);
  if (observaciones) baseDatos.getRange(ultimaFila, 17).setValue(observaciones);

  const turnoId = "t_" + new Date().getTime();
  baseDatos.getRange(ultimaFila, 18).setValue(turnoId);

  // 4. Sincronizar BD central (igual que _apiAsignar, origen "PWA")
  try {
    const bdC     = _bdCentral();
    const filaBDC = bdC.getLastRow() + 1;
    bdC.getRange(filaBDC, 1, 1, 9).setValues([[
      fechaDate, horaFraccion,
      capitalizar(nombre), capitalizar(apellido),
      String(dni), estudio,
      origen || "AMBULATORIO", "Ok", ahora
    ]]);
    if (observaciones) bdC.getRange(filaBDC, 17).setValue(observaciones);
    bdC.getRange(filaBDC, 18).setValue(turnoId);
    bdC.getRange(filaBDC, 19).setValue("PWA");
  } catch (err) {
    Logger.log("Error BD central [modificar]: " + err);
  }

  // ✅ Refrescar la grilla dibujada en Portada
  try {
    vistaPrevia();
  } catch (err) {
    Logger.log("Error refrescando vistaPrevia tras modificar: " + err);
  }

  return { turnoId, fila: ultimaFila, modId, mensaje: "Turno modificado correctamente" };
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerCardiologia&desde=dd/MM/yyyy&dias=7
//  Lee pacientes de la agenda de Cardiología del Sheet externo.
//  Filtra por rango de fechas y devuelve agrupado por fecha.
// ─────────────────────────────────────────────────────────────
function _apiLeerCardiologia(p) {
  if (!p.desde) throw new Error("Falta parámetro desde");

  const SHEET_ID  = "15HBStrd51hmS9w_4gQ-uWORKFNsSm1jWcSo_HbzqrCs";
  const HOJA_NOMBRE = "2026";
  const tz  = Session.getScriptTimeZone();
  const dias = parseInt(p.dias || "7");

  // Construir set de fechas válidas
  const pt     = p.desde.split("/");
  const inicio = new Date(parseInt(pt[2]), parseInt(pt[1])-1, parseInt(pt[0]));
  inicio.setHours(0,0,0,0);
  const fechasSet = new Set();
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    fechasSet.add(fechaAStr(d, tz));
  }

  // Leer sheet externo
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const hoja = ss.getSheetByName(HOJA_NOMBRE);
  if (!hoja) throw new Error("No se encontró la hoja: " + HOJA_NOMBRE);

  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 11).getValues();
  // Cols: A=FECHA(0), B=HORA(1), C=DNI(2), D=APELLIDO Y NOMBRE(3),
  //       E=EDAD(4), F=TELEFONO(5), G=DIAGNOSTICO(6), H=PESO(7),
  //       I=TALLA(8), J=SOLICITANTE(9), K=ESTADO(10)

  const porFecha = {};

  for (const row of datos) {
    if (!row[0]) continue;

    // Normalizar fecha
    let fechaStr = "";
    if (row[0] instanceof Date) {
      fechaStr = fechaAStr(row[0], tz);
    } else {
      const s = str(row[0]).trim();
      // Puede venir como dd/mm/yyyy o yyyy-mm-dd
      if (s.includes("/")) {
        fechaStr = s;
      } else if (s.includes("-")) {
        const p2 = s.split("-");
        fechaStr = `${p2[2]}/${p2[1]}/${p2[0]}`;
      }
    }

    if (!fechasSet.has(fechaStr)) continue;

    const estado = str(row[10]).trim().toUpperCase();
    if (estado === "CANCELADO" || estado === "CANCEL." || estado === "CANCELA...") continue;

    // La hora puede ser fracción decimal (Sheets time) o string "HH:MM"
    let mins = 0;
    if (typeof row[1] === "number") {
      // Fracción de día: 0.333... = 8hs
      mins = Math.round(row[1] * 24 * 60);
    } else if (row[1] instanceof Date) {
      mins = row[1].getHours() * 60 + row[1].getMinutes();
    } else {
      mins = parsearMinutos(str(row[1]).trim());
    }

    // Solo franja cardiología: 08:00 - 14:00
    if (mins < 8*60 || mins >= 14*60) continue;

    if (!porFecha[fechaStr]) porFecha[fechaStr] = [];
    porFecha[fechaStr].push({
      fecha:          fechaStr,
      hora:           minutosAHora(mins),
      mins:           mins,
      duracion:       60, // 1 hora por paciente
      dni:            str(row[2]).trim(),
      apellido_nombre: str(row[3]).trim(),
      diagnostico:    str(row[6]).trim(),
      estado:         str(row[10]).trim()
    });
  }

  // Ordenar por hora dentro de cada día
  for (const f of Object.keys(porFecha)) {
    porFecha[f].sort((a,b) => a.mins - b.mins);
  }

  return porFecha;
}

function _escribirLog(params) {
  try {
    const id    = params.sheetId || '';
    const ss    = id 
      ? SpreadsheetApp.openById(id)
      : SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName('Log_Bot');
    
    if (!sheet) {
      sheet = ss.insertSheet('Log_Bot');
      sheet.appendRow(['FECHA', 'HORA', 'STATUS', 'FILAS', 'MENSAJE']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    sheet.appendRow([
      params.fecha    || '',
      params.hora     || '',
      params.status   || '',
      Number(params.filas) || 0,
      params.mensaje  || '',
      params.maquina  || 'LOCAL',
    ]);
    
    return { ok: true };
      
  } catch(err) {
    throw new Error(err.message);
  }
}

function _leerLog(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Log_Bot');
  if (!sheet) return { filas: [], total: 0 };

  const ultima = Math.max(sheet.getLastRow(), 2);
  const limite = parseInt(p.limite || '20');
  const datos  = sheet.getRange(2, 1, ultima - 1, 5).getValues();

  const filas = datos
    .filter(r => r[0])
   .map(r => ({
      fecha:   r[0] instanceof Date ? Utilities.formatDate(r[0], 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy') : String(r[0] || ''),
      hora:    r[1] instanceof Date ? Utilities.formatDate(r[1], 'America/Argentina/Buenos_Aires', 'HH:mm:ss') : String(r[1] || ''),
      status:  String(r[2] || ''),
      filas:   Number(r[3] || 0),
      mensaje: String(r[4] || ''),
      maquina: String(r[5] || ''),
    }))
    .reverse()
    .slice(0, limite);

  return { filas, total: filas.length };
}

function _apiLeerConfig(p) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("Config");
  const tz     = Session.getScriptTimeZone();
  const tipo   = p.tipo || p.seccion || "all";

  // ── Bloqueos ──
  const bloqueos = [];
  if (tipo === "bloqueos" || tipo === "all") {
    const data = config.getRange("J3:M500").getValues();
    for (let i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      const fecha = data[i][0];
      bloqueos.push({
        fila:      i + 3,
        fecha:     fecha instanceof Date ? fechaAStr(fecha, tz) : str(fecha),
        horaD:     str(data[i][1]),
        horaH:     str(data[i][2]),
        concepto:  str(data[i][3])
      });
    }
    if (tipo === "bloqueos") return { bloqueos };
  }

  // ── Franjas ──
  const franjas = [];
  if (tipo === "franjas" || tipo === "all") {
    const data = config.getRange("O3:W500").getValues();
    for (let i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      franjas.push({
        fila:     i + 3,
        dia1:     str(data[i][0]),
        func1:    str(data[i][1]),
        dia2:     str(data[i][2]),
        func2:    str(data[i][3]),
        dia3:     str(data[i][4]),
        horaD:    str(data[i][5]),
        horaH:    str(data[i][6]),
        concepto: str(data[i][7]),
        color:    str(data[i][8]) || "#e06666"
      });
    }
    if (tipo === "franjas") return { franjas };
  }

  // ── Estudios ──
  const estudios = [];
  if (tipo === "all") {
    const cfg = cargarConfigCalendario();
    const cfgEst = cargarConfigEstudios();

    // Estudios desde Config A2:D
    const dataEst = config.getRange("A2:D500").getValues();
    for (let i = 0; i < dataEst.length; i++) {
      const nombre = str(dataEst[i][0]);
      if (!nombre) continue;
      estudios.push({
        nombre,
        estadistica:  str(dataEst[i][1]),
        restriccion:  str(dataEst[i][2]),
        duracion:     Number(dataEst[i][3]) || 0
      });
    }

    // Feriados
    const feriados = Object.entries(cfg.feriados).map(([fecha, concepto]) => ({ fecha, concepto }));

    // Restricciones horarias (franjas por código)
    const restricciones = [];
    for (const [codigo, reglas] of Object.entries(cfg.restriccionesHorarias || {})) {
      for (const r of reglas) {
        restricciones.push({ codigo, ...r,
          horaD: minutosAHora(r.minDesde), horaH: minutosAHora(r.minHasta) });
      }
    }

    // Restricciones por origen
    const restriccionesOrigen = [];
    for (const [origen, reglas] of Object.entries(cfg.restriccionesOrigen || {})) {
      for (const r of reglas) {
        restriccionesOrigen.push({ origen, ...r,
          horaD: minutosAHora(r.minDesde), horaH: minutosAHora(r.minHasta) });
      }
    }

    return { estudios, feriados, franjas, bloqueos, restricciones, restriccionesOrigen };
  }

  throw new Error("Sección no soportada: " + tipo);
}

function _apiEscribirConfig(p) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("Config");
  const tipo   = p.tipo || p.seccion || "bloqueos";
  const datos  = p.datos ? JSON.parse(p.datos) : null;

  if (tipo === "bloqueos") {
    const bloqueos = datos || (typeof p.bloqueos === "string" ? JSON.parse(p.bloqueos) : (p.bloqueos || []));
    config.getRange("J3:M500").clearContent();
    if (bloqueos.length > 0) {
      const filas = bloqueos.map(b => [b.fecha, b.horaDesde || b.horaD, b.horaHasta || b.horaH, b.concepto]);
      config.getRange(3, 10, filas.length, 4).setValues(filas);
    }
    _invalidarCacheConfig();
    return { escritos: bloqueos.length };
  }

  if (tipo === "franjas") {
    const franjas = datos || (typeof p.franjas === "string" ? JSON.parse(p.franjas) : (p.franjas || []));
    config.getRange("O3:W500").clearContent();
    if (franjas.length > 0) {
      const filas = franjas.map(f => [
        f.dia1, f.func1||"", f.dia2||"", f.func2||"", f.dia3||"",
        f.horaD, f.horaH, f.concepto, f.color||"#e06666"
      ]);
      config.getRange(3, 15, filas.length, 9).setValues(filas);
    }
    _invalidarCacheConfig();
    return { escritos: franjas.length };
  }

  return { error: "Tipo no reconocido" };
}

function _apiValidarPin(p) {
  if (!p.rol || !p.pin) throw new Error("Faltan parámetros rol y pin");
  const props = PropertiesService.getScriptProperties();
  const key   = p.rol === "jefatura" ? "PIN_JEFATURA" : "PIN_ADMIN";
  const pin   = props.getProperty(key) || "";
  return { valido: pin !== "" && String(p.pin) === pin };
}

function _apiCambiarPin(p) {
  if (!p.rol || !p.pinActual || !p.pinNuevo) throw new Error("Faltan parámetros");
  const props    = PropertiesService.getScriptProperties();
  const key      = p.rol === "admin" ? "PIN_ADMIN" : "PIN_JEFATURA";
  const pinGuard = props.getProperty(key) || "";
  if (String(p.pinActual) !== pinGuard) return { actualizado: false };
  if (!/^\d{4}$/.test(p.pinNuevo)) throw new Error("PIN inválido");
  props.setProperty(key, String(p.pinNuevo));
  return { actualizado: true };
}

function normalizarPracticasBDRIS() {
  const ss    = SpreadsheetApp.getActive();
  const hoja  = ss.getSheetByName("BD_RIS");
  if (!hoja) { Logger.log("No se encontró BD_RIS"); return; }

  const data = hoja.getDataRange().getValues();
  const COL_PRACTICA = 4; // columna E (0-indexed)

  const PREFIJOS = [
    "RESONANCIA MAGNETICA NUCLEAR DE ",
    "RESONANCIA MAGNETICA FUNCIONAL DE ",
    "RESONANCIA MAGNETICA DE ",
    "RESONANCIA MAGNETICA ",
    "ANGIORRESONANCIA DE ",
    "ANGIORRESONANCIA ",
    "COLANGIORRESONANCIA DE ",
    "COLANGIORRESONANCIA ",
    "COLANGIO RESONANCIA DE ",
    "COLANGIO-RESONANCIA DE ",
    "COLANGIOGRAFIA POR RM DE ",
    "COLANGIOGRAFIA POR RM ",
    "RMN DE ",
    "RM DE ",
    "RM ",
  ];

  function normalizar(practica) {
    if (!practica) return "";
    const partes = String(practica).split(/\s*·\s*|\s*-\s*/);
    const acortadas = partes.map(p => {
      let s = p.trim().toUpperCase();
      let esAngio = false;
      for (const pref of PREFIJOS) {
        if (s.startsWith(pref)) {
          if (pref.includes("ANGIO")) esAngio = true;
          s = s.slice(pref.length).trim();
          break;
        }
      }
      // Si venía de ANGIORRESONANCIA, preservar contexto
      if (esAngio) {
        const MAPEOS_ANGIO = {
          "CEREBRO":               "Angiorresonancia cerebro",
          "CEREBRO CON CONTRASTE": "Angiorresonancia cerebro con contraste",
          "VASOS DE CUELLO":       "Angiorresonancia vasos cuello",
          "VASOS CUELLO":          "Angiorresonancia vasos cuello",
        };
        if (MAPEOS_ANGIO[s]) return MAPEOS_ANGIO[s];
        return "Angiorresonancia " + s.charAt(0).toLowerCase() + s.slice(1).toLowerCase();
      }
      return s.charAt(0) + s.slice(1).toLowerCase();
    });
    // Deduplicar
    const vistos = new Set();
    const resultado = [];
    for (const a of acortadas) {
      const key = a.toLowerCase().trim();
      if (key && !vistos.has(key)) {
        vistos.add(key);
        resultado.push(a);
      }
    }
    return resultado.join(" · ");
  }

  let modificadas = 0;
  for (let i = 1; i < data.length; i++) {
    const original   = String(data[i][COL_PRACTICA] || "").trim();
    const normalizada = normalizar(original);
    if (original !== normalizada && normalizada) {
      hoja.getRange(i + 1, COL_PRACTICA + 1).setValue(normalizada);
      modificadas++;
    }
  }

  Logger.log(`Listo — ${modificadas} filas actualizadas de ${data.length - 1} totales`);
}
