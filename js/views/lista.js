// js/views/lista.js — Vista lista del día (técnico + administrativo)

const ListaView = (() => {
  let _fecha  = new Date();
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
    return ORIGEN_STYLE[(o||"").toUpperCase()] || { bg: "#fce4ec", border: "#c9506a", text: "#7a1f35" };
  }

  // ── render combinado: slots de agenda + turnos ────────────
  function _render(agendaDia, turnos, filtro) {
    const tbody  = document.getElementById("lista-tbody");
    const empty  = document.getElementById("lista-empty");
    const stats  = document.getElementById("lista-stats");

    const MIN_I = 7*60, MIN_F = 23*60;
    const fechaStr = API.fechaAStr(_fecha);

    // Construir mapa minutos → turno
    const turnoMap = {};
    for (const t of turnos) {
      turnoMap[t.mins] = t;
    }

    // Construir filas: un slot por cada entrada de la agenda (libres + ocupados)
    const filas = [];
    if (agendaDia && agendaDia.slots) {
      // Agregar slots de la agenda (incluye libres, franjas, bloqueos)
      for (const s of agendaDia.slots) {
        if (s.mins < MIN_I || s.mins >= MIN_F) continue;
        if (s.tipo === "continuacion") continue; // ocultar continuaciones

        const turno = turnoMap[s.mins];
        filas.push({ slot: s, turno: turno || null, mins: s.mins });
      }
    } else {
      // Fallback: solo turnos si no hay agenda
      for (const t of turnos) {
        filas.push({ slot: { tipo: "turno" }, turno: t, mins: t.mins });
      }
    }

    // Aplicar filtro
    const filasFiltradas = filtro
      ? filas.filter(f => {
          if (!f.turno) return false;
          return (f.turno.nombre + " " + f.turno.apellido).toLowerCase().includes(filtro.toLowerCase())
              || f.turno.dni.includes(filtro);
        })
      : filas;

    const presentes = turnos.filter(t => t.presente === "Presente").length;
    stats.textContent = `${turnos.length} turnos · ${presentes} presentes · ${turnos.length - presentes} pendientes · ${filas.filter(f=>f.slot.tipo==="libre").length} slots libres`;

    if (filasFiltradas.length === 0) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    tbody.innerHTML = filasFiltradas.map(({ slot, turno, mins }) => {
      const h = String(Math.floor(mins/60)).padStart(2,"0");
      const m = String(mins%60).padStart(2,"0");
      const hora = `${h}:${m}`;

      // ── SLOT LIBRE ──
      if (slot.tipo === "libre") {
        return `<tr class="fila-libre" data-mins="${mins}" data-fecha="${fechaStr}" style="cursor:pointer" title="Clic para asignar turno en este horario">
          <td class="td-hora" style="color:#aaa">${hora}</td>
          <td colspan="6" style="color:#bbb;font-style:italic;font-size:12px">
            <span style="color:#4a9e5c;font-weight:600">+ Libre</span> — clic para asignar turno
          </td>
          <td></td><td></td>
        </tr>`;
      }

      // ── BLOQUEO / FRANJA ──
      if (!turno) {
        const bg    = slot.color || "#f5f5f5";
        const label = slot.label || slot.tipo || "";
        return `<tr style="background:${bg}20">
          <td class="td-hora" style="color:#999">${hora}</td>
          <td colspan="6" style="color:#999;font-size:11px;font-style:italic">${label}</td>
          <td></td><td></td>
        </tr>`;
      }

      // ── TURNO ASIGNADO ──
      const est  = _origen(turno.origen);
      const pres = turno.presente === "Presente";
      const rowCls = pres ? "presente-row" : "";
      const presBadge = pres
        ? `<span class="presente-badge">✅ Presente<br><span style="font-weight:400;font-size:10px;color:#666">${turno.tsPresente||""}</span></span>`
        : `<button class="btn-presente" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;

      return `<tr class="${rowCls}" data-fila="${turno.fila}">
        <td class="td-hora">${hora}</td>
        <td class="td-nombre">${turno.nombre}</td>
        <td>${turno.apellido}</td>
        <td class="td-dni">${turno.dni}</td>
        <td>${turno.estudio}</td>
        <td><span class="origen-tag" style="background:${est.bg};border-color:${est.border};color:${est.text}">${turno.origen}</span></td>
        <td class="td-obs">${turno.observaciones||""}</td>
        <td>${presBadge}</td>
        <td>
          <button class="btn-sm btn-anular" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}" style="color:#c62828;border-color:#c62828">Anular</button>
        </td>
      </tr>`;
    }).join("");

    // ── click en slot libre → asignar turno ──
    tbody.querySelectorAll(".fila-libre").forEach(tr => {
      tr.addEventListener("click", () => {
        const mins  = parseInt(tr.dataset.mins);
        const fecha = tr.dataset.fecha;
        const h = String(Math.floor(mins/60)).padStart(2,"0");
        const m = String(mins%60).padStart(2,"0");
        App.abrirTurnoConFechaHora(fecha, `${h}:${m}`);
      });
    });

    // ── botón presente ──
    tbody.querySelectorAll(".btn-presente").forEach(btn => {
      btn.addEventListener("click", async () => {
        const fila   = parseInt(btn.dataset.fila);
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Dar presente a ${nombre}?`)) return;
        btn.disabled = true; btn.textContent = "Guardando…";
        try {
          await API.presente(fila);
          App.toast(`Presente: ${nombre}`, "ok");
          await cargar();
        } catch(err) {
          App.toast("Error: "+err.message, "error");
          btn.disabled = false; btn.textContent = "Presente";
        }
      });
    });

    // ── botón anular ──
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
        } catch(err) {
          App.toast("Error: "+err.message, "error");
          btn.disabled = false;
        }
      });
    });
  }

  // ── carga ─────────────────────────────────────────────────
  async function cargar() {
    const loading  = document.getElementById("lista-loading");
    const filtro   = document.getElementById("lista-filtro").value;
    _actualizarLabel();
    loading.classList.remove("hidden");
    try {
      const fechaStr = API.fechaAStr(_fecha);
      // Cargar agenda del día (slots) y turnos en paralelo
      const [agendaArr, turnos] = await Promise.all([
        API.agenda(fechaStr, 1, 20),   // paso 20 min para ver más granularidad
        API.turnos(fechaStr)
      ]);
      const agendaDia = agendaArr && agendaArr[0] ? agendaArr[0] : null;
      _render(agendaDia, turnos, filtro);
    } catch(err) {
      App.toast("Error cargando lista: "+err.message, "error");
      document.getElementById("lista-tbody").innerHTML = "";
      document.getElementById("lista-empty").textContent = "Error: "+err.message;
      document.getElementById("lista-empty").classList.remove("hidden");
    } finally {
      loading.classList.add("hidden");
    }
  }

  function _actualizarLabel() {
    const DIAS  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    document.getElementById("lista-fecha-label").textContent =
      `${DIAS[_fecha.getDay()]} ${_fecha.getDate()} de ${MESES[_fecha.getMonth()]}`;
  }

  function setFecha(fechaStr) {
    const p = fechaStr.split("/");
    _fecha = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
    _fecha.setHours(0,0,0,0);
  }

  function init() {
    document.getElementById("btn-dia-ant").onclick = () => {
      _fecha.setDate(_fecha.getDate()-1); cargar();
    };
    document.getElementById("btn-dia-sig").onclick = () => {
      _fecha.setDate(_fecha.getDate()+1); cargar();
    };
    document.getElementById("btn-lista-hoy").onclick = () => {
      _fecha = new Date(); _fecha.setHours(0,0,0,0); cargar();
    };
    document.getElementById("lista-filtro").addEventListener("input", () => cargar());
  }

  return { init, cargar, setFecha };
})();