// js/views/agenda.js — Vista de grilla semanal + calendario mensual (administrativo)

const AgendaView = (() => {
  let _modo       = "semana";
  let _fechaDesde = _lunesDeHoy();
  let _mesBase    = _primeroDeMes(new Date());
   let _paso              = 20;
  let _estudiosConfigCache = null;

  // ── Calcular duración real de práctica RIS (Config − 10 min) ──
  function _duracionRIS(practica) {
    if (!_estudiosConfigCache || !practica) return 20;
    // Normalizar texto para comparación
    function norm(s) {
      return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/\bgado\b/g,"contraste")
        .replace(/contaste/g,"contraste")
        .replace(/\bcolangiografia por resonancia magnetica\b/,"colangiorresonancia")
        .replace(/\bmacizo craneo facial\b/,"macizo craneofacial")
        .replace(/\bsacro iliacas\b/,"sacroiliacas")
        .replace(/\bambas rodillas\b/,"rodilla ambas")
        .replace(/\bambos hombros\b/,"hombro ambos")
        .replace(/\bambas manos\b/,"mano ambas")
        .replace(/\bambas caderas\b/,"cadera ambas")
        .replace(/\borbitas oculares\b/,"orbitas")
        .replace(/\bvasos de cuello\b/,"angiorresonancia de vasos")
        .replace(/\bresonancia dinamica de pelvis\b/,"pelvis")
        .replace(/\bprostatica\b/,"prostatica")
        .replace(/\bcerebro con protocolo epilepsia\b/,"cerebro protocolo epilepsia")
        .replace(/\bhipofisis\b/,"hipofisis")
        .replace(/\s+/g," ").trim();
    }
    // Separar prácticas múltiples por " · "
    const partes = practica.split(/\s*·\s*/);
    let total = 0;
    for (const parte of partes) {
      const pNorm = norm(parte);
      let dur = 0;
      // 1. Exact match normalizado
      for (const [nombre, cfg] of Object.entries(_estudiosConfigCache)) {
        if (norm(nombre) === pNorm) { dur = cfg.duracion; break; }
      }
      // 2. Config contiene todas las palabras clave de la práctica RIS
      if (!dur) {
        const palabras = pNorm.split(" ").filter(w => w.length > 3);
        for (const [nombre, cfg] of Object.entries(_estudiosConfigCache)) {
          const nNorm = norm(nombre);
          if (palabras.length > 0 && palabras.every(w => nNorm.includes(w))) {
            dur = cfg.duracion; break;
          }
        }
      }
      // 3. Primera palabra clave principal matchea
      if (!dur) {
        const primera = pNorm.split(" ")[0];
        for (const [nombre, cfg] of Object.entries(_estudiosConfigCache)) {
          if (norm(nombre).startsWith(primera)) { dur = cfg.duracion; break; }
        }
      }
      // 4. Fallback
      total += (dur || 30) - 10;
    }
    return Math.max(total, 10);
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
    };
    return m[(o||"").toUpperCase()] || { bg: "#e8a09a", text: "#7a1f35", border: "#c9506a" };
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
    const activosPorCol  = new Array(datos.length).fill(null); // { slot, hasta }
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

        // Actualizar turno activo
        if (s && s.tipo === "turno") {
          activosPorCol[di] = { slot: s, hasta: mins + (s.duracion || _paso) };
        } else if (activosPorCol[di] && mins >= activosPorCol[di].hasta) {
          activosPorCol[di] = null;
        }

        // RIS: buscar el que empieza exactamente en este slot (rm >= mins && rm < nextMins)
        const dniAgenda   = new Set((dia.slots||[]).filter(sl=>sl.dni).map(sl=>String(sl.dni).trim().replace(/^0+/,"")));
        const apellAgenda = new Set((dia.slots||[]).filter(sl=>sl.apellido).map(sl=>sl.apellido.trim().toUpperCase()));
        // Excluir RIS que ya están en la agenda cardiológica del día
        const dniCardio = new Set((cardioMap[dia.fecha]||[]).map(c => String(c.dni||"").trim().replace(/^0+/,"")));
        const risNuevo = (risMap[dia.fecha]||[]).find(r => {
          const rm = typeof r.mins==="number" ? r.mins : parsearMinsJS(r.hora);
          if (rm < mins || rm >= nextMins) return false;
          const dniRIS   = String(r.documento||"").replace(/[A-Za-z]+\s*/,"").trim().replace(/^0+/,"");
          const apellRIS = String(r.apellido_nombre||"").split(",")[0].trim().toUpperCase();
          if (dniAgenda.has(dniRIS) || apellAgenda.has(apellRIS)) return false;
          if (dniCardio.has(dniRIS)) return false; // ya aparece en franja cardio
          return true;
        });

        // Si hay RIS nuevo → registrar activo, marcar como NO mostrado aún
        if (risNuevo) {
          const dur = _duracionRIS(risNuevo.practica);
          risActivoCol[di] = { ris: risNuevo, hasta: risNuevo.mins + dur, mostrado: false };
        } else if (risActivoCol[di] && mins >= risActivoCol[di].hasta) {
          risActivoCol[di] = null;
        }

        // ¿Es continuación de turno propio?
        const esContinuacion = s && s.tipo === "continuacion";
        const activoEnSlot   = !esContinuacion && activosPorCol[di] &&
                               (!s || s.tipo === "libre") && mins < activosPorCol[di].hasta;

        // ¿Es continuación de RIS? solo si ya se mostró la primera vez y no hay RIS nuevo
        const risActivo       = risActivoCol[di];
        const risContinuacion = !esContinuacion && !activoEnSlot && !risNuevo &&
                                risActivo && risActivo.mostrado && mins < risActivo.hasta;

        if (esContinuacion || activoEnSlot) {
          // Continuación de turno propio — barra de color, clickeable
          const act = activosPorCol[di] ? activosPorCol[di].slot : null;
          const col = act ? _coloresOrigen(act.origen) : { bg:"#f0f0f0", border:"#ddd" };
          const _hasta  = activosPorCol[di] ? activosPorCol[di].hasta : mins + _paso;
          const _horaF  = String(Math.floor(_hasta/60)).padStart(2,"0")+":"+String(_hasta%60).padStart(2,"0");
          const nombreCont  = act ? `${act.apellido}, ${act.nombre}` : "";
          const estudioCont = act ? act.estudio : "";
          html += `<td class="slot-continua slot-libre"
            style="background:${col.bg}22;border-left:3px solid ${col.border};padding:2px 5px;cursor:pointer"
            data-fecha="${dia.fecha}" data-mins="${mins}" title="${nombreCont} — hasta ${_horaF} — clic para sobreturno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none;gap:4px">
              <div style="flex:1;overflow:hidden;min-width:0">
                ${nombreCont
                  ? `<div style="font-size:10px;font-weight:600;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nombreCont}</div>
                     <div style="font-size:9px;color:${col.text}99;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${estudioCont}</div>`
                  : `<div style="height:1px;flex:1;background:${col.border}44;border-top:1px solid ${col.border}33"></div>`}
              </div>
              <span style="color:${col.border};font-size:8px;font-weight:700;padding:0 2px;flex-shrink:0">→${_horaF}</span>
            </div></td>`;
        } else if (risContinuacion) {
          const r     = risActivo.ris;
          const hasta = risActivo.hasta;
          const horaF = String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0");
          html += `<td class="slot-ris-clickable"
            style="background:#f4f4f4;border-left:2px dashed #bbb;border:1px solid #ebebeb;cursor:pointer;padding:0 6px"
            data-fecha="${dia.fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(r.practica)}"
            title="${r.apellido_nombre} · ${r.practica} — hasta ${horaF} — clic para sobreturno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none">
              <div style="height:1px;flex:1;background:#bbb;border-top:1px dashed #ccc"></div>
              <span style="color:#999;font-size:8px;font-weight:700;padding:0 4px;flex-shrink:0">→${horaF}</span>
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
            const renderRIS = cardioRender.length > 0 ? cardioRender : (risNuevo ? [risNuevo] : []);
            html += _renderCeldaCombinada(s, renderRIS, dia.fecha, mins, risMap[dia.fecha] || []);
          }
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
    _bindSlotClicks(container);
  }

  // ── Celda combinada: turno propio + RIS en la misma fila ──
  function _renderCeldaCombinada(slot, risSlot, fecha, mins, risDelDia) {
    const tipo    = slot ? slot.tipo || "libre" : "libre";
    const tieneRIS = risSlot && risSlot.length > 0;
    const ris      = tieneRIS ? risSlot[0] : null;

    // Si hay turno propio + RIS → celda dividida side by side
    if (tipo === "turno" && tieneRIS) {
      const col = _coloresOrigen(slot.origen);
      const pres = slot.presente === "Presente" ? "✅" : "";
      const tip  = `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${slot.observaciones?"\n📝 "+slot.observaciones:""}`;
      return `<td style="padding:0;border:1px solid #e4e8ee;height:36px">
        <div style="display:flex;height:100%;gap:1px">
          <div class="slot-turno slot-content" style="flex:1;background:${slot.color||"#a8d5a2"};border-left:3px solid ${col.border};cursor:pointer;overflow:hidden"
            data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-tooltip="${encodeURIComponent(tip)}">
            <span class="slot-nombre" style="color:${col.text}">${slot.apellido}, ${slot.nombre} ${pres}</span>
            <span class="slot-estudio" style="color:${col.text}">${slot.estudio}</span>
          </div>
          <div class="slot-ris-side slot-content" style="flex:1;background:#f0f0f0;border-left:2px dashed #bbb;cursor:pointer;overflow:hidden"
            data-fecha="${fecha}" data-mins="${mins}" data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}" data-ris-practica="${encodeURIComponent(ris.practica)}"
            title="RIS: ${ris.apellido_nombre} — ${ris.practica}\nClic para asignar sobreturno">
            <span class="slot-nombre" style="color:#888;font-style:italic;font-size:10px">${ris.apellido_nombre}</span>
            <span class="slot-estudio" style="color:#aaa;font-size:9px">${ris.practica} <span style="background:#ddd;color:#777;border-radius:3px;padding:0 3px;font-size:8px">RIS</span></span>
          </div>
        </div>
      </td>`;
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

    // Si hay RIS en slot de franja o bloqueo → celda dividida: franja izq | RIS der
    if (tieneRIS && !cardioSlot && slot && (tipo === "franja" || tipo === "franja_origen" || tipo === "bloqueo_rec" || tipo === "bloqueo")) {
      const bg      = slot.color || "#ccc";
      const label   = slot.label || tipo;
      const risBg   = bg + "33";
      const risBord = bg + "88";
      // Badge de estado RIS
      const estadoRIS = ris.estado || "";
      const estadoBadge = estadoRIS
        ? `<span style="background:${risBord};color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${estadoRIS}</span>`
        : "";
      return `<td style="padding:0;border:1px solid #e4e8ee;height:36px">
        <div style="display:flex;height:100%;gap:1px">
          <div class="slot-content" style="flex:1;background:${bg};overflow:hidden">
            <span class="slot-label" style="font-size:10px;font-weight:600">${label}</span>
          </div>
          <div class="slot-ris-side slot-content" style="flex:1;background:${risBg};border-left:2px dashed ${risBord};cursor:pointer;overflow:hidden"
            data-fecha="${fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(ris.practica)}"
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
    return _renderSlot(slot, fecha, mins, risDelDia || []);
  }

  function _renderSlot(slot, fecha, mins, risDelDia) {
    slot._risDelDia = risDelDia || [];
    const tipo = slot.tipo || "libre";
    const bg   = slot.color || "#fff";
    if (tipo === "libre") {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const pasado = f < hoy;
      return pasado
        ? `<td class="slot-pasado" style="background:#fce8e8;cursor:default" title="Fecha pasada"><div class="slot-content"><span class="slot-label" style="color:#e0b0b0;font-size:9px">—</span></div></td>`
        : `<td class="slot-libre" style="background:${bg}" data-fecha="${fecha}" data-mins="${mins}" title="Libre — clic para asignar"><div class="slot-content"><span class="slot-label" style="color:#ccc">+</span></div></td>`;
    }
    if (tipo === "turno") {
      const col  = _coloresOrigen(slot.origen);
      const pres = slot.presente === "Presente" ? "✅" : "";
      const tip  = `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${slot.observaciones?"\n📝 "+slot.observaciones:""}${pres?"\n✅ Presente":""}`;

      // Buscar en RIS por DNI para mostrar estado y badge
      const dniLimpio = String(slot.dni||"").trim().replace(/^0+/,"");
      const risMatch  = (slot._risDelDia||[]).find(r => {
        const dniR = String(r.documento||"").replace(/[A-Za-z]+/,"").trim().replace(/^0+/,"");
        return dniR === dniLimpio;
      });
      const estRIS    = risMatch ? (risMatch.estado||"") : "";
      const hoy       = new Date(); hoy.setHours(0,0,0,0);
      const fp        = fecha.split("/");
      const fDate     = new Date(parseInt(fp[2]), parseInt(fp[1])-1, parseInt(fp[0]));
      const pasado    = fDate < hoy;
      const atendido  = estRIS === "Atendido" || estRIS === "Presente";
      const ausente   = estRIS === "Asignado" && pasado;
      const iconRIS   = atendido ? `<span style="color:#2e7d32;font-weight:700;margin-right:2px">✓</span>`
                      : ausente  ? `<span style="color:#c62828;font-weight:700;margin-right:2px">✗</span>`
                      : "";
      const badgeRIS  = risMatch ? `<span style="background:#888;color:#fff;border-radius:3px;padding:0 2px;font-size:8px;font-weight:700;margin-left:2px">RIS</span>` : "";

      return `<td class="slot-turno" style="background:${bg};border-left:3px solid ${col.border}" data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-tooltip="${encodeURIComponent(tip)}"><div class="slot-content"><span class="slot-nombre" style="color:${col.text}">${iconRIS}${slot.apellido}, ${slot.nombre} ${pres}</span><span class="slot-estudio" style="color:${col.text}">${slot.estudio}${badgeRIS}</span></div></td>`;
    }
    if (tipo === "continuacion") return `<td class="slot-continua" style="background:${bg}"><div class="slot-content"></div></td>`;
    return `<td class="slot-bloqueo" style="background:${bg}"><div class="slot-content"><span class="slot-label">${slot.label||""}</span></div></td>`;
  }

  function _bindSlotClicks(container) {
    function _esPasado(fecha) {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      return f < hoy;
    }

    container.querySelectorAll(".slot-libre").forEach(td => {
      td.addEventListener("click", () => {
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        const mins = parseInt(td.dataset.mins);
        App.abrirTurnoConFechaHora(td.dataset.fecha,
          String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0"));
      });
    });

    container.querySelectorAll(".slot-ris-clickable").forEach(td => {
      td.addEventListener("click", () => {
        const mins     = parseInt(td.dataset.mins);
        const nombre   = decodeURIComponent(td.dataset.risNombre || "");
        const practica = decodeURIComponent(td.dataset.risPractica || "");
        const hora     = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
        if (_esPasado(td.dataset.fecha)) { App.toast("No se puede asignar en fechas pasadas", "error"); return; }
        App.abrirTurnoConRIS(td.dataset.fecha, hora, nombre, practica);
      });
    });

    container.querySelectorAll(".slot-ris-side").forEach(div => {
      div.addEventListener("click", () => {
        const mins     = parseInt(div.dataset.mins);
        const nombre   = decodeURIComponent(div.dataset.risNombre || "");
        const practica = decodeURIComponent(div.dataset.risPractica || "");
        const hora     = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
        App.abrirTurnoConRIS(div.dataset.fecha, hora, nombre, practica);
      });
    });

    let tip = null;
    container.querySelectorAll("[data-tooltip]").forEach(td => {
      td.addEventListener("mouseenter", e => {
        tip = document.createElement("div");
        tip.className = "tooltip-turno";
        tip.innerHTML = decodeURIComponent(td.dataset.tooltip).replace(/\n/g,"<br>");
        document.body.appendChild(tip);
        _posTip(e, tip);
      });
      td.addEventListener("mousemove", e => { if(tip) _posTip(e,tip); });
      td.addEventListener("mouseleave", () => { if(tip){tip.remove();tip=null;} });
      td.addEventListener("click", () => { if(td.dataset.fila) App.mostrarOpcionesTurno(td.dataset.fila, td.dataset.tooltip); });
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
    const PROMEDIO = 32;

    // ── Helper: color de barra según ocupación ──
    function _colorBarra(ocupados, libres) {
      const total = ocupados + libres;
      if (total === 0) return "#ccc";
      const pct = ocupados / PROMEDIO;
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
        const barW      = Math.min(100, Math.round((res.ocupados / PROMEDIO) * 100));
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
    if (modo==="semana") _cargarSemana(); else _cargarMes();
  }

  async function _cargarSemana() {
    const loading = document.getElementById("agenda-loading");
    document.getElementById("agenda-rango-label").textContent = _labelRango();
    loading.classList.remove("hidden");
    try {
      const desde    = _strFecha(_fechaDesde);
      const cacheKey = `agenda_sem_${desde}_${_paso}`;
      const cached   = sessionStorage.getItem(cacheKey);

      let datos, risMap, cardioMap;
      if (!_estudiosConfigCache) {
        try { const cfg = await API.config(); _estudiosConfigCache = cfg.estudios || {}; } catch(_) {}
      }
      if (cached) {
        ({ datos, risMap, cardioMap } = JSON.parse(cached));
      } else {
        [datos, risMap, cardioMap] = await Promise.all([
          API.agenda(desde, 7, _paso),
          API.leerRISRango(desde, 7).catch(() => ({})),
          API.leerCardiologia(desde, 7).catch(() => ({}))
        ]);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ datos, risMap, cardioMap })); } catch(_) {}
      }
      _renderSemana(datos, risMap, cardioMap);
    }
    catch (err) { App.toast("Error: "+err.message,"error"); }
    finally     { loading.classList.add("hidden"); }
  }

  async function _cargarMes() {
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
      const cacheKey = `agenda_mes_${desde}_${_paso}`;
      const cached   = sessionStorage.getItem(cacheKey);

      let datosMes, risMes;
      if (cached) {
        ({ datosMes, risMes } = JSON.parse(cached));
      } else {
        [datosMes, risMes] = await Promise.all([
          API.agenda(desde, 42, _paso),
          API.leerRISRango(desde, 42).catch(() => ({}))
        ]);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ datosMes, risMes })); } catch(_) {}
      }
      _renderMes(datosMes, risMes);
    } catch(err) { App.toast("Error: "+err.message,"error"); }
    finally      { loading.classList.add("hidden"); }
  }

  function cargar() { if(_modo==="semana") _cargarSemana(); else _cargarMes(); }

  function init() {
    document.getElementById("btn-semana-ant").onclick = () => { _fechaDesde.setDate(_fechaDesde.getDate()-7); _cargarSemana(); };
    document.getElementById("btn-semana-sig").onclick = () => { _fechaDesde.setDate(_fechaDesde.getDate()+7); _cargarSemana(); };
    document.getElementById("agenda-paso").onchange   = e => { _paso = parseInt(e.target.value); cargar(); };
    document.getElementById("agenda-rango-label").textContent = _labelRango();

    document.getElementById("btn-mes-ant").onclick = () => { _mesBase = _primeroDeMes(new Date(_mesBase.getFullYear(),_mesBase.getMonth()-1,1)); _cargarMes(); };
    document.getElementById("btn-mes-sig").onclick = () => { _mesBase = _primeroDeMes(new Date(_mesBase.getFullYear(),_mesBase.getMonth()+1,1)); _cargarMes(); };
    document.getElementById("btn-mes-hoy").onclick = () => { _mesBase = _primeroDeMes(new Date()); _cargarMes(); };

    document.getElementById("btn-modo-semana").onclick = () => _setModo("semana");
    document.getElementById("btn-modo-mes").onclick    = () => _setModo("mes");
  }

  return { init, cargar };
})();