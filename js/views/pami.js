// js/views/pami.js — Vista PAMI (gestión de informes preliminares)

const PamiView = (() => {
  const PAMI_URL = "https://script.google.com/macros/s/AKfycbyf6pGup6zYbdkkxAyHcRpv3VZIXjKo6sSiA0gFnHOx86EgbUQQJg7tF744MHMssgGCzA/exec";

  let _datos = null;
  let _filtro = "";

  async function _pamiGet(params) {
    const qs   = new URLSearchParams(params).toString();
    const resp = await fetch(`${PAMI_URL}?${qs}`, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Error del servidor PAMI");
    return json.data;
  }

  async function cargar() {
    const container = document.getElementById("pami-container");
    container.innerHTML = '<div class="empty-state">Cargando PAMI...</div>';
    try {
      _datos = await _pamiGet({ action: "leerPAMI" });
      _render();
    } catch(err) {
      container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  async function _actualizar() {
    const btn = document.getElementById("pami-btn-actualizar");
    btn.disabled = true; btn.textContent = "⏳ Actualizando...";
    try {
      _datos = await _pamiGet({ action: "actualizarPAMI" });
      _render();
      App.toast("PAMI actualizado", "ok");
    } catch(err) {
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "↺ Actualizar";
    }
  }

  function _render() {
    const container = document.getElementById("pami-container");
    const r = _datos.resumen;

    const cards = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:1rem">
        <div style="background:#fff3e0;border:0.5px solid #ffcc80;border-radius:10px;padding:.8rem;text-align:center">
          <div style="font-size:11px;color:#e65100;font-weight:500">Urgentes</div>
          <div style="font-size:26px;font-weight:500;color:#e65100">${r.urgente}</div>
        </div>
        <div style="background:#fce8e8;border:0.5px solid #f5c6c6;border-radius:10px;padding:.8rem;text-align:center">
          <div style="font-size:11px;color:#c62828;font-weight:500">Vencidos</div>
          <div style="font-size:26px;font-weight:500;color:#c62828">${r.vencido}</div>
        </div>
        <div style="background:#e8f5e9;border:0.5px solid #a5d6a7;border-radius:10px;padding:.8rem;text-align:center">
          <div style="font-size:11px;color:#2e7d32;font-weight:500">Listos</div>
          <div style="font-size:26px;font-weight:500;color:#2e7d32">${r.listo}</div>
        </div>
        <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:10px;padding:.8rem;text-align:center">
          <div style="font-size:11px;color:var(--text-2);font-weight:500">Pendientes</div>
          <div style="font-size:26px;font-weight:500">${r.pendiente}</div>
        </div>
      </div>`;

    const filas = _datos.pendientes
      .filter(p => !_filtro || [p.apellido,p.nombre,p.dni,p.estudio].join(" ").toLowerCase().includes(_filtro))
      .map(p => {
        const estColor = p.estado === "Vencido"         ? "background:#fce8e8;color:#c62828"
                       : p.estado === "Urgente"          ? "background:#fff3e0;color:#e65100"
                       : p.estado === "Listo para cargar"? "background:#e8f5e9;color:#2e7d32"
                       : "background:#f0f0f0;color:#888";
        const fuenteBg = p.fuente === "BD" ? "background:#e8f4e8;color:#2e6b2e" : "background:#fff3e0;color:#7a4000";
        const bloqueado = p.estado === "Estudio pendiente";
        return `<tr data-fila="${p.filaSheet}">
          <td style="padding:7px 10px;font-weight:500;white-space:nowrap">${p.fecha}</td>
          <td style="padding:7px 10px;font-weight:500">${p.apellido}, ${p.nombre}</td>
          <td style="padding:7px 10px;color:var(--text-2)">${p.dni}</td>
          <td style="padding:7px 10px">${p.estudio}</td>
          <td style="padding:7px 10px;text-align:center"><span style="font-size:11px;font-weight:700;border-radius:4px;padding:2px 8px;${fuenteBg}">${p.fuente}</span></td>
          <td style="padding:7px 10px;text-align:center"><span style="font-size:11px;font-weight:700;border-radius:4px;padding:2px 8px;${estColor}">${p.estado}</span></td>
          <td style="padding:7px 10px;text-align:center">
            ${bloqueado
              ? `<span style="font-size:11px;color:#aaa">—</span>`
              : `<select class="pami-accion-sel" data-fila="${p.filaSheet}" style="font-size:12px;padding:3px 6px;border-radius:4px;border:0.5px solid var(--border)">
                  <option value="">— Acción —</option>
                  <option value="Subido">Subido</option>
                  <option value="No subido">No subido</option>
                  <option value="Cancelado">Cancelado</option>
                </select>`
            }
          </td>
        </tr>`;
      }).join("");

    container.innerHTML = `
      ${cards}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <input id="pami-filtro" type="search" placeholder="Filtrar por nombre, DNI o estudio..." style="flex:1;font-size:13px;padding:5px 10px">
        <span style="font-size:12px;color:var(--text-2)">${_datos.total} pendientes · ${r.bd} BD · ${r.ris} RIS</span>
      </div>
      <div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--navy);color:#fff">
              <th style="padding:8px 10px;text-align:left;font-size:11px">Fecha</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px">Paciente</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px">DNI</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px">Estudio</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px">Fuente</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px">Estado</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px">Acción</th>
            </tr>
          </thead>
          <tbody id="pami-tbody">${filas || '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-2)">Sin pendientes</td></tr>'}</tbody>
        </table>
      </div>`;

    // Filtro
    document.getElementById("pami-filtro").addEventListener("input", e => {
      _filtro = e.target.value.toLowerCase();
      _render();
    });

    // Acciones
    container.querySelectorAll(".pami-accion-sel").forEach(sel => {
      sel.addEventListener("change", async () => {
        const accion = sel.value;
        const fila   = sel.dataset.fila;
        if (!accion) return;
        const p = _datos.pendientes.find(x => String(x.filaSheet) === String(fila));
        const nombre = p ? `${p.apellido}, ${p.nombre}` : `fila ${fila}`;
        if (!confirm(`¿Registrar "${accion}" para ${nombre}?`)) { sel.value = ""; return; }
        sel.disabled = true;
        try {
          await _pamiGet({ action: "accionPAMI", filaSheet: fila, accion });
          App.toast(`${accion} registrado`, "ok");
          await cargar();
        } catch(err) {
          App.toast("Error: " + err.message, "error");
          sel.disabled = false; sel.value = "";
        }
      });
    });
  }

  function init() {
    document.getElementById("pami-btn-actualizar").addEventListener("click", _actualizar);
  }

  return { init, cargar };
})();