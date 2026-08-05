// ============================================================
//  RIS.gs — Gestión de turnos RIS (agenda externa, solo lectura)
//  Hoja: BD_RIS  (se crea automáticamente si no existe)
//  Columnas: A=Fecha | B=Hora | C=Documento | D=Apellido y Nombre | E=Práctica | F=Hash
// ============================================================

function _getHojaBDRIS() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let hoja   = ss.getSheetByName("BD_RIS");
  if (!hoja) {
    hoja = ss.insertSheet("BD_RIS");
    hoja.getRange(1, 1, 1, 9).setValues([[
      "FECHA", "HORA", "DOCUMENTO", "APELLIDO Y NOMBRE", "PRÁCTICA", "HASH", "COBERTURA", "ÁMBITO", "ESTADO DEL TURNO"
    ]]);
    hoja.getRange(1, 1, 1, 9)
      .setBackground("#1a3a5c").setFontColor("#ffffff")
      .setFontWeight("bold").setHorizontalAlignment("center");
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/** Hash simple para detectar duplicados: fecha+hora+documento concatenados. */
function _hashFila(fecha, hora, documento) {
  return `${fecha}|${hora}|${String(documento).trim().toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerRIS&fecha=dd/MM/yyyy
//  Devuelve todos los turnos RIS de una fecha dada.
// ─────────────────────────────────────────────────────────────
function _apiLeerRIS(p) {
  if (!p.fecha) throw new Error("Falta parámetro fecha");
  const tz     = Session.getScriptTimeZone();
  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();
  const configMap = cargarConfigEstudios();

  const grupos = {};
  for (const row of datos) {
    if (!row[0]) continue;
    const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
    if (fechaStr !== p.fecha) continue;

    const mins = parsearMinutos(row[1]);
    const doc  = str(row[2]).trim().toUpperCase();

    if (!grupos[doc]) {
      grupos[doc] = {
        fecha:           fechaStr,
        hora:            minutosAHora(mins),
        mins:            mins,
        documento:       str(row[2]),
        apellido_nombre: str(row[3]),
        practicas:       [],
        duracion:        0,
        cobertura:       str(row[6]),
        ambito:          str(row[7]),
        estado:          str(row[8])
      };
    }
    if (mins < grupos[doc].mins) {
      grupos[doc].mins = mins;
      grupos[doc].hora = minutosAHora(mins);
    }
    const prac = str(row[4]);
    if (!grupos[doc].practicas.includes(prac)) grupos[doc].practicas.push(prac);
  }

  // Calcular duración y practica final
  const DURACION_DEFAULT = 30;
  const result = [];
  for (const g of Object.values(grupos)) {
    let duracion = 0;
    for (const prac of g.practicas) {
      let dur = 0;
      for (const [nombre, cfg] of Object.entries(configMap)) {
        if (nombre === prac || nombre.toLowerCase().replace(/^resonancia magnética( de)?/i,"").trim() === prac.toLowerCase()) {
          dur = cfg.duracion; break;
        }
      }
      duracion += dur > 0 ? dur : DURACION_DEFAULT;
    }
    result.push({
      fecha:           g.fecha,
      hora:            g.hora,
      mins:            g.mins,
      documento:       g.documento,
      apellido_nombre: g.apellido_nombre,
      practica:        g.practicas.join(" · "),
      duracion:        duracion,
      cobertura:       g.cobertura || "",
      ambito:          g.ambito    || "",
      estado:          g.estado    || ""
    });
  }

  result.sort((a, b) => a.mins - b.mins);
  return result;
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerRISRango&desde=dd/MM/yyyy&dias=7
//  Devuelve RIS de un rango de fechas (para la grilla semanal/mensual).
// ─────────────────────────────────────────────────────────────
function _apiLeerRISRango(p) {
  if (!p.desde) throw new Error("Falta parámetro desde");
  const tz     = Session.getScriptTimeZone();
  const dias   = parseInt(p.dias || "7");
  const pt     = p.desde.split("/");
  const inicio = new Date(parseInt(pt[2]), parseInt(pt[1])-1, parseInt(pt[0]));
  inicio.setHours(0,0,0,0);

  // Construir set de fechas válidas
  const fechasSet = new Set();
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    fechasSet.add(fechaAStr(d, tz));
  }

  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();

  // Agrupar por fecha
  const porFecha = {};
  for (const row of datos) {
    if (!row[0]) continue;
    const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
    if (!fechasSet.has(fechaStr)) continue;
    if (!porFecha[fechaStr]) porFecha[fechaStr] = [];
    const mins = parsearMinutos(row[1]);
    porFecha[fechaStr].push({
      fecha:           fechaStr,
      hora:            minutosAHora(mins),
      mins:            mins,
      documento:       str(row[2]),
      apellido_nombre: str(row[3]),
      practica:        str(row[4]),
      cobertura:       str(row[6]),
      ambito:          str(row[7]),
      estado:          str(row[8])
    });
  }

  // Ordenar cada día y agrupar por documento
  for (const f of Object.keys(porFecha)) {
    porFecha[f].sort((a,b) => a.mins - b.mins);

    // Agrupar entradas del mismo paciente (mismo documento) en el día
    const agrupado = {};
    for (const entry of porFecha[f]) {
      const doc = str(entry.documento).replace(/^(DNI|CIBO|RP)\s*/i,"").trim().replace(/^0+/,"");
      if (!doc) { 
        // Sin documento → no agrupar, agregar con clave única
        const k = entry.apellido_nombre + "|" + entry.mins;
        agrupado[k] = entry;
        continue;
      }
      if (!agrupado[doc]) {
        // Primera aparición → registrar
        agrupado[doc] = {
          fecha:           entry.fecha,
          hora:            entry.hora,
          mins:            entry.mins,
          documento:       entry.documento,
          apellido_nombre: entry.apellido_nombre,
          practica:        entry.practica,
          cobertura:       entry.cobertura || "",
          ambito:          entry.ambito    || "",
          estado:          entry.estado    || "",
          minsFin:         entry.mins
        };
      } else {
        // Aparición posterior → agregar práctica si es distinta y actualizar fin
        const practicas = agrupado[doc].practica.split(" · ");
        if (!practicas.includes(entry.practica)) {
          agrupado[doc].practica += " · " + entry.practica;
        }
        if (entry.mins > agrupado[doc].minsFin) {
          agrupado[doc].minsFin = entry.mins;
        }
      }
    }


const configMap = cargarConfigEstudios();
const DURACION_DEFAULT = 20;

function _duracionPorPracticas(practicaStr) {
  const practicas = practicaStr.split(" · ").map(p => p.trim()).filter(p => p);
  let total = 0;
  for (const prac of practicas) {
    let dur = 0;
    for (const [nombre, cfg] of Object.entries(configMap)) {
      if (nombre === prac ||
          nombre.toLowerCase().replace(/^resonancia magnética( de)?/i,"").trim() === prac.toLowerCase()) {
        dur = cfg.duracion; break;
      }
    }
    total += dur > 0 ? dur : DURACION_DEFAULT;
  }
  return total > 0 ? total : DURACION_DEFAULT;
}

const resultado = Object.values(agrupado).map(e => {
  const duracion = _duracionPorPracticas(e.practica);
  return {
    fecha:           e.fecha,
    hora:            e.hora,
    mins:            e.mins,
    duracion:        duracion,
    documento:       e.documento,
    apellido_nombre: e.apellido_nombre,
    practica:        e.practica,
    cobertura:       e.cobertura || "",
    ambito:          e.ambito    || "",
    estado:          e.estado    || ""
  };
});

    resultado.sort((a,b) => a.mins - b.mins);
    porFecha[f] = resultado;
  }

  return porFecha;
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=verificarRIS&fecha=dd/MM/yyyy
//  Devuelve los hashes existentes para una fecha (para dedup en cliente).
// ─────────────────────────────────────────────────────────────
function _apiVerificarRIS(p) {
  if (!p.fecha) throw new Error("Falta parámetro fecha");
  const tz     = Session.getScriptTimeZone();
  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();
  const hashes = [];
  for (const row of datos) {
    if (!row[0]) continue;
    const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
    if (fechaStr !== p.fecha) continue;
    hashes.push(str(row[5]));
  }
  return { fecha: p.fecha, hashes, total: hashes.length };
}

// ─────────────────────────────────────────────────────────────
//  POST { action:"escribirRIS", fecha, filas:[...] }
//  Escribe filas nuevas (solo las que no existen por hash).
//  Devuelve cuántas se agregaron y cuántas se descartaron.
// ─────────────────────────────────────────────────────────────
function _apiEscribirRIS(body) {
  const { fecha, filas } = body;
  if (!fecha || !filas || !Array.isArray(filas))
    throw new Error("Faltan campos: fecha y filas[]");

  const tz   = Session.getScriptTimeZone();
  const hoja = _getHojaBDRIS();

  // Leer hashes existentes para esta fecha
  const ultima  = Math.max(hoja.getLastRow(), 2);
  const datos   = hoja.getRange(2, 1, ultima - 1, 9).getValues();
  const existentes = new Set();
  for (const row of datos) {
    if (!row[0]) continue;
    const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
    if (fechaStr === fecha && row[5]) existentes.add(str(row[5]));
  }

  // Parsear fecha para guardar como Date en la hoja
  const pt        = fecha.split("/");
  const fechaDate = new Date(parseInt(pt[2]), parseInt(pt[1])-1, parseInt(pt[0]));
  fechaDate.setHours(12,0,0,0);

  let agregadas = 0, descartadas = 0;
  const nuevasFilas = [];

  for (const f of filas) {
    const hash = _hashFila(fecha, f.hora || "", f.documento || "");
    if (existentes.has(hash)) { descartadas++; continue; }
    nuevasFilas.push([
      fechaDate,
      f.hora            || "",
      f.documento       || "",
      f.apellido_nombre || "",
      f.practica        || "",
      hash,
      f.cobertura       || "",
      f.ambito          || "",
      f.estado          || ""
    ]);
    agregadas++;
  }

  if (nuevasFilas.length > 0) {
    const filaDest = hoja.getLastRow() + 1;
    hoja.getRange(filaDest, 1, nuevasFilas.length, 9).setValues(nuevasFilas);
    hoja.getRange(filaDest, 1, nuevasFilas.length, 1)
      .setNumberFormat("dd/MM/yyyy");
  }

  // Ordenar hoja después de escribir
  if (agregadas > 0) _ordenarBDRIS(hoja);

  return {
    agregadas,
    descartadas,
    mensaje: agregadas === 0
      ? "Sin cambios — todos los registros ya existían"
      : `${agregadas} registros nuevos agregados, ${descartadas} ya existían`
  };
}

// ─────────────────────────────────────────────────────────────
//  Ordena BD_RIS por Fecha (col A) luego por Hora (col B)
// ─────────────────────────────────────────────────────────────
function _ordenarBDRIS(hoja) {
  hoja = hoja || _getHojaBDRIS();
  const ultima = hoja.getLastRow();
  if (ultima < 3) return; // nada que ordenar
  const rango = hoja.getRange(2, 1, ultima - 1, 9);
  rango.sort([
    { column: 1, ascending: true }, // Fecha
    { column: 2, ascending: true }  // Hora
  ]);
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=ordenarRIS
//  Ordena manualmente toda la BD_RIS por fecha y hora.
// ─────────────────────────────────────────────────────────────
function _apiOrdenarRIS() {
  const hoja   = _getHojaBDRIS();
  const ultima = hoja.getLastRow();
  if (ultima < 3) return { mensaje: "BD_RIS vacía o con un solo registro" };
  _ordenarBDRIS(hoja);
  return { mensaje: `BD_RIS ordenada correctamente (${ultima - 1} registros)` };
}


// ─────────────────────────────────────────────────────────────
//  GET ?action=normalizarRIS
//  Acorta las prácticas existentes en BD_RIS quitando el prefijo
//  "RESONANCIA MAGNETICA DE", "ANGIORRESONANCIA DE", etc.
//  Devuelve cuántas filas se actualizaron.
// ─────────────────────────────────────────────────────────────
function _apiNormalizarRIS() {
  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  if (ultima < 2) return { actualizadas: 0, mensaje: "BD_RIS vacía" };

  const datos = hoja.getRange(2, 5, ultima - 1, 1).getValues(); // columna E = PRÁCTICA
  const PREFIJOS = [
    "RESONANCIA MAGNETICA FUNCIONAL DE ",
    "RESONANCIA MAGNETICA DE ",
    "RESONANCIA MAGNETICA ",
    "ANGIORRESONANCIA DE ",
    "ANGIORRESONANCIA ",
    "COLANGIORRESONANCIA DE ",
    "COLANGIORRESONANCIA ",
    "COLANGIO RESONANCIA DE ",
    "COLANGIO-RESONANCIA DE ",
  ];

  function acortar(practica) {
    if (!practica) return practica;
    const partes = practica.split(" - ");
    const acortadas = partes.map(p => {
      let s = p.trim().toUpperCase();
      for (const pref of PREFIJOS) {
        if (s.startsWith(pref)) { s = s.slice(pref.length); break; }
      }
      // Capitalizar primera letra
      return s.charAt(0) + s.slice(1).toLowerCase();
    });
    return acortadas.join(" · ");
  }

  let actualizadas = 0;
  for (let i = 0; i < datos.length; i++) {
    const original = str(datos[i][0]);
    if (!original) continue;
    const nueva = acortar(original);
    if (nueva !== original) {
      hoja.getRange(i + 2, 5).setValue(nueva);
      actualizadas++;
    }
  }

  return {
    actualizadas,
    mensaje: actualizadas === 0
      ? "Sin cambios — las prácticas ya estaban normalizadas"
      : `${actualizadas} prácticas actualizadas correctamente`
  };
}


// ─────────────────────────────────────────────────────────────
//  GET ?action=consolidarRIS
//  Agrupa filas de BD_RIS por fecha+documento, consolida prácticas
//  en la fila más temprana y elimina las duplicadas.
// ─────────────────────────────────────────────────────────────
function _apiConsolidarRIS() {
  const tz   = Session.getScriptTimeZone();
  const hoja = _getHojaBDRIS();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return { consolidadas: 0, eliminadas: 0, mensaje: "BD_RIS vacía" };

  const datos = hoja.getRange(2, 1, ultima - 1, 9).getValues();

  // Agrupar por fecha + documento
  const grupos = {};   // clave → { filaIdx (0-based en datos), mins, practicas[] }
  const filasDuplicadas = []; // índices (0-based) a eliminar

  for (let i = 0; i < datos.length; i++) {
    const row = datos[i];
    if (!row[0]) continue;
    const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
    const doc      = str(row[2]).trim().toUpperCase();
    const mins     = parsearMinutos(row[1]);
    const prac     = str(row[4]);
    const clave    = fechaStr + "|" + doc;

    if (!grupos[clave]) {
      grupos[clave] = { filaIdx: i, mins: mins, practicas: [prac] };
    } else {
      // Actualizar horario más temprano
      if (mins < grupos[clave].mins) {
        grupos[clave].mins    = mins;
        grupos[clave].filaIdx = i;
      }
      // Agregar práctica si no está
      if (!grupos[clave].practicas.includes(prac)) {
        grupos[clave].practicas.push(prac);
      }
      // Esta fila es duplicada — marcar para eliminar
      filasDuplicadas.push(i);
    }
  }

  // Actualizar filas maestras con práctica consolidada y hora correcta
  let consolidadas = 0;
  for (const g of Object.values(grupos)) {
    if (g.practicas.length > 1) {
      const filaSheet = g.filaIdx + 2; // +2 porque datos empieza en fila 2
      const horaStr   = minutosAHora(g.mins);
      const pracStr   = g.practicas.join(" · ");
      hoja.getRange(filaSheet, 2).setValue(horaStr); // hora
      hoja.getRange(filaSheet, 5).setValue(pracStr); // práctica
      consolidadas++;
    }
  }

  // Eliminar filas duplicadas de abajo hacia arriba (para no desplazar índices)
  const idxOrdenados = [...new Set(filasDuplicadas)].sort((a,b) => b - a);
  for (const idx of idxOrdenados) {
    hoja.deleteRow(idx + 2);
  }

  return {
    consolidadas,
    eliminadas: idxOrdenados.length,
    mensaje: `${consolidadas} pacientes consolidados, ${idxOrdenados.length} filas duplicadas eliminadas`
  };
}


// ─────────────────────────────────────────────────────────────
//  GET ?action=actualizarEstadosRIS&fecha=dd/MM/yyyy&items=[...]
//  Actualiza la columna ESTADO (col I) de registros existentes.
// ─────────────────────────────────────────────────────────────
function _apiActualizarEstadosRIS(p) {
  if (!p.fecha || !p.items) throw new Error("Faltan campos: fecha e items");
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;
  const tz     = Session.getScriptTimeZone();
  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();

// Construir set de DNIs presentes en el Excel
  const dnisEnExcel = new Set(
    items.map(item => str(item.documento).replace(/^(DNI|CIBO|RP)\s*/i,"").trim().toUpperCase())
  );

  let actualizadas = 0;
  for (let i = 0; i < datos.length; i++) {
    const row = datos[i];
    if (!row[0]) continue;
    const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
    if (fechaStr !== p.fecha) continue;
    const dniFila = str(row[2]).replace(/^(DNI|CIBO|RP)\s*/i,"").trim().toUpperCase();
    if (!dniFila) continue;

    // Si el DNI no está en el Excel → ignorar, no tocar
    if (!dnisEnExcel.has(dniFila)) continue;

    // Si está en el Excel → actualizar con el estado que trae
    const item = items.find(it =>
      str(it.documento).replace(/^(DNI|CIBO|RP)\s*/i,"").trim().toUpperCase() === dniFila
    );
    if (item) {
      hoja.getRange(i + 2, 9).setValue(item.estado);
      actualizadas++;
    }
  }

  return {
    actualizadas,
    mensaje: `${actualizadas} estados actualizados`
  };
}  

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerConfig&seccion=estudios|feriados|bloqueos|franjas|restricciones
//  Lee secciones del sheet Config y las devuelve como JSON
// ─────────────────────────────────────────────────────────────
function _apiLeerConfig(p) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("Config");
  const tz     = Session.getScriptTimeZone();
  const sec    = (p.seccion || "all").toLowerCase();
  const result = {};

  // ── Estudios (A2:D)
  if (sec === "all" || sec === "estudios") {
    const data = config.getRange("A2:D500").getValues();
    result.estudios = [];
    for (const row of data) {
      if (!str(row[0])) continue;
      result.estudios.push({
        nombre:      str(row[0]),
        estadistica: str(row[1]),
        restriccion: str(row[2]),
        duracion:    Number(row[3]) || 0
      });
    }
  }

  // ── Feriados (F2:G)
  if (sec === "all" || sec === "feriados") {
    const data = config.getRange("F2:G500").getValues();
    result.feriados = [];
    for (const row of data) {
      if (!row[0]) continue;
      const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
      if (!fechaStr) continue;
      result.feriados.push({ fecha: fechaStr, concepto: str(row[1]) || "Feriado" });
    }
    result.feriados.sort((a,b) => {
      const pa = a.fecha.split("/"), pb = b.fecha.split("/");
      return new Date(pa[2],pa[1]-1,pa[0]) - new Date(pb[2],pb[1]-1,pb[0]);
    });
  }

  // ── Bloqueos puntuales (J3:M)
  if (sec === "all" || sec === "bloqueos") {
    const data = config.getRange("J3:M500").getValues();
    result.bloqueos = [];
    for (const row of data) {
      if (!row[0]) continue;
      const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
      if (!fechaStr) continue;
      result.bloqueos.push({
        fecha:    fechaStr,
        horaD:    minutosAHora(parsearMinutos(row[1])),
        horaH:    minutosAHora(parsearMinutos(row[2])),
        concepto: str(row[3]) || "Bloqueado"
      });
    }
  }

  // ── Franjas recurrentes (O3:W)
  if (sec === "all" || sec === "franjas") {
    const data = config.getRange("O3:W500").getValues();
    result.franjas = [];
    for (const row of data) {
      if (!str(row[0])) continue;
      result.franjas.push({
        dia1:     str(row[0]),
        func1:    str(row[1]),
        dia2:     str(row[2]),
        func2:    str(row[3]),
        dia3:     str(row[4]),
        horaD:    minutosAHora(parsearMinutos(row[5])),
        horaH:    minutosAHora(parsearMinutos(row[6])),
        concepto: str(row[7]) || "Bloqueado",
        color:    str(row[8]) || "#e06666"
      });
    }
  }

  // ── Restricciones por código (AH3:AQ16)
  if (sec === "all" || sec === "restricciones") {
    const data = config.getRange("AH3:AQ16").getValues();
    result.restricciones = [];
    for (const row of data) {
      if (!str(row[0])) continue;
      result.restricciones.push({
        codigo:   str(row[0]),
        dia1:     str(row[1]),
        func1:    str(row[2]),
        dia2:     str(row[3]),
        func2:    str(row[4]),
        dia3:     str(row[5]),
        horaD:    minutosAHora(parsearMinutos(row[6])),
        horaH:    minutosAHora(parsearMinutos(row[7])),
        leyenda:  str(row[8]),
        color:    str(row[9]) || "#e06666"
      });
    }
    // Restricciones por origen (AH19:AQ)
    const data2 = config.getRange("AH19:AQ500").getValues();
    result.restriccionesOrigen = [];
    for (const row of data2) {
      if (!str(row[0])) continue;
      result.restriccionesOrigen.push({
        origen:  str(row[0]),
        dia1:    str(row[1]),
        func1:   str(row[2]),
        dia2:    str(row[3]),
        func2:   str(row[4]),
        dia3:    str(row[5]),
        horaD:   minutosAHora(parsearMinutos(row[6])),
        horaH:   minutosAHora(parsearMinutos(row[7])),
        leyenda: str(row[8]),
        color:   str(row[9]) || "#e06666"
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=escribirConfig&seccion=X&datos=[...]
//  Escribe una sección completa del sheet Config
// ─────────────────────────────────────────────────────────────
function _apiEscribirConfig(p) {
  if (!p.seccion || !p.datos) throw new Error("Faltan seccion y datos");
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("Config");
  const datos  = JSON.parse(p.datos);
  const tz     = Session.getScriptTimeZone();

  switch(p.seccion) {
    case "estudios": {
      const rango = config.getRange("A2:D" + (datos.length + 1));
      const vals  = datos.map(e => [e.nombre, e.estadistica, e.restriccion, e.duracion]);
      rango.setValues(vals);
      // Limpiar filas extra
      const ultimaUsada = datos.length + 1;
      const ultimaHoja  = config.getLastRow();
      if (ultimaHoja > ultimaUsada) config.getRange("A" + (ultimaUsada+1) + ":D" + ultimaHoja).clearContent();
      break;
    }
    case "feriados": {
      const rango = config.getRange("F2:G" + (datos.length + 1));
      const vals  = datos.map(f => {
        const p2 = f.fecha.split("/");
        return [new Date(parseInt(p2[2]), parseInt(p2[1])-1, parseInt(p2[0])), f.concepto];
      });
      rango.setValues(vals);
      rango.getRange = undefined; // evitar error
      config.getRange("F2:G" + (datos.length+1)).setNumberFormat("dd/MM/yyyy");
      const ult = config.getLastRow();
      if (ult > datos.length + 1) config.getRange("F" + (datos.length+2) + ":G" + ult).clearContent();
      break;
    }
    case "bloqueos": {
      const rango = config.getRange("J3:M" + (datos.length + 2));
      const vals  = datos.map(b => {
        const p2 = b.fecha.split("/");
        return [new Date(parseInt(p2[2]), parseInt(p2[1])-1, parseInt(p2[0])), b.horaD, b.horaH, b.concepto];
      });
      rango.setValues(vals);
      const ult = config.getLastRow();
      if (ult > datos.length + 2) config.getRange("J" + (datos.length+3) + ":M" + ult).clearContent();
      break;
    }
    default: throw new Error("Sección no soportada: " + p.seccion);
  }

  // Invalidar cache
  _apiConsolidarRIS; // forzar referencia
  CacheService.getScriptCache().removeAll(["cfg_calendario_v1","cfg_estudios_v1"]);
  return { mensaje: "Sección " + p.seccion + " guardada correctamente" };
}

function _apiLeerLog(p) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const hoja  = ss.getSheetByName("Log_Bot");
  if (!hoja) return { filas: [] };
  const limite = parseInt(p.limite || "20");
  const ultima = Math.max(hoja.getLastRow(), 2);
  const desde  = Math.max(2, ultima - limite + 1);
  const datos  = hoja.getRange(desde, 1, ultima - desde + 1, 5).getValues();
  const filas  = datos
    .filter(r => r[0])
    .reverse()
    .map(r => ({
      fecha:   String(r[0]).trim(),
      hora:    String(r[1]).trim(),
      status:  String(r[2]).trim(),
      filas:   Number(r[4]) || 0,
      mensaje: String(r[3]).trim()
    }));
  return { filas };
}

function _apiActualizarPracticasRIS(p) {
  if (!p.fecha || !p.items) throw new Error("Faltan campos: fecha e items");
  const items = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;
  const tz     = Session.getScriptTimeZone();
  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();

  let actualizadas = 0;
  for (const item of items) {
    const dniBuscado = str(item.documento).replace(/^(DNI|CIBO|RP)\s*/i,"").trim().toUpperCase();
    for (let i = 0; i < datos.length; i++) {
      const row = datos[i];
      if (!row[0]) continue;
      const fechaStr = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
      if (fechaStr !== p.fecha) continue;
      const dniFila = str(row[2]).replace(/^(DNI|CIBO|RP)\s*/i,"").trim().toUpperCase();
      if (dniFila === dniBuscado) {
        const practicaActual = str(row[4]).trim();
        const practicaNueva  = str(item.practica).trim();
        if (practicaNueva && practicaNueva !== practicaActual) {
          hoja.getRange(i + 2, 5).setValue(practicaNueva); // columna E = práctica
          actualizadas++;
        }
        break;
      }
    }
  }
  return {
    actualizadas,
    mensaje: `${actualizadas} prácticas actualizadas de ${items.length} buscados`
  };
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=listarFilasCrudasRIS&desde=dd/MM/yyyy&hasta=dd/MM/yyyy
//  Devuelve TODAS las filas de BD_RIS en el rango, SIN agrupar por
//  documento (a diferencia de leerRIS) — incluye el número de fila real
//  de la hoja, necesario para poder borrar duplicados físicos puntuales.
// ─────────────────────────────────────────────────────────────
function _apiListarFilasCrudasRIS(p) {
  if (!p.desde || !p.hasta) throw new Error("Faltan parámetros desde/hasta");
  const tz     = Session.getScriptTimeZone();
  const hoja   = _getHojaBDRIS();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();

  const [ddD, mmD, aaaaD] = p.desde.split("/").map(Number);
  const [ddH, mmH, aaaaH] = p.hasta.split("/").map(Number);
  const desde = new Date(aaaaD, mmD - 1, ddD, 0, 0, 0);
  const hasta = new Date(aaaaH, mmH - 1, ddH, 23, 59, 59);

  const filas = [];
  for (let i = 0; i < datos.length; i++) {
    const row = datos[i];
    if (!row[0]) continue;
    const fechaObj = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (fechaObj < desde || fechaObj > hasta) continue;

    filas.push({
      fila:            i + 2,   // número real de fila en la hoja (encabezado en fila 1)
      fecha:           fechaAStr(fechaObj, tz),
      hora:            str(row[1]),
      documento:       str(row[2]),
      apellido_nombre: str(row[3]),
      practica:        str(row[4]),
      hash:            str(row[5]),
      cobertura:       str(row[6]),
      ambito:          str(row[7]),
      estado:          str(row[8])
    });
  }
  return filas;
}

// ─────────────────────────────────────────────────────────────
//  POST { action: "eliminarFilaRIS", fila, fecha, hora, documento }
//  Borra una fila puntual de BD_RIS, identificada por número de fila.
//  Antes de borrar, vuelve a leer esa fila y confirma que fecha/hora/
//  documento siguen coincidiendo con lo esperado — si la hoja cambió
//  entre la lectura del bot y este borrado, NO borra nada.
// ─────────────────────────────────────────────────────────────
function _apiEliminarFilaRIS(p) {
  if (!p.fila || !p.fecha || !p.hora || !p.documento) {
    throw new Error("Faltan parámetros (fila, fecha, hora, documento)");
  }
  const tz   = Session.getScriptTimeZone();
  const hoja = _getHojaBDRIS();
  const fila = Number(p.fila);

  if (fila < 2 || fila > hoja.getLastRow()) {
    return { eliminada: false, motivo: "Número de fila fuera de rango (¿ya se borró antes?)" };
  }

  const row = hoja.getRange(fila, 1, 1, 9).getValues()[0];
  const fechaActual = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
  // HORA se guarda como celda de hora (Date interno de Sheets) — str()
  // sobre un Date da el string completo ("Thu Dec 31 1899 18:40:00
  // GMT-0300..."), nunca "18:40", así que la comparación de abajo
  // siempre fallaba. Mismo patrón que ya usan _apiLeerRIS/_apiLeerRISRango
  // para leer esta misma columna.
  const horaActual  = row[1] instanceof Date ? minutosAHora(parsearMinutos(row[1])) : str(row[1]);
  const docActual   = str(row[2]);

  if (fechaActual !== p.fecha || horaActual !== p.hora || docActual !== p.documento) {
    return { eliminada: false, motivo: "La fila cambió desde que se leyó — no se borra por seguridad" };
  }

  hoja.deleteRow(fila);
  return { eliminada: true };
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerCardiacas&fecha=dd/MM/yyyy
//  Lee la planilla de cardíacas (spreadsheet APARTE de BD_RIS) y devuelve
//  las filas de una fecha, crudas — sin parsear edad/peso/talla, eso lo
//  hace sistema2-node al recibirlas (ver CARDIACAS_BOT_INTEGRATION.md).
//
//  Columnas de la planilla, en este orden:
//  Fecha | Hora | DNI | Apellido, Nombre | Edad | Teléfono | Diagnóstico |
//  Peso | Talla | (vacía) | Estado | Observaciones
// ─────────────────────────────────────────────────────────────
var BD_CARD_SS_ID = "15HBStrd51hmS9w_4gQ-uWORKFNsSm1jWcSo_HbzqrCs";
var BD_CARD_GID    = 531999607;

function _getHojaCardiacas() {
  var ss     = SpreadsheetApp.openById(BD_CARD_SS_ID);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === BD_CARD_GID) return sheets[i];
  }
  return sheets[0]; // fallback si cambió el gid
}

function _apiLeerCardiacas(p) {
  if (!p.fecha) throw new Error("Falta parámetro fecha");
  var tz   = Session.getScriptTimeZone();
  var hoja = _getHojaCardiacas();
  var data = hoja.getDataRange().getValues();

  var resultado = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var fechaObj = row[0] instanceof Date ? row[0] : new Date(row[0]);
    var fechaStr = fechaAStr(fechaObj, tz);
    if (fechaStr !== p.fecha) continue;

    resultado.push({
      fila:          i + 1,   // número real de fila (encabezado en fila 1)
      fecha:         fechaStr,
      hora:          str(row[1]),
      documento:     str(row[2]),
      nombre:        str(row[3]),
      edad:          str(row[4]),
      telefono:      str(row[5]),
      diagnostico:   str(row[6]),
      peso:          str(row[7]),
      talla:         str(row[8]),
      estado:        str(row[10]),
      observaciones: str(row[11])
    });
  }
  return resultado;
}

// ─────────────────────────────────────────────────────────────
//  POST { action: "eliminarFilaCardiacas", fila, fecha, documento }
//  Borra una fila puntual de la planilla de cardíacas, identificada por
//  número de fila. Antes de borrar, vuelve a leer esa fila y confirma que
//  fecha/documento siguen coincidiendo con lo esperado — si la planilla
//  cambió entre la lectura y este borrado, NO borra nada.
//  Mismo patrón que _apiEliminarFilaRIS.
// ─────────────────────────────────────────────────────────────
function _apiEliminarFilaCardiacas(p) {
  if (!p.fila || !p.fecha || !p.documento) {
    throw new Error("Faltan parámetros (fila, fecha, documento)");
  }
  const tz   = Session.getScriptTimeZone();
  const hoja = _getHojaCardiacas();
  const fila = Number(p.fila);

  if (fila < 2 || fila > hoja.getLastRow()) {
    return { eliminada: false, motivo: "Número de fila fuera de rango (¿ya se borró antes?)" };
  }

  const row = hoja.getRange(fila, 1, 1, 3).getValues()[0];
  const fechaActual = row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]);
  const docActual   = str(row[2]);

  if (fechaActual !== p.fecha || docActual !== p.documento) {
    return { eliminada: false, motivo: "La fila cambió desde que se leyó — no se borra por seguridad" };
  }

  hoja.deleteRow(fila);
  return { eliminada: true };
}

// ============================================================
//  Validaciones Agenda — pestaña nueva en el mismo Sheet BD_RIS.
//  Vuelca los problemas que detecta reglas.js (resonancia-bot): horarios
//  reservados, restricciones de contraste fuera de franja, etc. Solo
//  registro/consulta — no interactúa con BD_RIS ni con la app del RIS.
//  Columnas: A=Fecha | B=Hora | C=Documento | D=Paciente | E=Práctica |
//            F=Regla | G=Motivo | H=Origen | I=Hash
// ============================================================
function _getHojaValidacionesAgenda() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let hoja   = ss.getSheetByName("Validaciones Agenda");
  if (!hoja) {
    hoja = ss.insertSheet("Validaciones Agenda");
    hoja.getRange(1, 1, 1, 9).setValues([[
      "FECHA", "HORA", "DOCUMENTO", "PACIENTE", "PRÁCTICA", "REGLA", "MOTIVO", "ORIGEN", "HASH"
    ]]);
    hoja.getRange(1, 1, 1, 9)
      .setBackground("#7a1f1f").setFontColor("#ffffff")
      .setFontWeight("bold").setHorizontalAlignment("center");
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function _hashValidacionAgenda(fecha, hora, documento, regla) {
  return `${fecha}|${hora}|${String(documento).trim().toUpperCase()}|${regla}`;
}

// ─────────────────────────────────────────────────────────────
//  POST { action:"registrarValidacionesAgenda", origen, items:[...] }
//  items: [{ fecha, hora, documento, paciente, practica, regla, motivo }]
//  Dedup por fecha+hora+documento+regla — mismo criterio que
//  _apiEscribirRIS: si ya está registrada, no la duplica.
// ─────────────────────────────────────────────────────────────
function _apiRegistrarValidacionesAgenda(body) {
  const { origen, items } = body;
  if (!items || !Array.isArray(items))
    throw new Error("Faltan campos: items[]");

  const hoja   = _getHojaValidacionesAgenda();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();

  const existentes = new Set();
  for (const row of datos) {
    if (row[8]) existentes.add(str(row[8]));
  }

  let agregadas = 0, descartadas = 0;
  const nuevasFilas = [];

  for (const it of items) {
    const hash = _hashValidacionAgenda(it.fecha, it.hora || "", it.documento || "", it.regla || "");
    if (existentes.has(hash)) { descartadas++; continue; }
    nuevasFilas.push([
      it.fecha     || "",
      it.hora      || "",
      it.documento || "",
      it.paciente  || "",
      it.practica  || "",
      it.regla     || "",
      it.motivo    || "",
      origen       || "",
      hash
    ]);
    existentes.add(hash);
    agregadas++;
  }

  if (nuevasFilas.length > 0) {
    const filaDest = hoja.getLastRow() + 1;
    hoja.getRange(filaDest, 1, nuevasFilas.length, 9).setValues(nuevasFilas);
  }

  return {
    agregadas,
    descartadas,
    mensaje: agregadas === 0
      ? "Sin cambios — todas las validaciones ya estaban registradas"
      : `${agregadas} validaciones nuevas registradas, ${descartadas} ya existían`
  };
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerValidacionesAgenda
//  Devuelve todas las filas de la pestaña "Validaciones Agenda", más
//  nuevas primero. Pensada para que un HTML de solo lectura la consuma
//  directo (fetch con action=leerValidacionesAgenda) sin pasar por el bot.
// ─────────────────────────────────────────────────────────────
function _apiLeerValidacionesAgenda() {
  const tz     = Session.getScriptTimeZone();
  const hoja   = _getHojaValidacionesAgenda();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 9).getValues();

  const filas = [];
  for (const row of datos) {
    if (!row[0]) continue;
    // Sheets autoconvierte texto con pinta de fecha/hora a un Date real al
    // escribirlo (aunque _apiRegistrarValidacionesAgenda mande un string
    // plano) — mismo gotcha ya documentado en _apiEliminarFilaRIS.
    filas.push({
      fecha:     row[0] instanceof Date ? fechaAStr(row[0], tz) : str(row[0]),
      hora:      row[1] instanceof Date ? minutosAHora(parsearMinutos(row[1])) : str(row[1]),
      documento: str(row[2]),
      paciente:  str(row[3]),
      practica:  str(row[4]),
      regla:     str(row[5]),
      motivo:    str(row[6]),
      origen:    str(row[7])
    });
  }
  filas.reverse();
  return filas;
}

// ============================================================
//  Reglas Agenda — pestaña nueva en el mismo Sheet BD_RIS.
//  Reglas operativas fijas que valida reglas.js (resonancia-bot): antes
//  hardcodeadas en el bot, ahora editables desde acá (modal en la PWA).
//  Una fila por ventana horaria, agrupadas por ID compartido — evita
//  serializar JSON anidado en una celda, y queda legible a simple vista.
//  Columnas: A=ID | B=Nombre | C=Tipo | D=Modo | E=PalabraClave | F=Motivo |
//            G=Activa | H=Dias (separados por ";") | I=HoraDesde | J=HoraHasta
// ============================================================
function _getHojaReglasAgenda() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let hoja   = ss.getSheetByName("Reglas Agenda");
  if (!hoja) {
    hoja = ss.insertSheet("Reglas Agenda");
    hoja.getRange(1, 1, 1, 10).setValues([[
      "ID", "NOMBRE", "TIPO", "MODO", "PALABRA_CLAVE", "MOTIVO", "ACTIVA", "DIAS", "HORA_DESDE", "HORA_HASTA"
    ]]);
    hoja.getRange(1, 1, 1, 10)
      .setBackground("#4a2c1f").setFontColor("#ffffff")
      .setFontWeight("bold").setHorizontalAlignment("center");
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function _slugRegla(nombre) {
  return String(nombre || "regla")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "regla";
}

// HORA_DESDE/HORA_HASTA se guardan como texto ("08:00") pero Sheets las
// autoconvierte a Date al escribirlas — mismo gotcha ya documentado en
// _apiEliminarFilaRIS/_apiLeerValidacionesAgenda.
function _horaDeCelda(val) {
  return val instanceof Date ? minutosAHora(parsearMinutos(val)) : str(val);
}

function _leerFilasReglasAgenda() {
  const hoja   = _getHojaReglasAgenda();
  const ultima = Math.max(hoja.getLastRow(), 2);
  const datos  = hoja.getRange(2, 1, ultima - 1, 10).getValues();
  return { hoja, datos };
}

function _agruparReglas(datos) {
  const porId = {};
  for (const row of datos) {
    if (!row[0]) continue;
    const id = str(row[0]);
    if (!porId[id]) {
      porId[id] = {
        id,
        nombre:       str(row[1]),
        tipo:         str(row[2]) || "ventana_horaria",
        modo:         str(row[3]),
        palabraClave: str(row[4]),
        motivo:       str(row[5]),
        activa:       str(row[6]).toUpperCase() !== "FALSE",
        ventanas:     []
      };
    }
    porId[id].ventanas.push({
      // separador ";" a propósito — con "," el locale es-AR de Sheets
      // puede autoconvertir algo como "1,2" al número decimal 1.2
      dias:      String(row[7] || "").split(";").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
      horaDesde: _horaDeCelda(row[8]),
      horaHasta: _horaDeCelda(row[9])
    });
  }
  return Object.values(porId);
}

// ─────────────────────────────────────────────────────────────
//  GET ?action=leerReglasAgenda
//  Devuelve todas las reglas configuradas, agrupadas con sus ventanas.
// ─────────────────────────────────────────────────────────────
function _apiLeerReglasAgenda() {
  const { datos } = _leerFilasReglasAgenda();
  return _agruparReglas(datos);
}

// ─────────────────────────────────────────────────────────────
//  POST { action:"guardarReglaAgenda", regla }
//  regla: { id?, nombre, tipo, modo, palabraClave, motivo, activa,
//           ventanas:[{dias:[...], horaDesde, horaHasta}] }
//  Upsert: si id no viene, se genera del nombre (sufijo si ya existe).
//  Reescribe TODA la pestaña con un solo setValues (no fila por fila) —
//  minimiza la ventana de inconsistencia si algo falla a mitad de camino;
//  el volumen de filas acá es chico (reglas, no turnos), no hay problema
//  de performance.
// ─────────────────────────────────────────────────────────────
function _apiGuardarReglaAgenda(body) {
  const regla = typeof body.regla === 'string' ? JSON.parse(body.regla) : body.regla;
  if (!regla || !regla.nombre || !regla.modo || !Array.isArray(regla.ventanas) || regla.ventanas.length === 0) {
    throw new Error("Faltan campos: nombre, modo, ventanas[]");
  }
  for (const v of regla.ventanas) {
    if (!v.horaDesde || !v.horaHasta || v.horaHasta <= v.horaDesde) {
      throw new Error(`Ventana inválida (${v.horaDesde}-${v.horaHasta}): horaHasta debe ser mayor a horaDesde — si cruza medianoche, cargá dos ventanas separadas`);
    }
  }

  const { hoja, datos } = _leerFilasReglasAgenda();
  const idsExistentes = new Set(datos.map(r => str(r[0])).filter(Boolean));

  let id = regla.id;
  if (!id) {
    const base = _slugRegla(regla.nombre);
    id = base;
    let n = 2;
    while (idsExistentes.has(id)) { id = `${base}_${n}`; n++; }
  }

  const filasOtras = datos.filter(r => str(r[0]) !== id);
  const filasNuevas = regla.ventanas.map(v => [
    id,
    regla.nombre,
    regla.tipo || "ventana_horaria",
    regla.modo,
    regla.palabraClave || "",
    regla.motivo || "",
    regla.activa === false ? "FALSE" : "TRUE",
    (v.dias || []).join(";"),
    v.horaDesde,
    v.horaHasta
  ]);

  const todas = filasOtras.concat(filasNuevas);

  hoja.getRange(2, 1, Math.max(hoja.getLastRow() - 1, 1), 10).clearContent();
  if (todas.length > 0) {
    hoja.getRange(2, 1, todas.length, 10).setValues(todas);
  }

  return { id, mensaje: `Regla "${regla.nombre}" guardada (${filasNuevas.length} ventana(s))` };
}

// ─────────────────────────────────────────────────────────────
//  POST { action:"eliminarReglaAgenda", id }
//  Borra todas las filas de ese id. Mismo criterio de reescritura
//  completa que _apiGuardarReglaAgenda.
// ─────────────────────────────────────────────────────────────
function _apiEliminarReglaAgenda(body) {
  if (!body.id) throw new Error("Falta id");

  const { hoja, datos } = _leerFilasReglasAgenda();
  const quedan = datos.filter(r => str(r[0]) !== body.id);

  if (quedan.length === datos.length) {
    return { eliminada: false, motivo: "No se encontró esa regla (¿ya se borró antes?)" };
  }

  hoja.getRange(2, 1, Math.max(hoja.getLastRow() - 1, 1), 10).clearContent();
  if (quedan.length > 0) {
    hoja.getRange(2, 1, quedan.length, 10).setValues(quedan);
  }

  return { eliminada: true };
}
