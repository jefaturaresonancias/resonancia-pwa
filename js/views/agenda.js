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
    risMap    = risMap    || {};
    const container = document.getElementById("agenda-container");
    if (!datos || !datos.length) { container.innerHTML = '<div class="empty-state">Sin datos.</div>'; return; }

    const MIN_I = 0, MIN_F = 24*60;
    const slotsBase = datos[0].slots.filter(s => s.mins >= MIN_I && s.mins < MIN_F).map(s => s.mins);
    const slotsSet  = new Set(slotsBase);

    for (const dia of datos) {
      for (const s of dia.slots) {
        if (s.tipo === "turno" && s.mins >= MIN_I && s.mins < MIN_F && !slotsSet.has(s.mins))
          slotsSet.add(s.mins);
      }
      for (const r of (risMap[dia.fecha] || [])) {
        const rm = typeof r.mins === "number" ? r.mins : parsearMinsJS(r.hora);
        if (rm >= MIN_I && rm < MIN_F && !slotsSet.has(rm)) slotsSet.add(rm);
      }
    }
    const slots = Array.from(slotsSet).sort((a,b) => a-b);

    // ── Pre-computar rowspans por columna ─────────────────
    const rowspanInfo = datos.map(() => ({}));
    for (let di = 0; di < datos.length; di++) {
      const dia = datos[di];
      for (let si = 0; si < slots.length; si++) {
        if (rowspanInfo[di][si] && rowspanInfo[di][si].skip) continue;
        const mins = slots[si];
        const s    = dia.slots.find(sl => sl.mins === mins);
        if (s && s.tipo === "turno") {
          const hasta = mins + (s.duracion || _paso);
          let span = 1;
          for (let sj = si + 1; sj < slots.length; sj++) {
            if (slots[sj] < hasta) { rowspanInfo[di][sj] = { skip: true }; span++; }
            else break;
          }
          rowspanInfo[di][si] = { span, slot: s, hasta };
        }
      }
    }

    let html = '<table class="agenda-table"><thead><tr><th class="col-hora">Hora</th>';
    for (const d of datos) html += `<th class="${d.esFeriado?"feriado-col":""}">${d.label}${d.esFeriado?" 🚫":""}</th>`;
    html += "</tr></thead><tbody>";

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
        const ri  = rowspanInfo[di][si];

        // Celda cubierta por rowspan → saltar
        if (ri && ri.skip) continue;

        // ── RIS tracking ──────────────────────────────────
        const dniAgenda   = new Set((dia.slots||[]).filter(sl=>sl.dni).map(sl=>String(sl.dni).trim().replace(/^0+/,"")));
        const apellAgenda = new Set((dia.slots||[]).filter(sl=>sl.apellido).map(sl=>sl.apellido.trim().toUpperCase()));
        const dniCardio   = new Set((cardioMap[dia.fecha]||[]).map(c=>String(c.dni||"").trim().replace(/^0+/,"")));
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

        // ── TURNO con rowspan ─────────────────────────────
        if (ri && ri.span) {
          const act    = ri.slot;
          const hasta  = ri.hasta;
          const span   = ri.span;
          const col    = _coloresOrigen(act.origen);
          const bg     = act.color || col.bg;
          const pres   = act.presente === "Presente" ? "✅ " : "";
          const durMin = hasta - mins;
          const horaI  = String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
          const horaF  = String(Math.floor(hasta/60)).padStart(2,"0")+":"+String(hasta%60).padStart(2,"0");
          const tip    = `${act.apellido}, ${act.nombre}\nDNI: ${act.dni}\n${act.estudio}\n${act.origen}${act.observaciones?"\n📝 "+act.observaciones:""}${pres?"✅ Presente":""}`;

          const dniLimpio = String(act.dni||"").trim().replace(/^0+/,"");
          const risMatch  = (risMap[dia.fecha]||[]).find(r => {
            const dniR = String(r.documento||"").replace(/[A-Za-z]+/,"").trim().replace(/^0+/,"");
            return dniR === dniLimpio;
          });
          const estRIS   = risMatch ? (risMatch.estado||"") : "";
          const hoyD     = new Date(); hoyD.setHours(0,0,0,0);
          const fp       = dia.fecha.split("/");
          const fDate    = new Date(parseInt(fp[2]),parseInt(fp[1])-1,parseInt(fp[0]));
          const pasado   = fDate < hoyD;
          const atendido = estRIS === "Atendido" || estRIS === "Presente";
          const ausente  = estRIS === "Asignado" && pasado;
          const iconRIS  = atendido ? `<span style="color:#2e7d32;font-weight:700;margin-right:2px">✓</span>`
                         : ausente  ? `<span style="color:#c62828;font-weight:700;margin-right:2px">✗</span>` : "";
          const badgeRIS = risMatch
            ? `<span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:8px;font-weight:700;margin-left:3px">RIS</span>`
            : "";

          const turnoHTML = `
            <div style="font-size:11px;font-weight:700;color:${col.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${iconRIS}${pres}${act.apellido}, ${act.nombre}</div>
            <div style="font-size:10px;color:${col.text};opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">🔬 ${act.estudio}${badgeRIS}</div>
            <div style="display:flex;align-items:baseline;gap:3px;margin-top:4px">
              <span style="font-size:18px;font-weight:900;color:${col.border};line-height:1">${durMin}</span>
              <span style="font-size:9px;font-weight:700;color:${col.border}">min</span>
              <span style="font-size:9px;color:${col.text};opacity:.7">${horaI}→${horaF}</span>
            </div>
            <div style="font-size:9px;color:${col.text};opacity:.65;margin-top:2px">📍 ${act.origen}</div>`;

          if (risNuevo) {
            if (risActivoCol[di]) risActivoCol[di].mostrado = true;
            const r   = risNuevo;
            const est = r.estado || "";
            html += `<td rowspan="${span}" style="padding:0;border:1px solid #e4e8ee;vertical-align:top">
              <div style="display:flex;height:100%">
                <div class="slot-turno" style="flex:4;background:${bg};border-left:3px solid ${col.border};padding:5px 6px;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start"
                  data-fecha="${dia.fecha}" data-mins="${mins}" data-fila="${act.fila}" data-tooltip="${encodeURIComponent(tip)}">
                  <div style="pointer-events:none">${turnoHTML}</div>
                </div>
                <div class="slot-ris-side" style="flex:1;background:#f0f0f0;border-left:2px dashed #bbb;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:4px 2px;gap:4px"
                  data-fecha="${dia.fecha}" data-mins="${mins}"
                  data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
                  data-ris-practica="${encodeURIComponent(r.practica||"")}"
                  title="RIS: ${r.apellido_nombre} — clic para sobreturno">
                  <span style="background:#888;color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700;pointer-events:none">RIS</span>
                  ${est ? `<span style="background:#555;color:#fff;border-radius:3px;padding:0 2px;font-size:7px;font-weight:700;pointer-events:none">${est}</span>` : ""}
                  <span style="font-size:8px;color:#555;text-align:center;word-break:break-word;pointer-events:none;line-height:1.2">${r.apellido_nombre.split(",")[0]}</span>
                </div>
              </div>
            </td>`;
          } else {
            html += `<td rowspan="${span}" class="slot-turno"
              style="background:${bg};border-left:3px solid ${col.border};padding:5px 6px;vertical-align:top;cursor:pointer;overflow:hidden"
              data-fecha="${dia.fecha}" data-mins="${mins}" data-fila="${act.fila}" data-tooltip="${encodeURIComponent(tip)}">
              <div style="pointer-events:none">${turnoHTML}</div>
            </td>`;
          }
          continue;
        }

        // ── Continuación de RIS standalone ───────────────
        const risActivo       = risActivoCol[di];
        const risContinuacion = !risNuevo && risActivo && risActivo.mostrado && mins < risActivo.hasta;

        if (risContinuacion) {
          const r = risActivo.ris;
          html += `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #ccc;border:1px solid #ebebeb;cursor:pointer;padding:2px 5px"
            data-fecha="${dia.fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(r.practica||"")}"
            title="${r.apellido_nombre} — clic para sobreturno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none">
              <div style="height:1px;flex:1;background:#ccc;border-top:1px dashed #bbb"></div>
              <span style="color:#bbb;font-size:9px;font-weight:600;padding:0 4px;flex-shrink:0">+</span>
            </div></td>`;
          continue;
        }

        // ── CARDIO + franjas ──────────────────────────────
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
          html += _renderCeldaCombinada(s, renderRIS, dia.fecha, mins, risMap[dia.fecha] || []);
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
    _bindSlotClicks(container);
  }

  // ── Celda combinada — solo para NO-turno (libre+RIS, franja+RIS, cardio) ──
  function _renderCeldaCombinada(slot, risSlot, fecha, mins, risDelDia) {
    const tipo     = slot ? slot.tipo || "libre" : "libre";
    const tieneRIS = risSlot && risSlot.length > 0;
    const ris      = tieneRIS ? risSlot[0] : null;

    // ── Solo RIS en slot libre ────────────────────────────
    if (tieneRIS && (tipo === "libre" || tipo === "continuacion")) {
      const hoy    = new Date(); hoy.setHours(0,0,0,0);
      const fParts = fecha.split("/");
      const fDate  = new Date(parseInt(fParts[2]),parseInt(fParts[1])-1,parseInt(fParts[0]));
      const pasado = fDate < hoy;
      const est    = ris.estado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const ausente  = est === "Asignado" && pasado;
      const iconEst  = atendido ? `<span style="color:#2e7d32;font-weight:700">✓ </span>`
                     : ausente  ? `<span style="color:#c62828;font-weight:700">✗ </span>` : "";
      const badgeEst = est
        ? `<span style="background:${atendido?"#4a9e5c":ausente?"#c62828":"#888"};color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${est}</span>`
        : "";
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

    const cardioSlot = tieneRIS && risSlot[0] && risSlot[0]._cardio ? risSlot[0] : null;

    // ── Franja + RIS → franja 20% vertical | RIS 80% ─────
    if (tieneRIS && !cardioSlot && slot &&
        (tipo === "franja" || tipo === "franja_origen" || tipo === "bloqueo_rec" || tipo === "bloqueo")) {
      const bg      = slot.color || "#ccc";
      const label   = slot.label || tipo;
      const est     = ris.estado || "";
      const atendido = est === "Atendido" || est === "Presente";
      const badgeEst = est
        ? `<span style="background:${atendido?"#4a9e5c":"#888"};color:#fff;border-radius:3px;padding:0 3px;font-size:7px;font-weight:700">${est}</span>`
        : "";
      return `<td style="padding:0;border:1px solid #e4e8ee">
        <div style="display:flex;height:100%">
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

    // ── Cardio en franja ──────────────────────────────────
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
    return _renderSlot(slot, fecha, mins, risDelDia || []);
  }

  // ── Render slot genérico (libre, bloqueo, franja sin RIS) ─
  function _renderSlot(slot, fecha, mins, risDelDia) {
    slot._risDelDia = risDelDia || [];
    const tipo = slot.tipo || "libre";
    const bg   = slot.color || "#fff";

    if (tipo === "libre") {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
      f.setHours(0,0,0,0);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const pasado = f < hoy;
      return pasado
        ? `<td class="slot-pasado" style="background:#fce8e8;cursor:default"><div class="slot-content"><span class="slot-label" style="color:#e0b0b0;font-size:9px">—</span></div></td>`
        : `<td class="slot-libre" style="background:${bg}" data-fecha="${fecha}" data-mins="${mins}" title="Libre — clic para asignar"><div class="slot-content"><span class="slot-label" style="color:#ccc">+</span></div></td>`;
    }
    if (tipo === "continuacion") return `<td class="slot-continua" style="background:${bg}"><div class="slot-content"></div></td>`;
    return `<td class="slot-bloqueo" style="background:${bg}"><div class="slot-content"><span class="slot-label">${slot.label||""}</span></div></td>`;
  }

  // ── Eventos de click ──────────────────────────────────────
  function _bindSlotClicks(container) {
    function _esPasado(fecha) {
      const p = fecha.split("/");
      const f = new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
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