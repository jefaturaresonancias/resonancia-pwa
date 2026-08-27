// js/views/config.js — Panel de configuración (admin y jefatura)

const ConfigView = (() => {
  let _datos = null;
  let _estudiosEditados = [];
  let _limitesCount = 0;
  let _asignadoresTurno = [];
  let _agendaEspecial = {};
  // Panel de botones por rol (27/8/2026) — null = bloqueado; una vez
  // validado el PIN propio (rol='menu_config', distinto del de
  // jefatura/admin) guarda { pin, config } para poder guardar cambios sin
  // volver a pedirlo mientras se sigue en esta pantalla. Se re-bloquea
  // cada vez que se entra a Config de nuevo (ver cargar()).
  let _menuRolesEditor = null;

  // ── Cargar datos ──────────────────────────────────────────
  async function cargar() {
    const container = document.getElementById("config-container");
    container.innerHTML = '<div class="empty-state">Cargando configuración...</div>';
    _menuRolesEditor = null; // re-bloquear el panel de botones por rol
    try {
      const [estudios, feriados, franjas, bloqueos, restricciones, restriccionesOrigen, restriccionesPropia, limites, asignadores, agendaEspecial] = await Promise.all([
        RailwayAPI.leerAgendaEstudiosCatalogo(),
        RailwayAPI.leerAgendaFeriados(),
        RailwayAPI.leerAgendaFranjas(),
        RailwayAPI.leerAgendaBloqueos(),
        RailwayAPI.leerAgendaRestriccionesHorarias(),
        RailwayAPI.leerAgendaRestriccionesOrigen(),
        RailwayAPI.leerAgendaRestriccionesPropia(),
        // Límites vive en Railway (como Reglas Agenda) — si falla no debe
        // tumbar el resto de Config, solo el contador.
        RailwayAPI.leerLimitesSobreturno().catch(() => []),
        RailwayAPI.leerAsignadoresTurno().catch(() => []),
        RailwayAPI.leerAgendaEspecialConfig().catch(() => ({}))
      ]);
      _datos = { estudios, feriados, franjas, bloqueos, restricciones, restriccionesOrigen, restriccionesPropia };
      _limitesCount = limites.length;
      _asignadoresTurno = asignadores;
      _agendaEspecial = agendaEspecial;
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
        ${_card("🔒", (d.restricciones.length + (d.restriccionesOrigen||[]).length + (d.restriccionesPropia||[]).length), "restricciones")}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${_seccionEstudios(d.estudios)}
        ${_seccionFeriados(d.feriados)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${_seccionFranjas(d.franjas)}
          ${_seccionBloqueos(d.bloqueos)}
        </div>
        ${_seccionRestricciones(d.restricciones, d.restriccionesOrigen||[], d.restriccionesPropia||[])}
        ${_seccionLimites()}
        ${_seccionSugerirSobreturno()}
        ${_seccionAsignadoresTurno()}
        ${_seccionAgendaEspecial()}
        ${_seccionMenuRoles()}
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
      <button class="cfg-btn-del-estudio" data-idx="${i}" data-id="${e.id}" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0" aria-label="Eliminar">×</button>
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
          <button class="cfg-del-feriado" data-idx="${f._idx}" data-id="${f.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0;line-height:1;flex-shrink:0" aria-label="Eliminar">×</button>
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
      const dias = (f.diasSemana||[]).map(d => DIAS_LABEL[d]).join("/");
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:var(--bg)">
        <div style="width:12px;height:12px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${f.concepto}</div>
          <div style="font-size:11px;color:var(--text-2)">${dias} · ${f.horaDesde}–${f.horaHasta}</div>
        </div>
        <button class="cfg-edit-franja" data-idx="${i}" style="background:none;border:none;color:var(--text-2);cursor:pointer;font-size:14px" aria-label="Editar">✏️</button>
        <button class="cfg-del-franja" data-id="${f.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px" aria-label="Eliminar">×</button>
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
          <div style="font-size:11px;color:var(--text-2)">${b.fecha} · ${b.horaDesde}–${b.horaHasta}</div>
        </div>
        <button class="cfg-edit-bloqueo" data-idx="${i}" style="background:none;border:none;color:var(--text-2);cursor:pointer;font-size:14px;margin-right:2px" aria-label="Editar">✏️</button>
        <button class="cfg-del-bloqueo" data-id="${b.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px" aria-label="Eliminar">×</button>
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
  // Reserva (no bloqueo parejo): una franja por código/origen deja entrar
  // solo estudios cuyo catálogo tenga ese código, o turnos con ese origen —
  // ver lib/restriccionesCodigo.js (sistema2-node) para la mecánica real.
  // "Propia" es la ventana en la que un estudio CON ese código puede darse,
  // sin importar qué reserve la franja en ese momento.
  function _seccionRestricciones(rest, origen, propia) {
    const _item = (r, tipo) => {
      const dias = (r.diasSemana||[]).map(d => DIAS_LABEL[d]).join("/");
      const cod  = tipo === "origen" ? r.origen : r.codigo;
      const cls  = tipo === "codigo" ? "cfg-edit-rest-cod" : tipo === "origen" ? "cfg-edit-rest-orig" : "cfg-edit-rest-propia";
      const clsDel = tipo === "codigo" ? "cfg-del-rest-cod" : tipo === "origen" ? "cfg-del-rest-orig" : "cfg-del-rest-propia";
      return `<div style="padding:8px;border-radius:8px;background:var(--bg);position:relative">
        <div style="font-size:12px;color:var(--text-2);margin-bottom:2px">${tipo === "origen" ? "Origen" : "Código"}: ${cod}</div>
        <div style="font-size:13px;font-weight:500">${r.leyenda||(tipo === "propia" ? "Ventana propia" : "—")}</div>
        <div style="font-size:11px;color:var(--text-2)">${dias} · ${r.horaDesde}–${r.horaHasta}</div>
        <div style="position:absolute;top:6px;right:6px;display:flex;gap:4px">
          <button class="${cls}" data-id="${r.id}" style="background:none;border:none;color:var(--text-2);cursor:pointer;font-size:12px" aria-label="Editar">✏️</button>
          <button class="${clsDel}" data-id="${r.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px" aria-label="Eliminar">×</button>
        </div>
      </div>`;
    };
    const _grupo = (titulo, lista, tipo, vacio) => `<div>
      <div style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${titulo}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${lista.map(r => _item(r, tipo)).join("") || `<div style="font-size:12px;color:var(--text-2)">${vacio}</div>`}
      </div>
    </div>`;
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🔐 Restricciones por código, origen y ventana propia</span>
        <div style="display:flex;gap:6px">
          <button id="cfg-btn-nueva-rest-cod" style="font-size:12px">+ Por código</button>
          <button id="cfg-btn-nueva-rest-orig" style="font-size:12px">+ Por origen</button>
          <button id="cfg-btn-nueva-rest-propia" style="font-size:12px">+ Ventana propia</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start">
        ${_grupo("Por código", rest, "codigo", "Sin restricciones por código")}
        ${_grupo("Por origen", origen, "origen", "Sin restricciones por origen")}
        ${_grupo("Ventana propia", propia, "propia", "Sin ventanas propias")}
      </div>
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
          <button id="cfg-btn-sugerir-categorias" style="font-size:12px">🏷️ Categorías de estudio</button>
          <button id="cfg-btn-sugerir-franjas" style="font-size:12px">🎯 Franjas preferidas</button>
          <button id="cfg-btn-sugerir-reglas" style="font-size:12px">📋 Reglas específicas</button>
          <button id="cfg-btn-sugerir-gestionar" style="font-size:12px">⚙️ Ajustar parámetros</button>
        </div>
      </div>
    </div>`;
  }

  // ── Sección Quién asigna el turno ───────────────────────────
  // Lista propia, separada de la tabla de técnicos de guardias — obligatoria
  // desde el panel de turno (25/8/2026, mismo criterio que ya usa Portada).
  function _seccionAsignadoresTurno() {
    const items = _asignadoresTurno.map((n, i) => `
      <span class="estudio-chip">
        ${n}
        <button type="button" class="cfg-btn-del-asignador" data-idx="${i}" title="Quitar">×</button>
      </span>`).join("");

    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <span style="font-weight:500;font-size:15px">🧑‍⚕️ Quién asigna el turno</span>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">Lista obligatoria a elegir en el panel de turno antes de buscar horarios</div>
        </div>
        <button id="cfg-btn-nuevo-asignador" style="font-size:12px">+ Agregar</button>
      </div>
      <div id="cfg-chips-asignadores" class="estudios-chips-wrap">
        ${items || '<span style="color:var(--text-3);font-size:12px;font-style:italic">Sin nombres cargados todavía</span>'}
      </div>
    </div>`;
  }

  async function _guardarAsignadoresTurno() {
    try {
      await RailwayAPI.guardarAsignadoresTurno(_asignadoresTurno);
      App.toast("Lista guardada", "ok");
      _render();
    } catch (err) { App.toast("Error: " + err.message, "error"); }
  }

  // ── Sección Agendas especiales (NCX/Neurología) ─────────────
  // Ventana horaria de ncx.html/neurologia.html (26/8/2026) — coordinadores
  // externos solo pueden cargar dentro de esto. Reusa _pedirDiasSemana
  // (mismo prompt de texto que ya usan franjas/restricciones).
  function _seccionAgendaEspecial() {
    const _item = (tipo, icono) => {
      const v = _agendaEspecial[tipo];
      const dias = v ? (v.diasSemana || []).map(d => DIAS_LABEL[d]).join("/") : "—";
      return `<div style="padding:10px;border-radius:8px;background:var(--bg);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:600">${icono} ${tipo === "NCX" ? "Neurocirugía (NCX)" : "Neurología"}</div>
          <div style="font-size:12px;color:var(--text-2)">${v ? `${dias} · ${v.horaDesde}–${v.horaHasta}` : "Sin configurar"}</div>
        </div>
        <button class="cfg-edit-agenda-especial" data-tipo="${tipo}" style="font-size:12px">✏️ Editar</button>
      </div>`;
    };
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🩺 Agendas especiales (NCX / Neurología)</span>
        <div style="font-size:12px;color:var(--text-2);margin-top:2px">Ventana en la que ncx.html/neurologia.html dejan cargar un turno — coordinadores externos, con PIN propio</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${_item("NCX", "🔪")}
        ${_item("NEUROLOGIA", "🧠")}
      </div>
    </div>`;
  }

  function _editarAgendaEspecial(tipo) {
    const actual = _agendaEspecial[tipo] || { diasSemana: [], horaDesde: "", horaHasta: "" };
    const diasSemana = _pedirDiasSemana(actual.diasSemana);
    if (!diasSemana) return;
    const horaDesde = prompt("Hora desde (HH:MM):", actual.horaDesde);
    if (!horaDesde) return;
    const horaHasta = prompt("Hora hasta (HH:MM):", actual.horaHasta);
    if (!horaHasta) return;
    _guardarSeccion(RailwayAPI.guardarAgendaEspecialConfig, { tipo, diasSemana, horaDesde, horaHasta }, "Ventana guardada");
  }

  // ── Botones del sidebar por rol (27/8/2026) ────────────────
  // Qué botones puede ver administrativo/técnico es editable acá, pero
  // nunca por encima de lo que ya permite la clase del botón en el HTML
  // (admin-only/tecnico-only/jefatura-only/etc.) — mismo tope que aplica
  // js/app.js al construir el sidebar real, para que este panel no pueda
  // ofrecer algo reservado a otro nivel (ej. Config a administrativo).
  const ROLES_POR_CLASE = {
    "tecnico-only": ["tecnico"],
    "admin-only": ["administrativo", "jefatura", "admin"],
    "jefatura-only": ["jefatura", "admin"],
    "jefatura-exclusivo": ["jefatura"],
    "admin-jefatura-only": ["admin", "jefatura"]
  };
  function _navEsElegibleParaRol(el, rol) {
    for (const [clase, roles] of Object.entries(ROLES_POR_CLASE)) {
      if (el.classList.contains(clase) && !roles.includes(rol)) return false;
    }
    return true;
  }
  function _botonesElegibles(rol) {
    return [...document.querySelectorAll("#sidebar .nav-btn")]
      .filter(el => el.id !== "nav-cambiar-pin" && _navEsElegibleParaRol(el, rol))
      .map(el => ({ id: el.id, label: (el.querySelector(".nav-label") || el).textContent.trim() }));
  }

  function _seccionMenuRoles() {
    if (!_menuRolesEditor) {
      return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-weight:500;font-size:15px">🔐 Botones del menú por rol</span>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px">Qué ve administrativo y técnico en su sidebar — protegido con un PIN propio</div>
          </div>
          <button id="cfg-desbloquear-menu-roles" style="font-size:12px">🔓 Desbloquear</button>
        </div>
      </div>`;
    }
    const filas = (rol) => _botonesElegibles(rol).map(b => {
      const marcado = _menuRolesEditor.config[rol].includes(b.id) ? "checked" : "";
      return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;padding:3px 0">
        <input type="checkbox" class="cfg-menu-rol-check" data-rol="${rol}" data-id="${b.id}" ${marcado}> ${b.label}
      </label>`;
    }).join("");
    return `<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:500;font-size:15px">🔐 Botones del menú por rol</span>
        <div style="display:flex;gap:8px">
          <button id="cfg-menu-roles-cambiar-pin" style="font-size:12px">Cambiar PIN del panel</button>
          <button id="cfg-menu-roles-guardar" class="btn-primary" style="font-size:12px">Guardar</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div><div style="font-size:13px;font-weight:600;margin-bottom:6px">Administrativo</div>${filas("administrativo")}</div>
        <div><div style="font-size:13px;font-weight:600;margin-bottom:6px">Técnico</div>${filas("tecnico")}</div>
      </div>
    </div>`;
  }

  async function _desbloquearMenuRoles() {
    const pin = prompt("PIN del panel de botones por rol:");
    if (!pin) return;
    try {
      const r = await RailwayAPI.validarPinRol("menu_config", pin);
      if (!r.ok) { App.toast(r.error || "PIN incorrecto", "error"); return; }
      const config = await RailwayAPI.leerMenuRolesPublico();
      _menuRolesEditor = { pin, config };
      _render();
    } catch (err) { App.toast("Error: " + err.message, "error"); }
  }

  async function _guardarMenuRolesDesdeForm() {
    const config = { administrativo: [], tecnico: [] };
    document.querySelectorAll(".cfg-menu-rol-check").forEach(chk => {
      if (chk.checked) config[chk.dataset.rol].push(chk.dataset.id);
    });
    try {
      const r = await RailwayAPI.guardarMenuRoles(_menuRolesEditor.pin, config);
      if (!r.ok) { App.toast(r.error || "No se pudo guardar", "error"); return; }
      _menuRolesEditor.config = config;
      App.toast("Botones por rol guardados", "ok");
    } catch (err) { App.toast("Error: " + err.message, "error"); }
  }

  async function _cambiarPinMenuRoles() {
    const pinActual = prompt("PIN actual del panel:");
    if (!pinActual) return;
    const nuevo = prompt("PIN nuevo (4 dígitos):");
    if (!nuevo) return;
    if (!/^\d{4}$/.test(nuevo)) { App.toast("El PIN debe tener exactamente 4 dígitos", "error"); return; }
    const confirmar = prompt("Repetí el PIN nuevo:");
    if (nuevo !== confirmar) { App.toast("Los PINs no coinciden", "error"); return; }
    try {
      const r = await RailwayAPI.cambiarPinMenuRoles(pinActual, nuevo);
      if (!r.ok) { App.toast(r.error || "No se pudo cambiar el PIN", "error"); return; }
      if (_menuRolesEditor) _menuRolesEditor.pin = nuevo;
      App.toast("PIN del panel actualizado", "ok");
    } catch (err) { App.toast("Error: " + err.message, "error"); }
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
        _guardarEstudio({ ..._datos.estudios[i], duracion: nueva });
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
      btn.addEventListener("click", async () => {
        const i = parseInt(btn.dataset.idx);
        if (!confirm(`¿Eliminar estudio "${_datos.estudios[i].nombre}"?`)) return;
        try {
          await RailwayAPI.eliminarAgendaEstudio(btn.dataset.id);
          App.toast("Estudio eliminado", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
      });
    });

    // Nuevo estudio
    document.getElementById("cfg-btn-nuevo-estudio").addEventListener("click", () => _editarEstudio(-1));

    // Feriados
    container.querySelectorAll(".cfg-del-feriado").forEach(btn => {
      btn.addEventListener("click", async () => {
        const i = parseInt(btn.dataset.idx);
        if (!confirm(`¿Eliminar feriado "${_datos.feriados[i].fecha}"?`)) return;
        try {
          await RailwayAPI.eliminarAgendaFeriado(btn.dataset.id);
          App.toast("Feriado eliminado", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
      });
    });

    document.getElementById("cfg-btn-nuevo-feriado").addEventListener("click", async () => {
      const fecha    = prompt("Fecha del feriado (dd/MM/yyyy):");
      if (!fecha) return;
      const concepto = prompt("Concepto:");
      if (!concepto) return;
      try {
        await RailwayAPI.guardarAgendaFeriado({ fecha, concepto });
        App.toast("Feriado guardado", "ok");
        cargar();
      } catch (err) { App.toast("Error: " + err.message, "error"); }
    });

    // Bloqueos
    container.querySelectorAll(".cfg-del-bloqueo").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este bloqueo?")) return;
        try {
          await RailwayAPI.eliminarAgendaBloqueo(btn.dataset.id);
          App.toast("Bloqueo eliminado", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
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
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta franja?")) return;
        try {
          await RailwayAPI.eliminarAgendaFranja(btn.dataset.id);
          App.toast("Franja eliminada", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
      });
    });

    // Restricciones por código
    document.getElementById("cfg-btn-nueva-rest-cod").addEventListener("click", () => _editarRestriccionCodigo(null));
    container.querySelectorAll(".cfg-edit-rest-cod").forEach(btn => {
      btn.addEventListener("click", () => _editarRestriccionCodigo(_datos.restricciones.find(r => String(r.id) === btn.dataset.id)));
    });
    container.querySelectorAll(".cfg-del-rest-cod").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta restricción por código?")) return;
        try {
          await RailwayAPI.eliminarAgendaRestriccionHoraria(btn.dataset.id);
          App.toast("Restricción eliminada", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
      });
    });

    // Restricciones por origen
    document.getElementById("cfg-btn-nueva-rest-orig").addEventListener("click", () => _editarRestriccionOrigen(null));
    container.querySelectorAll(".cfg-edit-rest-orig").forEach(btn => {
      btn.addEventListener("click", () => _editarRestriccionOrigen((_datos.restriccionesOrigen||[]).find(r => String(r.id) === btn.dataset.id)));
    });
    container.querySelectorAll(".cfg-del-rest-orig").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta restricción por origen?")) return;
        try {
          await RailwayAPI.eliminarAgendaRestriccionOrigen(btn.dataset.id);
          App.toast("Restricción eliminada", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
      });
    });

    // Ventana propia del código
    document.getElementById("cfg-btn-nueva-rest-propia").addEventListener("click", () => _editarRestriccionPropia(null));
    container.querySelectorAll(".cfg-edit-rest-propia").forEach(btn => {
      btn.addEventListener("click", () => _editarRestriccionPropia((_datos.restriccionesPropia||[]).find(r => String(r.id) === btn.dataset.id)));
    });
    container.querySelectorAll(".cfg-del-rest-propia").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta ventana propia?")) return;
        try {
          await RailwayAPI.eliminarAgendaRestriccionPropia(btn.dataset.id);
          App.toast("Ventana eliminada", "ok");
          cargar();
        } catch (err) { App.toast("Error: " + err.message, "error"); }
      });
    });

    // Límites de sobreturno
    document.getElementById("cfg-btn-limites-gestionar").addEventListener("click", _abrirModalLimites);

    // Reglas de asignación de sobreturno
    document.getElementById("cfg-btn-sugerir-gestionar").addEventListener("click", _abrirModalSugerir);
    document.getElementById("cfg-btn-sugerir-reglas").addEventListener("click", _abrirModalSugerirReglas);
    document.getElementById("cfg-btn-sugerir-franjas").addEventListener("click", _abrirModalFranjasPreferidas);
    document.getElementById("cfg-btn-sugerir-categorias").addEventListener("click", _abrirModalCategorias);

    // Quién asigna el turno
    document.getElementById("cfg-btn-nuevo-asignador").addEventListener("click", () => {
      const nombre = prompt("Nombre de la persona:");
      if (!nombre || !nombre.trim()) return;
      _asignadoresTurno.push(nombre.trim());
      _guardarAsignadoresTurno();
    });
    container.querySelectorAll(".cfg-btn-del-asignador").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx, 10);
        if (!confirm(`¿Quitar a "${_asignadoresTurno[i]}" de la lista?`)) return;
        _asignadoresTurno.splice(i, 1);
        _guardarAsignadoresTurno();
      });
    });

    // Agendas especiales (NCX/Neurología)
    container.querySelectorAll(".cfg-edit-agenda-especial").forEach(btn => {
      btn.addEventListener("click", () => _editarAgendaEspecial(btn.dataset.tipo));
    });

    // Botones del menú por rol
    const btnDesbloquear = document.getElementById("cfg-desbloquear-menu-roles");
    if (btnDesbloquear) btnDesbloquear.addEventListener("click", _desbloquearMenuRoles);
    const btnGuardarMenu = document.getElementById("cfg-menu-roles-guardar");
    if (btnGuardarMenu) btnGuardarMenu.addEventListener("click", _guardarMenuRolesDesdeForm);
    const btnCambiarPinMenu = document.getElementById("cfg-menu-roles-cambiar-pin");
    if (btnCambiarPinMenu) btnCambiarPinMenu.addEventListener("click", _cambiarPinMenuRoles);
  }

  // ── Días de semana en texto (LUNES,MARTES,...) ↔ diasSemana:[0-6] ──
  // Reemplaza al viejo dia1/func1/dia2/func2/dia3 (rango de celdas del
  // Sheet) — acá se guarda directo el array de días, sin resolver rangos.
  const DIAS_NOMBRE = ['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'];
  const DIAS_NOMBRE_MAP = { DOMINGO:0, LUNES:1, MARTES:2, MIERCOLES:3, 'MIÉRCOLES':3, JUEVES:4, VIERNES:5, SABADO:6, 'SÁBADO':6 };
  function _diasSemanaATexto(dias) {
    return (dias||[]).slice().sort((a,b)=>a-b).map(d => DIAS_NOMBRE[d]).join(',');
  }
  function _textoADiasSemana(texto) {
    return String(texto||'').split(',').map(s => DIAS_NOMBRE_MAP[s.trim().toUpperCase()]).filter(d => d !== undefined);
  }
  function _pedirDiasSemana(actuales) {
    const texto = prompt("Días (separados por coma — LUNES,MARTES,...):", _diasSemanaATexto(actuales));
    if (texto === null) return null;
    const dias = _textoADiasSemana(texto);
    if (dias.length === 0) { App.toast("Ningún día válido reconocido", "error"); return null; }
    return dias;
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
    _guardarEstudio({ id: e.id, nombre, estadistica, restriccion, duracion });
  }

  async function _guardarEstudio(estudio) {
    try {
      await RailwayAPI.guardarAgendaEstudio(estudio);
      App.toast("Estudio guardado", "ok");
      cargar();
    } catch (err) { App.toast("Error: " + err.message, "error"); }
  }

  // ── Editar bloqueo ────────────────────────────────────────
  function _editarBloqueo(idx) {
    const nuevo = idx === -1;
    const b     = nuevo ? { fecha:"", horaDesde:"", horaHasta:"", concepto:"" } : {..._datos.bloqueos[idx]};
    const fecha    = prompt("Fecha del bloqueo (dd/MM/yyyy):", b.fecha);
    if (!fecha) return;
    const horaDesde = prompt("Hora desde (HH:MM):", b.horaDesde);
    if (!horaDesde) return;
    const horaHasta = prompt("Hora hasta (HH:MM):", b.horaHasta);
    if (!horaHasta) return;
    const concepto = prompt("Concepto:", b.concepto);
    if (!concepto) return;
    _guardarSeccion(RailwayAPI.guardarAgendaBloqueo, { id: b.id, fecha, horaDesde, horaHasta, concepto }, "Bloqueo guardado");
  }

  // ── Editar franja ─────────────────────────────────────────
  function _editarFranja(idx) {
    const nuevo = idx === -1;
    const f = nuevo
      ? { diasSemana:[], horaDesde:"", horaHasta:"", concepto:"", color:"#e06666" }
      : {..._datos.franjas[idx]};
    const concepto = prompt("Concepto (ej: Franja Exclusiva Neurología):", f.concepto);
    if (!concepto) return;
    const diasSemana = _pedirDiasSemana(f.diasSemana);
    if (!diasSemana) return;
    const horaDesde = prompt("Hora desde (HH:MM):", f.horaDesde);
    if (!horaDesde) return;
    const horaHasta = prompt("Hora hasta (HH:MM):", f.horaHasta);
    if (!horaHasta) return;
    const color = prompt("Color hex (ej: #e06666):", f.color || "#e06666");
    _guardarSeccion(RailwayAPI.guardarAgendaFranja, { id: f.id, diasSemana, horaDesde, horaHasta, concepto, color: color||"#e06666" }, "Franja guardada");
  }

  // ── Editar restricción por código ─────────────────────────
  function _editarRestriccionCodigo(r) {
    const d = r || { codigo:"", diasSemana:[], horaDesde:"", horaHasta:"", leyenda:"", color:"#e06666" };
    const codigo = prompt("Código (ej: MM, CAR, Q):", d.codigo);
    if (!codigo) return;
    const diasSemana = _pedirDiasSemana(d.diasSemana);
    if (!diasSemana) return;
    const horaDesde = prompt("Hora desde (HH:MM):", d.horaDesde);
    if (!horaDesde) return;
    const horaHasta = prompt("Hora hasta (HH:MM):", d.horaHasta);
    if (!horaHasta) return;
    const leyenda = prompt("Leyenda:", d.leyenda);
    const color = prompt("Color hex (ej: #e06666):", d.color || "#e06666");
    _guardarSeccion(RailwayAPI.guardarAgendaRestriccionHoraria, { id: d.id, codigo, diasSemana, horaDesde, horaHasta, leyenda, color: color||"#e06666" }, "Restricción guardada");
  }

  // ── Editar restricción por origen ─────────────────────────
  function _editarRestriccionOrigen(r) {
    const d = r || { origen:"", diasSemana:[], horaDesde:"", horaHasta:"", leyenda:"", color:"#ffd966" };
    const origen = prompt("Origen (ej: INTERNACIÓN):", d.origen);
    if (!origen) return;
    const diasSemana = _pedirDiasSemana(d.diasSemana);
    if (!diasSemana) return;
    const horaDesde = prompt("Hora desde (HH:MM):", d.horaDesde);
    if (!horaDesde) return;
    const horaHasta = prompt("Hora hasta (HH:MM):", d.horaHasta);
    if (!horaHasta) return;
    const leyenda = prompt("Leyenda:", d.leyenda);
    const color = prompt("Color hex (ej: #ffd966):", d.color || "#ffd966");
    _guardarSeccion(RailwayAPI.guardarAgendaRestriccionOrigen, { id: d.id, origen, diasSemana, horaDesde, horaHasta, leyenda, color: color||"#ffd966" }, "Restricción guardada");
  }

  // ── Editar ventana propia del código ──────────────────────
  function _editarRestriccionPropia(r) {
    const d = r || { codigo:"", diasSemana:[], horaDesde:"", horaHasta:"" };
    const codigo = prompt("Código (ej: MM, CAR):", d.codigo);
    if (!codigo) return;
    const diasSemana = _pedirDiasSemana(d.diasSemana);
    if (!diasSemana) return;
    const horaDesde = prompt("Hora desde (HH:MM):", d.horaDesde);
    if (!horaDesde) return;
    const horaHasta = prompt("Hora hasta (HH:MM):", d.horaHasta);
    if (!horaHasta) return;
    _guardarSeccion(RailwayAPI.guardarAgendaRestriccionPropia, { id: d.id, codigo, diasSemana, horaDesde, horaHasta }, "Ventana guardada");
  }

  // ── Guardar (genérico) ────────────────────────────────────
  async function _guardarSeccion(fnGuardar, datos, mensajeOk) {
    try {
      await fnGuardar(datos);
      App.toast(mensajeOk, "ok");
      cargar();
    } catch (err) { App.toast("Error: " + err.message, "error"); }
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
  const ORIGENES_SUGERIR = ['AMBULATORIO', 'INTERNACIÓN', 'GUARDIA', 'DIRECCIÓN', 'TRASLADO', 'DELEGACION/VICTOR'];

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
        <input type="text" id="sugerir-reglas-form-palabra" value="${regla ? (regla.palabraClave||'').replace(/"/g,'&quot;') : ''}" placeholder="Ej: MAMARIA, #MSK — separadas por coma, admite #CODIGO de categoría">
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

  // ── Modal: franjas preferidas por estudio (lista ↔ formulario) ─────
  // Mismo overlay que arriba. A diferencia de "Reglas específicas" (que
  // bloquea/reserva), esto no filtra nada — solo cambia el reparto de las
  // sugerencias que ya pasaron todos los filtros: hasta "cupo preferido"
  // dentro de la franja horaria, y hasta "cupo resto" fuera de ella, en
  // días distintos entre sí.
  let _franjasPreferidasCache = [];
  let _idFranjaPreferidaEditando = null;

  async function _abrirModalFranjasPreferidas() {
    document.getElementById('sugerir-modal-overlay').classList.remove('hidden');
    document.getElementById('sugerir-modal-titulo').textContent = 'Franjas preferidas por estudio';
    document.getElementById('sugerir-modal-body').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    document.getElementById('sugerir-modal-footer').innerHTML = '';
    try {
      _franjasPreferidasCache = await RailwayAPI.leerFranjasPreferidasSugerir();
      _renderListaFranjasPreferidas();
    } catch (err) {
      document.getElementById('sugerir-modal-body').innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function _renderListaFranjasPreferidas() {
    document.getElementById('sugerir-modal-titulo').textContent = 'Franjas preferidas por estudio';

    const filas = _franjasPreferidasCache.map(f => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.5rem;${f.activa === false ? 'opacity:.55' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">${f.nombre}${f.activa === false ? ' <span style="font-weight:400;color:var(--text-3)">(inactiva)</span>' : ''}</div>
          <div style="font-size:.78rem;color:var(--text-2);margin-top:.15rem">${f.palabraClave}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.15rem">${f.horaDesde}-${f.horaHasta}: hasta ${f.cupoPreferido} ahí + hasta ${f.cupoResto} fuera (días distintos)</div>
        </div>
        <button class="btn-sm" data-editar-franja="${f.id}">✏️</button>
        <button class="btn-sm" data-eliminar-franja="${f.id}" style="color:var(--danger)">🗑</button>
      </div>`).join('');

    document.getElementById('sugerir-modal-body').innerHTML = filas ||
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">Sin franjas preferidas todavía</div>';

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-franjas-cancelar-lista">Cerrar</button>
      <button class="btn-primary" id="btn-sugerir-franjas-nueva">+ Nueva franja</button>`;

    document.getElementById('sugerir-modal-body').querySelectorAll('[data-editar-franja]').forEach(btn => {
      btn.addEventListener('click', () => _abrirFormularioFranjaPreferida(_franjasPreferidasCache.find(f => f.id === btn.dataset.editarFranja)));
    });
    document.getElementById('sugerir-modal-body').querySelectorAll('[data-eliminar-franja]').forEach(btn => {
      btn.addEventListener('click', () => _eliminarFranjaPreferida(btn.dataset.eliminarFranja));
    });
    document.getElementById('btn-sugerir-franjas-cancelar-lista').addEventListener('click', _cerrarModalSugerir);
    document.getElementById('btn-sugerir-franjas-nueva').addEventListener('click', () => _abrirFormularioFranjaPreferida(null));
  }

  async function _eliminarFranjaPreferida(id) {
    const franja = _franjasPreferidasCache.find(f => f.id === id);
    if (!confirm(`¿Eliminar la franja "${franja ? franja.nombre : id}"? Esta acción no se puede deshacer.`)) return;
    try {
      await RailwayAPI.eliminarFranjaPreferidaSugerir(id);
      App.toast('Franja eliminada', 'ok');
      _abrirModalFranjasPreferidas();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  function _abrirFormularioFranjaPreferida(franja) {
    _idFranjaPreferidaEditando = franja ? franja.id : null;

    document.getElementById('sugerir-modal-titulo').textContent = franja ? 'Editar franja preferida' : 'Nueva franja preferida';

    document.getElementById('sugerir-modal-body').innerHTML = `
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Nombre</label>
        <input type="text" id="sugerir-franja-form-nombre" value="${franja ? franja.nombre.replace(/"/g,'&quot;') : ''}" placeholder="Ej: Lumbar/MSK sin contraste — madrugada">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Palabra(s) clave del estudio</label>
        <input type="text" id="sugerir-franja-form-palabra" value="${franja ? franja.palabraClave.replace(/"/g,'&quot;') : ''}" placeholder="Ej: lumbar, #MSK — separadas por coma, admite #CODIGO de categoría">
      </div>
      <div class="form-row" style="margin-bottom:.75rem">
        <div class="form-group"><label>Franja preferida desde</label><input type="time" id="sugerir-franja-form-desde" value="${franja ? franja.horaDesde : '00:00'}"></div>
        <div class="form-group"><label>hasta</label><input type="time" id="sugerir-franja-form-hasta" value="${franja ? franja.horaHasta : '04:00'}"></div>
      </div>
      <div class="form-row" style="margin-bottom:.75rem">
        <div class="form-group"><label>Cupo dentro de la franja</label><input type="number" id="sugerir-franja-form-cupo-pref" min="1" step="1" value="${franja ? franja.cupoPreferido : 2}"></div>
        <div class="form-group"><label>Cupo fuera (días distintos)</label><input type="number" id="sugerir-franja-form-cupo-resto" min="0" step="1" value="${franja ? franja.cupoResto : 3}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;margin-bottom:1rem;cursor:pointer">
        <input type="checkbox" id="sugerir-franja-form-activa" ${!franja || franja.activa !== false ? 'checked' : ''}> Franja activa
      </label>
      <div id="sugerir-franja-form-error" style="color:#c62828;font-size:.8rem;margin-top:.5rem"></div>
    `;

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-franjas-cancelar-form">Cancelar</button>
      <button class="btn-primary" id="btn-sugerir-franjas-guardar">Guardar</button>`;

    document.getElementById('btn-sugerir-franjas-cancelar-form').addEventListener('click', _renderListaFranjasPreferidas);
    document.getElementById('btn-sugerir-franjas-guardar').addEventListener('click', _guardarFormularioFranjaPreferida);
  }

  async function _guardarFormularioFranjaPreferida() {
    const errorEl = document.getElementById('sugerir-franja-form-error');
    errorEl.textContent = '';

    const nombre = document.getElementById('sugerir-franja-form-nombre').value.trim();
    const palabraClave = document.getElementById('sugerir-franja-form-palabra').value.trim();
    const horaDesde = document.getElementById('sugerir-franja-form-desde').value;
    const horaHasta = document.getElementById('sugerir-franja-form-hasta').value;
    const cupoPreferido = parseInt(document.getElementById('sugerir-franja-form-cupo-pref').value, 10);
    const cupoResto = parseInt(document.getElementById('sugerir-franja-form-cupo-resto').value, 10);
    const activa = document.getElementById('sugerir-franja-form-activa').checked;

    if (!nombre || !palabraClave) {
      errorEl.textContent = 'Completá nombre y palabra(s) clave.';
      return;
    }
    if (!horaDesde || !horaHasta || horaHasta <= horaDesde) {
      errorEl.textContent = `Franja inválida (${horaDesde}-${horaHasta}): la hora hasta tiene que ser mayor a la hora desde.`;
      return;
    }

    const franja = { id: _idFranjaPreferidaEditando || undefined, nombre, palabraClave, horaDesde, horaHasta, cupoPreferido, cupoResto, activa };

    try {
      await RailwayAPI.guardarFranjaPreferidaSugerir(franja);
      App.toast('Franja guardada', 'ok');
      await _abrirModalFranjasPreferidas();
    } catch (err) {
      errorEl.textContent = 'Error: ' + err.message;
    }
  }

  // ── Modal: categorías de estudio (lista ↔ formulario) ──────────────
  // Agrupan varios nombres de estudio bajo un código corto (#MSK, #NEURO,
  // #CUERPO...) reutilizable escribiendo "#CODIGO" dentro del campo
  // palabra clave de "Reglas específicas" o "Franjas preferidas" — NUNCA
  // en Reglas Agenda (esa la audita el bot externo, que no entiende esta
  // sintaxis). Mismo overlay que arriba.
  let _categoriasCache = [];

  async function _abrirModalCategorias() {
    document.getElementById('sugerir-modal-overlay').classList.remove('hidden');
    document.getElementById('sugerir-modal-titulo').textContent = 'Categorías de estudio';
    document.getElementById('sugerir-modal-body').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    document.getElementById('sugerir-modal-footer').innerHTML = '';
    try {
      _categoriasCache = await RailwayAPI.leerCategoriasEstudio();
      _renderListaCategorias();
    } catch (err) {
      document.getElementById('sugerir-modal-body').innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function _renderListaCategorias() {
    document.getElementById('sugerir-modal-titulo').textContent = 'Categorías de estudio';

    const filas = _categoriasCache.map(c => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.5rem">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">#${c.codigo} — ${c.nombre}</div>
          <div style="font-size:.78rem;color:var(--text-2);margin-top:.15rem">${c.palabrasClave}</div>
        </div>
        <button class="btn-sm" data-editar-categoria="${c.codigo}">✏️</button>
        <button class="btn-sm" data-eliminar-categoria="${c.codigo}" style="color:var(--danger)">🗑</button>
      </div>`).join('');

    document.getElementById('sugerir-modal-body').innerHTML = `
      <p style="font-size:.78rem;color:var(--text-2);margin-bottom:.75rem">Usalas escribiendo <code>#CODIGO</code> dentro de la palabra clave en "Reglas específicas" o "Franjas preferidas" — se puede combinar con texto suelto (ej. "cerebro, #MSK"). No funcionan en Reglas Agenda.</p>
      ${filas || '<div style="text-align:center;padding:2rem;color:var(--text-3)">Sin categorías todavía</div>'}`;

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-categorias-cancelar-lista">Cerrar</button>
      <button class="btn-primary" id="btn-sugerir-categorias-nueva">+ Nueva categoría</button>`;

    document.getElementById('sugerir-modal-body').querySelectorAll('[data-editar-categoria]').forEach(btn => {
      btn.addEventListener('click', () => _abrirFormularioCategoria(_categoriasCache.find(c => c.codigo === btn.dataset.editarCategoria)));
    });
    document.getElementById('sugerir-modal-body').querySelectorAll('[data-eliminar-categoria]').forEach(btn => {
      btn.addEventListener('click', () => _eliminarCategoria(btn.dataset.eliminarCategoria));
    });
    document.getElementById('btn-sugerir-categorias-cancelar-lista').addEventListener('click', _cerrarModalSugerir);
    document.getElementById('btn-sugerir-categorias-nueva').addEventListener('click', () => _abrirFormularioCategoria(null));
  }

  async function _eliminarCategoria(codigo) {
    const cat = _categoriasCache.find(c => c.codigo === codigo);
    if (!confirm(`¿Eliminar la categoría "#${codigo}"? Las reglas que la usen dejarán de matchear por ella.`)) return;
    try {
      await RailwayAPI.eliminarCategoriaEstudio(codigo);
      App.toast('Categoría eliminada', 'ok');
      _abrirModalCategorias();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  function _abrirFormularioCategoria(categoria) {
    document.getElementById('sugerir-modal-titulo').textContent = categoria ? 'Editar categoría' : 'Nueva categoría';

    document.getElementById('sugerir-modal-body').innerHTML = `
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Código (sin espacios, ej. MSK)</label>
        <input type="text" id="sugerir-categoria-form-codigo" value="${categoria ? categoria.codigo : ''}" placeholder="MSK" ${categoria ? 'disabled style="background:#f0f0f0;color:#888"' : ''}>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Nombre</label>
        <input type="text" id="sugerir-categoria-form-nombre" value="${categoria ? categoria.nombre.replace(/"/g,'&quot;') : ''}" placeholder="Músculo-esquelético">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Palabras clave que agrupa (separadas por coma)</label>
        <input type="text" id="sugerir-categoria-form-palabras" value="${categoria ? categoria.palabrasClave.replace(/"/g,'&quot;') : ''}" placeholder="rodilla, hombro, tobillo, columna lumbar">
      </div>
      <div id="sugerir-categoria-form-error" style="color:#c62828;font-size:.8rem;margin-top:.5rem"></div>
    `;

    document.getElementById('sugerir-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-sugerir-categorias-cancelar-form">Cancelar</button>
      <button class="btn-primary" id="btn-sugerir-categorias-guardar">Guardar</button>`;

    document.getElementById('btn-sugerir-categorias-cancelar-form').addEventListener('click', _renderListaCategorias);
    document.getElementById('btn-sugerir-categorias-guardar').addEventListener('click', _guardarFormularioCategoria);
  }

  async function _guardarFormularioCategoria() {
    const errorEl = document.getElementById('sugerir-categoria-form-error');
    errorEl.textContent = '';

    const codigo = document.getElementById('sugerir-categoria-form-codigo').value.trim();
    const nombre = document.getElementById('sugerir-categoria-form-nombre').value.trim();
    const palabrasClave = document.getElementById('sugerir-categoria-form-palabras').value.trim();

    if (!codigo || !nombre || !palabrasClave) {
      errorEl.textContent = 'Completá código, nombre y palabras clave.';
      return;
    }

    try {
      await RailwayAPI.guardarCategoriaEstudio({ codigo, nombre, palabrasClave });
      App.toast('Categoría guardada', 'ok');
      await _abrirModalCategorias();
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