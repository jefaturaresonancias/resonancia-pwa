// js/views/turno.js — Formulario de asignación con múltiples estudios

const TurnoView = (() => {
  let _slotSeleccionado = null;
  let _fechaPrefill     = null;
  let _horaPrefill      = null;
  let _estudiosConfig   = {};        // { nombre: { duracion, restriccion } }
  let _estudiosElegidos = [];        // array de nombres elegidos

  // ── Cargar estudios ───────────────────────────────────────
  async function cargarEstudios() {
    if (Object.keys(_estudiosConfig).length > 0) return;
    try {
      const cfg = await API.config();
      _estudiosConfig = cfg.estudios || {};
      _poblarSelect();
    } catch (err) {
      App.toast("Error cargando estudios: " + err.message, "error");
    }
  }

  function _poblarSelect(filtro) {
    const sel = document.getElementById("t-estudio-sel");
    sel.innerHTML = '<option value="">— Seleccionar estudio —</option>';
    const nombres = Object.keys(_estudiosConfig).sort();
    for (const n of nombres) {
      if (filtro && !n.toLowerCase().includes(filtro.toLowerCase())) continue;
      if (_estudiosElegidos.includes(n)) continue; // ya agregado
      const opt = document.createElement("option");
      opt.value = n; opt.textContent = n;
      sel.appendChild(opt);
    }
  }

  // ── Agregar estudio elegido ───────────────────────────────
  function _agregarEstudio(nombre) {
    if (!nombre || _estudiosElegidos.includes(nombre)) return;
    _estudiosElegidos.push(nombre);
    _renderChips();
    _actualizarTiempo();
    _poblarSelect();
    document.getElementById("t-estudio-sel").value = "";
    // Limpiar slots anteriores
    _limpiarSlots();
  }

  function _quitarEstudio(nombre) {
    _estudiosElegidos = _estudiosElegidos.filter(e => e !== nombre);
    _renderChips();
    _actualizarTiempo();
    _poblarSelect();
    _limpiarSlots();
  }

  function _renderChips() {
    const wrap = document.getElementById("t-estudios-chips");
    if (_estudiosElegidos.length === 0) {
      wrap.innerHTML = '<span style="color:var(--text-3);font-size:12px;font-style:italic">Ningún estudio seleccionado</span>';
      return;
    }
    wrap.innerHTML = _estudiosElegidos.map(n => `
      <span class="estudio-chip">
        ${n}
        <button type="button" class="chip-remove" data-est="${encodeURIComponent(n)}" title="Quitar">×</button>
      </span>`).join("");
    wrap.querySelectorAll(".chip-remove").forEach(btn => {
      btn.addEventListener("click", () => _quitarEstudio(decodeURIComponent(btn.dataset.est)));
    });
  }

  function _actualizarTiempo() {
    const durTotal = _estudiosElegidos.reduce((sum, n) =>
      sum + (_estudiosConfig[n]?.duracion || 0), 0);
    const el = document.getElementById("t-tiempo-total");
    if (durTotal > 0) {
      const h = Math.floor(durTotal / 60);
      const m = durTotal % 60;
      const label = h > 0 ? `${h}h ${m > 0 ? m + "min" : ""}` : `${m} min`;
      el.innerHTML = `⏱ Tiempo total estimado: <strong>${label}</strong>`;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  function _limpiarSlots() {
    document.getElementById("slots-container").classList.add("hidden");
    document.getElementById("slot-seleccionado").classList.add("hidden");
    document.getElementById("slots-grid").innerHTML = "";
    document.getElementById("turno-result").classList.add("hidden");
    _slotSeleccionado = null;
  }

  // ── Prefill desde agenda/lista ────────────────────────────
  function prefill(fecha, hora, condicion) {
    _fechaPrefill = fecha;
    _horaPrefill  = hora;

    if (fecha) {
      const p = fecha.split("/");
      document.getElementById("t-fecha").value = `${p[2]}-${p[1]}-${p[0]}`;
    }

    const avisoEl = document.getElementById("turno-condicion-aviso");
    if (avisoEl) avisoEl.remove();

    if (condicion) {
      if (condicion.origen) {
        const sel = document.getElementById("t-origen");
        for (const opt of sel.options) {
          if (opt.value.toUpperCase() === condicion.origen.toUpperCase()) {
            sel.value = opt.value; break;
          }
        }
        sel.style.borderColor = "#c9a000";
      }
      if (condicion.filtro) _filtrarEstudios(condicion.filtro);

      const aviso = document.createElement("div");
      aviso.id = "turno-condicion-aviso";
      aviso.style.cssText = "background:#fff8e1;border-left:4px solid #f0c040;padding:8px 14px;border-radius:4px;font-size:12px;font-weight:600;color:#7a4f00;margin-bottom:1rem";
      aviso.innerHTML = `⚠️ Franja con condición: <strong>${condicion.label}</strong>${condicion.filtro ? " — estudios filtrados" : ""}${condicion.origen ? " — origen pre-seleccionado" : ""}`;
      const form = document.getElementById("form-turno");
      if (form) form.insertBefore(aviso, form.firstChild);
    }

    // Si viene con hora prefijada → mostrar horario seleccionado directamente
    if (hora) {
      const slotsContainer = document.getElementById("slots-container");
      const slotSel        = document.getElementById("slot-seleccionado");
      const slotsGrid      = document.getElementById("slots-grid");

      slotsContainer.classList.remove("hidden");
      slotsGrid.innerHTML = "";

      // Mostrar directamente el slot elegido sin buscar
      _slotSeleccionado = { hora, mins: _horaAMins(hora) };
      document.getElementById("slot-hora-label").textContent = `Horario seleccionado: ${hora} hs`;
      slotSel.classList.remove("hidden");

      // Agregar chip de hora con opción de cambiar
      slotsGrid.innerHTML = `<div style="margin-bottom:.5rem;font-size:12px;color:var(--text-2)">
        Horario pre-seleccionado desde la agenda. 
        <button type="button" id="btn-cambiar-hora" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;text-decoration:underline;padding:0">Buscar otro horario</button>
      </div>`;
      document.getElementById("btn-cambiar-hora").addEventListener("click", () => {
        _slotSeleccionado = null;
        slotSel.classList.add("hidden");
        slotsGrid.innerHTML = "";
        slotsContainer.classList.add("hidden");
      });
    }
  }

  function _horaAMins(hora) {
    if (!hora) return 0;
    const p = hora.split(":");
    return parseInt(p[0]||0)*60 + parseInt(p[1]||0);
  }

  function _filtrarEstudios(filtro) {
    document.getElementById("t-estudio-buscar").value = filtro;
    _poblarSelect(filtro);
    const sel = document.getElementById("t-estudio-sel");
    if (sel.options.length > 1) sel.value = sel.options[1].value;
    sel.style.borderColor = "#f0c040";
  }

  // ── Buscar slots ──────────────────────────────────────────
  async function _buscarSlots() {
    if (_estudiosElegidos.length === 0) {
      App.toast("Agregá al menos un estudio.", "error"); return;
    }
    const origen   = document.getElementById("t-origen").value;
    const fechaRaw = document.getElementById("t-fecha").value;
    if (!fechaRaw) { App.toast("Ingresá una fecha.", "error"); return; }

    const [y, m, d] = fechaRaw.split("-");
    const fecha = `${d}/${m}/${y}`;
    const estudioStr = _estudiosElegidos.join(", ");

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
      const result = await API.slots(fecha, estudioStr, origen);
      if (result.esFeriado) {
        slotsGrid.innerHTML = `<p style="color:#c62828;font-weight:600">🚫 ${fecha} es feriado: ${result.feriado}</p>`;
        return;
      }
      if (result.total === 0) {
        slotsGrid.innerHTML = `<p style="color:#666">Sin turnos disponibles para esta fecha.<br>Probá con otra fecha.</p>`;
        return;
      }
      result.libres.forEach(slot => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "slot-chip";
        chip.textContent = slot.hora;
        chip.dataset.mins = slot.mins;
        chip.dataset.hora = slot.hora;
        if (_horaPrefill && slot.hora === _horaPrefill) _elegirSlot(chip, slot);
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

  // ── Confirmar turno ───────────────────────────────────────
  async function _confirmar(e) {
    e.preventDefault();
    if (_estudiosElegidos.length === 0) { App.toast("Agregá al menos un estudio.", "error"); return; }
    if (!_slotSeleccionado)             { App.toast("Seleccioná un horario.", "error"); return; }

    const nombre   = document.getElementById("t-nombre").value.trim();
    const apellido = document.getElementById("t-apellido").value.trim();
    const dni      = document.getElementById("t-dni").value.trim();
    const origen   = document.getElementById("t-origen").value;
    const obs      = document.getElementById("t-obs").value.trim();
    const fechaRaw = document.getElementById("t-fecha").value;

    if (!nombre || !apellido || !dni) { App.toast("Completá nombre, apellido y DNI.", "error"); return; }

    const [y, m, d] = fechaRaw.split("-");
    const fecha = `${d}/${m}/${y}`;
    const estudio = _estudiosElegidos.join(", ");

    const btn = document.getElementById("btn-confirmar");
    btn.disabled = true; btn.textContent = "Guardando…";
    document.getElementById("turno-result").classList.add("hidden");

    try {
      const filaOriginal = parseInt(document.getElementById("form-turno").dataset.filaOriginal || "0");
      if (filaOriginal) {
        const tooltipOrig = document.getElementById("form-turno").dataset.tooltipOriginal || "";
        const confirmar = confirm(`¿Modificar turno?\n\nDE: ${tooltipOrig}\n\nA: ${apellido}, ${nombre} — ${fecha} ${_slotSeleccionado.hora} hs\n¿Confirmás?`);
        if (!confirmar) { btn.disabled = false; btn.textContent = "✓ Confirmar turno"; return; }
        await API.anular(filaOriginal);
        document.getElementById("form-turno").dataset.filaOriginal = "";
      }
      await API.asignar({ nombre, apellido, dni, estudio, origen, fecha, hora: _slotSeleccionado.hora, observaciones: obs });
      const result = document.getElementById("turno-result");
      result.className = "turno-result ok";
      result.innerHTML = `✅ Turno confirmado<br><strong>${apellido}, ${nombre}</strong><br>${estudio}<br>📅 ${fecha} · 🕐 ${_slotSeleccionado.hora} hs`;
      result.classList.remove("hidden");
      App.toast(`Turno asignado: ${apellido} — ${_slotSeleccionado.hora} hs`, "ok");
      _resetForm();
      App.refrescarAgenda();
    } catch (err) {
      const result = document.getElementById("turno-result");
      result.className = "turno-result error";
      result.textContent = "❌ Error: " + err.message;
      result.classList.remove("hidden");
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "✓ Confirmar turno";
    }
  }

  function _resetForm() {
    document.getElementById("form-turno").reset();
    _estudiosElegidos = [];
    _renderChips();
    _actualizarTiempo();
    _poblarSelect();
    _limpiarSlots();
    _fechaPrefill = null;
    _horaPrefill  = null;
  }

  function init() {
    // Agregar estudio al hacer clic en el botón o cambiar select
    document.getElementById("btn-agregar-estudio").addEventListener("click", () => {
      const sel = document.getElementById("t-estudio-sel");
      _agregarEstudio(sel.value);
    });
    document.getElementById("t-estudio-sel").addEventListener("change", (e) => {
      if (e.target.value) _agregarEstudio(e.target.value);
    });
    // Buscar/filtrar estudios en tiempo real
    document.getElementById("t-estudio-buscar").addEventListener("input", (e) => {
      _poblarSelect(e.target.value);
    });
    document.getElementById("btn-ver-slots").onclick = _buscarSlots;
    document.getElementById("form-turno").addEventListener("submit", _confirmar);
  }

  function mostrarAvisoRIS(nombre, practica) {
    const prev = document.getElementById("turno-ris-aviso");
    if (prev) prev.remove();

    const form = document.getElementById("form-turno");
    if (!form) return;

    const aviso = document.createElement("div");
    aviso.id = "turno-ris-aviso";
    aviso.style.cssText = "background:#f0f0f0;border-left:4px dashed #bbb;padding:10px 14px;border-radius:6px;font-size:12px;color:#555;margin-bottom:1rem";
    aviso.innerHTML = `
      <div style="font-weight:700;color:#888;margin-bottom:4px">⚠️ Sobreturno — hay un paciente RIS en este horario</div>
      <div style="font-style:italic">${nombre}</div>
      <div style="font-size:11px;color:#aaa">${practica}</div>
      <div style="margin-top:6px;font-size:11px;color:#c07000;font-weight:600">
        Verificá la demora antes de confirmar. El sobreturno se agrega después del paciente RIS.
      </div>`;
    form.insertBefore(aviso, form.firstChild);
  }

  // ── Panel flotante ───────────────────────────────────────
  function abrirPanel(fecha, hora, condicion, ris) {
    const panel   = document.getElementById("turno-panel");
    const overlay = document.getElementById("panel-overlay");
    panel.style.display   = "flex";
    overlay.style.display = "block";
    cargarEstudios().then(() => {
      prefill(fecha, hora, condicion);
      if (ris) mostrarAvisoRIS(ris.nombre, ris.practica);
    });
  }

  function cerrarPanel() {
    document.getElementById("turno-panel").style.display   = "none";
    document.getElementById("panel-overlay").style.display = "none";
    _resetForm();
  }

  async function abrirPanelModificar(fila, tooltipTexto) {
    // Buscar datos del turno por fila
    let turno = null;
    try {
      const lineas = tooltipTexto.split("\n");
      // tooltip: "APELLIDO, NOMBRE\nDNI: 12345\nEstudio\nOrigen\n📝 obs"
      const nombreCompleto = lineas[0] || "";
      const partes = nombreCompleto.split(",");
      const apellido = partes[0]?.trim() || "";
      const nombre   = partes[1]?.trim() || "";
      const dniLine  = lineas.find(l => l.startsWith("DNI:")) || "";
      const dni      = dniLine.replace("DNI:","").trim();
      const estudio  = lineas[2] || "";
      const origen   = lineas[3] || "";
      const obsLine  = lineas.find(l => l.startsWith("📝")) || "";
      const obs      = obsLine.replace("📝","").trim();
      turno = { fila, apellido, nombre, dni, estudio, origen, observaciones: obs };
    } catch(e) { App.toast("Error leyendo datos del turno", "error"); return; }

    await cargarEstudios();
    abrirPanel();

    // Precargar datos del paciente
    document.getElementById("t-nombre").value   = turno.nombre;
    document.getElementById("t-apellido").value = turno.apellido;
    document.getElementById("t-dni").value      = turno.dni;
    document.getElementById("t-obs").value      = turno.observaciones;

    // Precargar origen
    const selOrigen = document.getElementById("t-origen");
    for (const opt of selOrigen.options) {
      if (opt.value.toUpperCase() === turno.origen.toUpperCase()) { selOrigen.value = opt.value; break; }
    }

    // Precargar estudios como chips
    _estudiosElegidos = turno.estudio.split(",").map(s => s.trim()).filter(Boolean);
    _renderChips();
    _actualizarTiempo();
    _poblarSelect();

    // Aviso de modificación
    const prev = document.getElementById("turno-ris-aviso");
    if (prev) prev.remove();
    const aviso = document.createElement("div");
    aviso.id = "turno-ris-aviso";
    aviso.style.cssText = "background:#fff8e1;border-left:4px solid #f0c040;padding:10px 14px;border-radius:6px;font-size:12px;color:#7a4f00;margin-bottom:1rem;font-weight:600";
    aviso.innerHTML = `✏️ Modificando turno de <strong>${turno.apellido}, ${turno.nombre}</strong><br><span style="font-weight:400;color:#888">Seleccioná nueva fecha y horario. Al confirmar se anula el turno original.</span>`;
    document.getElementById("form-turno").insertBefore(aviso, document.getElementById("form-turno").firstChild);

    // Guardar fila original para anular al confirmar
    document.getElementById("form-turno").dataset.filaOriginal = fila;
    document.getElementById("form-turno").dataset.tooltipOriginal = tooltipTexto;
  }

  return { init, prefill, cargarEstudios, mostrarAvisoRIS, abrirPanel, cerrarPanel, abrirPanelModificar };
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
        div.innerHTML = '<div class="empty-state">Sin resultados.</div>'; return;
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
            <span>📅 ${t.fecha}</span><span>🕐 ${t.hora} hs</span>
            <span>🔬 ${t.estudio}</span>
            <span><span class="origen-tag" style="background:${est.bg};border-color:${est.border};color:${est.text}">${t.origen}</span></span>
            ${t.observaciones ? `<span>📝 ${t.observaciones}</span>` : ""}
            ${t.presente === "Presente" ? '<span>✅ Presente</span>' : ""}
          </div>
          ${t.tipoMod === "" ? `<div style="margin-top:.5rem"><button class="btn-sm btn-anular-busq" data-fila="${t.fila}" data-nombre="${t.apellido}, ${t.nombre}" style="color:#c62828;border-color:#c62828">Anular turno</button></div>` : ""}
        </div>`;
      }).join("");

      div.querySelectorAll(".btn-anular-busq").forEach(btn => {
        btn.addEventListener("click", async () => {
          const fila = parseInt(btn.dataset.fila);
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