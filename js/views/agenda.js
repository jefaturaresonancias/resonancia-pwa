// js/views/agenda.js — Vista de grilla semanal + calendario mensual (administrativo)

const AgendaView = (() => {
  let _modo       = "semana";
  let _fechaDesde = _lunesDeHoy();
  let _mesBase    = _primeroDeMes(new Date());
  let _paso       = 40;

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
    const container = document.getElementById("agenda-container");
    if (!datos || !datos.length) { container.innerHTML = '<div class="empty-state">Sin datos.</div>'; return; }

    const MIN_I = 0, MIN_F = 24*60;
    const slotsBase = datos[0].slots.filter(s => s.mins >= MIN_I && s.mins < MIN_F).map(s => s.mins);
    const slotsSet  = new Set(slotsBase);

    for (const dia of datos) {
      for (const s of dia.slots) {
        if (s.tipo === "turno" && s.mins >= MIN_I && s.mins < MIN_F && !slotsSet.has(s.mins)) {
          slotsSet.add(s.mins);
        }
      }
      for (const r of (risMap[dia.fecha] || [])) {
        const rm = typeof r.mins === "number" ? r.mins : parsearMinsJS(r.hora);
        if (rm >= MIN_I && rm < MIN_F && !slotsSet.has(rm)) slotsSet.add(rm);
      }
    }
    const slots = Array.from(slotsSet).sort((a,b) => a-b);

    let html = '<table class="agenda-table"><thead><tr><th class="col-hora">Hora</th>';
    for (const d of datos) html += `<th class="${d.esFeriado?"feriado-col":""}">${d.label}${d.esFeriado?" 🚫":""}</th>`;
    html += "</tr></thead><tbody>";

    const activosPorCol   = new Array(datos.length).fill(null);
    const risActivoCol    = new Array(datos.length).fill(null);
    const cardioActivoCol = new Array(datos.length).fill(null);

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
          activosPorCol[di] = { slot: s, hasta: mins + (s.duracion || _paso), mostroContinua: false };
        } else if (activosPorCol[di] && mins >= activosPorCol[di].hasta) {
          activosPorCol[di] = null;
        }

        // RIS
        const dniAgenda   = new Set((dia.slots||[]).filter(sl=>sl.dni).map(sl=>String(sl.dni).trim().replace(/^0+/,"")));
        const apellAgenda = new Set((dia.slots||[]).filter(sl=>sl.apellido).map(sl=>sl.apellido.trim().toUpperCase()));
        const dniCardio   = new Set((cardioMap[dia.fecha]||[]).map(c => String(c.dni||"").trim().replace(/^0+/,"")));
        const risNuevo = (risMap[dia.fecha]||[]).find(r => {
          const rm = typeof r.mins==="number" ? r.mins : parsearMinsJS(r.hora);
          if (rm < mins || rm >= nextMins) return false;
          const dniRIS   = String(r.documento||"").replace(/[A-Za-z]+\s*/,"").trim().replace(/^0+/,"");
          const apellRIS = String(r.apellido_nombre||"").split(",")[0].trim().toUpperCase();
          if (dniAgenda.has(dniRIS) || apellAgenda.has(apellRIS)) return false;
          if (dniCardio.has(dniRIS)) return false;
          return true;
        });

        if (risNuevo) {
          const dur = (risNuevo.duracion && risNuevo.duracion > 0) ? risNuevo.duracion : _paso;
          risActivoCol[di] = { ris: risNuevo, hasta: risNuevo.mins + dur, mostrado: false };
        } else if (risActivoCol[di] && mins >= risActivoCol[di].hasta) {
          risActivoCol[di] = null;
        }

        const esContinuacion = s && s.tipo === "continuacion";
        const activoEnSlot   = !esContinuacion && activosPorCol[di] &&
                               (!s || s.tipo === "libre") && mins < activosPorCol[di].hasta;
        const risActivo       = risActivoCol[di];
        const risContinuacion = !esContinuacion && !activoEnSlot && !risNuevo &&
                                risActivo && risActivo.mostrado && mins < risActivo.hasta;

        if (esContinuacion || activoEnSlot) {
          const act    = activosPorCol[di] ? activosPorCol[di].slot : null;
          const col    = act ? _coloresOrigen(act.origen) : { bg:"#f0f0f0", border:"#ddd", text:"#666" };
          const hasta  = activosPorCol[di] ? activosPorCol[di].hasta : mins + _paso;
          const horaF  = String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0");
          const esFirst  = activosPorCol[di] && !activosPorCol[di].mostroContinua;
          const esSecond = activosPorCol[di] && activosPorCol[di].mostroContinua && !activosPorCol[di].mostroEstudio;
          if (esFirst  && activosPorCol[di]) { activosPorCol[di].mostroContinua = true; }
          if (esSecond && activosPorCol[di]) { activosPorCol[di].mostroEstudio  = true; }

          const risEnContinua = risNuevo || (risActivo && !risActivo.mostrado ? risActivo.ris : null);

          if (esFirst && act && risEnContinua) {
            // Slot inicial CON RIS → turno 80% | RIS 20% → turno muestra solo nombre
            const r    = risEnContinua;
            const pres = act.presente === "Presente" ? "✅ " : "";
            if (risNuevo && risActivoCol[di]) risActivoCol[di].mostrado = true;
            html += `<td style="padding:0;border:1px solid #e4e8ee;cursor:pointer">
              <div style="display:flex;height:100%;gap:1px">
                <div class="slot-continua slot-libre" style="flex:4;background:${col.bg}18;border-left:3px solid ${col.bg};padding:3px 6px;overflow:hidden"
                  data-fecha="${dia.fecha}" data-mins="${mins}">
                  <div style="font-size:11px;font-weight:700;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${pres}${act.apellido}, ${act.nombre}</div>
                  <div style="font-size:9px;color:${col.text};opacity:.7;pointer-events:none">📍 ${act.origen}</div>
                </div>
                <div class="slot-ris-side slot-content" style="flex:1;background:#f0f0f0;border-left:2px dashed #bbb;cursor:pointer;overflow:hidden;padding:2px 3px;display:flex;flex-direction:column;align-items:center;justify-content:center"
                  data-fecha="${dia.fecha}" data-mins="${mins}"
                  data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
                  data-ris-practica="${encodeURIComponent(r.practica||r.diagnostico||"")}"
                  title="RIS: ${r.apellido_nombre} — clic para sobreturno">
                  <span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700;pointer-events:none">RIS</span>
                </div>
              </div></td>`;
          } else if (esFirst && act) {
            // Slot inicial SIN RIS → solo nombre + origen
            const pres = act.presente === "Presente" ? "✅ " : "";
            html += `<td class="slot-continua slot-libre"
              style="background:${col.bg}18;border-left:3px solid ${col.bg};border-top:none;border-bottom:none;padding:4px 6px;cursor:pointer;vertical-align:middle;overflow:hidden"
              data-fecha="${dia.fecha}" data-mins="${mins}" title="Clic para sobreturno">
              <div style="pointer-events:none">
                <div style="font-size:11px;font-weight:700;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pres}${act.apellido}, ${act.nombre}</div>
                <div style="font-size:9px;color:${col.text};opacity:.75">📍 ${act.origen}</div>
              </div></td>`;
          } else if (esSecond && act && risEnContinua) {
            // Segunda continuación CON RIS → estudio 80% | RIS nombre 20%
            const startM = act.mins !== undefined ? act.mins : mins;
            const durMin = hasta - startM;
            const horaI  = String(Math.floor(startM/60)).padStart(2,"0")+":"+String(startM%60).padStart(2,"0");
            const r = risEnContinua;
            html += `<td style="padding:0;border:1px solid #e4e8ee;cursor:pointer">
              <div style="display:flex;height:100%;gap:1px">
                <div class="slot-continua slot-libre" style="flex:4;background:${col.bg}0d;border-left:3px solid ${col.bg}55;padding:3px 6px;overflow:hidden"
                  data-fecha="${dia.fecha}" data-mins="${mins}">
                  <div style="font-size:10px;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">🔬 ${act.estudio}</div>
                  <div style="font-size:9px;color:${col.text};opacity:.65;pointer-events:none">⏱ ${durMin}min · ${horaI}→${horaF}</div>
                </div>
                <div class="slot-ris-side slot-content" style="flex:1;background:#f0f0f0;border-left:2px dashed #bbb;cursor:pointer;overflow:hidden;padding:2px 3px;display:flex;flex-direction:column;align-items:center;justify-content:center"
                  data-fecha="${dia.fecha}" data-mins="${mins}"
                  data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
                  data-ris-practica="${encodeURIComponent(r.practica||r.diagnostico||"")}"
                  title="RIS: ${r.apellido_nombre} — clic para sobreturno">
                  <span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700;pointer-events:none">RIS</span>
                </div>
              </div></td>`;
          } else if (esSecond && act) {
            // Segunda continuación SIN RIS → estudio + duración
            const startM = act.mins !== undefined ? act.mins : mins;
            const durMin = hasta - startM;
            const horaI  = String(Math.floor(startM/60)).padStart(2,"0")+":"+String(startM%60).padStart(2,"0");
            html += `<td class="slot-continua slot-libre"
              style="background:${col.bg}0d;border-left:3px solid ${col.bg}44;border-top:none;border-bottom:none;padding:3px 6px;cursor:pointer;vertical-align:middle;overflow:hidden"
              data-fecha="${dia.fecha}" data-mins="${mins}" title="→${horaF} — clic para sobreturno">
              <div style="pointer-events:none">
                <div style="font-size:10px;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔬 ${act.estudio}</div>
                <div style="font-size:9px;color:${col.text};opacity:.65">⏱ ${durMin}min · ${horaI}→${horaF}</div>
              </div></td>`;
          } else {
            // Resto → barra fina con hora fin
            html += `<td class="slot-continua slot-libre"
              style="background:${col.bg}0a;border-left:3px solid ${col.bg}33;border-top:none;border-bottom:none;padding:2px 6px;cursor:pointer"
              data-fecha="${dia.fecha}" data-mins="${mins}" title="→${horaF} — clic para sobreturno">
              <div style="height:100%;display:flex;align-items:center;justify-content:flex-end;pointer-events:none">
                <span style="color:${col.border}55;font-size:8px;font-weight:600">→${horaF}</span>
              </div></td>`;
          }

        } else if (risContinuacion) {
          const r = risActivo.ris;
          html += `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #ccc;border:1px solid #ebebeb;cursor:pointer;padding:2px 5px"
            data-fecha="${dia.fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(r.practica||"")}"
            title="${r.apellido_nombre} · ${r.practica||""} — clic para sobreturno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none">
              <div style="height:1px;flex:1;background:#ccc;border-top:1px dashed #bbb"></div>
              <span style="color:#bbb;font-size:9px;font-weight:600;padding:0 4px;flex-shrink:0">+</span>
            </div></td>`;

        } else {
          const esFranjaCardioSlot = s &&
            (s.tipo === "franja" || s.tipo === "franja_origen" || s.tipo === "bloqueo_rec") &&
            (s.label||"").toLowerCase().includes("cardiol");

          let cardioRender = [];
          let skipRender   = false;

          if (dia.diaSemana === 3 && esFranjaCardioSlot) {
            const cardioDia = (cardioMap[dia.fecha] || []);
            if (cardioActivoCol[di] && mins >= cardioActivoCol[di].hasta) cardioActivoCol[di] = null;
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
                cardioRender = [{ ...cardioActivoCol[di].cp }];
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
            html += _renderCeldaCombinada(s, renderRIS, dia.fecha, mins, risMap[dia.fecha] || [], activosPorCol[di] ? activosPorCol[di].hasta : mins + _paso, nextMins);
          }
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
    _bindSlotClicks(container);
  }

  // ── Celda combinada ───────────────────────────────────────
  function _renderCeldaCombinada(slot, risSlot, fecha, mins, risDelDia, hasta, nextMins) {
    const tipo     = slot ? slot.tipo || "libre" : "libre";
    const tieneRIS = risSlot && risSlot.length > 0;
    const ris      = tieneRIS ? risSlot[0] : null;
    const durMin   = hasta ? hasta - mins : _paso;
    const horaF    = hasta ? String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0") : "";
    const horaI    = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");

    // ── Turno single-slot + RIS → 80/20
    if (tipo === "turno" && tieneRIS) {
      const col  = _coloresOrigen(slot.origen);
      const pres = slot.presente === "Presente" ? "✅ " : "";
      const tip  = `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${slot.observaciones?"\n📝 "+slot.observaciones:""}`;
      const est  = ris.estado || "";
      const badgeEst = est ? `<span style="background:#666;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${est}</span>` : "";
      const esSolo = durMin <= _paso;
      return `<td style="padding:0;border:1px solid #e4e8ee">
        <div style="display:flex;height:100%;gap:1px">
          <div class="slot-turno" style="flex:4;background:${slot.color||col.bg};border-left:3px solid ${col.border};cursor:pointer;overflow:hidden;padding:3px 6px;display:flex;flex-direction:column;justify-content:center"
            data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-tooltip="${encodeURIComponent(tip)}">
            <div style="font-size:11px;font-weight:700;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${pres}${slot.apellido}, ${slot.nombre}</div>
            <div style="font-size:10px;color:${col.text};opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">🔬 ${slot.estudio}</div>
            ${esSolo ? `<div style="font-size:9px;color:${col.text};opacity:.7;pointer-events:none">⏱ ${durMin}min · ${horaI}→${horaF} · 📍 ${slot.origen}</div>` : ""}
          </div>
          <div class="slot-ris-side" style="flex:1;background:#f0f0f0;border-left:2px dashed #bbb;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px"
            data-fecha="${fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(ris.practica||"")}"
            title="RIS: ${ris.apellido_nombre} — clic para sobreturno">
            ${badgeEst}
            <span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700;pointer-events:none">RIS</span>
            <span style="font-size:8px;color:#777;text-align:center;pointer-events:none;overflow:hidden;text-overflow:ellipsis;max-width:100%">${ris.apellido_nombre.split(",")[0]}</span>
          </div>
        </div>
      </td>`;
    }

    // ── Solo RIS en slot libre ──
    if (tieneRIS && (tipo === "libre" || tipo === "continuacion")) {
      const hoy    = new Date(); hoy.setHours(0,0,0,0);
      const fParts = fecha.split("/");
      const fDate  = new Date(parseInt(fParts[2]), parseInt(fParts[1])-1, parseInt(fParts[0]));
      const pasado = fDate < hoy;
      const est    = ris.estado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const ausente  = est === "Asignado" && pasado;
      const iconEst  = atendido ? `<span style="color:#2e7d32;font-weight:700">✓ </span>`
                     : ausente  ? `<span style="color:#c62828;font-weight:700">✗ </span>` : "";
      const badgeEst = est ? `<span style="background:${atendido?"#4a9e5c":ausente?"#c62828":"#888"};color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${est}</span>` : "";
      return `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #bbb;border:1px solid #e4e8ee;cursor:pointer;padding:3px 5px"
        data-fecha="${fecha}" data-mins="${mins}"
        data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}"
        data-ris-practica="${encodeURIComponent(ris.practica||"")}"
        title="RIS: ${ris.apellido_nombre}\nEstado: ${est}\nClic para sobreturno">
        <div class="slot-content">
          <div style="display:flex;gap:2px;align-items:center;margin-bottom:1px">
            ${badgeEst}
            <span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">RIS</span>
          </div>
          <span class="slot-nombre" style="color:#666;font-style:italic">${iconEst}${ris.apellido_nombre}</span>
          <span class="slot-estudio" style="color:#999;font-size:9px">${ris.practica||""}</span>
        </div>
      </td>`;
    }

    const cardioSlot = tieneRIS && risSlot[0]?._cardio ? risSlot[0] : null;

    // ── Franja + RIS → franja 20% | RIS 80% ──
    if (tieneRIS && !cardioSlot && slot &&
        (tipo === "franja" || tipo === "franja_origen" || tipo === "bloqueo_rec" || tipo === "bloqueo")) {
      const bg      = slot.color || "#ccc";
      const label   = slot.label || tipo;
      const est     = ris.estado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const ausente  = (est === "Asignado");
      const badgeEst = est ? `<span style="background:${atendido?"#4a9e5c":ausente?"#888":"#888"};color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${est}</span>` : "";
      return `<td style="padding:0;border:1px solid #e4e8ee">
        <div style="display:flex;height:100%;gap:1px">
          <div style="flex:1;background:${bg};overflow:hidden;display:flex;align-items:center;justify-content:center;padding:2px">
            <span style="font-size:8px;font-weight:700;color:#fff;writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-height:100%">${label}</span>
          </div>
          <div class="slot-ris-side" style="flex:4;background:${bg}15;border-left:2px dashed ${bg}88;cursor:pointer;overflow:hidden;padding:3px 5px;display:flex;flex-direction:column;justify-content:center"
            data-fecha="${fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(ris.practica||"")}"
            title="RIS: ${ris.apellido_nombre} — clic para sobreturno">
            <div style="display:flex;gap:2px;align-items:center;margin-bottom:1px;pointer-events:none">
              ${badgeEst}
              <span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">RIS</span>
            </div>
            <span style="font-size:11px;font-weight:600;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${ris.apellido_nombre}</span>
            <span style="font-size:9px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${ris.practica||""}</span>
          </div>
        </div>
      </td>`;
    }

    // ── Cardio en franja ──
    if (cardioSlot && slot) {
      const bg  = slot.color || "#e8a0c0";
      const c   = cardioSlot;
      const badges = [];
      if (c._enAgenda) badges.push(`<span style="background:#4a9e5c;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">AGENDA</span>`);
      if (c._enRIS)    badges.push(`<span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">RIS</span>`);
      badges.push(`<span style="background:#c9506a;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">CARDIO</span>`);
      const estCardio  = (c.estado||"").toUpperCase();
      const atendidoC  = estCardio === "REALIZADO" || estCardio === "CONFIRMADO" || estCardio === "PRESENTE";
      const estadoIconC = atendidoC ? `<span style="color:#2e7d32;font-weight:700;margin-right:2px">✓</span>` : "";
      return `<td style="background:${bg}22;border-left:3px solid ${bg};border:1px solid ${bg}55;padding:3px 5px;cursor:pointer"
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

    if (!slot) return "<td></td>";
    return _renderSlot(slot, fecha, mins, risDelDia || [], hasta, nextMins);
  }

  // ── Render slot individual ────────────────────────────────
  function _renderSlot(slot, fecha, mins, risDelDia, hasta, nextMins) {
    slot._risDelDia = risDelDia || [];
    const tipo   = slot.tipo || "libre";
    const bg     = slot.color || "#fff";
    const durMin = hasta ? hasta - mins : _paso;
    const horaF  = hasta ? String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0") : "";
    const horaI  = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");

    if (tipo === "libre") {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const pasado = f < hoy;
      return pasado
        ? `<td class="slot-pasado" style="background:#fce8e8;cursor:default"><div class="slot-content"><span class="slot-label" style="color:#e0b0b0;font-size:9px">—</span></div></td>`
        : `<td class="slot-libre" style="background:${bg}" data-fecha="${fecha}" data-mins="${mins}" title="Libre — clic para asignar"><div class="slot-content"><span class="slot-label" style="color:#ccc">+</span></div></td>`;
    }

    if (tipo === "turno") {
      const col    = _coloresOrigen(slot.origen);
      const pres   = slot.presente === "Presente" ? "✅ " : "";
      const tip    = `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${slot.observaciones?"\n📝 "+slot.observaciones:""}${pres?"✅ Presente":""}`;
      const dniLimpio = String(slot.dni||"").trim().replace(/^0+/,"");
      const risMatch  = (slot._risDelDia||[]).find(r => {
        const dniR = String(r.documento||"").replace(/[A-Za-z]+/,"").trim().replace(/^0+/,"");
        return dniR === dniLimpio;
      });
      const estRIS   = risMatch ? (risMatch.estado||"") : "";
      const hoy      = new Date(); hoy.setHours(0,0,0,0);
      const fp       = fecha.split("/");
      const fDate    = new Date(parseInt(fp[2]), parseInt(fp[1])-1, parseInt(fp[0]));
      const pasado   = fDate < hoy;
      const atendido = estRIS === "Atendido" || estRIS === "Presente";
      const ausente  = estRIS === "Asignado" && pasado;
      const iconRIS  = atendido ? `<span style="color:#2e7d32;font-weight:700;margin-right:2px">✓</span>`
                     : ausente  ? `<span style="color:#c62828;font-weight:700;margin-right:2px">✗</span>` : "";
      const badgeRIS = risMatch ? `<span style="background:#888;color:#fff;border-radius:3px;padding:0 2px;font-size:8px;font-weight:700;margin-left:2px">RIS</span>` : "";

      // esSolo: el turno termina antes del próximo slot del grid → no habrá continuación
      const esSolo = !hasta || !nextMins || hasta <= nextMins;
      if (esSolo) {
        // Single-slot → todo en una celda
        return `<td class="slot-turno" style="background:${bg};border-left:3px solid ${col.border};padding:3px 6px;vertical-align:middle"
          data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-tooltip="${encodeURIComponent(tip)}">
          <div style="pointer-events:none">
            <div style="font-size:11px;font-weight:700;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${iconRIS}${pres}${slot.apellido}, ${slot.nombre}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:1px">
              <span style="font-size:13px;font-weight:800;color:${col.border};white-space:nowrap">${durMin}<span style="font-size:9px;font-weight:600">min</span></span>
              <span style="font-size:9px;color:${col.text};opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔬 ${slot.estudio}${badgeRIS}</span>
            </div>
            <div style="font-size:8px;color:${col.text};opacity:.65">${horaI}→${horaF} · 📍 ${slot.origen}</div>
          </div></td>`;
      }
      // Multi-slot → solo nombre + origen en el slot inicial
      return `<td class="slot-turno" style="background:${bg};border-left:3px solid ${col.border};padding:3px 6px;vertical-align:middle"
        data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-tooltip="${encodeURIComponent(tip)}">
        <div style="pointer-events:none">
          <div style="font-size:11px;font-weight:700;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${iconRIS}${pres}${slot.apellido}, ${slot.nombre}</div>
          <div style="font-size:9px;color:${col.text};opacity:.75">📍 ${slot.origen}${badgeRIS}</div>
        </div></td>`;
    }

    if (tipo === "continuacion") return `<td class="slot-continua" style="background:${bg}"><div class="slot-content"></div></td>`;
    return `<td class="slot-bloqueo" style="background:${bg}"><div class="slot-content"><span class="slot-label">${slot.label||""}</span></div></td>`;
  }

  // ── Eventos de click ──────────────────────────────────────
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
      resumenMap[dia.fecha] = { libres, ocupados, bloqueados, esFeriado: dia.esFeriado, feriado: dia.feriado };
    }

    const año = _mesBase.getFullYear(), mes = _mesBase.getMonth();
    const diasMes = new Date(año, mes+1, 0).getDate();
    let primerDia = new Date(año, mes, 1).getDay();
    primerDia = primerDia===0 ? 6 : primerDia-1;

    const hoyStr = _strFecha(new Date());
    const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

    let totalOcup = 0, totalLibres = 0;
    for (const v of Object.values(resumenMap)) {
      if (!v.esFeriado) { totalOcup += v.ocupados; totalLibres += v.libres; }
    }
    const totalRIS = Object.values(risMes).reduce((a,v) => a + v.length, 0);

    let html = `<div class="cal-mes-wrap"><table class="cal-mes-table"><thead><tr>`;
    for (const d of DIAS) html += `<th>${d}</th>`;
    html += `</tr></thead><tbody><tr>`;

    for (let i=0; i<primerDia; i++) html += `<td class="cal-dia cal-dia-vacio"></td>`;

    let col = primerDia;
    for (let dia=1; dia<=diasMes; dia++) {
      const fechaDate = new Date(año, mes, dia);
      const fechaStr  = _strFecha(fechaDate);
      const res       = resumenMap[fechaStr];
      const esHoy     = fechaStr === hoyStr;
      const esDom     = fechaDate.getDay() === 0;

      let cls = "cal-dia";
      if (esHoy) cls += " cal-dia-hoy";
      if (esDom) cls += " cal-dia-dom";

      let contenido = "";
      if (!res) {
        const DIAS_C2 = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
        contenido = `<div class="cal-d-head"><span class="cal-d-num">${dia}</span><span class="cal-d-name">${DIAS_C2[fechaDate.getDay()]}</span></div>`;
      } else if (res.esFeriado) {
        cls += " cal-dia-feriado";
        const DIAS_C = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
        contenido = `<div class="cal-d-head"><span class="cal-d-num">${dia}</span><span class="cal-d-name" style="color:#c05050">${DIAS_C[fechaDate.getDay()]}</span></div><div class="cal-d-body"><div class="cal-feriado-label">🚫 ${res.feriado||"Feriado"}</div></div>`;
      } else {
        const total = res.libres + res.ocupados;
        const pct   = total > 0 ? res.libres/total : 0;
        if      (pct===0 && total>0) cls += " cal-dia-lleno";
        else if (pct>0 && pct<0.25)  cls += " cal-dia-casi-lleno";
        const barOcup   = total>0 ? Math.round((res.ocupados/total)*100) : 0;
        const risDelDia = (risMes[fechaStr] || []).length;
        const DIAS_CORTO = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
        contenido = `
          <div class="cal-d-head">
            <span class="cal-d-num">${dia}</span>
            <span class="cal-d-name">${DIAS_CORTO[fechaDate.getDay()]}</span>
          </div>
          <div class="cal-d-body">
            <div class="cal-barra">
              <div class="cal-barra-ocu" style="width:${barOcup}%"></div>
              <div class="cal-barra-lib" style="width:${100-barOcup}%"></div>
            </div>
            ${risDelDia > 0 ? `<div class="cal-barra-ris-wrap"><div class="cal-barra-ris"></div></div>` : ""}
            <div class="cal-contadores">
              <span class="cal-ocu-badge">● ${res.ocupados}</span>
              <span class="cal-lib-badge">▲ ${res.libres}</span>
              ${risDelDia > 0 ? `<span class="cal-ris-badge">📋 ${risDelDia}</span>` : ""}
            </div>
          </div>`;
      }

      html += `<td class="${cls}" data-fecha="${fechaStr}" title="Clic para ver semana">${contenido}</td>`;
      col++;
      if (col===7 && dia<diasMes) { html += `</tr><tr>`; col=0; }
    }

    const resto = col===0 ? 0 : 7-col;
    for (let i=0; i<resto; i++) html += `<td class="cal-dia cal-dia-vacio"></td>`;
    html += `</tr></tbody></table>
      <div class="cal-pie">
        <span class="cal-pie-lib">▲ ${totalLibres} slots libres en el mes</span>
        <span class="cal-pie-sep">·</span>
        <span class="cal-pie-ocu">● ${totalOcup} turnos asignados</span>
        ${totalRIS > 0 ? `<span class="cal-pie-sep">·</span><span class="cal-pie-ris">📋 ${totalRIS} RIS</span>` : ""}
      </div>
    </div>`;
    container.innerHTML = html;

    container.querySelectorAll(".cal-dia[data-fecha]").forEach(td => {
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
    document.getElementById("btn-agenda-hoy").onclick = () => { _fechaDesde = _lunesDeHoy(); _cargarSemana(); };
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