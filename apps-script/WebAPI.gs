// ============================================================
//  WebAPI.gs — Endpoints HTTP para la PWA
//  AGREGAR ESTE ARCHIVO al proyecto Apps Script existente
//  (botón "+" en panel Archivos → nuevo archivo → WebAPI)
// ============================================================

// ─────────────────────────────────────────────────────────────
//  ENTRY POINTS HTTP
// ─────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "ping";
  try {
    return _jsonOk(_routeGet(action, e.parameter || {}));
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
    case "ping":    return { version: "3.0-pwa", status: "ok" };
    case "config":  return _apiConfig();
    case "agenda":  return _apiAgenda(p);
    case "turnos":  return _apiTurnos(p);
    case "slots":   return _apiSlots(p);
    case "buscar":  return _apiBuscar(p);
    default:        throw new Error("Acción no reconocida: " + action);
  }
}

function _routePost(action, body) {
  switch (action) {
    case "asignar":  return _apiAsignar(body);
    case "presente": return _apiPresente(body);
    case "anular":   return _apiAnular(body);
    default:         throw new Error("Acción POST no reconocida: " + action);
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

  return { mensaje: "Turno anulado", timestamp: ahora };
}
