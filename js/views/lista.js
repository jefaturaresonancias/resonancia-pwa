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
  function _render(agendaDia, turnos, filtro, risDelDia) {
    risDelDia = risDelDia || [];
    const tbody  = document.getElementById("lista-tbody");
    const empty  = document.getElementById("lista-empty");
    const stats  = document.getElementById("lista-stats");

    const MIN_I = 0, MIN_F = 24*60;
    const fechaStr = API.fechaAStr(_fecha);

    // Construir mapa minutos → turno
    const turnoMap = {};
    for (const t of turnos) {
      turnoMap[t.mins] = t;
    }

    // Construir filas: un slot por cada entrada de la agenda (libres + ocupados)
    const filas = [];
    if (agendaDia && agendaDia.slots) {
      for (const s of agendaDia.slots) {
        if (s.mins < MIN_I || s.mins >= MIN_F) continue;
        if (s.tipo === "continuacion") continue;
        const turno = turnoMap[s.mins];
        filas.push({ slot: s, turno: turno || null, mins: s.mins, esRIS: false });
      }
    } else {
      for (const t of turnos) {
        filas.push({ slot: { tipo: "turno" }, turno: t, mins: t.mins, esRIS: false });
      }
    }

    // Agregar filas RIS intercaladas — excluir duplicados con agenda propia
    const dnisPropios = new Set(
      turnos.map(t => String(t.dni).trim().replace(/^0+/, ""))
    );
    for (const r of risDelDia) {
      const mins = _parseMins(r.hora);
      if (mins < MIN_I || mins >= MIN_F) continue;
      const dniRIS = String(r.documento || "")
        .replace(/^(DNI|CIBO|RP)\s*/i, "").trim().replace(/^0+/, "");
      if (dnisPropios.has(dniRIS)) continue; // ya está en agenda propia
      filas.push({ slot: { tipo: "ris" }, turno: null, mins, esRIS: true, ris: r });
    }
    filas.sort((a, b) => a.mins - b.mins);

    // Aplicar filtro
    const filasFiltradas = filtro
      ? filas.filter(f => {
          if (!f.turno) return false;
          return (f.turno.nombre + " " + f.turno.apellido).toLowerCase().includes(filtro.toLowerCase())
              || f.turno.dni.includes(filtro);
        })
      : filas;

    const presentes = turnos.filter(t => t.presente === "Presente").length;
    const cntRIS = risDelDia.length;
    stats.textContent = `${turnos.length} turnos · ${presentes} presentes · ${turnos.length - presentes} pendientes · ${filas.filter(f=>f.slot&&f.slot.tipo==="libre").length} libres${cntRIS > 0 ? ` · 📋 ${cntRIS} RIS` : ""}`;

    if (filasFiltradas.length === 0) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const esTecnico = Config.getRol() === "tecnico";

    tbody.innerHTML = filasFiltradas.map((fila) => {
      const { slot, turno, mins, esRIS } = fila;
      const h = String(Math.floor(mins/60)).padStart(2,"0");
      const m = String(mins%60).padStart(2,"0");
      const hora = `${h}:${m}`;

      // Técnico no ve slots libres ni continuaciones
      if (esTecnico && !turno && !esRIS) return "";

      // ── FILA RIS ──
      if (esRIS) {
        const r = fila.ris;
        return `<tr style="background:#f5f5f5;border-left:3px solid #bbb">
          <td class="td-hora" style="color:#999">${hora}</td>
          <td style="color:#888;font-style:italic">${r.apellido_nombre}</td>
          <td colspan="2" style="color:#aaa;font-size:11px;font-style:italic">${r.documento}</td>
          <td colspan="2" style="color:#aaa;font-size:11px">${r.practica}</td>
          <td></td>
          <td><span style="font-size:10px;background:#eee;color:#888;padding:2px 8px;border-radius:10px;font-weight:600">RIS</span></td>
          <td></td>
        </tr>`;
      }

      // ── SLOT LIBRE — solo para administrativo ──
      if (slot.tipo === "libre") {
        if (esTecnico) return "";
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
        const esFranja = slot.tipo === "franja" || slot.tipo === "franja_origen";
        if (esFranja) {
          // Detectar condición según tipo y label
          const condicion = {
            label,
            tipo:    slot.tipo,
            origen:  slot.tipo === "franja_origen" ? _detectarOrigen(label) : null,
            filtro:  slot.tipo === "franja"        ? _detectarFiltroEstudio(label) : null
          };
          return `<tr class="fila-franja" data-mins="${mins}" data-fecha="${fechaStr}"
                  data-condicion="${encodeURIComponent(JSON.stringify(condicion))}"
                  style="cursor:pointer;background:${bg}22" title="Clic para asignar turno (${label})">
            <td class="td-hora" style="color:#888">${hora}</td>
            <td colspan="6" style="font-size:11px">
              <span style="display:inline-block;background:${bg};color:#555;padding:2px 10px;border-radius:10px;font-weight:600">${label}</span>
              <span style="color:#aaa;font-size:10px;margin-left:8px">clic para asignar</span>
            </td>
            <td></td><td></td>
          </tr>`;
        }
        // Bloqueo puro — ocultar en vista técnico
        if (esTecnico) return "";
        return `<tr style="background:${bg}18">
          <td class="td-hora" style="color:#bbb">${hora}</td>
          <td colspan="6" style="color:#bbb;font-size:11px;font-style:italic">${label}</td>
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

    // ── click en franja → asignar turno con condición ──
    tbody.querySelectorAll(".fila-franja").forEach(tr => {
      tr.addEventListener("click", () => {
        const mins     = parseInt(tr.dataset.mins);
        const fecha    = tr.dataset.fecha;
        const condicion = JSON.parse(decodeURIComponent(tr.dataset.condicion));
        const h = String(Math.floor(mins/60)).padStart(2,"0");
        const m = String(mins%60).padStart(2,"0");
        App.abrirTurnoConCondicion(fecha, `${h}:${m}`, condicion);
      });
    });

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
      const [agendaArr, turnos, risDelDia] = await Promise.all([
        API.agenda(fechaStr, 1, 20),
        API.turnos(fechaStr),
        API.leerRIS(fechaStr).catch(() => [])
      ]);
      const agendaDia = agendaArr && agendaArr[0] ? agendaArr[0] : null;
      _render(agendaDia, turnos, filtro, risDelDia);
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

  function _parseMins(hora) {
    if (!hora) return 0;
    const p = String(hora).replace(/a\.m\.|p\.m\./gi,"").trim().split(":");
    return parseInt(p[0]||0)*60 + (parseInt(p[1]||0));
  }

  function _detectarOrigen(label) {
    const l = (label||"").toLowerCase();
    if (l.includes("intern")) return "INTERNACIÓN";
    if (l.includes("guardia")) return "GUARDIA";
    if (l.includes("direcci")) return "DIRECCIÓN";
    if (l.includes("traslad")) return "TRASLADO";
    return null;
  }

  function _detectarFiltroEstudio(label) {
    const l = (label||"").toLowerCase();
    if (l.includes("mamari")) return "mamaria";
    if (l.includes("cardiolog")) return "cardiolog";
    if (l.includes("neuroci") || l.includes("neuro")) return "cerebro";
    return null;
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