// js/views/config.js — Panel de configuración (admin y jefatura)

const ConfigView = (() => {
  let _datos = null;
  let _estudiosEditados = [];
  let _limitesCount = 0;

  // ── Cargar datos ──────────────────────────────────────────
  async function cargar() {
    const container = document.getElementById("config-container");
    container.innerHTML = '<div class="empty-state">Cargando configuración...</div>';
    try {
      const [datos, limites] = await Promise.all([
        API.leerConfig("all"),
        // Límites vive en Railway (como Reglas Agenda), no en el Sheet —
        // si falla no debe tumbar el resto de Config, solo el contador.
        RailwayAPI.leerLimitesSobreturno().catch(() => [])
      ]);
      _datos = datos;
      _limitesCount = limites.length;
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
        ${_seccionLimites()}
        ${_seccionSugerirSobreturno()}
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
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    // Agrupar por mes
    const porMes = {};
    feriados.forEach((f, i) => {
      const p   = f.fecha.split("/");
      const mes = parseInt(p[1]) - 1;
      if (!porMes[mes]) porMes[mes] = [];
      porMes[mes].push({ ...f, _idx: i });
    });

    const cols = Object.keys(porMes).sort((a,b) => a-b).map(mes => {
      const items = porMes[mes].map(f =>
        `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border)">
          <div style="flex-shrink:0;width:28px;height:28px;border-radius:8px;background:#fce8e8;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#c62828">
            ${f.fecha.split("/")[0]}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.concepto}</div>
            <div style="font-size:10px;color:var(--text-2)">${f.fecha}</div>
          </div>
          <button class="cfg-del-feriado" data-idx="${f._idx}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0;line-height:1;flex-shrink:0" aria-label="Eliminar">×</button>
        </div>`
      ).join("");
      return `<div style="background:var(--bg);border-radius:10px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${MESES[mes]}</div>
        ${items}
      </div>`;
    }).join("");

    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🗓 Feriados 2026</span>
        <button id="cfg-btn-nuevo-feriado" style="font-size:12px">+ Agregar</button>
      </div>
      <div id="cfg-chips-feriados" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
        ${cols || '<div style="font-size:13px;color:var(--text-2)">Sin feriados cargados</div>'}
      </div>
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
        <button class="cfg-edit-franja" data-idx="${i}" style="background:none;border:none;color:var(--text-2);cursor:pointer;font-size:14px" aria-label="Editar">✏️</button>
        <button class="cfg-del-franja" data-idx="${i}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px" aria-label="Eliminar">×</button>
      </div>`;
    }).join("");
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🎨 Franjas recurrentes</span>
        <button id="cfg-btn-nueva-franja" style="font-size:12px">+ Agregar</button>
      </div>
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
        <button class="cfg-edit-bloqueo" data-idx="${i}" style="background:none;border:none;color:var(--text-2);cursor:pointer;font-size:14px;margin-right:2px" aria-label="Editar">✏️</button>
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

  // ── Sección Límites de sobreturno ─────────────────────────
  // A diferencia de las demás secciones, esto vive en Railway (Postgres),
  // no en el Sheet — mismo criterio que Reglas Agenda en Validaciones: se
  // gestiona desde un modal propio, no con prompt() encadenados, porque
  // acá hay campos estructurados (ámbito, valor, días, límite).
  function _seccionLimites() {
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:500;font-size:15px">🚫 Límites de sobreturno</span>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">${_limitesCount} regla${_limitesCount === 1 ? "" : "s"} configurada${_limitesCount === 1 ? "" : "s"} — bloquean la carga real, no son solo un aviso</div>
        </div>
        <button id="cfg-btn-limites-gestionar" style="font-size:12px">⚙️ Gestionar límites</button>
      </div>
    </div>`;
  }

  // ── Sección Reglas de asignación de sobreturno ─────────────
  function _seccionSugerirSobreturno() {
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:500;font-size:15px">💡 Reglas de asignación de sobreturno</span>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">Parámetros del sugeridor de horario (botón en el panel de turno) — es solo una recomendación, no bloquea nada</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="cfg-btn-sugerir-reglas" style="font-size:12px">📋 Reglas específicas</button>
          <button id="cfg-btn-sugerir-gestionar" style="font-size:12px">⚙️ Ajustar parámetros</button>
        </div>
      </div>
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

    document.getElementById("cfg-btn-nuevo-bloqueo").addEventListener("click", () => _editarBloqueo(-1));

    container.querySelectorAll(".cfg-edit-bloqueo").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        _editarBloqueo(i);
      });
    });

    // Franjas recurrentes
    document.getElementById("cfg-btn-nueva-franja").addEventListener("click", () => _editarFranja(-1));

    container.querySelectorAll(".cfg-edit-franja").forEach(btn => {
      btn.addEventListener("click", () => _editarFranja(parseInt(btn.dataset.idx)));
    });

    container.querySelectorAll(".cfg-del-franja").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        if (!confirm(`¿Eliminar franja "${_datos.franjas[i].concepto}"?`)) return;
        _datos.franjas.splice(i, 1);
        _guardarFranjas();
      });
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

    // Límites de sobreturno
    document.getElementById("cfg-btn-limites-gestionar").addEventListener("click", _abrirModalLimites);

    // Reglas de asignación de sobreturno
    document.getElementById("cfg-btn-sugerir-gestionar").addEventListener("click", _abrirModalSugerir);
    document.getElementById("cfg-btn-sugerir-reglas").addEventListener("click", _abrirModalSugerirReglas);
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

  // ── Editar bloqueo ────────────────────────────────────────
  function _editarBloqueo(idx) {
    const nuevo = idx === -1;
    const b     = nuevo ? { fecha:"", horaD:"", horaH:"", concepto:"" } : {..._datos.bloqueos[idx]};
    const fecha    = prompt("Fecha del bloqueo (dd/MM/yyyy):", b.fecha);
    if (!fecha) return;
    const horaD    = prompt("Hora desde (HH:MM):", b.horaD);
    if (!horaD) return;
    const horaH    = prompt("Hora hasta (HH:MM):", b.horaH);
    if (!horaH) return;
    const concepto = prompt("Concepto:", b.concepto);
    if (!concepto) return;
    const actualizado = { fecha, horaD, horaH, concepto };
    if (nuevo) _datos.bloqueos.push(actualizado);
    else _datos.bloqueos[idx] = actualizado;
    _guardarBloqueos();
  }

  // ── Editar franja ─────────────────────────────────────────
  function _editarFranja(idx) {
    const nuevo = idx === -1;
    const f = nuevo
      ? { dia1:"", func1:"", dia2:"", func2:"", dia3:"", horaD:"", horaH:"", concepto:"", color:"#e06666" }
      : {..._datos.franjas[idx]};
    const concepto = prompt("Concepto (ej: Franja Exclusiva Neurología):", f.concepto);
    if (!concepto) return;
    const dia1    = prompt("Día desde (ej: LUNES, MARTES):", f.dia1);
    if (!dia1) return;
    const func1   = prompt("Función: 'hasta', 'y', o dejar vacío:", f.func1);
    const dia2    = prompt("Día hasta/adicional (opcional):", f.dia2);
    const func2   = prompt("Segunda función (opcional):", f.func2);
    const dia3    = prompt("Tercer día (opcional):", f.dia3);
    const horaD   = prompt("Hora desde (HH:MM):", f.horaD);
    if (!horaD) return;
    const horaH   = prompt("Hora hasta (HH:MM):", f.horaH);
    if (!horaH) return;
    const color   = prompt("Color hex (ej: #e06666):", f.color || "#e06666");
    const actualizado = { dia1, func1: func1||"", dia2: dia2||"", func2: func2||"", dia3: dia3||"", horaD, horaH, concepto, color: color||"#e06666" };
    if (nuevo) _datos.franjas.push(actualizado);
    else _datos.franjas[idx] = actualizado;
    _guardarFranjas();
  }

  async function _guardarFranjas() {
    try {
      await API.escribirConfig("franjas", _datos.franjas);
      App.toast("Franjas guardadas", "ok");
      _render();
    } catch(err) { App.toast("Error: " + err.message, "error"); }
  }

  // ── Guardar secciones ─────────────────────────────────────
  async function _guardarEstudios() {
    try {
      App.toast("Guardando estudios...", "ok");
      await API.escribirEstudios(_datos.estudios);
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

  // ── Modal: gestionar límites de sobreturno (lista ↔ formulario) ────
  const DIAS_LABEL = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const AMBITOS = {
    paciente:   'Por paciente (mismo DNI) por día',
    region:     'Por región por día',
    estudio:    'Por estudio (palabra clave) + día',
    global_dia: 'Tope diario global de regiones'
  };
  // Copia de EST_REGIONES (sistema2-node/lib/clasificacion.js) para el
  // dropdown — si se agrega/renombra una región allá, actualizar acá.
  const EST_REGIONES = [
    'Cerebro', 'Angio Cerebral', 'Angio Vasos Cuello', 'Órbitas', 'Macizo Facial', 'Peñasco', 'Hipófisis', 'Cuello',
    'Tórax', 'Abdomen', 'Colangioresonancia', 'Pelvis', 'Pelvis Ginecológica', 'Caderas', 'Otras Regiones',
    'Rodillas', 'Tobillo/Pie', 'Hombro', 'Codo', 'Muñeca', 'Mano',
    'Columna Cervical', 'Columna Dorsal', 'Columna Lumbar',
    'Cardíaca', 'Espectro', 'Funcional', 'Mamaria', 'Fetal/Obstétrica'
  ];

  // Reglas propias del sugeridor de sobreturno — mismo formato/semántica
  // que "Reglas Agenda" (modo, ventanas), pero exclusivas de acá (nunca
  // llegan al bot de Validaciones), así que acá SÍ puede quedar la
  // palabra clave vacía (origen solo alcanza).
  const MODOS_SUGERIR = {
    prohibido_en_ventana: 'Prohibido en este horario',
    reservado_en_ventana: 'Reservado en este horario (todo lo demás, prohibido)',
    solo_en_ventanas:     'Solo permitido en estos horarios',
  };
  const ORIGENES_SUGERIR = ['AMBULATORIO', 'INTERNACIÓN', 'GUARDIA', 'DIRECCIÓN', 'TRASLADO'];

  let _limitesCache = [];
  let _idLimiteEditando = null; // null = límite nuevo

  function _abrirModalLimites() {
    document.getElementById('limites-modal-overlay').classList.remove('hidden');
    _cargarLimitesModal();
  }

  function _cerrarModalLimites() {
    document.getElementById('limites-modal-overlay').classList.add('hidden');
  }

  async function _cargarLimitesModal() {
    document.getElementById('limites-modal-titulo').textContent = 'Límites de sobreturno';
    document.getElementById('limites-modal-body').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    document.getElementById('limites-modal-footer').innerHTML = '';
    try {
      _limitesCache = await RailwayAPI.leerLimitesSobreturno();
      _limitesCount = _limitesCache.length;
      _renderListaLimites();
    } catch (err) {
      document.getElementById('limites-modal-body').innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function _resumenLimite(r) {
    const dias = (r.dias && r.dias.length) ? r.dias.map(d => DIAS_LABEL[d]).join('/') : 'todos los días';
    const valor = r.valor ? ` "${r.valor}"` : '';
    return `Máx ${r.limite} sobreturno(s)${valor} — ${dias}`;
  }

  function _renderListaLimites() {
    document.getElementById('limites-modal-titulo').textContent = 'Límites de sobreturno';

    const filas = _limitesCache.map(r => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.5rem;${r.activa === false ? 'opacity:.55' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">${r.nombre}${r.activa === false ? ' <span style="font-weight:400;color:var(--text-3)">(inactiva)</span>' : ''}</div>
          <div style="font-size:.78rem;color:var(--text-2);margin-top:.15rem">${AMBITOS[r.ambito] || r.ambito}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.15rem">${_resumenLimite(r)}</div>
        </div>
        <button class="btn-sm" data-editar="${r.id}">✏️</button>
        <button class="btn-sm" data-eliminar="${r.id}" style="color:var(--danger)">🗑</button>
      </div>`).join('');

    document.getElementById('limites-modal-body').innerHTML = filas ||
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">Sin límites configurados todavía — los sobreturnos se cargan sin restricción</div>';

    document.getElementById('limites-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-limites-cancelar-lista">Cerrar</button>
      <button class="btn-primary" id="btn-limites-nuevo">+ Nuevo límite</button>`;

    document.getElementById('limites-modal-body').querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', () => _abrirFormularioLimite(_limitesCache.find(r => r.id === btn.dataset.editar)));
    });
    document.getElementById('limites-modal-body').querySelectorAll('[data-eliminar]').forEach(btn => {
      btn.addEventListener('click', () => _eliminarLimite(btn.dataset.eliminar));
    });
    document.getElementById('btn-limites-cancelar-lista').addEventListener('click', () => { _cerrarModalLimites(); _render(); });
    document.getElementById('btn-limites-nuevo').addEventListener('click', () => _abrirFormularioLimite(null));
  }

  async function _eliminarLimite(id) {
    const regla = _limitesCache.find(r => r.id === id);
    if (!confirm(`¿Eliminar el límite "${regla ? regla.nombre : id}"? Esta acción no se puede deshacer.`)) return;
    try {
      await RailwayAPI.eliminarLimiteSobreturno(id);
      App.toast('Límite eliminado', 'ok');
      _cargarLimitesModal();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  function _htmlCampoValor(ambito, valorActual) {
    if (ambito === 'region') {
      return `<div class="form-group" id="limites-form-valor-wrap" style="margin-bottom:.75rem">
        <label>Región</label>
        <select id="limites-form-valor">
          ${EST_REGIONES.map(r => `<option value="${r}" ${r === valorActual ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>`;
    }
    if (ambito === 'estudio') {
      return `<div class="form-group" id="limites-form-valor-wrap" style="margin-bottom:.75rem">
        <label>Palabra(s) clave en el estudio</label>
        <input type="text" id="limites-form-valor" value="${(valorActual || '').replace(/"/g,'&quot;')}" placeholder="Ej: pelvis alta resolución — o varias separadas por coma">
      </div>`;
    }
    return `<div id="limites-form-valor-wrap"></div>`;
  }

  function _abrirFormularioLimite(regla) {
    _idLimiteEditando = regla ? regla.id : null;
    const diasActuales = regla ? (regla.dias || []) : [];

    document.getElementById('limites-modal-titulo').textContent = regla ? 'Editar límite' : 'Nuevo límite';

    document.getElementById('limites-modal-body').innerHTML = `
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Nombre</label>
        <input type="text" id="limites-form-nombre" value="${regla ? regla.nombre.replace(/"/g,'&quot;') : ''}" placeholder="Ej: Pelvis alta resolución — lunes">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Ámbito</label>
        <select id="limites-form-ambito">
          ${Object.entries(AMBITOS).map(([v, lbl]) => `<option value="${v}" ${regla && regla.ambito === v ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
      </div>
      ${_htmlCampoValor(regla ? regla.ambito : 'paciente', regla ? regla.valor : '')}
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Límite (máximo de sobreturnos)</label>
        <input type="number" id="limites-form-limite" min="1" step="1" value="${regla ? regla.limite : 1}">
      </div>
      <div style="margin-bottom:.75rem">
        <label style="font-size:.85rem;display:block;margin-bottom:4px">Días de la semana (vacío = todos los días)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${DIAS_LABEL.map((lbl, d) => `
            <label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--text-2);cursor:pointer">
              <input type="checkbox" class="limite-dia" value="${d}" ${diasActuales.includes(d) ? 'checked' : ''}>
              ${lbl}
            </label>`).join('')}
        </div>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Motivo (opcional)</label>
        <input type="text" id="limites-form-motivo" value="${regla ? (regla.motivo || '').replace(/"/g,'&quot;') : ''}" placeholder="Nota interna">
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;margin-bottom:1rem;cursor:pointer">
        <input type="checkbox" id="limites-form-activa" ${!regla || regla.activa !== false ? 'checked' : ''}> Límite activo
      </label>
      <div id="limites-form-error" style="color:#c62828;font-size:.8rem;margin-top:.5rem"></div>
    `;

    document.getElementById('limites-form-ambito').addEventListener('change', (e) => {
      document.getElementById('limites-form-valor-wrap').outerHTML = _htmlCampoValor(e.target.value, '');
    });

    document.getElementById('limites-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-limites-cancelar-form">Cancelar</button>
      <button class="btn-primary" id="btn-limites-guardar">Guardar</button>`;

    document.getElementById('btn-limites-cancelar-form').addEventListener('click', _renderListaLimites);
    document.getElementById('btn-limites-guardar').addEventListener('click', _guardarFormularioLimite);
  }

  async function _guardarFormularioLimite() {
    const errorEl = document.getElementById('limites-form-error');
    errorEl.textContent = '';

    const nombre = document.getElementById('limites-form-nombre').value.trim();
    const ambito = document.getElementById('limites-form-ambito').value;
    const valorEl = document.getElementById('limites-form-valor');
    const valor = valorEl ? valorEl.value.trim() : '';
    const limite = parseInt(document.getElementById('limites-form-limite').value, 10);
    const motivo = document.getElementById('limites-form-motivo').value.trim();
    const activa = document.getElementById('limites-form-activa').checked;
    const dias = [...document.querySelectorAll('.limite-dia:checked')].map(cb => parseInt(cb.value, 10));

    if (!nombre) { errorEl.textContent = 'Completá el nombre.'; return; }
    if (!Number.isInteger(limite) || limite <= 0) { errorEl.textContent = 'El límite tiene que ser un número entero mayor a 0.'; return; }
    if ((ambito === 'region' || ambito === 'estudio') && !valor) {
      errorEl.textContent = 'Este ámbito necesita completar el valor (región o palabra clave).';
      return;
    }

    const regla = { id: _idLimiteEditando || undefined, nombre, ambito, valor, dias, limite, activa, motivo };

    try {
      await RailwayAPI.guardarLimiteSobreturno(regla);
      App.toast('Límite guardado', 'ok');
      await _cargarLimitesModal();
    } catch (err) {
      errorEl.textContent = 'Error: ' + err.message;
    }
  }

  function _initModalLimites() {
    document.getElementById('btn-limites-modal-cerrar').addEventListener('click', () => { _cerrarModalLimites(); _render(); });
    document.getElementById('limites-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'limites-modal-overlay') { _cerrarModalLimites(); _render(); }
    });
  }

  // ── Modal: reglas de asignación de sobreturno (formulario único) ───
  // A diferencia de Límites/Reglas Agenda, no es una lista de reglas —
  // son 5 parámetros sueltos de la heurística del sugeridor (ver
  // rpc/sobreturnoSugerir.js en sistema2-node), guardados como un blob
  // JSON en Railway. Un solo formulario, sin paso de "lista".

  async function _abrirModalSugerir() {
    document.getElementById('sugerir-modal-overlay').classList.remove('hidden');
    document.getElementById('sugerir-modal-titulo').textContent = 'Reglas de asignación de sobreturno';
    document.getElementById('sugerir-modal-body').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    document.getElementById('sugerir-modal-footer').innerHTML = '';
    try {
      const cfg = await RailwayAPI.leerConfigSugerirSobreturno();
      _renderFormularioSugerir(cfg);
    } catch (err) {
      document.getElementById('sugerir-modal-body').innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function _cerrarModalSugerir() {
    document.getElementById('sugerir-modal-overlay').classList.add('hidden');
  }

  function _renderFormularioSugerir(cfg) {
    document.getElementById('sugerir-modal-body').innerHTML = `
      <p style="font-size:.8rem;color:var(--text-2);margin-bottom:1rem">
        Ajustan qué recomienda el botón "💡 Sugerir horario de sobreturno" del panel de turno — nunca bloquean la carga, solo cambian el orden/motivo de las sugerencias.
      </p>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Umbral de estudio "pesado" (minutos)</label>
        <input type="number" id="sugerir-form-umbral" min="0" step="1" value="${cfg.umbralPesadoMin}">
        <div style="font-size:.72rem;color:var(--text-3);margin-top:2px">Un estudio con contraste siempre cuenta como pesado, dure lo que dure.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Bonus por amortiguar</label><input type="number" id="sugerir-form-bonus" min="0" step="0.5" value="${cfg.bonusAmortigua}"></div>
        <div class="form-group"><label>Penalización dos pesados seguidos</label><input type="number" id="sugerir-form-penalizacion" min="0" step="0.5" value="${cfg.penalizacionDosPesados}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Días hacia adelante que busca</label><input type="number" id="sugerir-form-dias" min="1" step="1" value="${cfg.diasBusqueda}"></div>
        <div class="form-group"><label>Cantidad de sugerencias</label><input type="number" id="sugerir-form-max" min="1" step="1" value="${cfg.maxSugerencias}"></div>
      </div>
      <div id="sugerir-form-error" style="color:#c62828;font-size:.8rem;margin-top:.5rem"></div>
    `;

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-cancelar">Cerrar</button>
      <button class="btn-primary" id="btn-sugerir-guardar">Guardar</button>`;

    document.getElementById('btn-sugerir-cancelar').addEventListener('click', _cerrarModalSugerir);
    document.getElementById('btn-sugerir-guardar').addEventListener('click', _guardarFormularioSugerir);
  }

  async function _guardarFormularioSugerir() {
    const errorEl = document.getElementById('sugerir-form-error');
    errorEl.textContent = '';

    const cfg = {
      umbralPesadoMin: parseFloat(document.getElementById('sugerir-form-umbral').value),
      bonusAmortigua: parseFloat(document.getElementById('sugerir-form-bonus').value),
      penalizacionDosPesados: parseFloat(document.getElementById('sugerir-form-penalizacion').value),
      diasBusqueda: parseInt(document.getElementById('sugerir-form-dias').value, 10),
      maxSugerencias: parseInt(document.getElementById('sugerir-form-max').value, 10)
    };

    try {
      await RailwayAPI.guardarConfigSugerirSobreturno(cfg);
      App.toast('Parámetros guardados', 'ok');
      _cerrarModalSugerir();
    } catch (err) {
      errorEl.textContent = 'Error: ' + err.message;
    }
  }

  function _initModalSugerir() {
    document.getElementById('btn-sugerir-modal-cerrar').addEventListener('click', _cerrarModalSugerir);
    document.getElementById('sugerir-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'sugerir-modal-overlay') _cerrarModalSugerir();
    });
  }

  // ── Modal: reglas específicas del sugeridor (lista ↔ formulario) ───
  // Mismo overlay que el formulario de parámetros de arriba (#sugerir-
  // modal-*), solo cambia el contenido. A diferencia de "Reglas Agenda"
  // (validaciones.js), acá la palabra clave es opcional — estas reglas
  // son exclusivas del sugeridor, nunca las audita el bot de Validaciones,
  // así que "solo origen, sin estudio puntual" es seguro acá.
  let _reglasSugerirCache = [];
  let _idReglaSugerirEditando = null;
  let _formVentanasSugerir = [];
  let _calendarioHeredado = null; // { bloqueos, bloqueosRecurrentes, ... } de AGENDA_CALENDARIO_CONFIG, solo lectura

  async function _abrirModalSugerirReglas() {
    document.getElementById('sugerir-modal-overlay').classList.remove('hidden');
    document.getElementById('sugerir-modal-titulo').textContent = 'Reglas específicas del sugeridor';
    document.getElementById('sugerir-modal-body').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    document.getElementById('sugerir-modal-footer').innerHTML = '';
    try {
      const [reglas, agendaConfig] = await Promise.all([
        RailwayAPI.leerReglasSugerirSobreturno(),
        // Informativo, no crítico — si falla no debe tumbar la lista de reglas propias.
        RailwayAPI.obtenerAgendaConfig().catch(() => null)
      ]);
      _reglasSugerirCache = reglas;
      _calendarioHeredado = agendaConfig && agendaConfig.calendario;
      _renderListaReglasSugerir();
    } catch (err) {
      document.getElementById('sugerir-modal-body').innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function _resumenVentanasSugerir(ventanas) {
    return (ventanas || []).map(v => {
      const dias = (v.dias || []).map(d => DIAS_LABEL[d]).join('/');
      return `${dias} ${v.horaDesde}-${v.horaHasta}`;
    }).join(' · ');
  }

  function _minAHoraSugerir(min) {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }

  // Bloqueos puntuales (equipo parado), franjas recurrentes exclusivas y
  // restricciones por código/origen (ej. descompresión, "solo internados
  // 20-22") de AGENDA_CALENDARIO_CONFIG — el sugeridor ya los respeta
  // server-side (rpc/sobreturnoSugerir.js, lib/bloqueosCalendario.js,
  // lib/restriccionesCodigo.js), esto es solo para que se vean acá y no
  // parezcan magia. No editables desde este panel: restriccionesHorarias/
  // restriccionesOrigen se configuran en Config → "Restricciones por
  // código y origen"; bloqueos y restriccionesConfig, en el calendario de
  // agenda del Sheet.
  function _htmlHeredadasCalendario() {
    if (!_calendarioHeredado) return '';
    const bloqueos = _calendarioHeredado.bloqueos || [];
    const recurrentes = _calendarioHeredado.bloqueosRecurrentes || [];
    const restHorarias = _calendarioHeredado.restriccionesHorarias || {};
    const restOrigen = _calendarioHeredado.restriccionesOrigen || {};
    const restConfig = _calendarioHeredado.restriccionesConfig || {};
    const hayAlgo = bloqueos.length || recurrentes.length ||
      Object.keys(restHorarias).length || Object.keys(restOrigen).length || Object.keys(restConfig).length;
    if (!hayAlgo) return '';

    const _fila = (icono, texto) => `
      <div style="font-size:.78rem;color:var(--text-2);padding:.35rem 0;border-bottom:1px dashed var(--border)">${icono} ${texto}</div>`;
    const _diasYHoras = (r) => `${(r.diasSemana || []).map(d => DIAS_LABEL[d]).join('/')} · ${_minAHoraSugerir(r.minDesde)}-${_minAHoraSugerir(r.minHasta)}`;

    const filasPuntuales = bloqueos.map(b =>
      _fila('📅', `${b.fechaStr} · ${_minAHoraSugerir(b.minDesde)}-${_minAHoraSugerir(b.minHasta)} — ${b.concepto || 'Sin concepto'}`)).join('');
    const filasRecurrentes = recurrentes.map(f =>
      _fila('🔁', `${_diasYHoras(f)} — ${f.concepto || 'Sin concepto'}`)).join('');
    const filasCodigo = Object.entries(restHorarias).flatMap(([cod, reglas]) => reglas.map(r =>
      _fila('🔖', `Código ${cod} · ${_diasYHoras(r)} — ${r.leyenda || 'Reservado'} (solo estudios con este código entran ahí)`))).join('');
    const filasOrigen = Object.entries(restOrigen).flatMap(([cod, reglas]) => reglas.map(r =>
      _fila('🔖', `Origen ${cod} · ${_diasYHoras(r)} — ${r.leyenda || 'Reservado'} (solo ese origen entra ahí)`))).join('');
    const filasPropias = Object.entries(restConfig).flatMap(([cod, reglas]) => reglas.map(r =>
      _fila('📎', `Código ${cod} — solo puede darse ${_diasYHoras(r)}`))).join('');

    return `
      <div style="background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:1rem">
        <div style="font-size:.78rem;font-weight:700;color:var(--text-2);text-transform:uppercase;margin-bottom:.35rem">🔒 Heredadas de Config (equipo parado / franjas exclusivas / restricciones por código)</div>
        ${filasPuntuales}${filasRecurrentes}${filasCodigo}${filasOrigen}${filasPropias}
        <div style="font-size:.72rem;color:var(--text-3);margin-top:.5rem">Ya las respeta el sugeridor — se editan donde ya se editaban, no acá.</div>
      </div>`;
  }

  function _renderListaReglasSugerir() {
    document.getElementById('sugerir-modal-titulo').textContent = 'Reglas específicas del sugeridor';

    const filas = _reglasSugerirCache.map(r => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.5rem;${r.activa === false ? 'opacity:.55' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">${r.nombre}${r.activa === false ? ' <span style="font-weight:400;color:var(--text-3)">(inactiva)</span>' : ''}</div>
          <div style="font-size:.78rem;color:var(--text-2);margin-top:.15rem">${MODOS_SUGERIR[r.modo] || r.modo} — ${[r.palabraClave, r.origen].filter(Boolean).join(' · ') || '—'}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.15rem">${_resumenVentanasSugerir(r.ventanas)}</div>
        </div>
        <button class="btn-sm" data-editar-sug="${r.id}">✏️</button>
        <button class="btn-sm" data-eliminar-sug="${r.id}" style="color:var(--danger)">🗑</button>
      </div>`).join('');

    document.getElementById('sugerir-modal-body').innerHTML = _htmlHeredadasCalendario() + (filas ||
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">Sin reglas específicas todavía</div>');

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-reglas-cancelar-lista">Cerrar</button>
      <button class="btn-primary" id="btn-sugerir-reglas-nueva">+ Nueva regla</button>`;

    document.getElementById('sugerir-modal-body').querySelectorAll('[data-editar-sug]').forEach(btn => {
      btn.addEventListener('click', () => _abrirFormularioReglaSugerir(_reglasSugerirCache.find(r => r.id === btn.dataset.editarSug)));
    });
    document.getElementById('sugerir-modal-body').querySelectorAll('[data-eliminar-sug]').forEach(btn => {
      btn.addEventListener('click', () => _eliminarReglaSugerir(btn.dataset.eliminarSug));
    });
    document.getElementById('btn-sugerir-reglas-cancelar-lista').addEventListener('click', _cerrarModalSugerir);
    document.getElementById('btn-sugerir-reglas-nueva').addEventListener('click', () => _abrirFormularioReglaSugerir(null));
  }

  async function _eliminarReglaSugerir(id) {
    const regla = _reglasSugerirCache.find(r => r.id === id);
    if (!confirm(`¿Eliminar la regla "${regla ? regla.nombre : id}"? Esta acción no se puede deshacer.`)) return;
    try {
      await RailwayAPI.eliminarReglaSugerirSobreturno(id);
      App.toast('Regla eliminada', 'ok');
      _abrirModalSugerirReglas();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  function _htmlVentanaSugerir(idx, v) {
    const dias = DIAS_LABEL.map((lbl, d) => `
      <label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--text-2);cursor:pointer">
        <input type="checkbox" class="sugerir-ventana-dia" value="${d}" ${v.dias.includes(d) ? 'checked' : ''}>
        ${lbl}
      </label>`).join('');

    return `
      <div class="sugerir-ventana-row" data-idx="${idx}" style="border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <span style="font-size:.78rem;font-weight:700;color:var(--text-2);text-transform:uppercase">Ventana ${idx + 1}</span>
          <button type="button" class="btn-sm" data-quitar-ventana-sug="${idx}" style="color:var(--danger)">Quitar</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.5rem">${dias}</div>
        <div class="form-row" style="margin-bottom:0">
          <div class="form-group"><label>Desde</label><input type="time" class="sugerir-ventana-desde" value="${v.horaDesde}"></div>
          <div class="form-group"><label>Hasta</label><input type="time" class="sugerir-ventana-hasta" value="${v.horaHasta}"></div>
        </div>
      </div>`;
  }

  function _renderVentanasSugerir() {
    const cont = document.getElementById('sugerir-reglas-form-ventanas');
    cont.innerHTML = _formVentanasSugerir.map((v, i) => _htmlVentanaSugerir(i, v)).join('');
    cont.querySelectorAll('[data-quitar-ventana-sug]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.quitarVentanaSug, 10);
        _formVentanasSugerir.splice(idx, 1);
        if (_formVentanasSugerir.length === 0) _formVentanasSugerir.push({ dias: [], horaDesde: '08:00', horaHasta: '17:00' });
        _renderVentanasSugerir();
      });
    });
  }

  function _abrirFormularioReglaSugerir(regla) {
    _idReglaSugerirEditando = regla ? regla.id : null;
    _formVentanasSugerir = regla ? JSON.parse(JSON.stringify(regla.ventanas)) : [{ dias: [], horaDesde: '08:00', horaHasta: '17:00' }];

    document.getElementById('sugerir-modal-titulo').textContent = regla ? 'Editar regla' : 'Nueva regla';

    document.getElementById('sugerir-modal-body').innerHTML = `
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Nombre</label>
        <input type="text" id="sugerir-reglas-form-nombre" value="${regla ? regla.nombre.replace(/"/g,'&quot;') : ''}" placeholder="Ej: Mamarias solo sábados">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Modo</label>
        <select id="sugerir-reglas-form-modo">
          ${Object.entries(MODOS_SUGERIR).map(([v, lbl]) => `<option value="${v}" ${regla && regla.modo === v ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Palabra(s) clave en el estudio (opcional si elegís origen)</label>
        <input type="text" id="sugerir-reglas-form-palabra" value="${regla ? (regla.palabraClave||'').replace(/"/g,'&quot;') : ''}" placeholder="Ej: MAMARIA — o varias separadas por coma">
      </div>
      <div style="margin-bottom:.75rem">
        <label style="font-size:.85rem;display:block;margin-bottom:4px">Origen(es) (opcional si completás palabra clave — vacío = cualquier origen)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${ORIGENES_SUGERIR.map(o => `
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-2);cursor:pointer">
              <input type="checkbox" class="sugerir-regla-origen" value="${o}" ${regla && (regla.origen || '').split(',').map(s => s.trim().toUpperCase()).includes(o) ? 'checked' : ''}>
              ${o}
            </label>`).join('')}
        </div>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Motivo (queda como nota interna)</label>
        <input type="text" id="sugerir-reglas-form-motivo" value="${regla ? (regla.motivo||'').replace(/"/g,'&quot;') : ''}" placeholder="Ej: Solo hay técnico de mamarias los sábados">
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;margin-bottom:1rem;cursor:pointer">
        <input type="checkbox" id="sugerir-reglas-form-activa" ${!regla || regla.activa !== false ? 'checked' : ''}> Regla activa
      </label>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span style="font-size:.78rem;font-weight:700;color:var(--text-2);text-transform:uppercase">Ventanas horarias</span>
        <button type="button" class="btn-sm" id="btn-sugerir-reglas-agregar-ventana">+ Agregar ventana</button>
      </div>
      <div id="sugerir-reglas-form-ventanas"></div>
      <div id="sugerir-reglas-form-error" style="color:#c62828;font-size:.8rem;margin-top:.5rem"></div>
    `;

    _renderVentanasSugerir();

    document.getElementById('btn-sugerir-reglas-agregar-ventana').addEventListener('click', () => {
      _formVentanasSugerir.push({ dias: [], horaDesde: '08:00', horaHasta: '17:00' });
      _renderVentanasSugerir();
    });

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-reglas-cancelar-form">Cancelar</button>
      <button class="btn-primary" id="btn-sugerir-reglas-guardar">Guardar</button>`;

    document.getElementById('btn-sugerir-reglas-cancelar-form').addEventListener('click', _renderListaReglasSugerir);
    document.getElementById('btn-sugerir-reglas-guardar').addEventListener('click', _guardarFormularioReglaSugerir);
  }

  async function _guardarFormularioReglaSugerir() {
    const errorEl = document.getElementById('sugerir-reglas-form-error');
    errorEl.textContent = '';

    const nombre  = document.getElementById('sugerir-reglas-form-nombre').value.trim();
    const modo    = document.getElementById('sugerir-reglas-form-modo').value;
    const palabra = document.getElementById('sugerir-reglas-form-palabra').value.trim();
    const origen  = [...document.querySelectorAll('.sugerir-regla-origen:checked')].map(cb => cb.value).join(', ');
    const motivo  = document.getElementById('sugerir-reglas-form-motivo').value.trim();
    const activa  = document.getElementById('sugerir-reglas-form-activa').checked;

    if (!nombre) {
      errorEl.textContent = 'Completá el nombre.';
      return;
    }
    if (!palabra && !origen) {
      errorEl.textContent = 'Completá palabra clave y/o origen — la regla necesita algo para filtrar.';
      return;
    }

    const ventanas = [];
    const filas = document.querySelectorAll('#sugerir-reglas-form-ventanas .sugerir-ventana-row');
    for (const fila of filas) {
      const dias = [...fila.querySelectorAll('.sugerir-ventana-dia:checked')].map(cb => parseInt(cb.value, 10));
      const horaDesde = fila.querySelector('.sugerir-ventana-desde').value;
      const horaHasta = fila.querySelector('.sugerir-ventana-hasta').value;
      if (dias.length === 0) {
        errorEl.textContent = 'Cada ventana necesita al menos un día seleccionado.';
        return;
      }
      if (!horaDesde || !horaHasta || horaHasta <= horaDesde) {
        errorEl.textContent = `Ventana inválida (${horaDesde}-${horaHasta}): la hora hasta tiene que ser mayor a la hora desde. Si cruza medianoche, usá 23:59 y cargá otra ventana aparte para el resto.`;
        return;
      }
      ventanas.push({ dias, horaDesde, horaHasta });
    }

    const regla = { id: _idReglaSugerirEditando || undefined, nombre, modo, palabraClave: palabra, origen, motivo, activa, ventanas };

    try {
      await RailwayAPI.guardarReglaSugerirSobreturno(regla);
      App.toast('Regla guardada', 'ok');
      await _abrirModalSugerirReglas();
    } catch (err) {
      errorEl.textContent = 'Error: ' + err.message;
    }
  }

  function _init() {
    _initModalLimites();
    _initModalSugerir();
  }

  return { init: _init, cargar };
})();