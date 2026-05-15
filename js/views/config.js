// js/views/config.js — Panel de configuración (admin y jefatura)

const ConfigView = (() => {
  let _datos = null;
  let _estudiosEditados = [];

  // ── Cargar datos ──────────────────────────────────────────
  async function cargar() {
    const container = document.getElementById("config-container");
    container.innerHTML = '<div class="empty-state">Cargando configuración...</div>';
    try {
      _datos = await API.leerConfig("all");
      _render();
    } catch(err) {
      container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  // ── Render principal ──────────────────────────────────────
  function _render() {
    const d = _datos;
    const container = document.getElementById("config-container");
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:1.5rem">
        ${_card("📚", d.estudios.length, "estudios")}
        ${_card("🗓", d.feriados.length, "feriados 2026")}
        ${_card("🎨", d.franjas.length, "franjas recurrentes")}
        ${_card("🔒", (d.restricciones.length + (d.restriccionesOrigen||[]).length), "restricciones")}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${_seccionEstudios(d.estudios)}
        ${_seccionFeriados(d.feriados)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${_seccionFranjas(d.franjas)}
          ${_seccionBloqueos(d.bloqueos)}
        </div>
        ${_seccionRestricciones(d.restricciones, d.restriccionesOrigen||[])}
      </div>`;
    _bindEvents();
  }

  function _card(icon, num, label) {
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem">
      <div style="font-size:13px;color:var(--text-2);margin-bottom:4px">${label}</div>
      <div style="font-size:28px;font-weight:500">${num}</div>
    </div>`;
  }

  // ── Sección Estudios ──────────────────────────────────────
  function _seccionEstudios(estudios) {
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">📚 Estudios</span>
        <div style="display:flex;gap:8px">
          <input id="cfg-buscar-estudio" type="text" placeholder="Buscar estudio..." style="width:200px;font-size:13px;padding:4px 10px">
          <button id="cfg-btn-nuevo-estudio" style="font-size:12px">+ Nuevo</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1.5fr 80px 80px 36px;gap:6px;font-size:12px;color:var(--text-2);padding-bottom:6px;border-bottom:0.5px solid var(--border);margin-bottom:4px">
        <span>Nombre</span><span>Estadística</span><span>Restricción</span><span>Tiempo (min)</span><span></span>
      </div>
      <div id="cfg-lista-estudios" style="max-height:300px;overflow-y:auto">
        ${estudios.map((e,i) => _filaEstudio(e,i)).join("")}
      </div>
    </div>`;
  }

  function _filaEstudio(e, i) {
    const bg = i % 2 === 0 ? "" : "background:var(--bg);";
    return `<div class="cfg-fila-estudio" data-idx="${i}" style="display:grid;grid-template-columns:2fr 1.5fr 80px 80px 36px;gap:6px;align-items:center;padding:4px 2px;${bg}border-radius:6px">
      <span class="cfg-nombre" style="font-size:13px;cursor:pointer" title="Clic para editar">${e.nombre}</span>
      <span class="cfg-estadistica" style="font-size:12px;color:var(--text-2);cursor:pointer">${e.estadistica||"—"}</span>
      <span style="font-size:12px;text-align:center">${e.restriccion ? `<span style="background:var(--bg);border:0.5px solid var(--border);border-radius:4px;padding:1px 6px">${e.restriccion}</span>` : "—"}</span>
      <span class="cfg-duracion" data-idx="${i}" style="font-size:13px;text-align:center;cursor:pointer;text-decoration:underline dotted" title="Clic para editar duración">${e.duracion}</span>
      <button class="cfg-btn-del-estudio" data-idx="${i}" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0" aria-label="Eliminar">×</button>
    </div>`;
  }

  // ── Sección Feriados ──────────────────────────────────────
  function _seccionFeriados(feriados) {
    const chips = feriados.map((f,i) =>
      `<div style="display:inline-flex;align-items:center;gap:6px;background:var(--danger-bg,#fce8e8);border:0.5px solid var(--danger-border,#f5c6c6);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--danger,#c62828)">
        ${f.fecha} — ${f.concepto}
        <button class="cfg-del-feriado" data-idx="${i}" style="background:none;border:none;color:inherit;cursor:pointer;font-size:14px;padding:0;line-height:1" aria-label="Eliminar">×</button>
      </div>`
    ).join(" ");
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🗓 Feriados 2026</span>
        <button id="cfg-btn-nuevo-feriado" style="font-size:12px">+ Agregar</button>
      </div>
      <div id="cfg-chips-feriados" style="display:flex;flex-wrap:wrap;gap:8px">${chips}</div>
    </div>`;
  }

  // ── Sección Franjas ───────────────────────────────────────
  function _seccionFranjas(franjas) {
    const items = franjas.map((f,i) => {
      const dias = [f.dia1, f.func1, f.dia2, f.func2, f.dia3].filter(Boolean).join(" ");
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:var(--bg)">
        <div style="width:12px;height:12px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${f.concepto}</div>
          <div style="font-size:11px;color:var(--text-2)">${dias} · ${f.horaD}–${f.horaH}</div>
        </div>
      </div>`;
    }).join("");
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="font-weight:500;font-size:15px;margin-bottom:12px">🎨 Franjas recurrentes</div>
      <div style="display:flex;flex-direction:column;gap:6px">${items || '<div style="font-size:13px;color:var(--text-2)">Sin franjas configuradas</div>'}</div>
    </div>`;
  }

  // ── Sección Bloqueos puntuales ────────────────────────────
  function _seccionBloqueos(bloqueos) {
    const items = (bloqueos||[]).map((b,i) =>
      `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:var(--bg)">
        <span style="font-size:15px">🔒</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${b.concepto}</div>
          <div style="font-size:11px;color:var(--text-2)">${b.fecha} · ${b.horaD}–${b.horaH}</div>
        </div>
        <button class="cfg-del-bloqueo" data-idx="${i}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px" aria-label="Eliminar">×</button>
      </div>`
    ).join("");
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">📅 Bloqueos puntuales</span>
        <button id="cfg-btn-nuevo-bloqueo" style="font-size:12px">+ Agregar</button>
      </div>
      <div id="cfg-lista-bloqueos" style="display:flex;flex-direction:column;gap:6px">
        ${items || '<div style="font-size:13px;color:var(--text-2)">Sin bloqueos programados</div>'}
      </div>
    </div>`;
  }

  // ── Sección Restricciones ─────────────────────────────────
  function _seccionRestricciones(rest, origen) {
    const items = [...rest, ...origen].map(r => {
      const dias = [r.dia1, r.func1, r.dia2, r.func2, r.dia3].filter(Boolean).join(" ");
      const cod  = r.codigo || r.origen;
      return `<div style="padding:8px;border-radius:8px;background:var(--bg)">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:2px">${r.codigo ? "Código" : "Origen"}: ${cod}</div>
        <div style="font-size:13px;font-weight:500">${r.leyenda||"—"}</div>
        <div style="font-size:11px;color:var(--text-2)">${dias} · ${r.horaD}–${r.horaH}</div>
      </div>`;
    }).join("");
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🔐 Restricciones por código y origen</span>
        <div style="display:flex;gap:6px">
          <button id="cfg-btn-nueva-rest-cod" style="font-size:12px">+ Por código</button>
          <button id="cfg-btn-nueva-rest-orig" style="font-size:12px">+ Por origen</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${items||"Sin restricciones"}</div>
    </div>`;
  }

  // ── Eventos ───────────────────────────────────────────────
  function _bindEvents() {
    const container = document.getElementById("config-container");

    // Buscar estudios
    document.getElementById("cfg-buscar-estudio").addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll(".cfg-fila-estudio").forEach(row => {
        const nombre = row.querySelector(".cfg-nombre").textContent.toLowerCase();
        row.style.display = nombre.includes(q) ? "" : "none";
      });
    });

    // Editar duración al hacer clic
    container.querySelectorAll(".cfg-duracion").forEach(el => {
      el.addEventListener("click", () => {
        const i = parseInt(el.dataset.idx);
        const nueva = parseInt(prompt("Duración en minutos:", _datos.estudios[i].duracion));
        if (isNaN(nueva)) return;
        _datos.estudios[i].duracion = nueva;
        _guardarEstudios();
      });
    });

    // Editar estudio al hacer clic en nombre
    container.querySelectorAll(".cfg-nombre").forEach(el => {
      el.addEventListener("click", () => {
        const i = parseInt(el.closest(".cfg-fila-estudio").dataset.idx);
        _editarEstudio(i);
      });
    });

    // Eliminar estudio
    container.querySelectorAll(".cfg-btn-del-estudio").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        if (!confirm(`¿Eliminar estudio "${_datos.estudios[i].nombre}"?`)) return;
        _datos.estudios.splice(i, 1);
        _guardarEstudios();
      });
    });

    // Nuevo estudio
    document.getElementById("cfg-btn-nuevo-estudio").addEventListener("click", () => _editarEstudio(-1));

    // Feriados
    container.querySelectorAll(".cfg-del-feriado").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        if (!confirm(`¿Eliminar feriado "${_datos.feriados[i].fecha}"?`)) return;
        _datos.feriados.splice(i, 1);
        _guardarFeriados();
      });
    });

    document.getElementById("cfg-btn-nuevo-feriado").addEventListener("click", () => {
      const fecha    = prompt("Fecha del feriado (dd/MM/yyyy):");
      if (!fecha) return;
      const concepto = prompt("Concepto:");
      if (!concepto) return;
      _datos.feriados.push({ fecha, concepto });
      _datos.feriados.sort((a,b) => {
        const pa = a.fecha.split("/"), pb = b.fecha.split("/");
        return new Date(pa[2],pa[1]-1,pa[0]) - new Date(pb[2],pb[1]-1,pb[0]);
      });
      _guardarFeriados();
    });

    // Bloqueos
    container.querySelectorAll(".cfg-del-bloqueo").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        if (!confirm("¿Eliminar este bloqueo?")) return;
        _datos.bloqueos.splice(i, 1);
        _guardarBloqueos();
      });
    });

    document.getElementById("cfg-btn-nuevo-bloqueo").addEventListener("click", () => {
      const fecha    = prompt("Fecha del bloqueo (dd/MM/yyyy):");
      if (!fecha) return;
      const horaD    = prompt("Hora desde (HH:MM):");
      const horaH    = prompt("Hora hasta (HH:MM):");
      const concepto = prompt("Concepto:");
      if (!concepto) return;
      _datos.bloqueos.push({ fecha, horaD, horaH, concepto });
      _guardarBloqueos();
    });

    // Nueva restricción por código
    document.getElementById("cfg-btn-nueva-rest-cod").addEventListener("click", () => {
      const codigo   = prompt("Código (ej: MM, CAR):");
      if (!codigo) return;
      const dia1     = prompt("Día desde (ej: LUNES):");
      const func1    = prompt("Función (hasta / y / vacío):");
      const dia2     = prompt("Día hasta (opcional):");
      const horaD    = prompt("Hora desde (HH:MM):");
      const horaH    = prompt("Hora hasta (HH:MM):");
      const leyenda  = prompt("Leyenda:");
      const color    = prompt("Color hex (ej: #e06666):", "#e06666");
      _datos.restricciones.push({ codigo, dia1, func1: func1||"", dia2: dia2||"", func2:"", dia3:"", horaD, horaH, leyenda, color });
      App.toast("Restricción agregada — guardá desde el sheet Config para hacerla permanente", "ok");
      _render();
    });

    // Nueva restricción por origen
    document.getElementById("cfg-btn-nueva-rest-orig").addEventListener("click", () => {
      const origen   = prompt("Origen (ej: INTERNACIÓN):");
      if (!origen) return;
      const dia1     = prompt("Día desde (ej: LUNES):");
      const func1    = prompt("Función (hasta / y / vacío):");
      const dia2     = prompt("Día hasta (opcional):");
      const horaD    = prompt("Hora desde (HH:MM):");
      const horaH    = prompt("Hora hasta (HH:MM):");
      const leyenda  = prompt("Leyenda:");
      const color    = prompt("Color hex (ej: #ffd966):", "#ffd966");
      if (!_datos.restriccionesOrigen) _datos.restriccionesOrigen = [];
      _datos.restriccionesOrigen.push({ origen, dia1, func1: func1||"", dia2: dia2||"", func2:"", dia3:"", horaD, horaH, leyenda, color });
      App.toast("Restricción agregada — guardá desde el sheet Config para hacerla permanente", "ok");
      _render();
    });
  }

  // ── Editar estudio ────────────────────────────────────────
  function _editarEstudio(idx) {
    const nuevo = idx === -1;
    const e     = nuevo ? { nombre:"", estadistica:"", restriccion:"", duracion:30 } : {..._datos.estudios[idx]};
    const nombre = prompt("Nombre del estudio:", e.nombre);
    if (nombre === null) return;
    const estadistica = prompt("Estadística:", e.estadistica);
    const restriccion = prompt("Restricción (C, S, MM, etc.):", e.restriccion);
    const duracion    = parseInt(prompt("Tiempo en minutos:", e.duracion));
    if (isNaN(duracion)) { App.toast("Duración inválida", "error"); return; }
    const actualizado = { nombre, estadistica, restriccion, duracion };
    if (nuevo) _datos.estudios.push(actualizado);
    else _datos.estudios[idx] = actualizado;
    _datos.estudios.sort((a,b) => a.nombre.localeCompare(b.nombre));
    _guardarEstudios();
  }

  // ── Guardar secciones ─────────────────────────────────────
  async function _guardarEstudios() {
    try {
      App.toast("Guardando estudios...", "ok");
      await API.escribirConfig("estudios", _datos.estudios);
      App.toast("Estudios guardados", "ok");
      _render();
    } catch(err) { App.toast("Error: "+err.message, "error"); }
  }

  async function _guardarFeriados() {
    try {
      await API.escribirConfig("feriados", _datos.feriados);
      App.toast("Feriados guardados", "ok");
      _render();
    } catch(err) { App.toast("Error: "+err.message, "error"); }
  }

  async function _guardarBloqueos() {
    try {
      await API.escribirConfig("bloqueos", _datos.bloqueos);
      App.toast("Bloqueos guardados", "ok");
      _render();
    } catch(err) { App.toast("Error: "+err.message, "error"); }
  }

  return { init() {}, cargar };
})();