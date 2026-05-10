// js/views/turno.js — Formulario de asignación y buscador

const TurnoView = (() => {
  let _slotSeleccionado = null;  // { mins, hora }
  let _fechaPrefill     = null;
  let _horaPrefill      = null;

  // ── cargar lista de estudios desde config ─────────────────
  async function cargarEstudios() {
    const sel = document.getElementById("t-estudio");
    if (sel.options.length > 1) return; // ya cargados
    try {
      const cfg    = await API.config();
      const estudios = Object.keys(cfg.estudios || {}).sort();
      estudios.forEach(e => {
        const opt = document.createElement("option");
        opt.value = e;
        opt.textContent = e;
        sel.appendChild(opt);
      });
    } catch (err) {
      App.toast("Error cargando estudios: " + err.message, "error");
    }
  }

  // ── prefill desde click en agenda ─────────────────────────
  function prefill(fecha, hora) {
    _fechaPrefill = fecha;
    _horaPrefill  = hora;

    // Convertir dd/MM/yyyy → yyyy-MM-dd para input[type=date]
    if (fecha) {
      const p = fecha.split("/");
      document.getElementById("t-fecha").value = `${p[2]}-${p[1]}-${p[0]}`;
    }
    // hora queda para seleccionar en los chips de slots
    // pero lo mostramos pre-seleccionado si viene de un click directo
  }

  // ── buscar slots disponibles ──────────────────────────────
  async function _buscarSlots() {
    const estudio = document.getElementById("t-estudio").value;
    const origen  = document.getElementById("t-origen").value;
    const fechaRaw = document.getElementById("t-fecha").value;  // yyyy-MM-dd

    if (!estudio) { App.toast("Seleccioná un estudio primero.", "error"); return; }
    if (!fechaRaw){ App.toast("Ingresá una fecha.", "error"); return; }

    // Convertir yyyy-MM-dd → dd/MM/yyyy
    const [y, m, d] = fechaRaw.split("-");
    const fecha = `${d}/${m}/${y}`;

    const slotsContainer = document.getElementById("slots-container");
    const slotsGrid      = document.getElementById("slots-grid");
    const slotsLoading   = document.getElementById("slots-loading");
    const slotSel        = document.getElementById("slot-seleccionado");

    slotsContainer.classList.remove("hidden");
    slotsGrid.innerHTML = "";
    slotSel.classList.add("hidden");
    slotsLoading.classList.remove("hidden");
    _slotSeleccionado = null;

    try {
      const result = await API.slots(fecha, estudio, origen);

      if (result.esFeriado) {
        slotsGrid.innerHTML = `<p style="color:#c62828;font-weight:600">🚫 ${fecha} es feriado: ${result.feriado}</p>`;
        return;
      }
      if (result.total === 0) {
        slotsGrid.innerHTML = `<p style="color:#666">Sin turnos disponibles para esta fecha y estudio.<br>Probá con otra fecha.</p>`;
        return;
      }

      result.libres.forEach(slot => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "slot-chip";
        chip.textContent = slot.hora;
        chip.dataset.mins = slot.mins;
        chip.dataset.hora = slot.hora;

        // Si viene prefill de hora, auto-seleccionar
        if (_horaPrefill && slot.hora === _horaPrefill) {
          _elegirSlot(chip, slot);
        }

        chip.addEventListener("click", () => _elegirSlot(chip, slot));
        slotsGrid.appendChild(chip);
      });

    } catch (err) {
      slotsGrid.innerHTML = `<p style="color:#c62828">Error: ${err.message}</p>`;
    } finally {
      slotsLoading.classList.add("hidden");
    }
  }

  function _elegirSlot(chip, slot) {
    document.querySelectorAll(".slot-chip").forEach(c => c.classList.remove("selected"));
    chip.classList.add("selected");
    _slotSeleccionado = slot;
    document.getElementById("slot-hora-label").textContent = `Horario seleccionado: ${slot.hora} hs`;
    document.getElementById("slot-seleccionado").classList.remove("hidden");
  }

  // ── confirmar turno ───────────────────────────────────────
  async function _confirmar(e) {
    e.preventDefault();

    if (!_slotSeleccionado) {
      App.toast("Seleccioná un horario disponible.", "error");
      return;
    }

    const nombre  = document.getElementById("t-nombre").value.trim();
    const apellido= document.getElementById("t-apellido").value.trim();
    const dni     = document.getElementById("t-dni").value.trim();
    const estudio = document.getElementById("t-estudio").value;
    const origen  = document.getElementById("t-origen").value;
    const obs     = document.getElementById("t-obs").value.trim();
    const fechaRaw= document.getElementById("t-fecha").value;  // yyyy-MM-dd

    if (!nombre || !apellido || !dni) {
      App.toast("Completá nombre, apellido y DNI.", "error");
      return;
    }

    const [y, m, d] = fechaRaw.split("-");
    const fecha = `${d}/${m}/${y}`;

    const btn = document.getElementById("btn-confirmar");
    btn.disabled = true;
    btn.textContent = "Guardando…";

    const result = document.getElementById("turno-result");
    result.classList.add("hidden");

    try {
      const resp = await API.asignar({
        nombre, apellido, dni, estudio, origen,
        fecha, hora: _slotSeleccionado.hora,
        observaciones: obs
      });

      result.className = "turno-result ok";
      result.innerHTML = `✅ Turno confirmado correctamente<br>
        <strong>${apellido}, ${nombre}</strong> · ${estudio}<br>
        📅 ${fecha} · 🕐 ${_slotSeleccionado.hora} hs`;
      result.classList.remove("hidden");

      App.toast(`Turno asignado: ${apellido}, ${nombre} — ${_slotSeleccionado.hora} hs`, "ok");
      _resetForm();
      App.refrescarAgenda();

    } catch (err) {
      result.className = "turno-result error";
      result.textContent = "❌ Error: " + err.message;
      result.classList.remove("hidden");
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "✓ Confirmar turno";
    }
  }

  function _resetForm() {
    document.getElementById("form-turno").reset();
    document.getElementById("slots-container").classList.add("hidden");
    document.getElementById("slot-seleccionado").classList.add("hidden");
    document.getElementById("slots-grid").innerHTML = "";
    _slotSeleccionado = null;
    _fechaPrefill = null;
    _horaPrefill  = null;
  }

  function init() {
    document.getElementById("btn-ver-slots").onclick = _buscarSlots;
    document.getElementById("form-turno").addEventListener("submit", _confirmar);
  }

  return { init, prefill, cargarEstudios };
})();


// ── BUSCAR VIEW ───────────────────────────────────────────────

const BuscarView = (() => {
  const ORIGEN_STYLE = {
    "AMBULATORIO": { bg: "#e8f5e9", border: "#4a9e5c", text: "#1a5e28" },
    "GUARDIA":     { bg: "#e3f2fd", border: "#2a7ab5", text: "#0a3d6b" },
    "INTERNACIÓN": { bg: "#fff8e1", border: "#c9a000", text: "#7a4f00" },
    "INTERNACION": { bg: "#fff8e1", border: "#c9a000", text: "#7a4f00" },
  };
  function _origen(o) {
    return ORIGEN_STYLE[(o||"").toUpperCase()] || { bg: "#fce4ec", border: "#c9506a", text: "#7a1f35" };
  }

  async function buscar() {
    const apellido = document.getElementById("b-apellido").value.trim();
    const dni      = document.getElementById("b-dni").value.trim();

    if (!apellido && !dni) { App.toast("Ingresá apellido o DNI.", "error"); return; }

    const btn = document.getElementById("btn-buscar");
    btn.disabled = true; btn.textContent = "Buscando…";

    const div = document.getElementById("buscar-results");
    div.innerHTML = '<p style="color:#666;padding:1rem">Buscando…</p>';

    try {
      const turnos = await API.buscar(apellido, dni);
      if (turnos.length === 0) {
        div.innerHTML = '<div class="empty-state">Sin resultados para los criterios ingresados.</div>';
        return;
      }

      div.innerHTML = turnos.map(t => {
        const est = _origen(t.origen);
        const estadoCls = t.tipoMod === "Anular" ? "estado-anulado"
                        : t.tipoMod && t.tipoMod !== "" ? "estado-mod" : "estado-activo";
        const estadoTxt = t.tipoMod === "Anular" ? "🔴 Anulado"
                        : t.tipoMod && t.tipoMod !== "" ? `🟡 Mod. ${t.tipoMod}` : "🟢 Activo";

        return `<div class="buscar-card">
          <div class="buscar-card-header">
            <span class="buscar-nombre">${t.apellido}, ${t.nombre} · DNI ${t.dni}</span>
            <span class="buscar-estado ${estadoCls}">${estadoTxt}</span>
          </div>
          <div class="buscar-detalle">
            <span>📅 ${t.fecha}</span>
            <span>🕐 ${t.hora} hs</span>
            <span>🔬 ${t.estudio}</span>
            <span><span class="origen-tag" style="background:${est.bg};border-color:${est.border};color:${est.text}">${t.origen}</span></span>
            ${t.observaciones ? `<span>📝 ${t.observaciones}</span>` : ""}
            ${t.presente === "Presente" ? '<span>✅ Presente</span>' : ""}
          </div>
          ${t.tipoMod === "" ? `<div style="margin-top:.5rem"><button class="btn-sm btn-anular-busq" data-fila="${t.fila}" data-nombre="${t.apellido}, ${t.nombre}" style="color:#c62828;border-color:#c62828">Anular turno</button></div>` : ""}
        </div>`;
      }).join("");

      // Anular desde buscar
      div.querySelectorAll(".btn-anular-busq").forEach(btn => {
        btn.addEventListener("click", async () => {
          const fila   = parseInt(btn.dataset.fila);
          const nombre = btn.dataset.nombre;
          if (!confirm(`¿Anular el turno de ${nombre}?`)) return;
          btn.disabled = true;
          try {
            await API.anular(fila);
            App.toast(`Turno anulado: ${nombre}`, "ok");
            buscar();
          } catch (err) {
            App.toast("Error: " + err.message, "error");
            btn.disabled = false;
          }
        });
      });

    } catch (err) {
      div.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "Buscar";
    }
  }

  function init() {
    document.getElementById("btn-buscar").onclick = buscar;
    document.getElementById("b-apellido").addEventListener("keydown", e => { if (e.key === "Enter") buscar(); });
    document.getElementById("b-dni").addEventListener("keydown",      e => { if (e.key === "Enter") buscar(); });
  }

  return { init };
})();
