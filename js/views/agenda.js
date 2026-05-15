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
    window._cardioMostrado = new Set(); // reset por render
    risMap = risMap || {};
    const container = document.getElementById("agenda-container");
    if (!datos || !datos.length) { container.innerHTML = '<div class="empty-state">Sin datos.</div>'; return; }

    const MIN_I = 0, MIN_F = 24*60;
    const slotsBase = datos[0].slots.filter(s => s.mins >= MIN_I && s.mins < MIN_F).map(s => s.mins);
    const slotsSet  = new Set(slotsBase);

    // Agregar horarios de turnos que no caen en el paso del grid (ej: 21:30 con paso 40)
    for (const dia of datos) {
      for (const s of dia.slots) {
        if (s.tipo === "turno" && s.mins >= MIN_I && s.mins < MIN_F && !slotsSet.has(s.mins)) {
          slotsSet.add(s.mins);
        }
      }
      for (const r of (risMap[dia.fecha] || [])) {
        const rm = typeof r.mins === "number" ? r.mins : parsearMinsJS(r.hora);
        if (rm >= MIN_I && rm < MIN_F && !slotsSet.has(rm)) {
          slotsSet.add(rm);
        }
      }
    }
    const slots = Array.from(slotsSet).sort((a,b) => a-b);

    let html = '<table class="agenda-table"><thead><tr><th class="col-hora">Hora</th>';
    for (const d of datos) html += `<th class="${d.esFeriado?"feriado-col":""}">${d.label}${d.esFeriado?" 🚫":""}</th>`;
    html += "</tr></thead><tbody>";

    // Rastrear turno activo y RIS activo por columna
    const activosPorCol = new Array(datos.length).fill(null); // { slot, hasta }
    const risActivoCol  = new Array(datos.length).fill(null); // { ris, hasta, mostrado }

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
        const risNuevo = (risMap[dia.fecha]||[]).find(r => {
          const rm = typeof r.mins==="number" ? r.mins : parsearMinsJS(r.hora);
          if (rm < mins || rm >= nextMins) return false;
          const dniRIS   = String(r.documento||"").replace(/[A-Za-z]+\s*/,"").trim().replace(/^0+/,"");
          const apellRIS = String(r.apellido_nombre||"").split(",")[0].trim().toUpperCase();
          return !dniAgenda.has(dniRIS) && !apellAgenda.has(apellRIS);
        });

        // Si hay RIS nuevo → registrar activo, marcar como NO mostrado aún
        if (risNuevo) {
          const dur = (risNuevo.duracion && risNuevo.duracion > 0) ? risNuevo.duracion : _paso;
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
          html += `<td class="slot-continua slot-libre" style="background:${col.bg}22;border-left:3px solid ${col.bg}88;border-top:none;border-bottom:none;padding:2px 5px;cursor:pointer" data-fecha="${dia.fecha}" data-mins="${mins}" title="Continúa — clic para sobreturno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none">
              <div style="height:1px;flex:1;background:${col.border}44;border-top:1px solid ${col.border}33"></div>
              <span style="color:${col.border}88;font-size:9px;font-weight:600;padding:0 4px;flex-shrink:0">+</span>
            </div></td>`;
        } else if (risContinuacion) {
          // Continuación de RIS — clickeable para sobreturno
          const r = risActivo.ris;
          html += `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #ccc;border:1px solid #ebebeb;cursor:pointer;padding:2px 5px"
            data-fecha="${dia.fecha}" data-mins="${mins}"
            data-ris-nombre="${encodeURIComponent(r.apellido_nombre)}"
            data-ris-practica="${encodeURIComponent(r.practica)}"
            title="${r.apellido_nombre} · ${r.practica} — clic para sobreturno">
            <div style="height:100%;display:flex;align-items:center;justify-content:space-between;pointer-events:none">
              <div style="height:1px;flex:1;background:#ccc;border-top:1px dashed #bbb"></div>
              <span style="color:#bbb;font-size:9px;font-weight:600;padding:0 4px;flex-shrink:0">+</span>
            </div></td>`;
        } else {
          // Buscar paciente cardiológico para este slot (miércoles, 08-14hs)
        let cardioSlotArr = [];
        if (dia.diaSemana === 3) { // miércoles
          const cardioDia = (cardioMap[dia.fecha] || []);
          const cp = cardioDia.find(c => {
            return c.mins <= mins && mins < c.mins + (c.duracion || 60);
          });
          if (cp) {
            // Verificar si está en agenda propia o RIS
            const dniCP = String(cp.dni||"").trim().replace(/^0+/,"");
            const enAgenda = (dia.slots||[]).some(sl => sl.dni && String(sl.dni).trim().replace(/^0+/,"") === dniCP);
            const enRIS    = (risMap[dia.fecha]||[]).some(r => {
              const dniR = String(r.documento||"").replace(/[A-Za-z\s]+/,"").trim().replace(/^0+/,"");
              return dniR === dniCP;
            });
            // Solo mostrar si el slot es de franja cardiología
            if (s && (s.tipo === "franja" || s.tipo === "franja_origen") &&
                (s.label||"").toLowerCase().includes("cardio")) {
              // Primera aparición del paciente en este slot
              const cKey = dia.fecha + "_" + dniCP;
              if (!window._cardioMostrado) window._cardioMostrado = new Set();
              if (!window._cardioMostrado.has(cKey)) {
                window._cardioMostrado.add(cKey);
                cardioSlotArr = [{ ...cp, _cardio: true, _enAgenda: enAgenda, _enRIS: enRIS }];
              }
            }
          }
        }

        // Render normal — si hay RIS nuevo, marcarlo como mostrado
        if (risNuevo && risActivoCol[di]) risActivoCol[di].mostrado = true;
        const renderRIS = cardioSlotArr.length > 0 ? cardioSlotArr : (risNuevo ? [risNuevo] : []);
        html += _renderCeldaCombinada(s, renderRIS, dia.fecha, mins);
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    container.innerHTML = html;
    _bindSlotClicks(container);
  }

  // ── Celda combinada: turno propio + RIS en la misma fila ──
  function _renderCeldaCombinada(slot, risSlot, fecha, mins) {
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
      return `<td class="slot-ris-clickable" style="background:#f4f4f4;border-left:2px dashed #bbb;border:1px solid #e4e8ee;cursor:pointer"
        data-fecha="${fecha}" data-mins="${mins}"
        data-ris-nombre="${encodeURIComponent(ris.apellido_nombre)}" data-ris-practica="${encodeURIComponent(ris.practica)}"
        title="RIS: ${ris.apellido_nombre}\nClic para asignar sobreturno aquí">
        <div class="slot-content">
          <span class="slot-nombre" style="color:#888;font-style:italic">${ris.apellido_nombre}</span>
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
      // Color RIS = color de franja muy suave (22% opacidad) con borde del color
      const risBg   = bg + "33"; // hex con alpha ~20%
      const risBord = bg + "88"; // hex con alpha ~53%
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
            <span class="slot-nombre" style="color:#555;font-style:italic;font-size:10px">${ris.apellido_nombre}</span>
            <span class="slot-estudio" style="color:#777;font-size:9px">${ris.practica} <span style="background:${risBord};color:#fff;border-radius:3px;padding:0 3px;font-size:8px">RIS</span></span>
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
      return `<td style="background:${bg}22;border-left:3px solid ${bg};border:1px solid ${bg}55;padding:3px 5px;cursor:pointer;height:36px"
        data-fecha="${fecha}" data-mins="${mins}"
        data-ris-nombre="${encodeURIComponent(c.apellido_nombre)}"
        data-ris-practica="${encodeURIComponent(c.diagnostico)}"
        title="Cardiología: ${c.apellido_nombre}\nDNI: ${c.dni}\n${c.diagnostico}\nEstado: ${c.estado}">
        <div class="slot-content">
          <div style="display:flex;align-items:center;gap:3px;margin-bottom:1px">${badges.join("")}</div>
          <span class="slot-nombre" style="color:#555;font-weight:600">${c.apellido_nombre}</span>
          <span class="slot-estudio" style="color:#777;font-size:10px">${c.diagnostico}</span>
        </div>
      </td>`;
    }

    // Default: render normal
    if (!slot) return "<td></td>";
    return _renderSlot(slot, fecha, mins);
  }

  function _renderSlot(slot, fecha, mins) {
    const tipo = slot.tipo || "libre";
    const bg   = slot.color || "#fff";
    if (tipo === "libre") {
      return `<td class="slot-libre" style="background:${bg}" data-fecha="${fecha}" data-mins="${mins}" title="Libre — clic para asignar"><div class="slot-content"><span class="slot-label" style="color:#ccc">+</span></div></td>`;
    }
    if (tipo === "turno") {
      const col  = _coloresOrigen(slot.origen);
      const pres = slot.presente === "Presente" ? "✅" : "";
      const tip  = `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${slot.observaciones?"\n📝 "+slot.observaciones:""}${pres?"\n✅ Presente":""}`;
      return `<td class="slot-turno" style="background:${bg};border-left:3px solid ${col.border}" data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}" data-tooltip="${encodeURIComponent(tip)}"><div class="slot-content"><span class="slot-nombre" style="color:${col.text}">${slot.apellido}, ${slot.nombre} ${pres}</span><span class="slot-estudio" style="color:${col.text}">${slot.estudio}</span></div></td>`;
    }
    if (tipo === "continuacion") return `<td class="slot-continua" style="background:${bg}"><div class="slot-content"></div></td>`;
    return `<td class="slot-bloqueo" style="background:${bg}"><div class="slot-content"><span class="slot-label">${slot.label||""}</span></div></td>`;
  }

  function _bindSlotClicks(container) {
    container.querySelectorAll(".slot-libre").forEach(td => {
      td.addEventListener("click", () => {
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
      td.addEventListener("click", () => { if(td.dataset.fila) App.mostrarOpcionesTurno(td.dataset.fila); });
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
        const barOcup  = total>0 ? Math.round((res.ocupados/total)*100) : 0;
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
      const desde = _strFecha(_fechaDesde);
      const [datos, risMap, cardioMap] = await Promise.all([
        API.agenda(desde, 7, _paso),
        API.leerRISRango(desde, 7).catch(() => ({})),
        API.leerCardiologia(desde, 7).catch(() => ({}))
      ]);
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
      const [datosMes, risMes] = await Promise.all([
        API.agenda(_strFecha(lunes), 42, _paso),
        API.leerRISRango(_strFecha(lunes), 42).catch(() => ({}))
      ]);
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