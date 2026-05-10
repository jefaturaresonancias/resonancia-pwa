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
  function _renderSemana(datos, risMap) {
    risMap = risMap || {};
    const container = document.getElementById("agenda-container");
    if (!datos || !datos.length) { container.innerHTML = '<div class="empty-state">Sin datos.</div>'; return; }

    const MIN_I = 7*60, MIN_F = 22*60;
    const slots = datos[0].slots.filter(s => s.mins >= MIN_I && s.mins < MIN_F).map(s => s.mins);

    let html = '<table class="agenda-table"><thead><tr><th class="col-hora">Hora</th>';
    for (const d of datos) html += `<th class="${d.esFeriado?"feriado-col":""}">${d.label}${d.esFeriado?" 🚫":""}</th>`;
    html += "</tr></thead><tbody>";

    for (const mins of slots) {
      const h = String(Math.floor(mins/60)).padStart(2,"0");
      const m = String(mins%60).padStart(2,"0");
      html += `<tr><td class="col-hora">${h}:${m}</td>`;
      for (const dia of datos) {
        const s = dia.slots.find(s => s.mins === mins);
        html += s ? _renderSlot(s, dia.fecha, mins) : "<td></td>";
      }
      html += "</tr>";
      // Filas RIS para este slot
      const risEnSlot = [];
      for (const dia of datos) {
        const ris = (risMap[dia.fecha] || []).filter(r => {
          const rm = parsearMinsJS(r.hora);
          return rm >= mins && rm < mins + _paso;
        });
        risEnSlot.push({ fecha: dia.fecha, ris });
      }
      const hayRIS = risEnSlot.some(d => d.ris.length > 0);
      if (hayRIS) {
        for (const risEntry of risEnSlot[0]?.ris?.length ? [0] : []) { break; }
        // Una fila RIS por cada turno RIS en cualquier día del slot
        const maxRIS = Math.max(...risEnSlot.map(d => d.ris.length), 0);
        for (let ri = 0; ri < maxRIS; ri++) {
          html += `<tr>`;
          html += `<td class="col-hora" style="font-size:9px;color:#aaa;background:#f4f4f4">RIS</td>`;
          for (const d of risEnSlot) {
            const r = d.ris[ri];
            if (r) {
              html += `<td class="slot-ris" title="${r.apellido_nombre} — ${r.practica}">
                <div class="slot-content">
                  <span class="slot-nombre" style="color:#888">${r.apellido_nombre}</span>
                  <span class="slot-estudio" style="color:#aaa">${r.practica}</span>
                </div></td>`;
            } else {
              html += `<td class="slot-ris-vacio"></td>`;
            }
          }
          html += `</tr>`;
        }
      }
    }
    html += "</tbody></table>";
    container.innerHTML = html;
    _bindSlotClicks(container);
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

    // Totales del mes para el pie
    let totalOcup = 0, totalLibres = 0;
    for (const v of Object.values(resumenMap)) {
      if (!v.esFeriado) { totalOcup += v.ocupados; totalLibres += v.libres; }
    }

    const totalRIS = Object.values(risMes).reduce((a,v) => a + v.length, 0);

    let html = `<div class="cal-mes-wrap">
      <table class="cal-mes-table"><thead><tr>`;
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
        contenido = `<div class="cal-num">${dia}</div>`;
      } else if (res.esFeriado) {
        cls += " cal-dia-feriado";
        contenido = `<div class="cal-num">${dia}</div><div class="cal-feriado-label">🚫 ${res.feriado||"Feriado"}</div>`;
      } else {
        const total = res.libres + res.ocupados;
        const pct   = total > 0 ? res.libres/total : 0;
        if      (pct===0 && total>0)     cls += " cal-dia-lleno";
        else if (pct>0 && pct<0.25)      cls += " cal-dia-casi-lleno";

        const barOcup = total>0 ? Math.round((res.ocupados/total)*100) : 0;

        const risDelDia = (risMes[fechaStr] || []).length;
        contenido = `
          <div class="cal-num">${dia}</div>
          <div class="cal-contadores">
            <span class="cal-lib-badge" title="Slots libres">▲ ${res.libres}</span>
            <span class="cal-ocu-badge" title="Turnos asignados">● ${res.ocupados}</span>
            ${risDelDia > 0 ? `<span class="cal-ris-badge" title="Turnos RIS">📋 ${risDelDia}</span>` : ""}
          </div>
          <div class="cal-barra">
            <div class="cal-barra-ocu" style="width:${barOcup}%"></div>
            <div class="cal-barra-lib" style="width:${100-barOcup}%"></div>
          </div>
          ${risDelDia > 0 ? `<div class="cal-barra cal-barra-ris-wrap"><div class="cal-barra-ris" style="width:100%"></div></div>` : ""}`;
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

    // Click en día → ir a Lista del día para esa fecha
    container.querySelectorAll(".cal-dia[data-fecha]").forEach(td => {
      td.addEventListener("click", () => {
        App.irAListaDia(td.dataset.fecha);
      });
    });
  }

  // ── TOGGLE MODO ───────────────────────────────────────────
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
      const [datos, risMap] = await Promise.all([
        API.agenda(_strFecha(_fechaDesde), 7, _paso),
        API.leerRISRango(_strFecha(_fechaDesde), 7).catch(() => ({}))
      ]);
      _renderSemana(datos, risMap);
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