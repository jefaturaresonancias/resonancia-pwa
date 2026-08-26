// js/views/agendaEspecial.js — "Verificar agendas especiales" (26/8/2026)
// Turnos cargados desde ncx.html/neurologia.html (coordinadores externos,
// sin sesión de Railway) — acá Administrativo/Jefatura/Admin los ven para
// cargarlos a mano en Sigehos y marcarlos como hechos.

const AgendaEspecialView = (() => {
  let _turnos = [];
  let _verCargados = false;

  function _minAHora(m) {
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
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
