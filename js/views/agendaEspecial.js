// js/views/agendaEspecial.js — "Verificar agendas especiales" (26/8/2026)
// Turnos cargados desde ncx.html/neurologia.html (coordinadores externos,
// sin sesión de Railway) — acá Administrativo/Jefatura/Admin los ven para
// cargarlos a mano en Sigehos y marcarlos como hechos.

const AgendaEspecialView = (() => {
  let _turnos = [];
  let _verCargados = false;
  let _guiaConfig = null;
  let _guiaTurnos = [];

  function _minAHora(m) {
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  function _horaAMin(h) {
    const [hh, mm] = h.split(":");
    return parseInt(hh, 10) * 60 + parseInt(mm, 10);
  }
  function _fechaISOaDMY(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  async function cargar() {
    const container = document.getElementById("agenda-especial-container");
    container.innerHTML = '<div class="empty-state">Cargando...</div>';
    try {
      _turnos = await RailwayAPI.leerAgendaEspecialTurnos(!_verCargados);
      _render();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
    _cargarGuia();
  }

  // ── Guía visual (28/8/2026, a pedido) — mismas grillas de "próximos
  // horarios" que ya ven los coordinadores externos en ncx.html/
  // neurologia.html, acá de solo lectura (sin PIN, sin clic para
  // cargar — jefatura/admin/administrativo ya tienen la agenda general
  // para eso) para tener de un vistazo qué hay agendado sin salir de
  // esta pantalla. Reusa las clases .ae-grilla-* de css/agenda-especial.css.
  const TIPOS_GUIA = [
    { tipo: "NCX", titulo: "🔪 Agenda NCX" },
    { tipo: "NEUROLOGIA", titulo: "🧠 Agenda Neurología" }
  ];
  const CANTIDAD_FECHAS_GUIA = 6;
  const DIAS_LABEL_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  function _proximasFechasGuia(diasSemana) {
    const fechas = [];
    const cur = new Date();
    cur.setUTCHours(0, 0, 0, 0);
    let guard = 0;
    while (fechas.length < CANTIDAD_FECHAS_GUIA && guard < 90) {
      if (diasSemana.includes(cur.getUTCDay())) fechas.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
      guard++;
    }
    return fechas;
  }

  function _fechaISOaEtiquetaGuia(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dia = DIAS_LABEL_CORTO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  }

  async function _cargarGuia() {
    const cont = document.getElementById("agenda-especial-guia");
    try {
      const [config, turnos] = await Promise.all([
        RailwayAPI.leerAgendaEspecialConfig(),
        RailwayAPI.leerAgendaEspecialTurnos(false)
      ]);
      _guiaConfig = config;
      _guiaTurnos = turnos;
      _renderGuia();
    } catch (err) {
      if (cont) cont.innerHTML = `<div class="empty-state">Error cargando la guía: ${err.message}</div>`;
    }
  }

  function _renderGuia() {
    const cont = document.getElementById("agenda-especial-guia");
    if (!cont || !_guiaConfig) return;

    cont.innerHTML = TIPOS_GUIA.map(({ tipo, titulo }) => {
      const ventana = _guiaConfig[tipo];
      if (!ventana) return "";
      const turnosTipo = _guiaTurnos.filter((t) => t.agenda_especial === tipo);
      const fechas = _proximasFechasGuia(ventana.diasSemana);
      const desde = _horaAMin(ventana.horaDesde);
      const hasta = _horaAMin(ventana.horaHasta);

      let html = `<div class="ae-grilla-wrap" style="margin-top:1.5rem">
        <h2>${titulo}</h2>
        <div class="ae-grilla-scroll"><table class="ae-grilla-tabla"><thead><tr><th>Hora</th>`;
      fechas.forEach((f) => { html += `<th>${_fechaISOaEtiquetaGuia(f)}</th>`; });
      html += "</tr></thead><tbody>";

      for (let m = desde; m < hasta; m += 20) {
        html += `<tr><td class="ae-grilla-hora">${_minAHora(m)}</td>`;
        fechas.forEach((f) => {
          const ocupado = turnosTipo.find((t) => t.fecha === f && t.mins === m);
          html += ocupado
            ? `<td class="ae-grilla-celda ae-grilla-ocupada" style="cursor:default" title="${ocupado.estudio}">${ocupado.apellido}</td>`
            : `<td class="ae-grilla-celda ae-grilla-libre" style="cursor:default">libre</td>`;
        });
        html += "</tr>";
      }
      html += "</tbody></table></div></div>";
      return html;
    }).join("");
  }

  function _render() {
    const container = document.getElementById("agenda-especial-container");
    if (!_turnos.length) {
      container.innerHTML = `<div class="empty-state">${_verCargados ? "No hay turnos de agendas especiales." : "No hay turnos pendientes de cargar en Sigehos."}</div>`;
      return;
    }

    const filas = _turnos.map((t) => `
      <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:10px;padding:.85rem 1rem;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:1rem">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.03em">${t.agenda_especial} · ${_fechaISOaDMY(t.fecha)} · ${_minAHora(t.mins)}</div>
          <div style="font-weight:600;margin-top:2px">${t.apellido}, ${t.nombre} <span style="font-weight:400;color:var(--text-2)">(DNI ${t.dni})</span></div>
          <div style="font-size:12px;color:var(--text-2)">${t.estudio}${t.observaciones ? " — " + t.observaciones : ""}</div>
        </div>
        <button class="btn-sm ae-btn-marcar" data-id="${t.id}" data-cargado="${t.cargado_sigehos ? "0" : "1"}">
          ${t.cargado_sigehos ? "↩ Marcar pendiente" : "✓ Marcar cargado en Sigehos"}
        </button>
      </div>`).join("");

    container.innerHTML = filas;

    container.querySelectorAll(".ae-btn-marcar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.dataset.id, 10);
        const cargado = btn.dataset.cargado === "1";
        btn.disabled = true;
        try {
          await RailwayAPI.marcarAgendaEspecialCargado(id, cargado);
          App.toast(cargado ? "Marcado como cargado en Sigehos" : "Marcado como pendiente", "ok");
          cargar();
        } catch (err) {
          App.toast("Error: " + err.message, "error");
          btn.disabled = false;
        }
      });
    });
  }

  function init() {
    document.getElementById("ae-especial-btn-reload").addEventListener("click", cargar);
    document.getElementById("ae-ver-cargados").addEventListener("change", (e) => {
      _verCargados = e.target.checked;
      cargar();
    });
  }

  return { cargar, init };
})();
