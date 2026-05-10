// js/views/agenda.js — Vista de grilla semanal (administrativo)

const AgendaView = (() => {
  // ── estado ────────────────────────────────────────────────
  let _fechaDesde = _lunesDeHoy();
  let _paso       = 40;
  let _datos      = null;

  function _lunesDeHoy() {
    const d = new Date();
    const dia = d.getDay();                   // 0=Dom … 6=Sáb
    d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ── utilidades ────────────────────────────────────────────
  function _strFecha(d) { return API.fechaAStr(d); }

  function _labelRango() {
    const fin = new Date(_fechaDesde);
    fin.setDate(_fechaDesde.getDate() + 6);
    const opts = { day: "numeric", month: "short" };
    return (
      _fechaDesde.toLocaleDateString("es-AR", opts) +
      " — " +
      fin.toLocaleDateString("es-AR", opts)
    );
  }

  // ── colores de origen ─────────────────────────────────────
  function _coloresOrigen(origen) {
    const map = {
      "AMBULATORIO": { bg: "#a8d5a2", text: "#1a5e28", border: "#4a9e5c" },
      "GUARDIA":     { bg: "#5ba4cf", text: "#0a3d6b", border: "#2a7ab5" },
      "INTERNACIÓN": { bg: "#ffd966", text: "#7a4f00", border: "#c9a000" },
      "INTERNACION": { bg: "#ffd966", text: "#7a4f00", border: "#c9a000" },
      "DIRECCIÓN":   { bg: "#a98fd4", text: "#3d1e7a", border: "#7c5cb5" },
      "DIRECCION":   { bg: "#a98fd4", text: "#3d1e7a", border: "#7c5cb5" },
      "TRASLADO":    { bg: "#3c9ab8", text: "#0a3d52", border: "#1a6e8a" },
    };
    return map[(origen || "").toUpperCase()] || { bg: "#e8a09a", text: "#7a1f35", border: "#c9506a" };
  }

  // ── renderizado ───────────────────────────────────────────
  function _render(datos) {
    _datos = datos;
    const container = document.getElementById("agenda-container");
    if (!datos || datos.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay datos de agenda.</div>';
      return;
    }

    // Rango de horas visibles: 07:00 a 22:00
    const MIN_INICIO = 7  * 60;
    const MIN_FIN    = 22 * 60;

    // Determinar slots visibles
    const slotsVisibles = [];
    if (datos[0]) {
      for (const s of datos[0].slots) {
        if (s.mins >= MIN_INICIO && s.mins < MIN_FIN) slotsVisibles.push(s.mins);
      }
    }

    let html = '<table class="agenda-table"><thead><tr>';
    html += '<th class="col-hora">Hora</th>';
    for (const d of datos) {
      const clsFer = d.esFeriado ? " feriado-col" : "";
      html += `<th class="${clsFer}">${d.label}${d.esFeriado ? " 🚫" : ""}</th>`;
    }
    html += "</tr></thead><tbody>";

    for (const mins of slotsVisibles) {
      const h   = String(Math.floor(mins / 60)).padStart(2, "0");
      const m   = String(mins % 60).padStart(2, "0");
      html += `<tr><td class="col-hora">${h}:${m}</td>`;

      for (const dia of datos) {
        const slot = dia.slots.find(s => s.mins === mins);
        html += slot ? _renderSlot(slot, dia.fecha, mins) : '<td></td>';
      }
      html += "</tr>";
    }

    html += "</tbody></table>";
    container.innerHTML = html;
    _bindSlotClicks(container);
  }

  function _renderSlot(slot, fecha, mins) {
    const tipo = slot.tipo || "libre";
    const bg   = slot.color || "#ffffff";

    if (tipo === "libre") {
      return `<td class="slot-libre" style="background:${bg}"
              data-fecha="${fecha}" data-mins="${mins}"
              title="Libre — hacer clic para asignar turno">
              <div class="slot-content">
                <span class="slot-label" style="color:#aaa;">+</span>
              </div></td>`;
    }

    if (tipo === "turno") {
      const col     = _coloresOrigen(slot.origen);
      const pres    = slot.presente === "Presente" ? "✅" : "";
      const tooltip = `${slot.apellido}, ${slot.nombre}\nDNI: ${slot.dni}\n${slot.estudio}\n${slot.origen}${slot.observaciones ? "\n📝 " + slot.observaciones : ""}${pres ? "\n✅ Presente" : ""}`;
      return `<td class="slot-turno" style="background:${bg};border-left:3px solid ${col.border}"
              data-fecha="${fecha}" data-mins="${mins}" data-fila="${slot.fila}"
              data-tooltip="${encodeURIComponent(tooltip)}"
              title="">
              <div class="slot-content">
                <span class="slot-nombre" style="color:${col.text}">${slot.apellido}, ${slot.nombre} ${pres}</span>
                <span class="slot-estudio" style="color:${col.text}">${slot.estudio}</span>
              </div></td>`;
    }

    if (tipo === "continuacion") {
      return `<td class="slot-continua" style="background:${bg}"><div class="slot-content"></div></td>`;
    }

    // Bloqueo, feriado, franja
    const label = slot.label || "";
    return `<td class="slot-bloqueo" style="background:${bg}">
            <div class="slot-content">
              <span class="slot-label">${label}</span>
            </div></td>`;
  }

  function _bindSlotClicks(container) {
    // Click en slot libre → abrir formulario de asignación con fecha/hora prellenos
    container.querySelectorAll(".slot-libre").forEach(td => {
      td.addEventListener("click", () => {
        const fecha = td.dataset.fecha;
        const mins  = parseInt(td.dataset.mins);
        const h     = String(Math.floor(mins / 60)).padStart(2, "0");
        const m     = String(mins % 60).padStart(2, "0");
        App.abrirTurnoConFechaHora(fecha, `${h}:${m}`);
      });
    });

    // Tooltip en celdas con turno
    let tooltipEl = null;
    container.querySelectorAll("[data-tooltip]").forEach(td => {
      td.addEventListener("mouseenter", (e) => {
        const txt = decodeURIComponent(td.dataset.tooltip).replace(/\n/g, "<br>");
        tooltipEl = document.createElement("div");
        tooltipEl.className = "tooltip-turno";
        tooltipEl.innerHTML = txt;
        document.body.appendChild(tooltipEl);
        _posTooltip(e, tooltipEl);
      });
      td.addEventListener("mousemove", (e) => { if (tooltipEl) _posTooltip(e, tooltipEl); });
      td.addEventListener("mouseleave", () => { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } });

      // Click derecho o long-click → anular (futuro)
      td.addEventListener("click", () => {
        const fila = td.dataset.fila;
        if (fila) App.mostrarOpcionesTurno(fila);
      });
    });
  }

  function _posTooltip(e, el) {
    const x = Math.min(e.clientX + 12, window.innerWidth  - el.offsetWidth  - 8);
    const y = Math.min(e.clientY + 12, window.innerHeight - el.offsetHeight - 8);
    el.style.left = x + "px";
    el.style.top  = y + "px";
  }

  // ── carga ─────────────────────────────────────────────────
  async function cargar() {
    const loading = document.getElementById("agenda-loading");
    const lbl     = document.getElementById("agenda-rango-label");
    lbl.textContent = _labelRango();

    loading.classList.remove("hidden");
    try {
      const datos = await API.agenda(_strFecha(_fechaDesde), 7, _paso);
      _render(datos);
    } catch (err) {
      App.toast("Error cargando agenda: " + err.message, "error");
      document.getElementById("agenda-container").innerHTML =
        `<div class="empty-state">Error: ${err.message}</div>`;
    } finally {
      loading.classList.add("hidden");
    }
  }

  // ── controles de navegación ───────────────────────────────
  function _semanaAnt() { _fechaDesde.setDate(_fechaDesde.getDate() - 7); cargar(); }
  function _semanaSig() { _fechaDesde.setDate(_fechaDesde.getDate() + 7); cargar(); }
  function _irHoy()     { _fechaDesde = _lunesDeHoy(); cargar(); }

  function init() {
    document.getElementById("btn-semana-ant").onclick = _semanaAnt;
    document.getElementById("btn-semana-sig").onclick = _semanaSig;
    document.getElementById("btn-agenda-hoy").onclick = _irHoy;
    document.getElementById("agenda-paso").onchange = (e) => {
      _paso = parseInt(e.target.value);
      cargar();
    };
    document.getElementById("agenda-rango-label").textContent = _labelRango();
  }

  return { init, cargar };
})();
