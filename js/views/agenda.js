// js/views/agenda.js — Vista de grilla semanal + calendario mensual (administrativo)

const AgendaView = (() => {
  let _modo       = "semana";
  let _fechaDesde = _lunesDeHoy();
  let _mesBase    = _primeroDeMes(new Date());
   let _paso              = 20;
  let _estudiosConfigCache = null; // config de "estudios" (duracion/restriccion por nombre) — usado para el filtro de restricciones, ver línea ~680
  let _filtroOrigenes = new Set(); // vacío = todos
  let _filtroEstados  = new Set(); // vacío = todos
  let _filtroEstudio  = "";
  let _ocultarRIS     = false; // true = mostrar solo los sobreturnos, ocultar lo que viene de BD_RIS sin turno propio

  // Cache de duracion estimada por texto de practica de RIS (evita pedir
  // de nuevo lo mismo en cada re-render de la semana). El calculo en si
  // vive en el backend (api_tiempoPractica_estimarDuraciones, misma
  // formula ya confirmada por el usuario el 14/8/2026 para el sugeridor
  // de sobreturno) porque requiere clasificar cada tramo a su region
  // (lib/clasificacion.js), logica que solo existe del lado de Node.
  // Reemplaza la version anterior (fuzzy-match contra agendaConfig.estudios,
  // ver git log) que daba la mitad de la duracion real contra los casos
  // reales confirmados el 9/9/2026 ("cerebro con contraste" 20min en vez
  // de 40min) -- mismo bug ya encontrado y corregido en lista.js, esta
  // vista lo tenia tambien. MARGEN_ENTRE_ESTUDIOS_MIN cubre el cambio de
  // paciente/sala entre un estudio y el siguiente, que ningun calculo de
  // duracion de escaneo va a capturar nunca (confirmado por el usuario
  // contra 2 casos reales mas, DNI 12106879 y 96365423).
  const MARGEN_ENTRE_ESTUDIOS_MIN = 10;
  const _duracionRISCache = new Map();

  async function _cargarDuracionesRIS(risMap) {
    const practicas = new Set();
    Object.values(risMap || {}).forEach(dia => (dia || []).forEach(r => { if (r.practica) practicas.add(r.practica); }));
    const faltantes = Array.from(practicas).filter(p => !_duracionRISCache.has(p));
    if (faltantes.length === 0) return;
    try {
      const duraciones = await RailwayAPI.estimarDuracionesPractica(faltantes);
      faltantes.forEach((p, i) => _duracionRISCache.set(p, (duraciones[i] || 20) + MARGEN_ENTRE_ESTUDIOS_MIN));
    } catch (_) {
      faltantes.forEach(p => _duracionRISCache.set(p, 20 + MARGEN_ENTRE_ESTUDIOS_MIN)); // fallback conservador, no bloquea el render
    }
  }

  function _duracionRIS(practica) {
    return _duracionRISCache.get(practica) || (20 + MARGEN_ENTRE_ESTUDIOS_MIN);
  }

  function parsearMinsJS(hora) {
    if (!hora) return 0;
    const p = String(hora).replace(/a\.m\.|p\.m\./g,"").trim().split(":");
    return parseInt(p[0]||0)*60 + (parseInt(p[1]||0));
  }

  function _lunesDeHoy() {
    const d = new Date();
    const dia = d.getDay();
    d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function _lunesDe(d) {
    const r = new Date(d);
    const dia = r.getDay();
    r.setDate(r.getDate() - (dia === 0 ? 6 : dia - 1));
    r.setHours(0, 0, 0, 0);
    return r;
  }
  // Próxima ocurrencia (incluyendo hoy) del día ISO indicado: 1=lunes … 5=viernes
  function _proximoDiaSemana(diaSemanaISO) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dowHoy = hoy.getDay() === 0 ? 7 : hoy.getDay();
    const diff = ((diaSemanaISO - dowHoy) % 7 + 7) % 7;
    const objetivo = new Date(hoy);
    objetivo.setDate(hoy.getDate() + diff);
    return objetivo;
  }
  function _primeroDeMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function _strFecha(d)     { return API.fechaAStr(d); }

  function _labelRango() {
    const fin = new Date(_fechaDesde);
    fin.setDate(_fechaDesde.getDate() + 6);
    const o = { day: "numeric", month: "short" };
    return _fechaDesde.toLocaleDateString("es-AR", o) + " — " + fin.toLocaleDateString("es-AR", o);
  }
  function _labelMes() {
    return _mesBase.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
      .replace(/^\w/, c => c.toUpperCase());
  }

  function _coloresOrigen(o) {
    const m = {
      "AMBULATORIO": { bg: "#a8d5a2", text: "#1a5e28", border: "#4a9e5c" },
      "GUARDIA":     { bg: "#5ba4cf", text: "#0a3d6b", border: "#2a7ab5" },
      "INTERNACIÓN": { bg: "#ffd966", text: "#7a4f00", border: "#c9a000" },
      "INTERNACION": { bg: "#ffd966", text: "#7a4f00", border: "#c9a000" },
      "DIRECCIÓN":   { bg: "#a98fd4", text: "#3d1e7a", border: "#7c5cb5" },
      "DIRECCION":   { bg: "#a98fd4", text: "#3d1e7a", border: "#7c5cb5" },
      "TRASLADO":    { bg: "#3c9ab8", text: "#0a3d52", border: "#1a6e8a" },
      "DELEGACION/VICTOR": { bg: "#f4b183", text: "#7a3d00", border: "#c9762a" },
    };
    return m[(o||"").toUpperCase()] || { bg: "#e8a09a", text: "#7a1f35", border: "#c9506a" };
  }

  // ── Leyenda de colores (fuente única: _coloresOrigen) ──────
  function _renderLeyenda() {
    const el = document.getElementById("agenda-leyenda");
    if (!el) return;
    const origenes = ["AMBULATORIO", "GUARDIA", "INTERNACIÓN", "DIRECCIÓN", "TRASLADO", "DELEGACION/VICTOR"];
    let html = origenes.map(o => {
      const c = _coloresOrigen(o);
      return `<span class="agenda-leyenda-item"><span class="agenda-leyenda-sw" style="background:${c.bg}"></span>${o.charAt(0)+o.slice(1).toLowerCase()}</span>`;
    }).join("");
    html += `<span class="agenda-leyenda-item"><span class="agenda-leyenda-sw" style="background:#f4f4f4;border-style:dashed;border-color:#bbb"></span>RIS (fuera de agenda)</span>`;
    html += `<span class="agenda-leyenda-item"><span class="agenda-leyenda-sw" style="background:repeating-linear-gradient(45deg,#ccc,#ccc 3px,#eee 3px,#eee 6px)"></span>Franja / restricción (color según configuración)</span>`;
    el.innerHTML = html;
  }

  // ── Filtros rápidos (origen / estado / estudio) ────────────
  const ORIGENES_FILTRO = [
    { key: "AMBULATORIO", label: "Ambulatorio" },
    { key: "GUARDIA",     label: "Guardia" },
    { key: "INTERNACION", label: "Internación" },
    { key: "DIRECCION",   label: "Dirección" },
    { key: "TRASLADO",    label: "Traslado" },
    { key: "DELEGACION/VICTOR", label: "Delegación/Víctor" },
    { key: "OTRO",        label: "Otro" },
  ];

  function _normOrigen(o) {
    const norm = (o || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return ORIGENES_FILTRO.some(x => x.key === norm) ? norm : "OTRO";
  }

  function _renderFiltros() {
    const contOrigen = document.getElementById("filtro-origen-chips");
    contOrigen.innerHTML = ORIGENES_FILTRO.map(o =>
      `<button type="button" class="filtro-chip" data-tipo="origen" data-val="${o.key}">${o.label}</button>`
    ).join("");

    const contEstado = document.getElementById("filtro-estado-chips");
    contEstado.innerHTML = `
      <button type="button" class="filtro-chip" data-tipo="estado" data-val="presente">Presente</button>
      <button type="button" class="filtro-chip" data-tipo="estado" data-val="pendiente">Pendiente</button>`;

    document.querySelectorAll("#agenda-filtros .filtro-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const set = btn.dataset.tipo === "origen" ? _filtroOrigenes : _filtroEstados;
        const val = btn.dataset.val;
        if (set.has(val)) set.delete(val); else set.add(val);
        btn.classList.toggle("activo");
        _aplicarFiltros();
        _actualizarBtnLimpiar();
      });
    });

    document.getElementById("filtro-estudio").addEventListener("input", e => {
      _filtroEstudio = e.target.value.trim().toLowerCase();
      _aplicarFiltros();
      _actualizarBtnLimpiar();
    });

    document.getElementById("btn-filtros-limpiar").addEventListener("click", () => {
      _filtroOrigenes.clear();
      _filtroEstados.clear();
      _filtroEstudio = "";
      document.getElementById("filtro-estudio").value = "";
      document.querySelectorAll("#agenda-filtros .filtro-chip.activo").forEach(b => b.classList.remove("activo"));
      _aplicarFiltros();
      _actualizarBtnLimpiar();
    });

    // Mostrar/ocultar RIS — mismo criterio que Portada: destildado, la
    // grilla solo muestra los sobreturnos (turnos propios), sin los
    // pacientes de BD_RIS que todavía no tienen un turno cargado encima.
    document.getElementById("chk-mostrar-ris").addEventListener("change", (e) => {
      _ocultarRIS = !e.target.checked;
      _cargarSemana(); // reusa la cache de sessionStorage, no vuelve a pedir datos
    });
  }

  function _actualizarBtnLimpiar() {
    const hayFiltro = _filtroOrigenes.size || _filtroEstados.size || _filtroEstudio;
    document.getElementById("btn-filtros-limpiar").classList.toggle("hidden", !hayFiltro);
  }

  // Atenúa (no elimina) los turnos que no matchean, para no romper los rowspan
  function _aplicarFiltros() {
    document.querySelectorAll("#agenda-container [data-fturno]").forEach(el => {
      const origen   = _normOrigen(el.dataset.origen);
      const presente = el.dataset.presente === "1";
      const estudio  = el.dataset.estudio || "";
      let visible = true;
      if (_filtroOrigenes.size && !_filtroOrigenes.has(origen)) visible = false;
      if (_filtroEstados.size) {
        const key = presente ? "presente" : "pendiente";
        if (!_filtroEstados.has(key)) visible = false;
      }
      if (_filtroEstudio && !estudio.includes(_filtroEstudio)) visible = false;
      el.classList.toggle("slot-dimmed", !visible);
    });
  }

  // Bloque de turnos que se pisan (16/10/2026, a pedido). Primero: "se pintan
  // los dos de verde pero son el mismo paciente y eso confunde" — y después,
  // con pacientes distintos, el turno que arrancaba adentro de otro y
  // terminaba más tarde aparecía dos veces (en la columna de superpuestos Y
  // con su propia celda abajo). Ahora la celda del que empieza primero se
  // estira hasta el final de TODOS los que se pisan con él (transitivo: A
  // pisa a B y B pisa a C), así nadie abre una segunda celda. Adentro de la
  // celda: el turno principal y los otros estudios del MISMO DNI (cada uno
  // clickeable, en la base siguen siendo turnos distintos); a la derecha:
  // los de OTROS pacientes (con su "→hora fin") y el RIS. Usa los
  // `solapados` que manda el backend.
  // Devuelve { filas: Set de filas del bloque, mismos, otros, hasta (fin del
  // bloque), hastaPaciente (fin del principal + sus mismos DNI) }.
  function _dniNormAg(d) { return String(d || "").replace(/\D/g, "").replace(/^0+/, ""); }
  function _horaAMinsAg(h) { const [a, b] = String(h || "").split(":").map(Number); return (a || 0) * 60 + (b || 0); }
  function _agruparBloque(dia, s, hastaPropio) {
    const dni = _dniNormAg(s.dni);
    const filas = new Set([s.fila]);
    const mismos = [], otros = [];
    let hasta = hastaPropio, hastaPaciente = hastaPropio;
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const sl of dia.slots) {
        if (!filas.has(sl.fila)) continue;
        for (const t of (sl.solapados || [])) {
          if (filas.has(t.fila)) continue;
          filas.add(t.fila);
          cambio = true;
          const fin = t.horaFin ? _horaAMinsAg(t.horaFin) : t.mins + _paso;
          if (fin > hasta) hasta = fin;
          if (dni && _dniNormAg(t.dni) === dni) {
            mismos.push(t);
            if (fin > hastaPaciente) hastaPaciente = fin;
          } else {
            otros.push(t);
          }
        }
      }
    }
    mismos.sort((a, b) => a.mins - b.mins);
    otros.sort((a, b) => a.mins - b.mins);
    return { filas, mismos, otros, hasta, hastaPaciente };
  }

  // Los otros estudios del mismo paciente, adentro de la celda del bloque —
  // cada línea abre las opciones de SU turno (data-turno-id propio).
  function _lineasMismoPaciente(slot, fecha, col, lista) {
    return (lista || slot._mismoPaciente || []).map(t => `
      <div class="slot-mismo" style="color:${col.text}"
        data-fecha="${fecha}" data-mins="${t.mins}" data-fila="${t.fila}" data-turno-id="${t.turnoId || ""}"
        data-tooltip="${encodeURIComponent(_tipTurno(t))}"
        data-fturno="1" data-origen="${t.origen || ""}" data-presente="${t.presente === "Presente" ? "1" : "0"}" data-estudio="${(t.estudio || "").toLowerCase()}">
        ＋ ${t.hora} ${t.estudio}${t.horaFin ? ` →${t.horaFin}` : ""}${t.presente === "Presente" ? " ✅" : ""}${ExcepcionPin.badge(t)}</div>`).join("");
  }

  // ── VISTA SEMANA ──────────────────────────────────────────
  function _renderSemana(datos, risMap, cardioMap) {
    cardioMap = cardioMap || {};
    risMap = risMap || {};
    const _risMapRef = risMap;
    const container = document.getElementById("agenda-container");
    if (!datos || !datos.length) { container.innerHTML = '<div class="empty-state">Sin datos.</div>'; return; }

    const MIN_I = 0, MIN_F = 24*60;
    const slotsSet = new Set();
    // Base de 20 min
    for (let m = MIN_I; m < MIN_F; m += 20) slotsSet.add(m);
    // Agregar horarios irregulares de turnos propios y RIS
    for (const dia of datos) {
      for (const s of dia.slots) {
        if (s.tipo === "turno" && s.mins >= MIN_I && s.mins < MIN_F) slotsSet.add(s.mins);
      }
      for (const r of (risMap[dia.fecha] || [])) {
        const rm = typeof r.mins === "number" ? r.mins : parsearMinsJS(r.hora);
        if (rm >= MIN_I && rm < MIN_F) slotsSet.add(rm);
      }
    }

    const slots = Array.from(slotsSet).sort((a,b) => a-b);

    // Normalizar continuaciones: slots del mismo paciente (misma fila) → tipo continuacion
    for (const dia of datos) {
      const vistos = new Map(); // fila → mins del primer slot
      for (const s of dia.slots) {
        if (s.tipo !== "turno") continue;
        if (vistos.has(s.fila)) {
          s.tipo = "continuacion";
          s.color = s.color; // mantener color
        } else {
          vistos.set(s.fila, s.mins);
          // Calcular hasta cuándo llega este turno
          const sigsDelMismo = dia.slots.filter(sl => sl.fila === s.fila && sl.mins > s.mins);
          const ultimoMins = sigsDelMismo.length > 0
            ? Math.max(...sigsDelMismo.map(sl => sl.mins)) + _paso
            : s.mins + _paso;
          s.duracion = ultimoMins - s.mins;
        }
      }
    }

    let html = '<table class="agenda-table"><thead><tr><th class="col-hora">Hora</th>';
    for (const d of datos) html += `<th class="${d.esFeriado?"feriado-col":""}">${d.label}${d.esFeriado?" 🚫":""}</th>`;
    html += "</tr></thead><tbody>";

    // Rastrear turno activo, RIS activo y cardio activo por columna
    const activosPorCol  = new Array(datos.length).fill(null); // { slot, hasta, rowSpan }
    const risActivoCol   = new Array(datos.length).fill(null); // { ris, hasta, mostrado }
    const cardioActivoCol = new Array(datos.length).fill(null); // { cp, hasta, mostrado }

    for (let si = 0; si < slots.length; si++) {
      const mins     = slots[si];
      const nextMins = si + 1 < slots.length ? slots[si + 1] : mins + _paso;
      const h = String(Math.floor(mins/60)).padStart(2,"0");
      const m = String(mins%60).padStart(2,"0");
      html += `<tr><td class="col-hora">${h}:${m}</td>`;

      for (let di = 0; di < datos.length; di++) {
        const dia = datos[di];
        const s   = dia.slots.find(sl => sl.mins === mins);
        // El backend calcula franjas/bloqueos cada 20 min exactos; cuando la
        // grilla agrega una fila "rara" (un paciente de RIS que arranca en
        // un minuto no múltiplo de 20), esa fila no tiene su propio slot —
        // `s` da undefined y la franja se cortaba ahí. Para pintar el color
        // de la franja (no para turno/continuación, que sí necesitan el
        // slot exacto) usamos el bloque de 20 min que la contiene.
        const sFranja = s || dia.slots.find(sl => sl.mins === Math.floor(mins/20)*20);
        const esContinuacion = s && s.tipo === "continuacion";

        // Actualizar turno activo y rowspan. Un turno que ya quedó adentro del
        // bloque de arriba (ver _agruparBloque) no abre una celda nueva.
        const yaAgrupado = s && s.tipo === "turno" && activosPorCol[di] &&
          mins < activosPorCol[di].hasta && activosPorCol[di].filas && activosPorCol[di].filas.has(s.fila);
        if (s && s.tipo === "turno" && !yaAgrupado) {
          const grupo = _agruparBloque(dia, s, mins + (s.duracion || _paso));
          const hasta = grupo.hasta;
          s._mismoPaciente = grupo.mismos;
          s._otrosBloque = grupo.otros;
          s._hastaUnido = grupo.hastaPaciente; // el "→hora" de la celda: el principal + sus mismos DNI
          const spanCount = Math.max(1, slots.slice(si).filter(tm => tm < hasta).length);
          // Para los carriles (ver _renderTurnoConSuperpuestos): la hora de
          // cada fila que ocupa la celda y la posición de la primera.
          s._filasBloque = slots.slice(si, si + spanCount);
          s._si = si;
          activosPorCol[di] = { slot: s, hasta, rowSpan: spanCount, filas: grupo.filas };
        } else if (activosPorCol[di] && mins >= activosPorCol[di].hasta) {
          activosPorCol[di] = null;
        }

        const turnoActivo = activosPorCol[di] && mins < activosPorCol[di].hasta;
        const inicioTurno = turnoActivo && s && s.tipo === "turno" && activosPorCol[di].slot === s;
        const spannedTurno = turnoActivo && !inicioTurno;
        if (esContinuacion || spannedTurno) continue;

        // RIS: buscar el que empieza exactamente en este slot (rm >= mins && rm < nextMins)
        const pacientesAgenda = (dia.slots||[]).flatMap(sl => [sl, ...(sl.solapados||[])]);
        const dniAgenda   = new Set(pacientesAgenda.filter(sl=>sl.dni).map(sl=>String(sl.dni).trim().replace(/^0+/,"")));
        const apellAgenda = new Set(pacientesAgenda.filter(sl=>sl.apellido).map(sl=>sl.apellido.trim().toUpperCase()));
        // Excluir RIS que ya están en la agenda cardiológica del día
        const dniCardio = new Set((cardioMap[dia.fecha]||[]).map(c => String(c.dni||"").trim().replace(/^0+/,"")));
        const _minsRIS = r => typeof r.mins==="number" ? r.mins : parsearMinsJS(r.hora);
        const _risSinTurno = r => {
          const dniRIS   = String(r.documento||"").replace(/[A-Za-z]+\s*/,"").trim().replace(/^0+/,"");
          const apellRIS = String(r.apellido_nombre||"").split(",")[0].trim().toUpperCase();
          if (dniAgenda.has(dniRIS) || apellAgenda.has(apellRIS)) return false;
          if (dniCardio.has(dniRIS)) return false; // ya aparece en franja cardio
          return true;
        };
        const risNuevo = inicioTurno ? null : (risMap[dia.fecha]||[]).find(r => {
          const rm = _minsRIS(r);
          return rm >= mins && rm < nextMins && _risSinTurno(r);
        });

        // Si hay RIS nuevo → registrar activo, marcar como NO mostrado aún
        if (risNuevo) {
          const dur = _duracionRIS(risNuevo.practica);
          risActivoCol[di] = { ris: risNuevo, hasta: _minsRIS(risNuevo) + dur, mostrado: false };
        } else if (risActivoCol[di] && mins >= risActivoCol[di].hasta) {
          risActivoCol[di] = null;
        }

        // Todo lo que arranca mientras dura este turno (2/10/2026, a pedido:
        // "si autorizo con PIN de jefatura que un turno pise otro tienen que
        // mostrarse ambos y el de RIS si es que está"): otros turnos de la
        // PWA (el backend los manda en `solapados` del slot donde arrancan)
        // y estudios de RIS sin turno propio. Antes las filas tapadas por el
        // rowspan se salteaban enteras y eso quedaba invisible.
        let risEnTurno = [];
        if (inicioTurno) {
          const hastaTurno = activosPorCol[di].hasta;
          risEnTurno = (risMap[dia.fecha]||[])
            .filter(r => { const rm = _minsRIS(r); return rm >= mins && rm < hastaTurno && _risSinTurno(r); })
            .sort((a, b) => _minsRIS(a) - _minsRIS(b));
          // Superpuestos de OTROS pacientes en todo el bloque (los del mismo
          // paciente van adentro de la celda) — ver _agruparBloque.
          s._solapadosVista = s._otrosBloque || [];
          // Un RIS de adentro que sigue después del turno: su barra de
          // continuación se dibuja en las filas siguientes (salvo que ya
          // hubiera uno de antes que termina todavía más tarde).
          const ultimoRIS = risEnTurno
            .map(r => ({ ris: r, hasta: _minsRIS(r) + _duracionRIS(r.practica) }))
            .sort((a, b) => b.hasta - a.hasta)[0];
          if (ultimoRIS && ultimoRIS.hasta > hastaTurno && !(risActivoCol[di] && risActivoCol[di].hasta >= ultimoRIS.hasta)) {
            risActivoCol[di] = { ris: ultimoRIS.ris, hasta: ultimoRIS.hasta, mostrado: true };
          }
        }

        const risActivo       = risActivoCol[di];
        // Si acá arranca un turno propio, tiene prioridad sobre la barra de
        // continuación de RIS — de lo contrario el turno queda tapado y,
        // como esa celda de RIS no lleva rowspan pero activosPorCol[di]
        // sigue reservando la fila siguiente como "cubierta", esa fila
        // siguiente termina sin <td> real y corre las columnas de la
        // derecha una posición a la izquierda.
        const risContinuacion = !risNuevo && risActivo && risActivo.mostrado && mins < risActivo.hasta && !inicioTurno;

        if (risContinuacion) {
          const r     = risActivo.ris;
          const hasta = risActivo.hasta;
          const horaF = String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0");
          // Solo mostramos la etiqueta "→hora" en la última fila del tramo, para que
          // el resto se lea como una sola barra gris continua (sin texto repetido)
          // aunque cada slot sigue siendo su propia celda clickeable.
          const esUltimaFila = nextMins >= hasta;
          const etiqueta = esUltimaFila
            ? `<span style="color:#999;font-size:8px;font-weight:700;padding:0 4px;flex-shrink:0">→${horaF}</span>`
            : "";
          // Esta fila puntual puede caer sobre una franja/bloqueo (ej.
          // "Franja de descompresión") aunque sea continuación de RIS — sin
          // esto la fila se veía en blanco, cortando el color de la franja
          // a la mitad del bloque.
          const esFranjaAqui = sFranja && (sFranja.tipo === "franja" || sFranja.tipo === "franja_origen" || sFranja.tipo === "bloqueo_rec" || sFranja.tipo === "bloqueo");
          const bgFila     = esFranjaAqui ? sFranja.color : "#f4f4f4";
          const bordeFila  = esFranjaAqui ? sFranja.color : "#bbb";
          html += `<td class="slot-ris-clickable slot-ris-continua"
            style="background:${bgFila};border-left:2px dashed ${bordeFila};border:1px solid #ebebeb;cursor:pointer;padding:0 6px"
            data-fecha="${dia.fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(r.practica)}"
            data-franja-label="${esFranjaAqui ? encodeURIComponent(sFranja.label) : ''}"
            title="${esFranjaAqui ? sFranja.label + ' — ' : ''}${r.apellido_nombre} · ${r.practica} — hasta ${horaF} — clic para asignar turno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none">
              <div style="height:1px;flex:1;border-top:1px dashed #999"></div>
              ${etiqueta}
            </div></td>`;
        } else {
          // ── CARDIO: lógica unificada ──
          const esFranjaCardioSlot = s &&
            (s.tipo === "franja" || s.tipo === "franja_origen" || s.tipo === "bloqueo_rec") &&
            (s.label||"").toLowerCase().includes("cardiol");

          let cardioRender = [];
          let skipRender   = false;

          if (dia.diaSemana === 3 && esFranjaCardioSlot) {
            const cardioDia = (cardioMap[dia.fecha] || []);
            // Expirar activo si terminó
            if (cardioActivoCol[di] && mins >= cardioActivoCol[di].hasta) {
              cardioActivoCol[di] = null;
            }
            // Nuevo paciente que empieza en este slot O cuyo horario queda en este rango
            if (!cardioActivoCol[di]) {
              const cpNuevo = cardioDia.find(c => c.mins < nextMins && (c.mins + (c.duracion||60)) > mins);
              if (cpNuevo) {
                const dniCP    = String(cpNuevo.dni||"").trim().replace(/^0+/,"");
                const enAgenda = (dia.slots||[]).some(sl => sl.dni && String(sl.dni).trim().replace(/^0+/,"") === dniCP);
                const enRIS    = (risMap[dia.fecha]||[]).some(r => {
                  const dniR = String(r.documento||"").replace(/[A-Za-z]+/,"").trim().replace(/^0+/,"");
                  return dniR === dniCP;
                });
                cardioActivoCol[di] = {
                  cp: { ...cpNuevo, _cardio: true, _enAgenda: enAgenda, _enRIS: enRIS },
                  hasta: cpNuevo.mins + (cpNuevo.duracion || 60),
                  mostrado: false
                };
              }
            }
            if (cardioActivoCol[di]) {
              if (!cardioActivoCol[di].mostrado) {
                cardioActivoCol[di].mostrado = true;
                // Estado de cardio agenda tiene prioridad
                const cpConEstado = { ...cardioActivoCol[di].cp };
                cardioRender = [cpConEstado];
              } else {
                const bg = s.color || "#e8a0c0";
                html += `<td style="background:${bg}22;border-left:3px solid ${bg}55;border:1px solid ${bg}33;padding:2px 5px">
                  <div style="height:100%;display:flex;align-items:center;gap:4px;pointer-events:none">
                    <div style="flex:1;height:1px;background:${bg}77"></div>
                    <span style="color:${bg};font-size:8px;font-weight:600">cardio</span>
                  </div></td>`;
                skipRender = true;
              }
            }
          }

          if (!skipRender) {
            if (risNuevo && risActivoCol[di]) risActivoCol[di].mostrado = true;
            const renderRIS = cardioRender.length > 0 ? cardioRender : (inicioTurno ? risEnTurno : (risNuevo ? [risNuevo] : []));
            const rowSpan = inicioTurno ? activosPorCol[di].rowSpan : 1;
            // Sin slot propio (fila "rara" de RIS) pero dentro de una franja
            // — usar el fallback para no perder el color a mitad de bloque.
            html += _renderCeldaCombinada(s || sFranja, renderRIS, dia.fecha, mins, risMap[dia.fecha] || [], rowSpan);
          }
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
    _ajustarCarriles(container);
    _bindSlotClicks(container);
    _aplicarFiltros();
  }

  // Los carriles se ubican primero en % (todas las filas iguales); acá se
  // corrigen en píxeles con la altura real de cada fila, porque una fila
  // puede estirarse si otra columna tiene más texto.
  function _ajustarCarriles(container) {
    const tds = container.querySelectorAll("td.celda-carriles");
    if (!tds.length) return;
    const filas = container.querySelectorAll(".agenda-table tbody tr");
    tds.forEach(td => {
      const si = +td.dataset.si, n = +td.dataset.n;
      if (!filas[si]) return;
      const top0 = filas[si].offsetTop;
      const topDe = k => (k < n && filas[si + k] ? filas[si + k].offsetTop - top0 : td.offsetHeight);
      // data-a/data-b: filas que ocupa en la vista normal (2 columnas);
      // data-aa/data-ba: en "ver todos".
      const ubicar = (el, a, b, sufijo) => {
        if (a === undefined) return;
        const y0 = topDe(+a), y1 = topDe(+b);
        el.style.setProperty("--t" + sufijo, (y0 + 1) + "px");
        el.style.setProperty("--h" + sufijo, Math.max(8, y1 - y0 - 2) + "px");
      };
      td.querySelectorAll(".carril-item").forEach(el => {
        ubicar(el, el.dataset.a, el.dataset.b, "");
        ubicar(el, el.dataset.aa, el.dataset.ba, "a");
      });
    });
  }
  let _resizeCarriles = null;
  window.addEventListener("resize", () => {
    clearTimeout(_resizeCarriles);
    _resizeCarriles = setTimeout(() => {
      const c = document.getElementById("agenda-container");
      if (c) _ajustarCarriles(c);
    }, 150);
  });

  // ── Celda combinada: turno propio + RIS en la misma fila ──
  function _renderCeldaCombinada(slot, risSlot, fecha, mins, risDelDia, rowspan = 1) {
    const tipo    = slot ? slot.tipo || "libre" : "libre";
    const tieneRIS = risSlot && risSlot.length > 0;
    const ris      = tieneRIS ? risSlot[0] : null;
    const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : "";

    // "Mostrar RIS" destildado: cae directo al render sin RIS — un turno
    // propio (sobreturno incluido) se ve igual que siempre, y un slot que
    // solo tenía un paciente de BD_RIS (sin turno cargado) pasa a verse
    // libre/franja/bloqueo, según corresponda, como si no hubiera RIS.
    // Cardiología no es RIS (otra planilla) — no se toca con este toggle.
    const esCardio = tieneRIS && risSlot[0] && risSlot[0]._cardio;
    const solapados = (tipo === "turno" && slot._solapadosVista) || [];
    if (_ocultarRIS && !esCardio) {
      if (!slot) return `<td${rowspanAttr}></td>`;
      // "Mostrar RIS" apaga solo el RIS — los turnos propios que se pisan se siguen viendo.
      if (solapados.length) return _renderTurnoConSuperpuestos(slot, [], solapados, fecha, mins, rowspan);
      return _renderSlot(slot, fecha, mins, risDelDia || [], rowspan);
    }

    // Turno propio + otros turnos y/o RIS que arrancan mientras dura → celda dividida
    if (tipo === "turno" && (tieneRIS || solapados.length)) {
      return _renderTurnoConSuperpuestos(slot, risSlot || [], solapados, fecha, mins, rowspan);
    }

    // Si hay solo RIS en slot libre → celda RIS clickeable
    if (tieneRIS && (tipo === "libre" || tipo === "continuacion")) {
      const hoy  = new Date(); hoy.setHours(0,0,0,0);
      const fParts = fecha.split("/");
      const fDate  = new Date(parseInt(fParts[2]), parseInt(fParts[1])-1, parseInt(fParts[0]));
      const pasado = fDate < hoy;
      const est    = ris.estado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const asignado = est === "Asignado" && pasado;
      const estadoIcon = atendido ? "✓" : asignado ? "✗" : "";
      const estadoColor = atendido ? "#2e7d32" : "#c62828";
      return `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #bbb;border:1px solid #e4e8ee;cursor:pointer"
        data-fecha="${fecha}" data-mins="${mins}"
        data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}" data-ris-practica="${encodeURIComponent(ris.practica)}"
        title="RIS: ${ris.apellido_nombre}\nEstado: ${est}\nClic para asignar sobreturno aquí">
        <div class="slot-content">
          <span class="slot-nombre" style="color:#888;font-style:italic">${estadoIcon ? `<span style="color:${estadoColor};font-weight:700;margin-right:2px">${estadoIcon}</span>` : ""}${ris.apellido_nombre}</span>
          <span class="slot-estudio" style="color:#aaa;font-size:10px">${ris.practica} <span style="background:#ddd;color:#777;border-radius:3px;padding:0 3px;font-size:9px">RIS</span></span>
        </div>
      </td>`;
    }

    // Si hay paciente cardíaco en slot de franja cardiología → mostrar paciente
    // (cardioSlot se inyecta desde el loop principal via risSlot con flag especial)
    const cardioSlot = tieneRIS && risSlot[0]?._cardio ? risSlot[0] : null;

    // Si hay RIS en slot de franja o bloqueo → celda dividida: franja izq | RIS der.
    // Si la franja quedó sin color propio (ej. "Solo sin contraste", blanca
    // a propósito — ver Config), partir la celda a la mitad no aporta nada:
    // la mitad de la franja se ve vacía y el RIS queda apretado sin
    // necesidad. En ese caso el RIS ocupa el 100% del ancho.
    if (tieneRIS && !cardioSlot && slot && (tipo === "franja" || tipo === "franja_origen" || tipo === "bloqueo_rec" || tipo === "bloqueo")) {
      const bg      = slot.color || "#ccc";
      const label   = slot.label || tipo;
      const franjaInvisible = bg.toLowerCase() === "#ffffff" || bg.toLowerCase() === "#fff";
      if (franjaInvisible) {
        const est = ris.estado || "";
        return `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #bbb;border:1px solid #e4e8ee;cursor:pointer"
          data-fecha="${fecha}" data-mins="${mins}"
          data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}" data-ris-practica="${encodeURIComponent(ris.practica)}"
          data-franja-label="${encodeURIComponent(label)}"
          title="${label} — RIS: ${ris.apellido_nombre}\nEstado: ${est}\nClic para asignar sobreturno aquí">
          <div class="slot-content">
            <span class="slot-nombre" style="color:#888;font-style:italic">${ris.apellido_nombre}</span>
            <span class="slot-estudio" style="color:#aaa;font-size:10px">${ris.practica} <span style="background:#ddd;color:#777;border-radius:3px;padding:0 3px;font-size:9px">RIS</span></span>
          </div>
        </td>`;
      }
      const risBg   = bg + "33";
      const risBord = bg + "88";
      // Badge de estado RIS
      const estadoRIS = ris.estado || "";
      const estadoBadge = estadoRIS
        ? `<span style="background:${risBord};color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${estadoRIS}</span>`
        : "";
      return `<td style="padding:0;border:1px solid #e4e8ee;height:36px">
        <div style="display:flex;height:100%;gap:1px">
          <div class="slot-content" style="flex:1;background:${bg};overflow:hidden" title="${label}"></div>
          <div class="slot-ris-side slot-content" style="flex:1;background:${risBg};border-left:2px dashed ${risBord};cursor:pointer;overflow:hidden"
            data-fecha="${fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(ris.practica)}"
            data-franja-label="${encodeURIComponent(label)}"
            title="RIS: ${ris.apellido_nombre} — ${ris.practica}\nClic para sobreturno">
            <div style="display:flex;gap:2px;align-items:center">${estadoBadge}<span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">RIS</span></div>
            <span class="slot-nombre" style="color:#555;font-style:italic;font-size:10px">${ris.apellido_nombre}</span>
            <span class="slot-estudio" style="color:#777;font-size:9px">${ris.practica}</span>
          </div>
        </div>
      </td>`;
    }

    // Si hay paciente cardíaco en slot de franja → mostrar con color de franja
    if (cardioSlot && slot) {
      const bg  = slot.color || "#e8a0c0";
      const c   = cardioSlot;
      const badges = [];
      if (c._enAgenda) badges.push(`<span style="background:#4a9e5c;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">AGENDA</span>`);
      if (c._enRIS)    badges.push(`<span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">RIS</span>`);
      badges.push(`<span style="background:#c9506a;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">CARDIO</span>`);
      // Estado de cardio agenda tiene prioridad — mapear a ícono
      const estCardio = (c.estado||"").toUpperCase();
      const atendidoC = estCardio === "REALIZADO" || estCardio === "CONFIRMADO" || estCardio === "PRESENTE";
      const estadoIconC = atendidoC ? `<span style="color:#2e7d32;font-weight:700;margin-right:2px">✓</span>` : "";
      return `<td style="background:${bg}22;border-left:3px solid ${bg};border:1px solid ${bg}55;padding:3px 5px;cursor:pointer;height:36px"
        data-fecha="${fecha}" data-mins="${mins}"
        data-ris-nombre="${encodeURIComponent(c.apellido_nombre)}"
        data-ris-practica="${encodeURIComponent(c.diagnostico)}"
        title="Cardiología: ${c.apellido_nombre}\nDNI: ${c.dni}\n${c.diagnostico}\nEstado: ${c.estado}">
        <div class="slot-content">
          <div style="display:flex;align-items:center;gap:3px;margin-bottom:1px">${badges.join("")}</div>
          <span class="slot-nombre" style="color:#555;font-weight:600">${estadoIconC}${c.apellido_nombre}</span>
          <span class="slot-estudio" style="color:#777;font-size:10px">${c.diagnostico}</span>
        </div>
      </td>`;
    }

    // Default: render normal
    if (!slot) return "<td></td>";
    return _renderSlot(slot, fecha, mins, risDelDia || [], rowspan);
  }

  // Texto del tooltip/"Opciones del turno" — texto plano a propósito (se
  // muestra también dentro de un confirm() nativo al anular). slot.risEstado
  // es el cruce por DNI (¿este turno YA está en RIS?), resuelto por el
  // backend. `enBloqueo` (2/10/2026): el turno cae dentro de un bloqueo
  // puntual de agenda.
  function _tipTurno(slot) {
    const risLinea = slot.risEstado ? `\n🏥 RIS: ${slot.risEstado}` : `\n🚫 NO ASIGNADO EN RIS`;
    const sinSolicitudLinea = slot.solicitudDigital === false ? `\n🚫 SIN SOLICITUD DIGITAL` : "";
    const creadoLinea = slot.creadoEn ? `\n🗓️ Cargado el: ${slot.creadoEn}` : "";
    const bloqueoLinea = slot.enBloqueo ? `\n⛔ Dentro del bloqueo: ${slot.enBloqueo}` : "";
    return `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${PedidoPiso.lineasTip(slot)}${slot.observaciones?"\n📝 "+slot.observaciones:""}${slot.tecnicoAsigno?"\n🧑‍⚕️ Asignó: "+slot.tecnicoAsigno:""}${slot.presente === "Presente"?"\n✅ Presente":""}${risLinea}${sinSolicitudLinea}${creadoLinea}${bloqueoLinea}${ExcepcionPin.lineaTip(slot)}`;
  }

  function _badgeBloqueo(slot) {
    return slot.enBloqueo
      ? `<span style="background:#e06666;color:#fff;border-radius:3px;padding:0 4px;font-size:7px;font-weight:700;margin-left:3px" title="Dentro del bloqueo: ${slot.enBloqueo}">⛔ BLOQUEO</span>`
      : "";
  }

  // Celda de turnos que se pisan, en DOS columnas (27/10/2026, a pedido:
  // "que los dos pacientes que tienen el mismo horario o se superponen
  // compartan las celdas del horario que ocupan… y que si el paciente está
  // en el RIS se fusione de costado con el turno de la agenda"; y después:
  // "poné uno abajo del otro y marcales en negrita el horario de inicio
  // para que se divida la celda en dos, no en tres"). Antes (2/10/2026)
  // era el dueño a la izquierda y una lista con lo demás a la derecha.
  // Va todo lo que arranca mientras dura el bloque:
  //  - el turno dueño de la celda (el que empezó primero), con sus otros
  //    estudios del mismo DNI adentro, como antes;
  //  - los turnos de OTROS pacientes (también agrupados por DNI);
  //  - los de RIS sin turno propio (ej. sobreturnos), en gris.
  // Cada uno arranca en la fila de su hora; si las dos columnas están
  // ocupadas, va abajo del que termina primero — por eso cada uno lleva su
  // hora de inicio en negrita. Si un turno ya está en RIS, el estado va en
  // una tira pegada a su costado. Lo que no entra en el alto de la celda:
  // "+N más" (clic: abre más columnas). Clics como siempre (turno =
  // opciones del turno; RIS = aviso de sobreturno).
  const COLUMNAS_CARRILES = 2;

  // Ubica cada cosa en L columnas: en la que la deja más arriba (la de la
  // izquierda si empata), nunca antes de su hora. Devuelve Map item →
  // { c: columna, a: primera fila, b: primera fila que ya no ocupa, ancho }.
  function _colocarCarriles(orden, n, L) {
    const fondo = new Array(L).fill(0); // primera fila libre de cada columna
    const lugar = new Map();
    for (const it of orden) {
      let c = 0;
      for (let k = 1; k < L; k++) if (Math.max(it.r0, fondo[k]) < Math.max(it.r0, fondo[c])) c = k;
      const a = Math.max(it.r0, fondo[c]);
      if (a >= n) continue; // ya no entra en el alto de la celda
      const b = a + Math.max(1, Math.min(it.r1 - it.r0, n - a));
      lugar.set(it, { c, a, b });
      fondo[c] = b;
    }
    // Se estira a la derecha si la columna de al lado está libre en todo su alto.
    const todos = [...lugar.values()];
    for (const l of todos) {
      let s = 1;
      while (l.c + s < L && !todos.some(o => o.c === l.c + s && o.a < l.b && l.a < o.b)) s++;
      l.ancho = s;
    }
    return lugar;
  }

  function _renderTurnoConSuperpuestos(slot, risItems, solapados, fecha, mins, rowspan) {
    const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : "";
    const filasOk = Array.isArray(slot._filasBloque) && slot._filasBloque.length === rowspan;
    const filasMins = filasOk ? slot._filasBloque : Array.from({ length: rowspan }, (_, k) => mins + k * _paso);
    const n = filasMins.length;
    const horaDe = m => String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
    const minsDe = r => typeof r.mins === "number" ? r.mins : parsearMinsJS(r.hora);
    const finTurno = t => { const f = t.horaFin ? _horaAMinsAg(t.horaFin) : 0; return f > t.mins ? f : t.mins + _paso; };
    // Fila donde arranca (la última que empieza antes o en esa hora) y
    // primera fila que ya no ocupa.
    const r0De = m => Math.max(0, filasMins.filter(t => t <= m).length - 1);
    const r1De = (e, r0) => Math.min(n, Math.max(r0 + 1, filasMins.filter(t => t < e).length));
    const fp = fecha.split("/");
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const pasado = new Date(+fp[2], +fp[1] - 1, +fp[0]) < hoy;

    // ── Qué va en la celda ──
    // El dueño cae en la casilla de 20 min que lo contiene; su hora real
    // (horaInicio/horaFinTurno) la manda sistema2 desde el 27/10/2026.
    const mismosDuenio = slot._mismoPaciente || [];
    const finesDuenio = [slot.horaFinTurno ? _horaAMinsAg(slot.horaFinTurno) : 0, ...mismosDuenio.map(finTurno)].filter(x => x > mins);
    const items = [{
      tipo: "turno", t: slot, mismos: mismosDuenio,
      ini: slot.horaInicio ? _horaAMinsAg(slot.horaInicio) : mins,
      fin: slot._hastaUnido || (mins + (slot.duracion || _paso)),
      finVer: finesDuenio.length ? Math.max(...finesDuenio) : null,
    }];
    const porDni = new Map();
    for (const t of solapados) {
      const k = _dniNormAg(t.dni) || ("fila:" + t.fila);
      if (!porDni.has(k)) porDni.set(k, []);
      porDni.get(k).push(t);
    }
    for (const grupo of porDni.values()) {
      grupo.sort((a, b) => a.mins - b.mins);
      items.push({ tipo: "turno", t: grupo[0], mismos: grupo.slice(1), ini: grupo[0].mins, fin: Math.max(...grupo.map(finTurno)) });
    }
    for (const r of risItems) {
      const rm = minsDe(r);
      items.push({ tipo: "ris", r, ini: rm, fin: rm + _duracionRIS(r.practica) });
    }
    for (const it of items) { it.r0 = r0De(it.ini); it.r1 = r1De(it.fin, it.r0); }

    // ── Columnas: el dueño primero; después por hora (turno antes que RIS) ──
    const orden = [items[0], ...items.slice(1).sort((a, b) =>
      a.ini - b.ini || (a.tipo === "turno" ? 0 : 1) - (b.tipo === "turno" ? 0 : 1) || b.fin - a.fin)];
    const lugar2 = _colocarCarriles(orden, n, COLUMNAS_CARRILES);
    const ocultos = orden.filter(it => !lugar2.has(it));
    // "Ver todos": más columnas, hasta que entre todo (máximo 6).
    let lugarT = null, LT = 0;
    if (ocultos.length) {
      for (LT = COLUMNAS_CARRILES + 1; LT <= 6; LT++) {
        lugarT = _colocarCarriles(orden, n, LT);
        if (lugarT.size === orden.length) break;
      }
      LT = Math.min(LT, 6);
    }
    const pct = x => (x * 100).toFixed(3) + "%";
    const vars = (l, L, suf) => !l ? "" :
      `--t${suf}:calc(${pct(l.a / n)} + 1px);--h${suf}:calc(${pct((l.b - l.a) / n)} - 2px);` +
      `--l${suf}:calc(${pct(l.c / L)} + 1px);--w${suf}:calc(${pct(l.ancho / L)} - 2px);`;
    const pos = it => {
      const l2 = lugar2.get(it), lT = lugarT && lugarT.get(it), l = l2 || lT;
      return {
        clase: (l2 ? "" : " carril-oculto") + (lugarT && !lT ? " carril-sin-todos" : ""),
        datos: (l2 ? ` data-a="${l2.a}" data-b="${l2.b}"` : "") + (lT ? ` data-aa="${lT.a}" data-ba="${lT.b}"` : ""),
        style: vars(l2, COLUMNAS_CARRILES, "") + vars(lT, LT, "a"),
        alto: l ? l.b - l.a : 1,
      };
    };
    const horaNegrita = txt => `<span class="carril-hora">${txt}</span>`;

    const htmlTurno = it => {
      const t = it.t, p = pos(it), alto = p.alto;
      const col = _coloresOrigen(t.origen);
      const sinSol = t.solicitudDigital === false;
      const est = t.risEstado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const ausente = est === "Asignado" && pasado;
      // RIS del mismo paciente, pegado al costado del turno.
      const tira = est
        ? `<div class="carril-ris-tira" style="color:${atendido ? "#2e7d32" : ausente ? "#c62828" : "#555"}" title="En RIS: ${est}">${atendido ? "✓ " : ausente ? "✗ " : ""}RIS${alto > 1 ? " · " + est : ""}</div>`
        : "";
      const badges = `${t.presente === "Presente" ? " ✅" : ""}${ExcepcionPin.badge(t)}` +
        (sinSol ? `<span style="background:#c62828;color:#fff;border-radius:3px;padding:0 4px;font-size:7px;font-weight:700;margin-left:3px">SIN SOLICITUD</span>` : "") +
        `${PedidoPiso.badge(t)}${_badgeBloqueo(t)}`;
      const inicio = it === items[0] ? (t.horaInicio || horaDe(mins)) : (t.hora || horaDe(it.ini));
      const finVer = horaDe(it.finVer || it.fin);
      const nombre = `<span class="slot-nombre" style="color:${col.text}">${horaNegrita(inicio)}${t.apellido}, ${t.nombre}${badges}</span>`;
      const cuerpo = alto > 1
        ? `${nombre}
           <span class="slot-estudio-full" style="color:${col.text}">${t.estudio}</span>
           <span class="slot-detalle" style="color:${col.text}">→ ${finVer}${t.dni ? " · DNI " + t.dni : ""}</span>
           ${PedidoPiso.lineaComentario(t, col.text)}
           ${_lineasMismoPaciente(t, fecha, col, it.mismos)}`
        : `${nombre}
           <span class="slot-estudio" style="color:${col.text}">${t.estudio}</span>
           ${_lineasMismoPaciente(t, fecha, col, it.mismos)}`;
      return `<div class="carril-item slot-turno${p.clase}${ExcepcionPin.clase(t)}"${p.datos}
          style="${p.style}background:${t.color || "#a8d5a2"};border-left:3px solid ${col.border}${sinSol ? ";box-shadow:inset 0 0 0 2px #c62828" : ""}"
          data-fecha="${fecha}" data-mins="${t.mins}" data-fila="${t.fila}" data-turno-id="${t.turnoId || ""}" data-tooltip="${encodeURIComponent(_tipTurno(t))}"
          data-fturno="1" data-origen="${t.origen || ""}" data-presente="${t.presente === "Presente" ? "1" : "0"}" data-estudio="${(t.estudio || "").toLowerCase()}">
          <div class="slot-content carril-cuerpo${alto > 1 ? " slot-content-expandido" : ""}">${cuerpo}</div>${tira}
        </div>`;
    };

    const htmlRis = it => {
      const r = it.r, p = pos(it), alto = p.alto;
      const est = r.estado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const ausente = est === "Asignado" && pasado;
      const icono = atendido ? `<span style="color:#2e7d32;font-weight:700">✓</span> `
                  : ausente  ? `<span style="color:#c62828;font-weight:700">✗</span> ` : "";
      return `<div class="carril-item carril-ris slot-ris-side${p.clase}"${p.datos} style="${p.style}"
          data-fecha="${fecha}" data-mins="${it.ini}" data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}" data-ris-practica="${encodeURIComponent(r.practica)}"
          data-ya-sobreturno="1"
          title="RIS (sin turno en la agenda): ${r.apellido_nombre} — ${r.practica}${est ? `\nEstado: ${est}` : ""}\n${horaDe(it.ini)} → ${horaDe(it.fin)} (duración estimada)">
          <div class="slot-content carril-cuerpo${alto > 1 ? " slot-content-expandido" : ""}">
            <span class="slot-nombre" style="color:#666;font-style:italic;font-size:10px">${horaNegrita(horaDe(it.ini))}${icono}${r.apellido_nombre}</span>
            <span class="slot-estudio" style="color:#999;font-size:9px">${r.practica} <span class="carril-ris-badge">RIS</span>${alto > 1 ? ` →${horaDe(it.fin)}` : ""}</span>
          </div>
        </div>`;
    };

    const chip = ocultos.length
      ? `<div class="carril-mas" data-texto="+${ocultos.length} más" title="Clic para ver todos"
          data-tooltip="${encodeURIComponent("También en este horario:\n" + ocultos.map(it => it.tipo === "turno"
            ? `${it.t.hora || horaDe(it.ini)} ${it.t.apellido}, ${it.t.nombre} — ${it.t.estudio}`
            : `${horaDe(it.ini)} ${it.r.apellido_nombre} — ${it.r.practica} (RIS)`).join("\n") + "\n\nClic para verlos todos")}">+${ocultos.length} más</div>`
      : "";

    return `<td${rowspanAttr} class="celda-carriles"${filasOk && Number.isInteger(slot._si) ? ` data-si="${slot._si}"` : ""} data-n="${n}">
      <div class="carriles">${orden.map(it => it.tipo === "turno" ? htmlTurno(it) : htmlRis(it)).join("")}${chip}</div>
    </td>`;
  }

  function _renderSlot(slot, fecha, mins, risDelDia, rowspan = 1) {
    const tipo = slot.tipo || "libre";
    const bg   = slot.color || "#fff";
    const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : "";
    if (tipo === "libre") {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const pasado = f < hoy;
      return pasado
        ? `<td class="slot-pasado" style="background:#fce8e8;cursor:default" title="Fecha pasada"${rowspanAttr}><div class="slot-content"><span class="slot-label" style="color:#e0b0b0;font-size:9px">—</span></div></td>`
        : `<td class="slot-libre" style="background:${bg}" data-fecha="${fecha}" data-mins="${mins}" title="Libre — clic para asignar"${rowspanAttr}><div class="slot-content"><span class="slot-label" style="color:#ccc">+</span></div></td>`;
    }
    if (tipo === "turno") {
      const col  = _coloresOrigen(slot.origen);
      const pres = slot.presente === "Presente" ? "✅" : "";

      // Cruce turno↔RIS (28/8/2026): ya viene resuelto desde el backend
      // (api_agenda_grilla hace el JOIN real contra `estudios` en
      // Postgres) — antes esto matcheaba por DNI del lado del cliente
      // contra slot._risDelDia, una segunda fuente de verdad separada de
      // la que ya usa lista.js para lo mismo.
      const estRIS    = slot.risEstado || "";
      const hoy       = new Date(); hoy.setHours(0,0,0,0);
      const fp        = fecha.split("/");
      const fDate     = new Date(parseInt(fp[2]), parseInt(fp[1])-1, parseInt(fp[0]));
      const pasado    = fDate < hoy;
      const atendido  = estRIS === "Atendido" || estRIS === "Presente";
      const ausente   = estRIS === "Asignado" && pasado;
      const iconRIS   = atendido ? `<span style="color:#2e7d32;font-weight:700;margin-right:2px">✓</span>`
                      : ausente  ? `<span style="color:#c62828;font-weight:700;margin-right:2px">✗</span>`
                      : "";
      // Línea de RIS en el tooltip/"Opciones del turno" (29/8/2026): ver
      // _tipTurno. El resaltado en rojo de "NO ASIGNADO EN RIS" se aplica
      // después, solo donde sí se renderiza como HTML (ver
      // _posTip/mostrarOpcionesTurno).
      // "SIN SOLICITUD DIGITAL" (29/8/2026, a pedido) — checkbox del panel
      // de turno; se guarda en Postgres y se muestra bien visible acá:
      // borde rojo en toda la celda + badge junto al nombre + línea en el
      // tooltip/"Opciones del turno".
      const sinSolicitud = slot.solicitudDigital === false;
      const tip  = _tipTurno(slot);
      // Mismo texto que ve el estado real de RIS (ej. "Asignado") — antes
      // acá solo decía "RIS" genérico, sin decir si ya está confirmado o
      // no en el sistema del hospital.
      const badgeRIS  = estRIS ? `<span style="background:#888;color:#fff;border-radius:3px;padding:0 4px;font-size:7px;font-weight:700;margin-left:2px">${estRIS}</span>` : "";
      const sinSolicitudBadge = sinSolicitud
        ? `<span style="background:#c62828;color:#fff;border-radius:3px;padding:0 4px;font-size:7px;font-weight:700;margin-left:3px">SIN SOLICITUD</span>` : "";

      let horaFinBadge = "";
      if (rowspan > 1) {
        const hasta = slot._hastaUnido || (mins + (slot.duracion || _paso));
        const horaF = String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0");
        horaFinBadge = `<span style="color:${col.text};opacity:.7;font-size:9px;font-weight:700;margin-left:3px">→${horaF}</span>`;
      }

      const dniTexto = slot.dni ? `DNI: ${slot.dni}` : "";

      // Con espacio de sobra (bloque fusionado) mostramos toda la info sin truncar,
      // en vez de esconderla detrás del tooltip al pasar el mouse.
      const contenido = rowspan > 1
        ? `<div class="slot-content slot-content-expandido">
            <span class="slot-nombre" style="color:${col.text}">${iconRIS}${slot.apellido}, ${slot.nombre} ${pres}${horaFinBadge}${ExcepcionPin.badge(slot)}${sinSolicitudBadge}${PedidoPiso.badge(slot)}${_badgeBloqueo(slot)}</span>
            ${dniTexto ? `<span class="slot-detalle" style="color:${col.text}">${dniTexto}</span>` : ""}
            <span class="slot-estudio-full" style="color:${col.text}">${slot.estudio}${badgeRIS}</span>
            ${PedidoPiso.lineaComentario(slot, col.text)}
            ${_lineasMismoPaciente(slot, fecha, col)}
            <span class="slot-origen-badge" style="color:${col.text}">${slot.origen||""}</span>
          </div>`
        : `<div class="slot-content"><span class="slot-nombre" style="color:${col.text}">${iconRIS}${slot.apellido}, ${slot.nombre} ${pres}${ExcepcionPin.badge(slot)}${sinSolicitudBadge}${PedidoPiso.badge(slot)}${_badgeBloqueo(slot)}</span><span class="slot-estudio" style="color:${col.text}">${slot.estudio}${badgeRIS}</span>${_lineasMismoPaciente(slot, fecha, col)}</div>`;

      return `<td class="slot-turno${ExcepcionPin.clase(slot)}" style="background:${bg};border-left:3px solid ${col.border}${sinSolicitud ? ";box-shadow:inset 0 0 0 2px #c62828" : ""}" data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-turno-id="${slot.turnoId||""}" data-tooltip="${encodeURIComponent(tip)}"${rowspanAttr}
        data-fturno="1" data-origen="${slot.origen||""}" data-presente="${slot.presente==="Presente"?"1":"0"}" data-estudio="${(slot.estudio||"").toLowerCase()}"
        >${contenido}</td>`;
    }
    if (tipo === "continuacion") return `<td class="slot-continua" style="background:${bg}"${rowspanAttr}><div class="slot-content"></div></td>`;
    // Franja reservada por origen (ej. Internación 20-22hs): sin RIS
    // encima, antes quedaba como bloqueo mudo sin clic — el único camino
    // para cargar ahí era "Nuevo turno" a mano. Con origen la dejamos
    // clickeable y precargamos ese origen forzado en el panel. La misma
    // franja puede llegar como "franja_origen" o como "bloqueo_rec" (ej.
    // "Solo internados" existe como bloqueo recurrente Y restricción por
    // origen a la vez) — el backend expone `origen` en ambos casos cuando
    // corresponde, así que alcanza con chequear ese campo, no el tipo.
    if ((tipo === "franja_origen" || tipo === "bloqueo_rec") && slot.origen) {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      if (f >= hoy) {
        return `<td class="slot-franja-origen" style="background:${bg};cursor:pointer" data-fecha="${fecha}" data-mins="${mins}" data-origen="${slot.origen}" data-label="${encodeURIComponent(slot.label||"")}" title="${slot.label||""} — clic para asignar con origen preseleccionado"${rowspanAttr}><div class="slot-content"></div></td>`;
      }
    }
    // Franja reservada por código (ej. "Solo sin contraste" SC): clickeable
    // solo si hay al menos un estudio real con ese código — si no (ej.
    // DESCOM, NCX, FRANJA DE NEUROLOGIA: ningún estudio del catálogo usa
    // esos códigos), es un bloqueo total de verdad y no tiene sentido abrir
    // el panel para no encontrar nada para elegir.
    if (tipo === "franja" && slot.codigo) {
      const hayEstudioConEseCodigo = _estudiosConfigCache &&
        Object.values(_estudiosConfigCache).some(c => c.restriccion === slot.codigo);
      if (hayEstudioConEseCodigo) {
        const p = fecha.split("/");
        const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
        f.setHours(0,0,0,0);
        const hoy = new Date(); hoy.setHours(0,0,0,0);
        if (f >= hoy) {
          return `<td class="slot-franja-codigo" style="background:${bg};cursor:pointer" data-fecha="${fecha}" data-mins="${mins}" data-codigo="${slot.codigo}" data-label="${encodeURIComponent(slot.label||"")}" title="${slot.label||""} — clic para asignar con estudios filtrados"${rowspanAttr}><div class="slot-content"></div></td>`;
        }
      }
    }
    // Franja recurrente informativa (bloquea:false, ej. "Internados
    // CEDETAC"): se ve con su color como las demás, pero NO tiene que
    // bloquear la carga — bug encontrado 11/9/2026, esta rama nunca
    // chequeaba `slot.bloquea` y caía siempre en el bloqueo mudo de abajo,
    // aunque el backend (enBloqueoRecurrente/evaluarRestriccionesCodigo)
    // ya la dejaba pasar sin problema si se cargaba por otro camino
    // ("Nuevo turno" a mano). Mismo criterio que franja por origen/código:
    // clickeable, sin precargar nada especial.
    if (tipo === "bloqueo_rec" && slot.bloquea === false) {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      if (f >= hoy) {
        return `<td class="slot-franja-informativa" style="background:${bg};cursor:pointer" data-fecha="${fecha}" data-mins="${mins}" title="${slot.label||""} — informativa, clic para asignar turno"${rowspanAttr}><div class="slot-content"></div></td>`;
      }
    }
    // Compresión visual (27/8/2026, a pedido): franjas/bloqueos/feriados ya
    // no repiten el texto completo en cada celda — solo el color, con el
    // detalle en el title (tooltip nativo al pasar el mouse). La leyenda
    // fija arriba de la grilla sigue mapeando color -> significado.
    return `<td class="slot-bloqueo" style="background:${bg}" title="${slot.label||""}"${rowspanAttr}><div class="slot-content"></div></td>`;
  }

  function _bindSlotClicks(container) {
    // Barre tooltips huérfanos de un render anterior (bug real encontrado
    // 11/9/2026): si el mouse seguía sobre una celda cuando la grilla se
    // reconstruye (ej. clic en "Actualizar" o cambio de semana), ese
    // mouseleave nunca llega — el div .tooltip-turno queda pegado en
    // pantalla para siempre, ya que `tip` de abajo arranca de nuevo en
    // null en cada render y pierde la referencia al viejo.
    document.querySelectorAll(".tooltip-turno").forEach(el => el.remove());

    function _esPasado(fecha) {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      return f < hoy;
    }

    container.querySelectorAll(".slot-franja-origen").forEach(td => {
      td.addEventListener("click", () => {
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        const mins  = parseInt(td.dataset.mins);
        const hora  = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
        const label = td.dataset.label ? decodeURIComponent(td.dataset.label) : "";
        App.abrirTurnoConCondicion(td.dataset.fecha, hora, { origen: td.dataset.origen, label, origenForzado: true });
      });
    });

    container.querySelectorAll(".slot-franja-codigo").forEach(td => {
      td.addEventListener("click", () => {
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        const mins  = parseInt(td.dataset.mins);
        const hora  = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
        const label = td.dataset.label ? decodeURIComponent(td.dataset.label) : "";
        App.abrirTurnoConCondicion(td.dataset.fecha, hora, { codigo: td.dataset.codigo, label });
      });
    });

    container.querySelectorAll(".slot-franja-informativa").forEach(td => {
      td.addEventListener("click", () => {
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        const mins = parseInt(td.dataset.mins);
        App.abrirTurnoConFechaHora(td.dataset.fecha, String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0"));
      });
    });

    container.querySelectorAll(".slot-libre").forEach(td => {
      td.addEventListener("click", () => {
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        const mins = parseInt(td.dataset.mins);
        App.abrirTurnoConFechaHora(td.dataset.fecha,
          String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0"));
      });
    });

    // Clic directo sobre el nombre/horario EXACTO de inicio de un paciente
    // de RIS ya no abre el formulario ahí mismo (28/8/2026, a pedido —
    // evitar cargar un sobreturno pisando exactamente ese horario sin darse
    // cuenta). Para cargar un sobreturno hay que abrir un turno nuevo y usar
    // "Sugerir sobreturno", que aplica los límites configurados. Esto NO
    // aplica a los slots de continuación (".slot-ris-continua", la barra que
    // sigue mostrando la duración estimada del estudio) — esos quedan
    // libres para dar turno normalmente, solo se bloquea el slot puntual.
    container.querySelectorAll(".slot-ris-clickable:not(.slot-ris-continua)").forEach(td => {
      td.addEventListener("click", () => {
        App.toast("Ese horario ya tiene un paciente de RIS — para sobreturno, usá \"Nuevo turno\" → \"Sugerir sobreturno\"", "error");
      });
    });

    container.querySelectorAll(".slot-ris-side").forEach(div => {
      div.addEventListener("click", () => {
        App.toast("Ese horario ya tiene un paciente de RIS — para sobreturno, usá \"Nuevo turno\" → \"Sugerir sobreturno\"", "error");
      });
    });

    // "+N más" en una celda con más de 3 carriles: muestra/oculta el resto.
    container.querySelectorAll(".carril-mas").forEach(el => {
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        const td = el.closest("td");
        const todos = td.classList.toggle("ver-todos");
        el.textContent = todos ? "ver menos" : el.dataset.texto;
      });
    });

    container.querySelectorAll(".slot-ris-continua").forEach(td => {
      td.addEventListener("click", () => {
        const franjaLabel = td.dataset.franjaLabel ? decodeURIComponent(td.dataset.franjaLabel) : "";
        if (/descompres/i.test(franjaLabel)) {
          App.toast(`"${franjaLabel}" — horario bloqueado, no se puede cargar nada ahí`, "error");
          return;
        }
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        const mins = parseInt(td.dataset.mins);
        App.abrirTurnoConFechaHora(td.dataset.fecha,
          String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0"));
      });
    });

    let tip = null;
    container.querySelectorAll("[data-tooltip]").forEach(td => {
      td.addEventListener("mouseenter", e => {
        // Celdas con turnos del mismo paciente adentro (.slot-mismo, también
        // con data-tooltip): al pasar del bloque a una línea no quedan dos
        // tooltips — se reemplaza el que estaba.
        if (tip) { tip.remove(); tip = null; }
        tip = document.createElement("div");
        tip.className = "tooltip-turno";
        tip.innerHTML = decodeURIComponent(td.dataset.tooltip).replace(/\n/g,"<br>")
          .replace("NO ASIGNADO EN RIS", '<span style="color:#e05a5a;font-weight:700">NO ASIGNADO EN RIS</span>')
          .replace("SIN SOLICITUD DIGITAL", '<span style="color:#e05a5a;font-weight:700">SIN SOLICITUD DIGITAL</span>');
        tip.innerHTML = ExcepcionPin.resaltar(PedidoPiso.resaltar(tip.innerHTML));
        document.body.appendChild(tip);
        _posTip(e, tip);
      });
      td.addEventListener("mousemove", e => { if(tip) _posTip(e,tip); });
      td.addEventListener("mouseleave", () => { if(tip){tip.remove();tip=null;} });
      // stopPropagation: el clic en un estudio del mismo paciente (.slot-mismo)
      // abre SU turno y no sigue hasta la celda que lo contiene.
      td.addEventListener("click", ev => { ev.stopPropagation(); if(td.dataset.fila) App.mostrarOpcionesTurno(td.dataset.fila, td.dataset.tooltip, td.dataset.fecha, td.dataset.mins, td.dataset.turnoId); });
    });
  }

  function _posTip(e, el) {
    el.style.left = Math.min(e.clientX+12, window.innerWidth -el.offsetWidth -8)+"px";
    el.style.top  = Math.min(e.clientY+12, window.innerHeight-el.offsetHeight-8)+"px";
  }

// ── VISTA MES ─────────────────────────────────────────────
  function _renderMes(datos, risMes) {
    risMes = risMes || {};
    const container = document.getElementById("agenda-container");
    const resumenMap = {};
    const MIN_I = 7*60, MIN_F = 22*60;

    for (const dia of datos) {
      let libres=0, ocupados=0, bloqueados=0;
      for (const s of dia.slots) {
        if (s.mins < MIN_I || s.mins >= MIN_F) continue;
        if (s.tipo==="libre") libres++;
        else if (s.tipo==="turno") ocupados++;
        else bloqueados++;
      }
      // Recopilar franjas del día
      const franjasDelDia = [];
      const vistasLabels = new Set();
      for (const s of dia.slots) {
        if (s.tipo === "franja" || s.tipo === "franja_origen" || s.tipo === "bloqueo_rec" || s.tipo === "bloqueo") {
          const key = s.label + "|" + s.color;
          if (!vistasLabels.has(key) && s.label) {
            // Encontrar rango horario de esta franja
            const slotsDeEstaFranja = dia.slots.filter(sl =>
              (sl.tipo === "franja" || sl.tipo === "franja_origen" || sl.tipo === "bloqueo_rec" || sl.tipo === "bloqueo") &&
              sl.label === s.label && sl.color === s.color
            );
            const minI = Math.min(...slotsDeEstaFranja.map(sl => sl.mins));
            const minF = Math.max(...slotsDeEstaFranja.map(sl => sl.mins)) + _paso;
            const hI   = String(Math.floor(minI/60)).padStart(2,"0");
            const hF   = String(Math.floor(minF/60)).padStart(2,"0");
            franjasDelDia.push({ label: s.label, color: s.color, horaD: hI, horaH: hF });
            vistasLabels.add(key);
          }
        }
      }
      // cupoLibres viene del backend: casilleros libres recortados por los
      // topes de turnos por franja (lo que realmente se puede cargar).
      if (typeof dia.cupoLibres === "number") libres = dia.cupoLibres;
      resumenMap[dia.fecha] = {
        libres, ocupados, bloqueados,
        esFeriado: dia.esFeriado, feriado: dia.feriado,
        franjas: franjasDelDia
      };
    }

    const año = _mesBase.getFullYear(), mes = _mesBase.getMonth();
    const diasMes = new Date(año, mes+1, 0).getDate();
    let primerDia = new Date(año, mes, 1).getDay();
    primerDia = primerDia===0 ? 6 : primerDia-1;

    const hoyStr = _strFecha(new Date());
    const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
    const DIAS_CORTO = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

    let totalOcup = 0, totalLibres = 0;
    for (const v of Object.values(resumenMap)) {
      if (!v.esFeriado) { totalOcup += v.ocupados; totalLibres += v.libres; }
    }
    const totalRIS = Object.values(risMes).reduce((a,v) => a + v.length, 0);

    // ── Helper: color de barra según ocupación ──
    function _colorBarra(ocupados, libres) {
      const total = ocupados + libres;
      if (total === 0) return "#ccc";
      const pct = ocupados / total;
      if (pct >= 1)    return "#e05555";
      if (pct >= 0.8)  return "#f0c040";
      return "#4a9e5c";
    }

    // ── Helper: color de texto sobre fondo de franja ──
    function _textColorFromBg(hex) {
      if (!hex) return "#555";
      const r = parseInt(hex.slice(1,3),16);
      const g = parseInt(hex.slice(3,5),16);
      const b = parseInt(hex.slice(5,7),16);
      const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
      return lum > 0.6 ? "#555" : "#fff";
    }

    // ── Helper: oscurecer hex para texto ──
    function _darken(hex) {
      if (!hex || hex.length < 7) return "#333";
      const r = Math.max(0, parseInt(hex.slice(1,3),16) - 80);
      const g = Math.max(0, parseInt(hex.slice(3,5),16) - 80);
      const b = Math.max(0, parseInt(hex.slice(5,7),16) - 80);
      return `rgb(${r},${g},${b})`;
    }

    let html = `
    <style>
      .cal-mes-wrap2 { padding: .25rem .5rem .5rem; display:flex; flex-direction:column; height:100%; }
      .cal-mes-table2 { width:100%; border-collapse:collapse; table-layout:fixed; flex:1; }
      .cal-mes-table2 thead th {
        background: var(--navy, #1a3a5c); color:#fff;
        padding:7px 4px; font-size:11px; font-weight:700;
        text-align:center; border-right:1px solid rgba(255,255,255,.15);
        border-radius:0;
      }
      .cal-dia2 {
        border:1px solid #e2e8f0; vertical-align:top; padding:0;
        background:#fff; cursor:pointer;
        height:calc((100vh - 200px) / 6); min-height:90px;
        overflow:hidden; transition:box-shadow .12s;
      }
      .cal-dia2:hover { box-shadow:0 2px 8px rgba(0,0,0,.1); z-index:1; position:relative; }
      .cal-dia2-vacio { background:#f8f9fb; cursor:default; border-color:transparent; }
      .cal-dia2-vacio:hover { box-shadow:none; }
      .cal-dia2-hoy { border:2px solid #1a3a5c !important; }
      .cal-dia2-feriado { background:#fff5f5 !important; }
      .cal-d2-head {
        display:flex; align-items:center; justify-content:space-between;
        padding:4px 7px 3px; border-bottom:1px solid #e8edf3;
        background:#f4f7fb;
      }
      .cal-dia2-feriado .cal-d2-head { background:#fff0f0; border-bottom-color:#f0c0c0; }
      .cal-dia2-hoy .cal-d2-head { background:#e8f0fb; border-bottom-color:#b0c8e8; }
      .cal-d2-num { font-size:13px; font-weight:800; color:#1a3a5c; line-height:1; }
      .cal-d2-num-hoy {
        background:#1a3a5c; color:#fff;
        width:22px; height:22px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; font-size:11px;
      }
      .cal-d2-dow { font-size:9px; font-weight:700; color:#aaa; letter-spacing:.05em; text-transform:uppercase; }
      .cal-dia2-hoy .cal-d2-dow { color:#1a3a5c; }
      .cal-d2-body { padding:4px 6px 5px; display:flex; flex-direction:column; gap:3px; }
      .cal-franjas2 { display:flex; flex-wrap:wrap; gap:2px; }
      .franja-pill2 {
        font-size:8px; font-weight:700; padding:1px 5px 1px 4px;
        border-radius:3px; white-space:nowrap; line-height:1.5;
        display:flex; align-items:center; gap:2px;
      }
      .cal-ocup-wrap { margin-top:2px; }
      .cal-ocup-bar { height:6px; border-radius:3px; background:#e2e8f0; overflow:hidden; margin-bottom:3px; }
      .cal-ocup-fill { height:100%; border-radius:3px; }
      .cal-ocup-nums { display:flex; align-items:center; gap:6px; }
      .cal-ocup-turnos { font-size:10px; font-weight:700; color:#1a3a5c; }
      .cal-ocup-libres { font-size:9px; color:#888; }
      .cal-ocup-ris { font-size:9px; color:#888; }
      .cal-feriado-lbl { font-size:9px; color:#c05050; font-weight:600; margin-top:2px; }
      .cal-pie2 {
        display:flex; gap:1rem; align-items:center;
        padding:.5rem 0 .2rem; font-size:12px; font-weight:600;
        border-top:1px solid #e2e8f0; margin-top:.4rem;
        flex-wrap:wrap;
      }
    </style>
    <div class="cal-mes-wrap2">
      <table class="cal-mes-table2">
        <thead><tr>`;

    for (const d of DIAS) html += `<th>${d}</th>`;
    html += `</tr></thead><tbody><tr>`;

    for (let i=0; i<primerDia; i++) html += `<td class="cal-dia2 cal-dia2-vacio"></td>`;

    let col = primerDia;
    for (let dia=1; dia<=diasMes; dia++) {
      const fechaDate = new Date(año, mes, dia);
      const fechaStr  = _strFecha(fechaDate);
      const res       = resumenMap[fechaStr];
      const esHoy     = fechaStr === hoyStr;
      const esDom     = fechaDate.getDay() === 0;
      const dowLabel  = DIAS_CORTO[fechaDate.getDay()];

      let cls = "cal-dia2";
      if (esHoy)            cls += " cal-dia2-hoy";
      if (res?.esFeriado)   cls += " cal-dia2-feriado";

      let contenido = "";

      const numHtml = esHoy
        ? `<div class="cal-d2-num cal-d2-num-hoy">${dia}</div>`
        : `<span class="cal-d2-num">${dia}</span>`;

      const head = `<div class="cal-d2-head">${numHtml}<span class="cal-d2-dow">${dowLabel}</span></div>`;

      if (!res) {
        contenido = head;
      } else if (res.esFeriado) {
        contenido = `${head}
          <div class="cal-d2-body">
            <div class="cal-feriado-lbl">🚫 ${res.feriado||"Feriado"}</div>
          </div>`;
      } else {
        const total     = res.libres + res.ocupados;
        const barW      = total > 0 ? Math.min(100, Math.round((res.ocupados / total) * 100)) : 100;
        const barColor  = _colorBarra(res.ocupados, res.libres);
        const risDelDia = (risMes[fechaStr] || []).length;

        // Pills de franjas con horario
        const franjasHtml = res.franjas.length > 0
          ? `<div class="cal-franjas2">${res.franjas.map(f => {
              const bg   = f.color || "#ccc";
              const txt  = _darken(bg);
              const short = f.label
                .replace("Franja Exclusiva ","")
                .replace("Solo mamarias Santojanni","Mama")
                .replace("Internados CEDETAC","Cedetac")
                .replace("Solo internados","Internados")
                .replace("Mantenimiento","Mant.");
              return `<span class="franja-pill2" style="background:${bg}33;color:${txt};border:1px solid ${bg}88">
                ${short} <span style="opacity:.7;font-weight:500">${f.horaD}-${f.horaH}</span>
              </span>`;
            }).join("")}</div>`
          : "";

        const libresLabel = res.libres <= 0 ? `<span style="color:#e05555;font-size:9px;font-weight:700">lleno</span>`
                          : `<span class="cal-ocup-libres">▲ ${res.libres} libres</span>`;

        contenido = `${head}
          <div class="cal-d2-body">
            ${franjasHtml}
            <div class="cal-ocup-wrap">
              <div class="cal-ocup-bar">
                <div class="cal-ocup-fill" style="width:${barW}%;background:${barColor}"></div>
              </div>
              <div class="cal-ocup-nums">
                <span class="cal-ocup-turnos">● ${res.ocupados}</span>
                ${libresLabel}
                ${risDelDia > 0 ? `<span class="cal-ocup-ris">📋 ${risDelDia}</span>` : ""}
              </div>
            </div>
          </div>`;
      }

      html += `<td class="${cls}" data-fecha="${fechaStr}" title="${fechaStr}">${contenido}</td>`;
      col++;
      if (col===7 && dia<diasMes) { html += `</tr><tr>`; col=0; }
    }

    const resto = col===0 ? 0 : 7-col;
    for (let i=0; i<resto; i++) html += `<td class="cal-dia2 cal-dia2-vacio"></td>`;

    html += `</tr></tbody></table>
      <div class="cal-pie2">
        <span style="color:#2e7d32">▲ ${totalLibres} libres en el mes</span>
        <span style="color:#999">·</span>
        <span style="color:#1a3a5c">● ${totalOcup} turnos asignados</span>
        <span style="color:#999">·</span>
        <span style="color:#888">promedio diario: ${Math.round(totalOcup / diasMes)}</span>
        ${totalRIS > 0 ? `<span style="color:#999">·</span><span style="color:#888">📋 ${totalRIS} RIS</span>` : ""}
      </div>
    </div>`;

    container.innerHTML = html;

    container.querySelectorAll(".cal-dia2[data-fecha]").forEach(td => {
      td.addEventListener("click", () => { App.irAListaDia(td.dataset.fecha); });
    });
  }

  function _setModo(modo) {
    _modo = modo;
    document.getElementById("btn-modo-semana").classList.toggle("modo-activo", modo==="semana");
    document.getElementById("btn-modo-mes").classList.toggle("modo-activo",    modo==="mes");
    document.getElementById("ctrl-semana").classList.toggle("hidden", modo!=="semana");
    document.getElementById("ctrl-mes").classList.toggle("hidden",    modo!=="mes");
    document.getElementById("agenda-filtros").classList.toggle("hidden", modo!=="semana");
    document.getElementById("agenda-leyenda").classList.toggle("hidden", modo!=="semana");
    if (modo==="semana") _cargarSemana(); else _cargarMes();
  }

  async function _cargarSemana(forzar = false) {
    const loading = document.getElementById("agenda-loading");
    document.getElementById("agenda-rango-label").textContent = _labelRango();
    loading.classList.remove("hidden");
    try {
      const desde    = _strFecha(_fechaDesde);
      const cacheKey = `agenda_sem_${desde}_${_paso}`;
      const cached   = forzar ? null : sessionStorage.getItem(cacheKey);

      let datos, risMap, cardioMap;
      if (!_estudiosConfigCache || forzar) { // "Actualizar" también trae cambios de Config
        try { const cfg = await RailwayAPI.obtenerAgendaConfig(); _estudiosConfigCache = cfg.estudios || {}; } catch(_) {}
      }
      if (cached) {
        ({ datos, risMap, cardioMap } = JSON.parse(cached));
      } else {
        [datos, risMap, cardioMap] = await Promise.all([
          RailwayAPI.agenda(desde, 7, _paso),
          RailwayAPI.leerRISRango(desde, 7).catch(() => ({})),
          RailwayAPI.leerCardiologia(desde, 7).catch(() => ({}))
        ]);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ datos, risMap, cardioMap })); } catch(_) {}
      }
      await _cargarDuracionesRIS(risMap);
      _renderSemana(datos, risMap, cardioMap);
    }
    catch (err) { App.toast("Error: "+err.message,"error"); }
    finally     { loading.classList.add("hidden"); }
  }

  async function _cargarMes(forzar = false) {
    const loading = document.getElementById("agenda-loading");
    document.getElementById("agenda-mes-label").textContent = _labelMes();
    loading.classList.remove("hidden");
    try {
      const año = _mesBase.getFullYear(), mes = _mesBase.getMonth();
      const p   = new Date(año, mes, 1);
      const dow = p.getDay();
      const lunes = new Date(p);
      lunes.setDate(p.getDate()-(dow===0?6:dow-1));
      const desde    = _strFecha(lunes);
      const cacheKey = `agenda_mes_v2_${desde}_${_paso}`;
      const cached   = forzar ? null : sessionStorage.getItem(cacheKey);

      let datosMes, risMes;
      if (cached) {
        ({ datosMes, risMes } = JSON.parse(cached));
      } else {
        [datosMes, risMes] = await Promise.all([
          RailwayAPI.agenda(desde, 42, _paso),
          RailwayAPI.leerRISRango(desde, 42).catch(() => ({}))
        ]);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ datosMes, risMes })); } catch(_) {}
      }
      _renderMes(datosMes, risMes);
    } catch(err) { App.toast("Error: "+err.message,"error"); }
    finally      { loading.classList.add("hidden"); }
  }

  function cargar(forzar = false) { if(_modo==="semana") _cargarSemana(forzar); else _cargarMes(forzar); }

  function init() {
    _renderLeyenda();
    _renderFiltros();
    document.getElementById("btn-semana-ant").onclick = () => { _fechaDesde.setDate(_fechaDesde.getDate()-7); _cargarSemana(); };
    document.getElementById("btn-semana-sig").onclick = () => { _fechaDesde.setDate(_fechaDesde.getDate()+7); _cargarSemana(); };
    document.getElementById("btn-semana-hoy").onclick = () => { _fechaDesde = _lunesDeHoy(); _cargarSemana(); };
    document.getElementById("btn-semana-lun").onclick = () => { _fechaDesde = _lunesDe(_proximoDiaSemana(1)); _cargarSemana(); };
    document.getElementById("btn-semana-vie").onclick = () => { _fechaDesde = _lunesDe(_proximoDiaSemana(5)); _cargarSemana(); };
    document.getElementById("agenda-paso").onchange   = e => { _paso = parseInt(e.target.value); cargar(); };
    document.getElementById("agenda-rango-label").textContent = _labelRango();

    document.getElementById("btn-mes-ant").onclick = () => { _mesBase = _primeroDeMes(new Date(_mesBase.getFullYear(),_mesBase.getMonth()-1,1)); _cargarMes(); };
    document.getElementById("btn-mes-sig").onclick = () => { _mesBase = _primeroDeMes(new Date(_mesBase.getFullYear(),_mesBase.getMonth()+1,1)); _cargarMes(); };
    document.getElementById("btn-mes-hoy").onclick = () => { _mesBase = _primeroDeMes(new Date()); _cargarMes(); };

    document.getElementById("btn-modo-semana").onclick = () => _setModo("semana");
    document.getElementById("btn-modo-mes").onclick    = () => _setModo("mes");

    document.getElementById("btn-agenda-panorama").onclick = () => PanoramaSemanal.abrirModal();
  }

  return { init, cargar };
})();
