// ============================================================
//  AGENDA DE TURNOS - Google Apps Script  (VERSIÓN 3.0)
//  Hojas: Portada | AgendaC | Base de datos | Config
//
//  CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR:
//  1. Helper parsearMinutos(val)       — elimina lógica duplicada ×5
//  2. Helper str(val)                  — elimina String().trim() repetido
//  3. Helper capitalizar(str)          — función global, ya no duplicada
//  4. Tabla de dispatch en onEdit*     — reemplaza 8 bloques if-else
//  5. Cache de config (CacheService)   — evita releer Sheets en cada llamada
//  6. Helper leerTurnosBD(filtros)     — centraliza loops sobre Base de datos
//  7. generarAgendaC dividida en fases — construirOcupadosMap / calcularSlots / renderizarAgenda
//  8. flush() solo donde es necesario
//  9. verProximoDia pasa parámetros directos a generarAgendaC
// ============================================================

// ─────────────────────────────────────────────────────────────
//  HELPERS GLOBALES
// ─────────────────────────────────────────────────────────────

/** Convierte cualquier representación de hora a minutos desde medianoche. */
function parsearMinutos(val) {
  if (!val && val !== 0) return 0;
  if (val instanceof Date) return val.getHours() * 60 + val.getMinutes();
  if (typeof val === "number") return Math.round(val * 24 * 60) % (24 * 60);

  const texto = String(val).trim();
  const esPM  = /p\.?\s*m\.?/i.test(texto);
  const esAM  = /a\.?\s*m\.?/i.test(texto);
  const s     = texto.replace(/[ap]\.?\s*m\.?/i, "").trim().split(":");

  let horas = parseInt(s[0]) || 0;
  const minutos = parseInt(s[1]) || 0;
  if (esPM && horas < 12) horas += 12;   // 2:20 p.m. → 14:20
  if (esAM && horas === 12) horas = 0;   // 12:00 a.m. → 00:00

  return horas * 60 + minutos;
}

/** Convierte minutos a string "HH:MM". */
function minutosAHora(m) {
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/** Convierte cualquier valor de celda a string limpio. */
function str(val) {
  return val != null ? String(val).trim() : "";
}

/** Capitaliza cada palabra de un string (locale es-AR). */
function capitalizar(s) {
  return str(s).toLowerCase().replace(/(^|\s)([^\s])/g, (_, esp, letra) =>
    esp + letra.toLocaleUpperCase("es-AR")
  );
}

/** Formatea una fecha Date a "dd/MM/yyyy". */
function fechaAStr(fecha, tz) {
  return Utilities.formatDate(fecha instanceof Date ? fecha : new Date(fecha), tz || Session.getScriptTimeZone(), "dd/MM/yyyy");
}
/** Abre la BD central y devuelve la hoja. */
function _bdCentral() {
  const ss = SpreadsheetApp.openById("1WwSvS1ymkl7RJ6MHOnNGE0mkvt5q5JJcvA9XUZ0ZvKg");
  return ss.getSheetByName("BD");
}

/** Busca en BD central la fila con un turnoId dado. Devuelve el número de fila o -1. */
function _buscarFilaBDCentral(hoja, turnoId) {
  const ultima = Math.max(hoja.getLastRow(), 2);
  const ids = hoja.getRange(2, 18, ultima - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === turnoId) return i + 2;
  }
  return -1;
}
// ─────────────────────────────────────────────────────────────
//  INSTALACIÓN DE TRIGGER
// ─────────────────────────────────────────────────────────────

function instalarTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === "onEditInstalable") ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger("onEditInstalable")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert("✅ Trigger instalado correctamente.");
}

// ─────────────────────────────────────────────────────────────
//  TABLA DE DISPATCH — reemplaza los bloques if-else
//  Cada regla: { sheet, col, row, valor, fn }
//  valor === "*" significa "cualquier valor no vacío"
// ─────────────────────────────────────────────────────────────

function getDispatchSimple() {
  return [];
}

function getDispatchInstalable() {
  return [
    { sheet: "Portada",    col: 9,  row: 8,   valor: "Ok",       fn: "_limpiarPortadaDesdeEdit" },
    { sheet: "Portada",    col: 12, row: 3,   valor: "Ok",       fn: "chequearTurnos"         },
    { sheet: "Portada",    col: 8,  row: 8,   valor: "Ok",       fn: "_validarYGenerarAgenda"  },
    { sheet: "Portada",    col: 12, row: 8,   valor: "*",        fn: "modificarTurno"          },
    { sheet: "Portada",    col: 8,  row: 10,  valor: "Ok",       fn: "_vistaPrevia"            },
    { sheet: "Portada",    col: 12, row: 5,   valor: "Ok",       fn: "generarParteDiario"      },
    { sheet: "AgendaC",    col: 3,  row: "*", valor: "Ok",       fn: "_confirmarTurnoFila"     },
    { sheet: "AgendaC",    col: 9,  row: 2,   valor: "Cancelar", fn: "cancelarAgendaC"         },
    { sheet: "AgendaC",    col: 10, row: 2,   valor: "Ok",       fn: "verProximoDia"           },
    { sheet: "Config",     col: "*", row: "*", valor: "*",       fn: "_invalidarCacheConfig"   }
  ];
}

function _despachar(e, tabla) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const col   = e.range.getColumn();
  const row   = e.range.getRow();
  const valor = str(e.value);

  for (const regla of tabla) {
    if (regla.sheet !== sheet.getName()) continue;
    if (regla.col !== "*" && regla.col !== col) continue;
    if (regla.row !== "*" && regla.row !== row) continue;
    if (regla.valor !== "*" && regla.valor !== valor) continue;
    if (!valor) continue;
    // Ejecutar la función correspondiente
    _ejecutarRegla(regla, e, row);
    return;
  }
}

function _ejecutarRegla(regla, e, row) {
  switch (regla.fn) {
    case "_limpiarPortadaDesdeEdit": _limpiarPortadaDesdeEdit(e.range.getSheet()); break;
    case "_validarYGenerarAgenda":   _validarYGenerarAgenda(e); break;
    case "modificarTurno":           modificarTurno(); break;
    case "_vistaPrevia":             e.range.clearContent(); vistaPrevia(); break;
    case "generarParteDiario":       generarParteDiario(); break;
    case "_confirmarTurnoFila":      confirmarTurno(row); break;
    case "cancelarAgendaC":          cancelarAgendaC(); break;
    case "verProximoDia":            verProximoDia(); break;
    case "chequearTurnos":           chequearTurnos(); break;
  }
}

// ─────────────────────────────────────────────────────────────
//  onEdit (sin permisos instalados — solo limpieza de Portada)
// ─────────────────────────────────────────────────────────────

function onEdit(e) {
  if (!e || !e.range) return;
  
  // Invalidar cache inmediatamente si se edita Config
  if (e.range.getSheet().getName() === "Config") {
    _invalidarCacheConfig();
  }

  _despachar(e, getDispatchSimple());

  // Capitalizar en Base de datos
  const sheet = e.range.getSheet();
  if (sheet.getName() === "Base de datos") {
    const col = e.range.getColumn();
    const val = e.range.getValue();
    if (col >= 1 && col <= 7 && typeof val === "string" && val !== "") {
      const proper = capitalizar(val);
      if (proper !== val) e.range.setValue(proper);
    }
  }
}

function onEditInstalable(e) {
  if (!e || !e.range) return;
  _despachar(e, getDispatchInstalable()); // <-- antes era DISPATCH_INSTALABLE
}

// ─────────────────────────────────────────────────────────────
//  Acciones internas del dispatch
// ─────────────────────────────────────────────────────────────

/** Limpia Portada al confirmar con Ok en I8. */
function _limpiarPortadaDesdeEdit(sheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("Config");
  const portada = ss.getSheetByName("Portada");

  if (!config || !portada) {
    SpreadsheetApp.getUi().alert("No se encontró la hoja CONFIG o Portada.");
    return;
  }

  portada.getRange("J3:M3").clearContent();
  portada.getRange("A8:C8").clearContent();
  portada.getRange("F8:I8").clearContent();
  portada.getRange("J8:M8").clearContent();
  portada.getRange("K5").clearContent();
  portada.getRange("M5").clearContent();

  const valorE1 = config.getRange("E1").getValue();
  config.getRange("E1").copyTo(portada.getRange("D8"));
  config.getRange("E2").copyTo(portada.getRange("E8"));

  const estiloBase = {
    fontFamily: "Nunito", fontSize: 12, hAlign: "center", vAlign: "middle",
    background: "#f0f6ff", fontColor: "#222222", fontWeight: "normal"
  };

  const aplicar = (rango, borde) => {
    rango.setFontFamily(estiloBase.fontFamily).setFontSize(estiloBase.fontSize)
         .setHorizontalAlignment(estiloBase.hAlign).setVerticalAlignment(estiloBase.vAlign)
         .setBackground(estiloBase.background).setFontColor(estiloBase.fontColor)
         .setFontWeight(estiloBase.fontWeight);
    if (borde) rango.setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
  };

  aplicar(portada.getRange("J3:L3"), true);
  aplicar(portada.getRange("A8:H8"), false);
  aplicar(portada.getRange("J8:L8"), true);

  ss.setActiveSheet(portada);
  portada.getRange("A8").activate();
}

/** Valida campos antes de generar agenda. */
function _validarYGenerarAgenda(e) {
  const sheet = e.range.getSheet();
  const valA8 = str(sheet.getRange("A8").getValue());
  const valB8 = str(sheet.getRange("B8").getValue());
  const valC8 = sheet.getRange("C8").getValue();
  const valF8 = str(sheet.getRange("F8").getValue());

  const faltantes = [];
  if (!valA8) faltantes.push("A8 (Nombre)");
  if (!valB8) faltantes.push("B8 (Apellido)");
  if (!valC8 || isNaN(Number(valC8))) faltantes.push("C8 (DNI — debe ser numérico)");
  if (!valF8) faltantes.push("F8 (Observaciones)");

  if (faltantes.length > 0) {
    e.range.clearContent();
    SpreadsheetApp.getUi().alert(
      "⚠️ No se puede generar la agenda hasta completar todos los campos.\n\nPor favor completá:\n• " +
      faltantes.join("\n• ")
    );
    return;
  }
  generarAgendaC();
}

/** Wrapper para vistaPrevia desde dispatch. */
function _vistaPrevia() {
  vistaPrevia();
}

// ─────────────────────────────────────────────────────────────
//  CACHE DE CONFIG — evita releer Sheets en cada llamada
//  TTL: 6 horas (21600 segundos)
// ─────────────────────────────────────────────────────────────

const _CACHE_KEY_CAL    = "cfg_calendario_v1";
const _CACHE_KEY_EST    = "cfg_estudios_v1";
const _CACHE_TTL        = 21600;

function _getCache() {
  return CacheService.getScriptCache();
}

/** Invalida el cache de configuración (llamar tras editar Config). */
function invalidarCache() {
  _getCache().removeAll([_CACHE_KEY_CAL, _CACHE_KEY_EST]);
  SpreadsheetApp.getUi().alert("🔄 Cache de configuración invalidado.");
}

// ─────────────────────────────────────────────────────────────
//  HELPER UNIFICADO: CARGAR CONFIG DE CALENDARIO
// ─────────────────────────────────────────────────────────────

function cargarConfigCalendario() {
  // Intentar desde cache
  const cached = _getCache().get(_CACHE_KEY_CAL);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const config = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
  const tz     = Session.getScriptTimeZone();

  const dataFeriados    = config.getRange("F2:G500").getValues();
  const dataBloqueos    = config.getRange("J3:M500").getValues();
  const dataRecurrentes = config.getRange("O3:W500").getValues();

  // ── Feriados
  const feriados = {};
  for (let i = 0; i < dataFeriados.length; i++) {
    const val      = dataFeriados[i][0];
    const concepto = str(dataFeriados[i][1]) || "Feriado";
    if (!val) continue;
    const fechaStr = (val instanceof Date) ? fechaAStr(val, tz) : str(val);
    if (fechaStr) feriados[fechaStr] = concepto;
  }

  // ── Bloqueos puntuales
  const bloqueos = [];
  for (let i = 0; i < dataBloqueos.length; i++) {
    const fecha    = dataBloqueos[i][0];
    const horaD    = dataBloqueos[i][1];
    const horaH    = dataBloqueos[i][2];
    const concepto = str(dataBloqueos[i][3]) || "Bloqueado";
    if (!fecha || !horaD || !horaH) continue;
    const fechaStr = (fecha instanceof Date) ? fechaAStr(fecha, tz) : str(fecha);
    bloqueos.push({ fechaStr, minDesde: parsearMinutos(horaD), minHasta: parsearMinutos(horaH), concepto });
  }

  // ── Días de semana helper
  const DIAS_MAP = {
    "LUNES": 1, "MARTES": 2, "MIÉRCOLES": 3, "MIERCOLES": 3,
    "JUEVES": 4, "VIERNES": 5, "SÁBADO": 6, "SABADO": 6, "DOMINGO": 0
  };

  function resolverDias(dia1, func1, dia2, func2, dia3) {
    const d1 = dia1 ? DIAS_MAP[dia1.toUpperCase().trim()] : null;
    const d2 = dia2 ? DIAS_MAP[dia2.toUpperCase().trim()] : null;
    const d3 = dia3 ? DIAS_MAP[dia3.toUpperCase().trim()] : null;
    const f1 = func1 ? func1.toLowerCase().trim() : null;
    const f2 = func2 ? func2.toLowerCase().trim() : null;
    if (d1 === null || d1 === undefined) return [];
    let dias = [];
    if (d2 !== null && d2 !== undefined) {
      if (f1 === "hasta") {
        let cur = d1;
        while (cur !== d2) { dias.push(cur); cur = (cur + 1) % 7; }
        dias.push(d2);
      } else {
        dias.push(d1); dias.push(d2);
      }
    } else {
      dias.push(d1);
    }
    if (d3 !== null && d3 !== undefined && f2) {
      if (f2 === "hasta") {
        const ultimo = dias[dias.length - 1];
        let cur = (ultimo + 1) % 7;
        while (cur !== d3) { dias.push(cur); cur = (cur + 1) % 7; }
        dias.push(d3);
      } else {
        dias.push(d3);
      }
    }
    return [...new Set(dias)];
  }

  // ── Bloqueos recurrentes
  const bloqueosRecurrentes = [];
  for (let i = 0; i < dataRecurrentes.length; i++) {
    const dia1     = str(dataRecurrentes[i][0]);
    const func1    = str(dataRecurrentes[i][1]);
    const dia2     = str(dataRecurrentes[i][2]);
    const func2    = str(dataRecurrentes[i][3]);
    const dia3     = str(dataRecurrentes[i][4]);
    const horaD    = dataRecurrentes[i][5];
    const horaH    = dataRecurrentes[i][6];
    const concepto = str(dataRecurrentes[i][7]) || "Bloqueado";
    const color    = str(dataRecurrentes[i][8]) || "#e06666";
    if (!dia1) continue;
    const diasSemana = resolverDias(dia1||null, func1||null, dia2||null, func2||null, dia3||null);
    if (diasSemana.length === 0) continue;
    bloqueosRecurrentes.push({
      diasSemana,
      minDesde: horaD ? parsearMinutos(horaD) : 0,
      minHasta: horaH ? parsearMinutos(horaH) : 23 * 60 + 59,
      concepto,
      color
    });
  }

  // ── Restricciones por código
  const dataRestricciones = config.getRange("Y3:AF500").getValues();
  const restriccionesConfig = {};
  for (let i = 0; i < dataRestricciones.length; i++) {
    const codigo = str(dataRestricciones[i][0]);
    if (!codigo) continue;
    const dia1  = str(dataRestricciones[i][1]);
    const func1 = str(dataRestricciones[i][2]);
    const dia2  = str(dataRestricciones[i][3]);
    const func2 = str(dataRestricciones[i][4]);
    const dia3  = str(dataRestricciones[i][5]);
    const horaD = dataRestricciones[i][6];
    const horaH = dataRestricciones[i][7];
    if (!dia1) continue;
    const diasSemana = resolverDias(dia1||null, func1||null, dia2||null, func2||null, dia3||null);
    if (diasSemana.length === 0) continue;
    if (!restriccionesConfig[codigo]) restriccionesConfig[codigo] = [];
    restriccionesConfig[codigo].push({
      diasSemana,
      minDesde: horaD ? parsearMinutos(horaD) : 0,
      minHasta: horaH ? parsearMinutos(horaH) : 23 * 60 + 59
    });
  }

  // ── Restricciones horarias por código (AH3:AQ16)
  const dataRestHorarias = config.getRange("AH3:AQ16").getValues();
  const restriccionesHorarias = {};
  for (let i = 0; i < dataRestHorarias.length; i++) {
    const codigo  = str(dataRestHorarias[i][0]);
    if (!codigo) continue;
    const dia1    = str(dataRestHorarias[i][1]);
    const func1   = str(dataRestHorarias[i][2]);
    const dia2    = str(dataRestHorarias[i][3]);
    const func2   = str(dataRestHorarias[i][4]);
    const dia3    = str(dataRestHorarias[i][5]);
    const horaD   = dataRestHorarias[i][6];
    const horaH   = dataRestHorarias[i][7];
    const leyenda = str(dataRestHorarias[i][8]) || "Reservado";
    const color   = str(dataRestHorarias[i][9]) || "#e06666";
    if (!dia1) continue;
    const diasSemana = resolverDias(dia1||null, func1||null, dia2||null, func2||null, dia3||null);
    if (diasSemana.length === 0) continue;
    if (!restriccionesHorarias[codigo]) restriccionesHorarias[codigo] = [];
    restriccionesHorarias[codigo].push({ diasSemana, minDesde: parsearMinutos(horaD), minHasta: parsearMinutos(horaH), leyenda, color });
  }

  // ── Restricciones por origen (AH19:AQ)
  const dataRestOrigen = config.getRange("AH19:AQ500").getValues();
  const restriccionesOrigen = {};
  for (let i = 0; i < dataRestOrigen.length; i++) {
    const codigo  = str(dataRestOrigen[i][0]);
    if (!codigo) continue;
    const dia1    = str(dataRestOrigen[i][1]);
    const func1   = str(dataRestOrigen[i][2]);
    const dia2    = str(dataRestOrigen[i][3]);
    const func2   = str(dataRestOrigen[i][4]);
    const dia3    = str(dataRestOrigen[i][5]);
    const horaD   = dataRestOrigen[i][6];
    const horaH   = dataRestOrigen[i][7];
    const leyenda = str(dataRestOrigen[i][8]) || "Reservado";
    const color   = str(dataRestOrigen[i][9]) || "#e06666";
    if (!dia1) continue;
    const diasSemana = resolverDias(dia1||null, func1||null, dia2||null, func2||null, dia3||null);
    if (diasSemana.length === 0) continue;
    if (!restriccionesOrigen[codigo]) restriccionesOrigen[codigo] = [];
    restriccionesOrigen[codigo].push({ diasSemana, minDesde: parsearMinutos(horaD), minHasta: parsearMinutos(horaH), leyenda, color });
  }

  const resultado = { feriados, bloqueos, bloqueosRecurrentes, restriccionesConfig, restriccionesHorarias, restriccionesOrigen };

  // Guardar en cache (serializar fechas como strings, ya lo son)
  try { _getCache().put(_CACHE_KEY_CAL, JSON.stringify(resultado), _CACHE_TTL); } catch (_) {}

  return resultado;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: CARGAR CONFIG DE ESTUDIOS (con cache)
// ─────────────────────────────────────────────────────────────

function cargarConfigEstudios() {
  const cached = _getCache().get(_CACHE_KEY_EST);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const config     = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
  const configData = config.getRange("A2:D500").getValues();
  const configMap  = {};
  for (let i = 0; i < configData.length; i++) {
    const key = str(configData[i][0]);
    if (key) configMap[key] = {
      restriccion: str(configData[i][2]),
      duracion:    Number(configData[i][3])
    };
  }

  try { _getCache().put(_CACHE_KEY_EST, JSON.stringify(configMap), _CACHE_TTL); } catch (_) {}
  return configMap;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: LEER TURNOS DE BASE DE DATOS (centraliza los loops)
//  filtros: { fechaStr?, dni?, soloActivos?, incluirFuturos? }
//  Devuelve array de objetos turno normalizados.
// ─────────────────────────────────────────────────────────────

function leerTurnosBD(filtros) {
  filtros = filtros || {};
  const baseDatos = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Base de datos");
  const tz        = Session.getScriptTimeZone();
  const ultimaFila = Math.max(baseDatos.getLastRow(), 2);
  const bdData     = baseDatos.getRange(2, 1, ultimaFila - 1, 17).getValues();

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const turnos = [];
  for (let i = 0; i < bdData.length; i++) {
    const fBD = bdData[i][0];
    const hBD = bdData[i][1];
    if (!fBD || !hBD) continue;

    const tipoMod = str(bdData[i][9]);
    if (filtros.soloActivos && tipoMod !== "" && tipoMod !== "0") continue;

    const fechaDate = fBD instanceof Date ? fBD : new Date(fBD);
    fechaDate.setHours(12, 0, 0, 0);
    const fStr = fechaAStr(fechaDate, tz);

    if (filtros.fechaStr && fStr !== filtros.fechaStr) continue;
    if (filtros.incluirFuturos && fechaDate < hoy) continue;

    const dni = str(bdData[i][4]);
    if (filtros.dni && dni !== filtros.dni) continue;

    const apellido = str(bdData[i][3]);
    if (filtros.apellido && !apellido.toLowerCase().includes(filtros.apellido.toLowerCase())) continue;

    turnos.push({
      fila:         i + 2,
      fechaDate,
      fechaStr:     fStr,
      mins:         parsearMinutos(hBD),
      horaRaw:      hBD,
      nombre:       str(bdData[i][2]),
      apellido,
      dni,
      estudio:      str(bdData[i][5]),
      origen:       str(bdData[i][6]),
      confirma:     str(bdData[i][7]),
      otorgado:     str(bdData[i][8]),
      tipoMod,
      fechaMod:     bdData[i][10],
      modId:        str(bdData[i][11]),
      presente:     str(bdData[i][12]),
      tsPresente:   str(bdData[i][13]),
      observaciones: str(bdData[i][16])
    });
  }
  return turnos;
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 1: GENERAR AGENDAC (dividida en fases)
// ─────────────────────────────────────────────────────────────

function generarAgendaC(params) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const portada = ss.getSheetByName("Portada");
  const tz      = Session.getScriptTimeZone();

  // Si se reciben params directos (desde verProximoDia), usarlos; si no, leer Portada
  let nombre, apellido, dni, estudio, origen, observaciones, fecha, fechaStr;

  if (params) {
    ({ nombre, apellido, dni, estudio, origen, observaciones, fecha } = params);
    fechaStr = fechaAStr(fecha, tz);
  } else {
    const row      = portada.getRange("A8:G8").getValues()[0];
    nombre         = str(row[0]);
    apellido       = str(row[1]);
    dni            = str(row[2]);
    estudio        = str(row[3]);
    origen         = str(row[4]);
    observaciones  = str(row[5]);
    const fechaVal = row[6];
    const fechaDisp = portada.getRange("G8").getDisplayValue();

    portada.getRange("H8").clearContent();

    if (!estudio || !fechaVal) {
      SpreadsheetApp.getUi().alert("Completá el estudio y la fecha antes de confirmar.");
      return;
    }

    const p = fechaDisp.split("/");
    if (p.length === 3) {
      fecha = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    } else if (fechaVal instanceof Date) {
      fecha = fechaVal;
    } else if (typeof fechaVal === "number") {
      fecha = new Date((fechaVal - 25569) * 86400000);
    } else {
      fecha = new Date(fechaVal);
    }
    fecha.setHours(12, 0, 0, 0);
    fechaStr = fechaAStr(fecha, tz);
  }

  const dia = fecha.getDay();
  const cfg = cargarConfigCalendario();

  // Advertencia de feriado
  if (cfg.feriados[fechaStr]) {
    const confirmar = SpreadsheetApp.getUi().alert(
      "⚠️ El " + fechaStr + " es feriado: " + cfg.feriados[fechaStr] + "\n\n¿Querés ver la agenda de todas formas?",
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    if (confirmar !== SpreadsheetApp.getUi().Button.YES) return;
  }

  // Cargar config estudios y calcular duración total
  const configMap        = cargarConfigEstudios();
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

  if (noEncontrados.length > 0) {
    SpreadsheetApp.getUi().alert("No se encontraron en Config:\n" + noEncontrados.join(", "));
    return;
  }
  if (duracion === 0) {
    SpreadsheetApp.getUi().alert("La duración total es 0. Revisá Config.");
    return;
  }

  const restricciones = Array.from(restriccionesSet);

  // ── FASE 1: construir mapa de slots ocupados
  const ocupadosMap = _construirOcupadosMap(fechaStr, configMap, dia);

  // ── FASE 2: calcular disponibilidad por slot
  const { slots, validacionesFilas, libres } = _calcularSlots(
    dia, duracion, restricciones, ocupadosMap, cfg, fechaStr, origen, configMap
  );

  // Verificar disponibilidad antes de crear hoja
  const esFeriado = !!cfg.feriados[fechaStr];
  if (libres === 0 && !esFeriado) {
    portada.getRange("F8").clearContent();
    SpreadsheetApp.getUi().alert(
      "⚠️ Sin turnos disponibles\n" + "─".repeat(40) + "\n\n🔬 " + estudio +
      "\n📅 " + fechaStr + "\n\nNo hay horarios disponibles. Seleccioná otra fecha."
    );
    return;
  }

  // ── FASE 3: renderizar la hoja AgendaC
  _renderizarAgenda(ss, slots, validacionesFilas, esFeriado, fechaStr, cfg.feriados);

  // Guardar propiedades del paciente
  PropertiesService.getScriptProperties().setProperties({
    "p_nombre":        String(nombre),
    "p_apellido":      String(apellido),
    "p_dni":           String(dni),
    "p_estudio":       String(estudio),
    "p_origen":        String(origen),
    "p_fecha":         fechaStr,
    "p_observaciones": observaciones,
    "p_fecha_agendac": fechaStr
  });

  if (esFeriado) {
    SpreadsheetApp.getUi().alert(
      "🚫 " + fechaStr + " — " + cfg.feriados[fechaStr] +
      "\n\nLa agenda se muestra en rojo. No se pueden confirmar turnos."
    );
  } else {
    const totalSlots = 24 * 60 / 10;
    SpreadsheetApp.getUi().alert(
      "📅 Agenda del " + fechaStr + " generada.\n" + "─".repeat(40) + "\n\n🔬 " + estudio +
      "\n\n✅ Turnos disponibles: " + libres + "\n🔴 Turnos ocupados: " + (totalSlots - libres) +
      "\n\n" + "─".repeat(40) + "\nElegí un horario y seleccioná 'Ok' en CONFIRMA."
    );
  }

  ss.setActiveSheet(ss.getSheetByName("AgendaC"));
}

/** FASE 1: Construye mapa minutos→datos del turno para una fecha dada. */
function _construirOcupadosMap(fechaStr, configMap) {
  const turnos = leerTurnosBD({ fechaStr, soloActivos: true });
  const ocupadosMap = {};

  for (const t of turnos) {
    const listaEst = t.estudio.split(",").map(s => s.trim()).filter(s => s);
    let dur = 0;
    for (const e of listaEst) { if (configMap[e]) dur += configMap[e].duracion; }
    if (dur === 0) dur = 10;

    for (let m = t.mins; m < t.mins + dur; m += 10) {
      ocupadosMap[m] = { nombre: t.nombre, apellido: t.apellido, dni: t.dni, estudio: t.estudio, origen: t.origen, confirma: t.confirma };
    }
  }
  return ocupadosMap;
}

/** FASE 2: Calcula el estado de cada slot (libre, ocupado, bloqueado, etc.) */
function _calcularSlots(dia, duracion, restricciones, ocupadosMap, cfg, fechaStr, origen, configMap) {
  const { feriados, bloqueos, bloqueosRecurrentes, restriccionesConfig, restriccionesHorarias, restriccionesOrigen } = cfg;
  const esFeriado = !!feriados[fechaStr];

  function cumpleRestriccion(m) {
    for (const cod of restricciones) {
      if (cod === "S" || cod === "ESP") continue;
      const reglas = restriccionesConfig[cod];
      if (!reglas || reglas.length === 0) continue;
      if (!reglas.some(r => r.diasSemana.includes(dia) && m >= r.minDesde && m <= r.minHasta)) return false;
    }
    return true;
  }

  function entraLibre(inicio) {
    if (inicio + duracion > 24 * 60) return false;
    for (let t = inicio; t < inicio + duracion; t += 10) {
      if (ocupadosMap[t]) return false;
    }
    return true;
  }

function obtenerFranjaCodigo(m) {
  for (const [cod, reglas] of Object.entries(restriccionesHorarias)) {
    for (const r of reglas) {
      if (r.diasSemana.includes(dia) && m >= r.minDesde && m <= r.minHasta) {
        if (m + duracion <= r.minHasta) return { ...r, cod };
      }
    }
  }
  return null;
}
function franjaOrigenQueRestringeInicio(m) {
  for (const [cod, reglas] of Object.entries(restriccionesOrigen)) {
    for (const r of reglas) {
      if (r.diasSemana.includes(dia) && m >= r.minDesde && m <= r.minHasta) {
        return { ...r, cod };
      }
    }
  }
  return null;
}
function obtenerFranjaOrigen(m) {
  for (const [cod, reglas] of Object.entries(restriccionesOrigen)) {
    for (const r of reglas) {
      if (r.diasSemana.includes(dia) && m >= r.minDesde && m <= r.minHasta) {
        if (m + duracion <= r.minHasta) return { ...r, cod };
      }
    }
  }
  return null;
}

function franjaQueRestringeInicio(m) {
  for (const [cod, reglas] of Object.entries(restriccionesHorarias)) {
    for (const r of reglas) {
      if (r.diasSemana.includes(dia) && m >= r.minDesde && m < r.minHasta) {
        return { ...r, cod };
      }
    }
  }
  return null;
}

  const COLOR_FERIADO   = Array(8).fill("#e06666");
  const COLOR_BLOQUEADO = Array(8).fill("#e06666");
  const COLOR_PACIENTE  = Array(8).fill("#cfe2f3");
  const COLOR_LIBRE     = Array(8).fill("#d9ead3");
  const COLOR_VACIO     = Array(8).fill("#ffffff");
  const slots           = [];
  const validacionesFilas = [];
  let libres            = 0;

  for (let m = 0; m < 24 * 60; m += 10) {
    const horaStr = minutosAHora(m);
    let fila, color;

    if (esFeriado) {
      fila  = [fechaStr, horaStr, "", "", "", "", feriados[fechaStr], ""];
      color = COLOR_FERIADO;

    } else {
      // Bloqueo puntual
      const bp = bloqueos.find(b => b.fechaStr === fechaStr && m >= b.minDesde && m <= b.minHasta);
      if (bp) {
        fila  = [fechaStr, horaStr, "", "", "", "", bp.concepto, ""];
        color = COLOR_BLOQUEADO;

      } else {
        const p = ocupadosMap[m];
        if (p && p.nombre) {
          // Turno de paciente
          fila  = [fechaStr, horaStr, p.confirma, p.nombre, p.apellido, p.dni, p.estudio, p.origen];
          color = COLOR_PACIENTE;

        } else {
          const franjaCodigo = obtenerFranjaCodigo(m);
          const franjaOrigen = obtenerFranjaOrigen(m);
          const franja       = franjaCodigo || franjaOrigen;

        if (franja) {
          fila  = [fechaStr, horaStr, "", "", "", "", franja.leyenda, ""];
          color = Array(8).fill(franja.color);

        const codigoOk = !franjaCodigo || restricciones.includes(franjaCodigo.cod);
        const origenOk = !franjaOrigen || origen.trim().toUpperCase() === franjaOrigen.cod.trim().toUpperCase();
        if (codigoOk && origenOk && cumpleRestriccion(m) && entraLibre(m)) {
          validacionesFilas.push(slots.length + 2);
          libres++;
        }

              } else {
            const franjaInicio = franjaQueRestringeInicio(m);
            const franjaOrigenInicio = franjaOrigenQueRestringeInicio(m);
            const franjaRestriccion = franjaInicio && !restricciones.includes(franjaInicio.cod) ? franjaInicio
              : franjaOrigenInicio && origen.trim().toUpperCase() !== franjaOrigenInicio.cod.trim().toUpperCase() ? franjaOrigenInicio
              : null;

            if (franjaRestriccion) {
              fila  = [fechaStr, horaStr, "", "", "", "", franjaRestriccion.leyenda, ""];
              color = Array(8).fill(franjaRestriccion.color);

            } else {
            const br = bloqueosRecurrentes.find(b => b.diasSemana.includes(dia) && m >= b.minDesde && m <= b.minHasta);

          if (br && cumpleRestriccion(m) && entraLibre(m)) {
            fila  = [fechaStr, horaStr, "", "", "", "", br.concepto, ""];
            color = Array(8).fill(br.color);

          const franjaQueBloquea = Object.entries(restriccionesHorarias).find(([cod, reglas]) =>
            !restricciones.includes(cod) &&
             reglas.some(r => r.diasSemana.includes(dia) && m >= r.minDesde && m < r.minHasta)
          );

  if (!franjaQueBloquea) {
    validacionesFilas.push(slots.length + 2);
    libres++;
  }

} else if (!br && cumpleRestriccion(m) && entraLibre(m)) {
              fila  = [fechaStr, horaStr, "", "", "", "", "", ""];
              color = COLOR_LIBRE;
              validacionesFilas.push(slots.length + 2);
              libres++;

            } else {
              fila  = [fechaStr, horaStr, "", "", "", "", "", ""];
              color = COLOR_VACIO;
            }
            }
          }
        }
      }
    }

    slots.push({ fila, color });
  }

  return { slots, validacionesFilas, libres };
}

/** FASE 3: Crea/recrea la hoja AgendaC y escribe los datos calculados. */
function _renderizarAgenda(ss, slots, validacionesFilas, esFeriado, fechaStr, feriados) {
  const hojaExistente = ss.getSheetByName("AgendaC");
  if (hojaExistente) ss.deleteSheet(hojaExistente);
  SpreadsheetApp.flush();
  const agendaC = ss.insertSheet("AgendaC", ss.getNumSheets());

  const totalFilas = slots.length + 1;
  const encabezado = [["DÍA", "HORA", "CONFIRMA", "NOMBRE", "APELLIDO", "DNI", "ESTUDIO", "ORIGEN"]];
  const colorEnc   = [["#4a86c8","#4a86c8","#4a86c8","#4a86c8","#4a86c8","#4a86c8","#4a86c8","#4a86c8"]];

  const valores = encabezado.concat(slots.map(s => s.fila));
  const colores = colorEnc.concat(slots.map(s => s.color));

  const rangoTotal = agendaC.getRange(1, 1, totalFilas, 8);
  rangoTotal.setValues(valores);
  rangoTotal.setBackgrounds(colores);

  if (esFeriado) agendaC.getRange(1, 1, 1, 8).setBackground("#cc0000");

  agendaC.getRange(1, 1, 1, 8)
    .setFontFamily("Nunito").setFontSize(16).setFontWeight("bold")
    .setFontColor("#ffffff").setHorizontalAlignment("center").setVerticalAlignment("middle");

  agendaC.getRange(2, 1, slots.length, 8)
    .setFontFamily("Nunito").setFontSize(12).setVerticalAlignment("middle").setHorizontalAlignment("center");

  agendaC.getRange(2, 6, slots.length, 1).setHorizontalAlignment("left").setWrap(true);

  const rngBorde = agendaC.getRange(1, 1, totalFilas, 9);
  rngBorde.setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  rngBorde.setBorder(true, true, true, true, null, null, "#888888", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  if (!esFeriado) {
    const regla = SpreadsheetApp.newDataValidation().requireValueInList(["Ok"], true).setAllowInvalid(false).build();
    for (const filaNum of validacionesFilas) {
      agendaC.getRange(filaNum, 3).setDataValidation(regla);
    }
  }

  // Botón Cancelar
  agendaC.getRange(1, 9).setValue("CANCELAR")
    .setBackground("#cc0000").setFontColor("#ffffff").setFontFamily("Nunito")
    .setFontSize(16).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  agendaC.getRange(2, 9).setValue("")
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Cancelar"], true).setAllowInvalid(false).build())
    .setBackground("#cc0000").setFontColor("#ffffff").setFontFamily("Nunito")
    .setFontSize(16).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Botón Ver Próximo Día
  agendaC.getRange(1, 10).setValue("VER PRÓXIMO DÍA")
    .setBackground("#1a3a5c").setFontColor("#ffffff").setFontFamily("Nunito")
    .setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center")
    .setVerticalAlignment("middle").setWrap(true);
  agendaC.getRange(2, 10).setValue("")
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Ok"], true).setAllowInvalid(false).build())
    .setBackground("#1a3a5c").setFontColor("#ffffff").setFontFamily("Nunito")
    .setFontSize(14).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Anchos de columna
  [100, 100, 150, 150, 150, 150, 450, 150, 120, 160].forEach((w, i) => agendaC.setColumnWidth(i + 1, w));
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 2: CONFIRMAR TURNO
// ─────────────────────────────────────────────────────────────

function confirmarTurno(filaAgendaC) {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const agendaC   = ss.getSheetByName("AgendaC");
  const baseDatos = ss.getSheetByName("Base de datos");
  const tz        = Session.getScriptTimeZone();

  const datosFila  = agendaC.getRange(filaAgendaC, 1, 1, 2).getValues()[0];
  const fechaTurno = datosFila[0];
  const horaTurno  = datosFila[1];

  if (!fechaTurno || !horaTurno) {
    SpreadsheetApp.getUi().alert("Error: no se pudo leer la fecha u hora del turno.");
    agendaC.getRange(filaAgendaC, 8).clearContent();
    return;
  }

  const NOMBRES_DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const fechaObj    = fechaTurno instanceof Date ? fechaTurno : new Date(fechaTurno);
  const mins        = parsearMinutos(horaTurno);
  const horaDisplay = minutosAHora(mins) + " hs";
  const fechaDisplay = NOMBRES_DIA_LARGO[fechaObj.getDay()] + " " + fechaObj.getDate() +
                       "/" + (fechaObj.getMonth() + 1) + "/" + fechaObj.getFullYear();

  const props       = PropertiesService.getScriptProperties();
  const nombre      = capitalizar(props.getProperty("p_nombre") || "");
  const apellido    = capitalizar(props.getProperty("p_apellido") || "");
  const dni         = props.getProperty("p_dni") || "";
  const estudio     = props.getProperty("p_estudio") || "";
  const origen      = props.getProperty("p_origen") || "";
  const modId       = props.getProperty("p_mod_id") || "";
  const observaciones = props.getProperty("p_observaciones") || "";

  if (!nombre && !dni) {
    SpreadsheetApp.getUi().alert("No hay datos de paciente pendiente. Volvé a Portada.");
    agendaC.getRange(filaAgendaC, 8).clearContent();
    return;
  }

  const otorgado   = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
  const ultimaFila = Math.max(baseDatos.getLastRow() + 1, 2);

  baseDatos.getRange(ultimaFila, 1, 1, 9).setValues([[
    fechaTurno, horaTurno, nombre, apellido, dni, estudio, origen, "Ok", otorgado
  ]]);

  if (modId !== "") baseDatos.getRange(ultimaFila, 12).setValue(modId);
  if (observaciones !== "") baseDatos.getRange(ultimaFila, 17).setValue(observaciones);

  // Generar turnoId único y guardarlo en columna 18 de BD local
  const turnoId = "t_" + new Date().getTime();
  baseDatos.getRange(ultimaFila, 18).setValue(turnoId);

  // Escribir en BD central
  try {
    const bdC     = _bdCentral();
    const filaBDC = bdC.getLastRow() + 1;
    bdC.getRange(filaBDC, 1, 1, 9).setValues([[
      fechaTurno, horaTurno, nombre, apellido, dni, estudio, origen, "Ok", otorgado
    ]]);
    if (observaciones !== "") bdC.getRange(filaBDC, 17).setValue(observaciones);
    bdC.getRange(filaBDC, 18).setValue(turnoId);
    bdC.getRange(filaBDC, 19).setValue("TECNICO");

    // Si es una modificación, buscar el turnoId original en BD local y borrarlo de BD central
    if (modId !== "") {
      const modFila = props.getProperty("p_mod_fila");
      if (modFila) {
        const turnoIdOriginal = str(baseDatos.getRange(parseInt(modFila), 18).getValue());
        if (turnoIdOriginal) {
          const filaVieja = _buscarFilaBDCentral(bdC, turnoIdOriginal);
          if (filaVieja > 0) bdC.deleteRow(filaVieja);
        }
      }
    }
  } catch (err) {
    Logger.log("Error escribiendo en BD central: " + err);
    SpreadsheetApp.getUi().alert("⚠️ Turno guardado localmente pero no se pudo escribir en la BD central.\nError: " + err);
  }

  props.deleteAllProperties();

  SpreadsheetApp.getUi().alert(
    "✅ Turno confirmado:\n" + "─".repeat(30) + "\n" +
    "👤 " + apellido + ", " + nombre + "  —  DNI: " + dni + "\n" +
    "🔬 " + estudio + "\n" +
    "📅 " + fechaDisplay + "  🕐 " + horaDisplay + "\n" +
    (observaciones !== "" ? "📝 " + observaciones + "\n" : "") +
    "─".repeat(30) + "\n\nConfirmado, volvemos a la Portada."
  );

  const hojaAgenda = ss.getSheetByName("AgendaC");
  if (hojaAgenda) ss.deleteSheet(hojaAgenda);

  vistaPrevia();
  ss.setActiveSheet(ss.getSheetByName("Portada"));
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 3: LIMPIAR PORTADA
// ─────────────────────────────────────────────────────────────

function limpiarPortada() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const portada = ss.getSheetByName("Portada");
  portada.getRange("A8:H8").clearContent();
  ss.setActiveSheet(portada);
  portada.getRange("A8").activate();
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 4: MENÚ PERSONALIZADO
// ─────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📅 Agenda")
    .addItem("Generar agenda del día", "generarAgendaC")
    .addItem("Limpiar Portada", "limpiarPortada")
    .addItem("Actualizar vista previa", "vistaPrevia")
    .addItem("Instalar Trigger", "instalarTrigger")
    .addSeparator()
    .addItem("🔄 Invalidar cache de Config", "invalidarCache")
    .addToUi();
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 5: VISTA PREVIA EN PORTADA
// ─────────────────────────────────────────────────────────────

function colorPorOrigen(origen) {
  switch (origen.toUpperCase()) {
    case "AMBULATORIO": return "#a8d5a2";
    case "GUARDIA":     return "#5ba4cf";
    case "INTERNACIÓN": return "#ffd966";
    case "DIRECCIÓN":   return "#a98fd4";
    case "TRASLADO":    return "#3c9ab8";
    default:            return "#e8a09a";
  }
}

function colorContinuacion(origen) {
  switch (origen.toUpperCase()) {
    case "AMBULATORIO": return "#cdebc9";
    case "GUARDIA":     return "#a8d0ed";
    case "INTERNACIÓN": return "#ffebaf";
    case "DIRECCIÓN":   return "#cec0ea";
    case "TRASLADO":    return "#74B9D4";
    default:            return "#f2c8c5";
  }
}

// Turnos de BD_RIS mostrados como guía — color propio, distinto de cualquier origen real,
// para que nunca se confundan con un turno local confirmado.
function colorRIS()              { return "#dce4f7"; }
function colorContinuacionRIS()  { return "#eef2fb"; }

function vistaPrevia() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const portada = ss.getSheetByName("Portada");
  const tz      = Session.getScriptTimeZone();

  const portadaVista = portada.getRange("C10:E10").getValues()[0];
  const FILA_INICIO  = 11;
  const DIAS         = Number(portadaVista[0]) || 12;
  const PASO_GRILLA  = Number(portadaVista[2]) || 40;
  const PASO_BD      = 10;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    return d;
  });

  const slots = [];
  for (let m = 0; m < 24 * 60; m += PASO_GRILLA) slots.push(m);

  const configMap = cargarConfigEstudios();

  // Construir mapa de turnos para todos los días del rango
  const todasFechas = dias.map(d => fechaAStr(d, tz));
  const turnosBD    = leerTurnosBD({ soloActivos: true });
  const turnosMap   = {};

  for (const t of turnosBD) {
    if (!todasFechas.includes(t.fechaStr)) continue;

    const listaEst = t.estudio.split(",").map(s => s.trim()).filter(s => s);
    let dur = 0;
    for (const e of listaEst) { if (configMap[e]) dur += configMap[e].duracion; }
    if (dur === 0) dur = PASO_BD;

const etiqueta = t.dni + " - " + t.apellido + "\n" + t.estudio +
                 (t.observaciones ? "\n📝 " + t.observaciones : "") +
                 (t.presente === "Presente" ? "\n✅ Presente" : "");

    for (let m = t.mins; m < t.mins + dur; m += PASO_BD) {
      const clave = t.fechaStr + "_" + m;
      if (m === t.mins) {
        turnosMap[clave] = { texto: etiqueta, origen: t.origen };
      } else if (!turnosMap[clave]) {
        turnosMap[clave] = { texto: "·", origen: t.origen };
      }
    }
  }

  // ── Turnos RIS (BD_RIS) — guía en los huecos libres, nunca pisa un turno local ──
  // risInfoMap guarda TODAS las apariciones de RIS (aunque estén tapadas por un turno
  // local) para poder avisar por nota; turnosMap solo recibe RIS en slots libres.
  const risInfoMap = {};
  try {
    const risPorFecha = _apiLeerRISRango({ desde: fechaAStr(hoy, tz), dias: String(DIAS) });
    for (const fechaStr of Object.keys(risPorFecha)) {
      if (!todasFechas.includes(fechaStr)) continue;
      for (const r of risPorFecha[fechaStr]) {
        const dur         = r.duracion || 20;
        const apellidoR    = str(r.apellido_nombre).split(",")[0].trim();
        const etiquetaRIS  = str(r.documento) + " - " + apellidoR + "\n" + r.practica;
        const notaRIS      = "RIS: " + str(r.documento) + " - " + apellidoR + " — " + r.practica;

        // BD_RIS trae horarios reales (ej. 1:25, 2:35) que no siempre caen en un
        // múltiplo de PASO_BD — la grilla solo lee claves alineadas a 10 min, así
        // que alineamos el inicio hacia abajo para que el turno no quede invisible.
        const minsInicio = Math.floor(r.mins / PASO_BD) * PASO_BD;

        for (let m = minsInicio; m < r.mins + dur; m += PASO_BD) {
          const clave = fechaStr + "_" + m;
          if (!risInfoMap[clave]) risInfoMap[clave] = notaRIS;
          if (turnosMap[clave]) continue; // ya hay turno local en este sub-slot — no pisar
          if (m === minsInicio) {
            turnosMap[clave] = { texto: etiquetaRIS, origen: "RIS", esRIS: true };
          } else if (!turnosMap[clave]) {
            turnosMap[clave] = { texto: "·", origen: "RIS", esRIS: true };
          }
        }
      }
    }
  } catch (err) {
    Logger.log("Error mergeando RIS en vistaPrevia: " + err);
  }

  const { feriados, bloqueos, bloqueosRecurrentes, restriccionesHorarias, restriccionesOrigen } = cargarConfigCalendario();

  const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const NOMBRES_MES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  const totalCols = DIAS + 1;

  // Limpiar grilla anterior
  const ultimaFila = portada.getMaxRows();
  const ultimaCol  = portada.getMaxColumns();
  const filasDisp  = ultimaFila - FILA_INICIO + 1;
  if (filasDisp > 0) {
    const rngLimpiar = portada.getRange(FILA_INICIO, 1, filasDisp, ultimaCol);
    rngLimpiar.clearContent();
    rngLimpiar.clearFormat();
  }

  const valores = [];
  const colores = [];
  const notas   = [];

  // Encabezado
  const encabezadoFila  = [""];
  const encabezadoColor = ["#4a86c8"];
  for (const d of dias) {
    const fStr    = fechaAStr(d, tz);
    const feriad  = !!feriados[fStr];
    const concepto = feriad ? "\n🚫 " + feriados[fStr] : "";
    encabezadoFila.push(NOMBRES_DIA[d.getDay()] + "\n" + d.getDate() + " " + NOMBRES_MES[d.getMonth()] + concepto);
    encabezadoColor.push(feriad ? "#cc0000" : "#4a86c8");
  }
  valores.push(encabezadoFila);
  colores.push(encabezadoColor);
  notas.push(new Array(totalCols).fill(""));

  const encabezadosIntermedios = [];
  let contadorFilas = 0;

  for (const m of slots) {
    if (PASO_GRILLA < 40 && contadorFilas > 0 && contadorFilas % 26 === 0) {
      valores.push(encabezadoFila);
      colores.push(encabezadoColor);
      notas.push(new Array(totalCols).fill(""));
      encabezadosIntermedios.push(FILA_INICIO + valores.length - 1);
    }
    contadorFilas++;

    const horaStr   = minutosAHora(m);
    const filaVal   = [horaStr];
    const filaColor = ["#e8eaf0"];
    const filaNota  = [""];

    for (const d of dias) {
      const fStr      = fechaAStr(d, tz);
      const diaSemana = d.getDay();

      if (feriados[fStr]) {
        filaVal.push("🚫");
        filaColor.push("#e06666");
        filaNota.push("");
        continue;
      }

      // Bloqueo puntual
      let bloqueoPuntual = "";
      for (const b of bloqueos) {
        if (b.fechaStr === fStr) {
          for (let sub = 0; sub < PASO_GRILLA; sub += PASO_BD) {
            if ((m + sub) >= b.minDesde && (m + sub) <= b.minHasta) { bloqueoPuntual = b.concepto; break; }
          }
        }
        if (bloqueoPuntual) break;
      }
      if (bloqueoPuntual) { filaVal.push(bloqueoPuntual); filaColor.push("#e06666"); filaNota.push(""); continue; }

      // Turno de paciente — el turno local siempre gana la celda; RIS solo se dibuja
      // si ningún sub-slot de esta celda tiene turno local. Si un turno local tapa
      // un RIS, se deja aviso en la nota de la celda (no se pierde la info).
      let textoLocal = "", origenLocal = "", ocupadoLocal = false;
      let textoRis = "", ocupadoRis = false;
      let notaRis = "";
      for (let sub = 0; sub < PASO_GRILLA; sub += PASO_BD) {
        const clave = fStr + "_" + (m + sub);
        const turno = turnosMap[clave];
        if (turno) {
          if (turno.esRIS) {
            ocupadoRis = true;
            if (turno.texto && turno.texto !== "·") textoRis = turno.texto;
          } else {
            ocupadoLocal = true;
            if (turno.texto && turno.texto !== "·") { textoLocal = turno.texto; origenLocal = turno.origen; }
            else if (!textoLocal) { origenLocal = turno.origen; }
          }
        }
        if (risInfoMap[clave] && !notaRis) notaRis = risInfoMap[clave];
      }

      if (textoLocal)   { filaVal.push(textoLocal); filaColor.push(colorPorOrigen(origenLocal)); filaNota.push(notaRis); continue; }
      if (ocupadoLocal) { filaVal.push(""); filaColor.push(colorContinuacion(origenLocal)); filaNota.push(notaRis); continue; }
      if (textoRis)     { filaVal.push("🔷 " + textoRis); filaColor.push(colorRIS()); filaNota.push(""); continue; }
      if (ocupadoRis)   { filaVal.push(""); filaColor.push(colorContinuacionRIS()); filaNota.push(""); continue; }

      // Bloqueo recurrente
      let bloqueoRec = null;
      for (const b of bloqueosRecurrentes) {
        if (b.diasSemana.includes(diaSemana)) {
          for (let sub = 0; sub < PASO_GRILLA; sub += PASO_BD) {
            if ((m + sub) >= b.minDesde && (m + sub) <= b.minHasta) { bloqueoRec = b; break; }
          }
        }
        if (bloqueoRec) break;
      }
      if (bloqueoRec) { filaVal.push(bloqueoRec.concepto); filaColor.push(bloqueoRec.color); filaNota.push(""); continue; }

      // Franja por código o por origen
      let bloqueoVista = null;
      for (const [, reglas] of Object.entries(restriccionesHorarias)) {
        if (bloqueoVista) break;
        for (const r of reglas) {
          if (r.diasSemana.includes(diaSemana)) {
            for (let sub = 0; sub < PASO_GRILLA; sub += PASO_BD) {
              if ((m + sub) >= r.minDesde && (m + sub) < r.minHasta) { bloqueoVista = r; break; }
            }
          }
          if (bloqueoVista) break;
        }
      }
      if (!bloqueoVista) {
        for (const [, reglas] of Object.entries(restriccionesOrigen)) {
          if (bloqueoVista) break;
          for (const r of reglas) {
            if (r.diasSemana.includes(diaSemana)) {
              for (let sub = 0; sub < PASO_GRILLA; sub += PASO_BD) {
                if ((m + sub) >= r.minDesde && (m + sub) < r.minHasta) { bloqueoVista = r; break; }
              }
            }
            if (bloqueoVista) break;
          }
        }
      }
      if (bloqueoVista) { filaVal.push(bloqueoVista.leyenda); filaColor.push(bloqueoVista.color); filaNota.push(""); continue; }

      filaVal.push(""); filaColor.push("#ffffff"); filaNota.push("");
    }
    valores.push(filaVal);
    colores.push(filaColor);
    notas.push(filaNota);
  }

  // Fila pie
  valores.push(encabezadoFila);
  colores.push(encabezadoColor);
  notas.push(new Array(totalCols).fill(""));

  const totalFilasConPie = valores.length;
  const rangoGrilla = portada.getRange(FILA_INICIO, 1, totalFilasConPie, totalCols);
  rangoGrilla.setValues(valores);
  rangoGrilla.setBackgrounds(colores);
  rangoGrilla.setNotes(notas);

  // Formato encabezados intermedios
  for (const filaEnc of encabezadosIntermedios) {
    portada.getRange(filaEnc, 1, 1, totalCols)
      .setFontFamily("Nunito").setFontSize(11).setFontWeight("bold")
      .setFontColor("#ffffff").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    portada.setRowHeight(filaEnc, 40);
  }

  // Formato encabezado principal y pie
  for (const filaEnc of [FILA_INICIO, FILA_INICIO + totalFilasConPie - 1]) {
    portada.getRange(filaEnc, 1, 1, totalCols)
      .setFontFamily("Nunito").setFontSize(11).setFontWeight("bold")
      .setFontColor("#ffffff").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    portada.setRowHeight(filaEnc, 40);
  }

  portada.getRange(FILA_INICIO + 1, 1, totalFilasConPie - 2, 1)
    .setFontFamily("Nunito").setFontSize(9).setFontWeight("bold")
    .setFontColor("#444444").setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#e8eaf0");

  portada.getRange(FILA_INICIO + 1, 2, totalFilasConPie - 2, DIAS)
    .setFontFamily("Nunito").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);

  for (let c = 1; c <= totalCols; c++) portada.setColumnWidth(c, 150);
  for (let r = FILA_INICIO + 1; r <= FILA_INICIO + totalFilasConPie - 2; r++) portada.setRowHeight(r, 45);

  const rngBorde = portada.getRange(FILA_INICIO, 1, totalFilasConPie, totalCols);
  rngBorde.setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  rngBorde.setBorder(true, true, true, true, null, null, "#888888", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  portada.setHiddenGridlines(true);
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 6: MODIFICAR / ANULAR TURNO
// ─────────────────────────────────────────────────────────────

function modificarTurno() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const portada   = ss.getSheetByName("Portada");
  const baseDatos = ss.getSheetByName("Base de datos");
  const ui        = SpreadsheetApp.getUi();
  const tz        = Session.getScriptTimeZone();

  const apellidoBusq = str(portada.getRange("J8").getValue());
  const dniBusq      = str(portada.getRange("K8").getValue());
  const accion       = str(portada.getRange("L8").getValue());

  portada.getRange("L8").clearContent();

  if (!apellidoBusq && !dniBusq) { ui.alert("Ingresá al menos un Apellido o DNI para buscar."); return; }
  if (!accion) { ui.alert("Seleccioná una acción en L8 (Fecha, Estudio o Anular)."); return; }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const candidatos = leerTurnosBD({ soloActivos: true, apellido: apellidoBusq, dni: dniBusq || undefined })
    .filter(t => t.fechaDate >= hoy);

  if (candidatos.length === 0) { ui.alert("No se encontraron turnos activos para los criterios ingresados."); return; }

  let elegido;
  const dnisUnicos = [...new Set(candidatos.map(t => t.dni))];

  if (dnisUnicos.length > 1) {
    let msg = "Se encontraron " + dnisUnicos.length + " pacientes. Ingresá el número:\n\n";
    dnisUnicos.forEach((dni, idx) => {
      const ej = candidatos.find(t => t.dni === dni);
      msg += (idx + 1) + ". " + ej.apellido + ", " + ej.nombre + "  —  DNI: " + dni + "\n";
    });
    const resp = ui.prompt(msg, ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    const num = parseInt(resp.getResponseText().trim());
    if (isNaN(num) || num < 1 || num > dnisUnicos.length) { ui.alert("Número inválido."); return; }
    const dniFiltrado = dnisUnicos[num - 1];
    const filtrados   = candidatos.filter(t => t.dni === dniFiltrado);
    elegido = filtrados.length === 1 ? filtrados[0] : _elegirDeLista(filtrados, ui, tz);
  } else if (candidatos.length === 1) {
    elegido = candidatos[0];
  } else {
    elegido = _elegirDeLista(candidatos, ui, tz);
  }

  if (!elegido) return;

  const ahora = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");

  if (accion === "Anular") {
    const horaStr = minutosAHora(elegido.mins) + " hs";
    const fechaStr = fechaAStr(elegido.fechaDate, tz);
    const confirmar = ui.alert(
      "⚠️ Confirmar anulación\n" + "─".repeat(40) + "\n" +
      "👤 " + elegido.apellido + ", " + elegido.nombre + "\n🔬 " + elegido.estudio +
      "\n📅 " + fechaStr + "\n🕐 " + horaStr + "\n📍 " + elegido.origen +
      (elegido.observaciones ? "\n📝 " + elegido.observaciones : "") +
      "\n" + "─".repeat(40) + "\n\n¿Confirmás la anulación?",
      ui.ButtonSet.YES_NO
    );
    if (confirmar !== ui.Button.YES) { ui.alert("Anulación cancelada."); return; }

    baseDatos.getRange(elegido.fila, 10).setValue(accion);
    baseDatos.getRange(elegido.fila, 11).setValue(ahora);

    // Borrar de BD central si existe
    try {
      const turnoIdAnul = str(baseDatos.getRange(elegido.fila, 18).getValue());
      if (turnoIdAnul) {
        const bdC = _bdCentral();
        const filaAnul = _buscarFilaBDCentral(bdC, turnoIdAnul);
        if (filaAnul > 0) bdC.deleteRow(filaAnul);
      }
    } catch (err) {
      Logger.log("Error borrando de BD central: " + err);
    }

    ui.alert(
      "✅ Turno anulado\n" + "─".repeat(40) + "\n" +
      "👤 " + elegido.apellido + ", " + elegido.nombre + "\n🔬 " + elegido.estudio +
      "\n📅 " + fechaStr + "\n🕐 " + horaStr + "\n📍 " + elegido.origen
    );
    vistaPrevia();
    return;
  }

  const modId = "mod_" + new Date().getTime();
  baseDatos.getRange(elegido.fila, 10).setValue(accion);
  baseDatos.getRange(elegido.fila, 11).setValue(ahora);
  baseDatos.getRange(elegido.fila, 12).setValue(modId);
  PropertiesService.getScriptProperties().setProperties({
    "p_mod_id":   modId,
    "p_mod_fila": String(elegido.fila)
  });

  portada.getRange("A8").setValue(elegido.nombre);
  portada.getRange("B8").setValue(elegido.apellido);
  portada.getRange("C8").setValue(elegido.dni);
  portada.getRange("E8").setValue(elegido.origen);

  if (accion === "Fecha") {
    portada.getRange("F8").setValue(elegido.observaciones);
    portada.getRange("D8").setValue(elegido.estudio);
    portada.getRange("G8").clearContent();
    ui.alert(
      "✅ Turno original anulado.\n\n" +
      "👤 " + elegido.apellido + ", " + elegido.nombre + "  —  DNI: " + elegido.dni + "\n" +
      "🔬 " + elegido.estudio + "\n📍 " + elegido.origen +
      (elegido.observaciones ? "\n📝 " + elegido.observaciones : "") +
      "\n\nIngresá la nueva FECHA en G8 y confirmá con H8."
    );
  } else if (accion === "Estudio") {
    portada.getRange("F8").setValue(elegido.observaciones);
    portada.getRange("D8").clearContent();
    portada.getRange("G8").setValue(elegido.fechaDate);
    ui.alert(
      "✅ Turno original anulado.\n\n" +
      "👤 " + elegido.apellido + ", " + elegido.nombre + "  —  DNI: " + elegido.dni + "\n" +
      "🔬 " + elegido.estudio + "\n📍 " + elegido.origen +
      (elegido.observaciones ? "\n📝 " + elegido.observaciones : "") +
      "\n\nIngresá el nuevo ESTUDIO en D8 y confirmá con H8."
    );
  }
  ss.setActiveSheet(portada);
}

/** Helper: permite elegir de una lista de turnos. */
function _elegirDeLista(lista, ui, tz) {
  let msg = "Se encontraron " + lista.length + " turnos. Ingresá el número:\n\n";
  lista.forEach((t, i) => {
    msg += (i + 1) + ". 📅 " + t.fechaStr + "  🕐 " + minutosAHora(t.mins) + " hs\n" +
           "    👤 " + t.apellido + ", " + t.nombre + "\n" +
           "    🔬 " + t.estudio + "\n" +
           "    📍 " + (t.origen || "—") + "\n" +
           "─".repeat(40) + "\n";
  });
  const resp = ui.prompt(msg, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  const num = parseInt(resp.getResponseText().trim());
  if (isNaN(num) || num < 1 || num > lista.length) { ui.alert("Número inválido."); return null; }
  return lista[num - 1];
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN 7: CHEQUEAR TURNOS
// ─────────────────────────────────────────────────────────────

function chequearTurnos() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const portada   = ss.getSheetByName("Portada");
  const baseDatos = ss.getSheetByName("Base de datos");
  const ui        = SpreadsheetApp.getUi();
  const tz        = Session.getScriptTimeZone();

  const apellidoBusq = str(portada.getRange("J3").getValue());
  const dniBusq      = str(portada.getRange("K3").getValue());
  portada.getRange("L3").clearContent();

  if (!apellidoBusq && !dniBusq) { ui.alert("Ingresá al menos un Apellido o DNI para buscar."); return; }

  const todos = leerTurnosBD({ apellido: apellidoBusq, dni: dniBusq || undefined });

  if (todos.length === 0) { ui.alert("No se encontraron turnos para los criterios ingresados."); return; }

  // Filtrar por paciente si hay múltiples apellidos
  let coincidencias = todos;
  const dnisUnicos = [...new Set(todos.map(t => t.dni))];
  if (dnisUnicos.length > 1) {
    let msg = "Se encontraron " + dnisUnicos.length + " pacientes. Ingresá el número:\n\n";
    dnisUnicos.forEach((dni, idx) => {
      const ej = todos.find(t => t.dni === dni);
      msg += (idx + 1) + ". " + ej.apellido + ", " + ej.nombre + "  —  DNI: " + dni + "\n";
    });
    const resp = ui.prompt(msg, ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    const num = parseInt(resp.getResponseText().trim());
    if (isNaN(num) || num < 1 || num > dnisUnicos.length) { ui.alert("Número inválido."); return; }
    coincidencias = todos.filter(t => t.dni === dnisUnicos[num - 1]);
  }

  coincidencias.sort((a, b) => {
    const diff = a.fechaDate - b.fechaDate;
    return diff !== 0 ? diff : a.mins - b.mins;
  });

  // Construir mapa modId → turno activo relacionado
  const relacionMap = {};
  for (const t of todos) {
    if (t.modId && (t.tipoMod === "" || t.tipoMod === "0")) relacionMap[t.modId] = t;
  }

  let texto = "Turnos encontrados para " +
    (apellidoBusq || "") + (apellidoBusq && dniBusq ? " / " : "") + (dniBusq || "") +
    " (" + coincidencias.length + "):\n" + "─".repeat(40) + "\n";

  for (const t of coincidencias) {
    let estado = "🟢 ACTIVO";
    let lineaExtra = "";
    let fechaModStr = "";

    if (t.fechaMod) {
      let soloDia, soloHora;
      if (t.fechaMod instanceof Date) {
        soloDia  = String(t.fechaMod.getDate()).padStart(2,"0") + "/" + String(t.fechaMod.getMonth()+1).padStart(2,"0");
        soloHora = String(t.fechaMod.getHours()).padStart(2,"0") + ":" + String(t.fechaMod.getMinutes()).padStart(2,"0");
      } else {
        const partes = str(t.fechaMod).split(" ");
        if (partes.length >= 2) { soloDia = partes[0].split("/").slice(0,2).join("/"); soloHora = partes[1].substring(0,5); }
      }
      if (soloDia && soloHora) fechaModStr = " (modificado el " + soloDia + " a las " + soloHora + " hs)";
    }

    if (t.tipoMod === "Anular") {
      estado = "🔴 ANULADO" + fechaModStr;
    } else if (t.tipoMod === "Fecha") {
      estado = "🟡 MOD. FECHA" + fechaModStr;
      const rel = relacionMap[t.modId];
      if (rel) lineaExtra = "   ↳ Nueva fecha: " + rel.fechaStr + " " + minutosAHora(rel.mins) + " hs\n";
    } else if (t.tipoMod === "Estudio") {
      estado = "🟡 MOD. ESTUDIO" + fechaModStr;
      const rel = relacionMap[t.modId];
      if (rel) lineaExtra = "   ↳ Nuevo estudio: " + rel.estudio + "\n";
    }

    texto += "\n📅 " + t.fechaStr + "  🕐 " + minutosAHora(t.mins) + " hs\n";
    texto += "👤 " + t.apellido + ", " + t.nombre + "  —  DNI: " + t.dni + "\n";
    texto += "🔬 " + t.estudio + "\n";
    texto += "📍 " + t.origen + "  —  " + estado + "\n";
    if (t.observaciones) texto += "📝 " + t.observaciones + "\n";
    if (lineaExtra) texto += lineaExtra;
    texto += "─".repeat(40) + "\n";
  }

  ui.alert(texto);

  // Presente
  const hoyStr   = fechaAStr(new Date(), tz);
  const turnoHoy = coincidencias.find(t => t.tipoMod === "" && t.fechaStr === hoyStr);

  if (!turnoHoy) return;

  if (turnoHoy.presente === "Presente") {
    ui.alert("✅ Este paciente ya tiene el presente registrado para hoy.");
    return;
  }

  const darPresente = ui.alert(
    "📅 Hay un turno para hoy\n" + "─".repeat(40) + "\n" +
    "👤 " + turnoHoy.apellido + ", " + turnoHoy.nombre + "\n🔬 " + turnoHoy.estudio +
    (turnoHoy.observaciones ? "\n📝 " + turnoHoy.observaciones : "") +
    "\n\n¿Dar presente?",
    ui.ButtonSet.YES_NO
  );

if (darPresente === ui.Button.YES) {
    const ahoraPresente = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");

    // ── BD local
    baseDatos.getRange(turnoHoy.fila, 13).setValue("Presente");
    baseDatos.getRange(turnoHoy.fila, 14).setValue(ahoraPresente);

    // ── BD central: buscar por turnoId (columna R = col 18) y sincronizar presente
    try {
        const turnoIdPresente = str(baseDatos.getRange(turnoHoy.fila, 18).getValue());
        if (turnoIdPresente) {
            const bdC = _bdCentral();
            const filaPresente = _buscarFilaBDCentral(bdC, turnoIdPresente);
            if (filaPresente > 0) {
                bdC.getRange(filaPresente, 13).setValue("Presente");
                bdC.getRange(filaPresente, 14).setValue(ahoraPresente);
            } else {
                Logger.log("Presente: turnoId no encontrado en BD central — " + turnoIdPresente);
            }
        }
    } catch (err) {
        Logger.log("Error sincronizando presente en BD central: " + err);
        ui.alert("⚠️ Presente guardado localmente pero no se pudo sincronizar con la BD central.\nError: " + err);
    }

    ui.alert("✅ Presente registrado correctamente.");
    vistaPrevia();
}
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN: CANCELAR AGENDAC
// ─────────────────────────────────────────────────────────────

function cancelarAgendaC() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  const modFila = props.getProperty("p_mod_fila");
  if (modFila) {
    const baseDatos = ss.getSheetByName("Base de datos");
    baseDatos.getRange(parseInt(modFila), 10, 1, 3).clearContent();
  }

  props.deleteAllProperties();
  const hojaAgenda = ss.getSheetByName("AgendaC");
  if (hojaAgenda) ss.deleteSheet(hojaAgenda);
  ss.setActiveSheet(ss.getSheetByName("Portada"));
  SpreadsheetApp.getUi().alert("↩️ Asignación del turno cancelada.");
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN: GENERAR PARTE DIARIO (HTML → PDF)
// ─────────────────────────────────────────────────────────────

 function generarParteDiario() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const portada = ss.getSheetByName("Portada");
  const tz      = Session.getScriptTimeZone();

  const fechaVal  = portada.getRange("K5").getValue();
  const fechaDisp = portada.getRange("K5").getDisplayValue();
  portada.getRange("L5").clearContent();

  if (!fechaVal) { SpreadsheetApp.getUi().alert("Ingresá una fecha en K5 antes de generar el parte."); return; }

  let fecha;
  const partes = fechaDisp.split("/");
  if (partes.length === 3) {
    fecha = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
  } else {
    fecha = fechaVal instanceof Date ? fechaVal : new Date(fechaVal);
  }
  fecha.setHours(12, 0, 0, 0);
  const fechaStr = fechaAStr(fecha, tz);

  const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const NOMBRES_MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaBonita = NOMBRES_DIA[fecha.getDay()] + " " + fecha.getDate() + " de " +
                      NOMBRES_MES[fecha.getMonth()] + " de " + fecha.getFullYear();

  const configMap = cargarConfigEstudios();
  const turnos    = leerTurnosBD({ fechaStr, soloActivos: true });

  if (turnos.length === 0) { SpreadsheetApp.getUi().alert("No hay turnos agendados para el " + fechaStr + "."); return; }

  turnos.sort((a, b) => a.mins - b.mins);

  // Conteo de estudios individuales
  const conteoEstudios = {};
  for (const t of turnos) {
    for (const est of t.estudio.split(",").map(s => s.trim()).filter(s => s)) {
      conteoEstudios[est] = (conteoEstudios[est] || 0) + 1;
    }
  }
  const totalEstudios = Object.values(conteoEstudios).reduce((a, b) => a + b, 0);
  let resumenEstudios = "";
  for (const [est, cant] of Object.entries(conteoEstudios)) {
    resumenEstudios += `<span class="tag">${cant} × ${est}</span> `;
  }

  const COLORES_ORIGEN = {
    "AMBULATORIO": { bg: "#e8f5e9", border: "#a8d5a2", text: "#2e7d32" },
    "GUARDIA":     { bg: "#e3f2fd", border: "#90caf9", text: "#1565c0" },
    "INTERNACIÓN": { bg: "#fce4ec", border: "#f48fb1", text: "#880e4f" },
    "DIRECCIÓN":   { bg: "#ede7f6", border: "#ce93d8", text: "#4a148c" }
  };
  const COLOR_DEFAULT = { bg: "#fff3e0", border: "#ffcc80", text: "#e65100" };

  let filasHTML = "";
  turnos.forEach((t, i) => {
    const col    = COLORES_ORIGEN[t.origen.toUpperCase()] || COLOR_DEFAULT;
    const bgFila = i % 2 === 0 ? "#ffffff" : "#f9f9f9";
    const estadoBg     = t.presente === "Presente" ? "#e8f5e9" : "#fff3e0";
    const estadoBorder = t.presente === "Presente" ? "#a8d5a2" : "#ffcc80";
    const estadoColor  = t.presente === "Presente" ? "#2e7d32" : "#e65100";
    const estadoTexto  = t.presente === "Presente" ? "✅ Presente" : "⏳ Asignado";
    filasHTML += `
  <tr style="background:${bgFila}">
    <td class="hora">${minutosAHora(t.mins)}</td>
    <td class="paciente">${t.apellido}, ${t.nombre}</td>
    <td class="dni">${t.dni}</td>
    <td class="estudio">${t.estudio}</td>
    <td class="obs">${t.observaciones}</td>
    <td><span class="origen-tag" style="background:${col.bg};border-color:${col.border};color:${col.text}">${t.origen}</span></td>
    <td><span class="origen-tag" style="background:${estadoBg};border-color:${estadoBorder};color:${estadoColor}">${estadoTexto}</span></td>
  </tr>`;
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Parte diario ${fechaStr.replace(/\//g, "-")}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #222; padding: 24px; }
  .header { text-align: center; margin-bottom: 20px; }
  .lugar  { font-size: 22px; font-weight: 700; color: #1a3a5c; letter-spacing: 0.5px; }
  .servicio { font-size: 15px; color: #4a86c8; font-weight: 600; margin-top: 2px; }
  .fecha  { font-size: 14px; color: #555; margin-top: 6px; }
  .divider { border: none; border-top: 2px solid #4a86c8; margin: 14px 0; }
  .resumen { background: #f0f6ff; border-left: 4px solid #4a86c8; padding: 10px 14px; margin-bottom: 18px; border-radius: 4px; }
  .resumen-titulo { font-weight: 700; color: #1a3a5c; margin-bottom: 6px; font-size: 13px; }
  .tag { display: inline-block; background: #dce8f8; color: #1a3a5c; border-radius: 12px; padding: 2px 10px; font-size: 12px; margin: 2px 3px 2px 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a3a5c; color: #fff; padding: 8px 10px; text-align: center; font-size: 12px; letter-spacing: 0.3px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e8e8e8; vertical-align: middle; text-align: center; }
  .hora     { font-weight: 700; color: #1a3a5c; white-space: nowrap; width: 60px; }
  .paciente { text-align: left; font-weight: 600; }
  .dni      { color: #666; font-size: 12px; width: 90px; }
  .estudio  { text-align: left; color: #333; }
  .obs      { text-align: left; color: #444; font-size: 12px; }
  .origen-tag { display: inline-block; padding: 2px 10px; border-radius: 12px; border: 1px solid; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .footer { margin-top: 18px; text-align: right; color: #aaa; font-size: 11px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background-color: #1a3a5c !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) td { background-color: #f9f9f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .origen-tag { border: 1px solid !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="lugar">HOSPITAL DONACIÓN FRANCISCO SANTOJANNI</div>
  <div class="servicio">SERVICIO DE RESONANCIA MAGNÉTICA NUCLEAR</div>
  <div class="fecha">${fechaBonita}</div>
</div>
<hr class="divider">
<div class="resumen">
  <div class="resumen-titulo">📋 ${turnos.length} paciente${turnos.length !== 1 ? "s" : ""} — ${totalEstudios} estudio${totalEstudios !== 1 ? "s" : ""}</div>
  ${resumenEstudios}
</div>
<table>
  <thead>
    <tr><th>HORA</th><th>PACIENTE</th><th>DNI</th><th>ESTUDIO</th><th>OBSERVACIONES</th><th>ORIGEN</th><th>ESTADO</th></tr>
  </thead>
  <tbody>${filasHTML}</tbody>
</table>
<div class="footer">Generado el ${Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'a las' HH:mm")} hs</div>
<div class="no-print" style="margin-top:20px;text-align:center">
  <button onclick="window.print()" style="background:#1a3a5c;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600">🖨️ Imprimir / Guardar PDF</button>
</div>
</body>
</html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(820).setHeight(620).setTitle("Parte diario — " + fechaStr),
    "Parte diario — " + fechaStr
  );
}

// ─────────────────────────────────────────────────────────────
//  FUNCIÓN: VER PRÓXIMO DÍA
//  Ahora pasa params directamente a generarAgendaC, sin escribir en Portada
// ─────────────────────────────────────────────────────────────

function verProximoDia() {
  const props = PropertiesService.getScriptProperties();
  const tz    = Session.getScriptTimeZone();

  const fechaActualStr = props.getProperty("p_fecha_agendac") || "";
  if (!fechaActualStr) { SpreadsheetApp.getUi().alert("No se pudo determinar la fecha actual de la agenda."); return; }

  const p             = fechaActualStr.split("/");
  const fechaActual   = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  fechaActual.setHours(12, 0, 0, 0);
  const fechaSiguiente = new Date(fechaActual);
  fechaSiguiente.setDate(fechaActual.getDate() + 1);
  const fechaSigStr = fechaAStr(fechaSiguiente, tz);

  // Leer datos del paciente de las propiedades y pasarlos directamente
  const params = {
    nombre:       props.getProperty("p_nombre")        || "",
    apellido:     props.getProperty("p_apellido")      || "",
    dni:          props.getProperty("p_dni")           || "",
    estudio:      props.getProperty("p_estudio")       || "",
    origen:       props.getProperty("p_origen")        || "",
    observaciones: props.getProperty("p_observaciones") || "",
    fecha:        fechaSiguiente
  };

  // Actualizar la fecha guardada en propiedades
  props.setProperty("p_fecha_agendac", fechaSigStr);
  props.setProperty("p_fecha", fechaSigStr);

  generarAgendaC(params);
}
// Chequea el cache en config y si cambió algo en config lo borra y lo crea de nuevo
function _invalidarCacheConfig() {
  _getCache().removeAll([_CACHE_KEY_CAL, _CACHE_KEY_EST]);
}

function setPins() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("PIN_JEFATURA", "1234"); // ← elegí el PIN que quieras
  props.setProperty("PIN_ADMIN",    "5678"); // ← elegí el PIN que quieras
}

function verPins() {
  const props = PropertiesService.getScriptProperties();
  console.log("JEFATURA:", props.getProperty("PIN_JEFATURA"));
  console.log("ADMIN:", props.getProperty("PIN_ADMIN"));
}