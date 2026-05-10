// js/views/lista.js — Vista lista del día (técnico)

const ListaView = (() => {
  let _fecha  = new Date();
  let _turnos = [];

  _fecha.setHours(0, 0, 0, 0);

  // ── colores de origen ─────────────────────────────────────
  const ORIGEN_STYLE = {
    "AMBULATORIO": { bg: "#e8f5e9", border: "#4a9e5c", text: "#1a5e28" },
    "GUARDIA":     { bg: "#e3f2fd", border: "#2a7ab5", text: "#0a3d6b" },
    "INTERNACIÓN": { bg: "#fff8e1", border: "#c9a000", text: "#7a4f00" },
    "INTERNACION": { bg: "#fff8e1", border: "#c9a000", text: "#7a4f00" },
    "DIRECCIÓN":   { bg: "#f3e5f5", border: "#7c5cb5", text: "#3d1e7a" },
    "DIRECCION":   { bg: "#f3e5f5", border: "#7c5cb5", text: "#3d1e7a" },
    "TRASLADO":    { bg: "#e0f7fa", border: "#1a6e8a", text: "#0a3d52" },
  };
  function _origen(o) {
    return ORIGEN_STYLE[(o || "").toUpperCase()] || { bg: "#fce4ec", border: "#c9506a", text: "#7a1f35" };
  }

  // ── render ────────────────────────────────────────────────
  function _render(turnos, filtro) {
    const tbody = document.getElementById("lista-tbody");
    const empty = document.getElementById("lista-empty");
    const stats = document.getElementById("lista-stats");

    const lista = filtro
      ? turnos.filter(t =>
          (t.nombre  + " " + t.apellido).toLowerCase().includes(filtro.toLowerCase()) ||
          t.dni.includes(filtro)
        )
      : turnos;

    const presentes = lista.filter(t => t.presente === "Presente").length;
    stats.textContent = `${lista.length} turnos · ${presentes} presentes · ${lista.length - presentes} pendientes`;

    if (lista.length === 0) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    tbody.innerHTML = lista.map(t => {
      const est  = _origen(t.origen);
      const pres = t.presente === "Presente";
      const rowClass = pres ? "presente-row" : "";
      const presBadge = pres
        ? `<span class="presente-badge">✅ Presente<br><span style="font-weight:400;font-size:10px;color:#666">${t.tsPresente || ""}</span></span>`
        : `<button class="btn-presente" data-fila="${t.fila}" data-nombre="${t.nombre} ${t.apellido}">Presente</button>`;

      return `<tr class="${rowClass}" data-fila="${t.fila}">
        <td class="td-hora">${t.hora}</td>
        <td class="td-nombre">${t.nombre}</td>
        <td>${t.apellido}</td>
        <td class="td-dni">${t.dni}</td>
        <td>${t.estudio}</td>
        <td><span class="origen-tag" style="background:${est.bg};border-color:${est.border};color:${est.text}">${t.origen}</span></td>
        <td class="td-obs">${t.observaciones || ""}</td>
        <td>${presBadge}</td>
        <td>
          <button class="btn-sm btn-anular" data-fila="${t.fila}" data-nombre="${t.nombre} ${t.apellido}" style="color:#c62828;border-color:#c62828">Anular</button>
        </td>
      </tr>`;
    }).join("");

    // ── botones de presente ──
    tbody.querySelectorAll(".btn-presente").forEach(btn => {
      btn.addEventListener("click", async () => {
        const fila   = parseInt(btn.dataset.fila);
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Dar presente a ${nombre}?`)) return;
        btn.disabled = true;
        btn.textContent = "Guardando…";
        try {
          await API.presente(fila);
          App.toast(`Presente registrado: ${nombre}`, "ok");
          await cargar();
        } catch (err) {
          App.toast("Error: " + err.message, "error");
          btn.disabled = false;
          btn.textContent = "Presente";
        }
      });
    });

    // ── botones de anular ──
    tbody.querySelectorAll(".btn-anular").forEach(btn => {
      btn.addEventListener("click", async () => {
        const fila   = parseInt(btn.dataset.fila);
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Anular el turno de ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
        btn.disabled = true;
        try {
          await API.anular(fila);
          App.toast(`Turno anulado: ${nombre}`, "ok");
          await cargar();
        } catch (err) {
          App.toast("Error: " + err.message, "error");
          btn.disabled = false;
        }
      });
    });
  }

  // ── carga ─────────────────────────────────────────────────
  async function cargar() {
    const loading = document.getElementById("lista-loading");
    const filtro  = document.getElementById("lista-filtro").value;
    _actualizarLabel();
    loading.classList.remove("hidden");
    try {
      _turnos = await API.turnos(API.fechaAStr(_fecha));
      _render(_turnos, filtro);
    } catch (err) {
      App.toast("Error cargando lista: " + err.message, "error");
      document.getElementById("lista-tbody").innerHTML = "";
      document.getElementById("lista-empty").textContent = "Error: " + err.message;
      document.getElementById("lista-empty").classList.remove("hidden");
    } finally {
      loading.classList.add("hidden");
    }
  }

  function _actualizarLabel() {
    const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    document.getElementById("lista-fecha-label").textContent =
      `${DIAS[_fecha.getDay()]} ${_fecha.getDate()} de ${MESES[_fecha.getMonth()]}`;
  }

  function init() {
    document.getElementById("btn-dia-ant").onclick = () => {
      _fecha.setDate(_fecha.getDate() - 1); cargar();
    };
    document.getElementById("btn-dia-sig").onclick = () => {
      _fecha.setDate(_fecha.getDate() + 1); cargar();
    };
    document.getElementById("btn-lista-hoy").onclick = () => {
      _fecha = new Date(); _fecha.setHours(0, 0, 0, 0); cargar();
    };
    document.getElementById("lista-filtro").addEventListener("input", (e) => {
      _render(_turnos, e.target.value);
    });
  }

  return { init, cargar };
})();
