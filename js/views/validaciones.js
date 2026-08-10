// js/views/validaciones.js — Validaciones de Agenda (reglas fijas del bot RIS)
const ValidacionesView = (() => {

  // Mismas reglas que reglas.js del bot — id -> { label, color }
  const REGLAS = {
    contraste_madrugada_semana: { label: 'Contraste madrugada', color: '#c62828' },
    contraste_finde:            { label: 'Contraste fin de semana', color: '#ad1457' },
    miercoles_cardio:           { label: 'Franja cardio', color: '#1a3a5c' },
    espectroscopia_horario:     { label: 'Horario espectroscopía', color: '#e65100' },
    pelvis_ginecologica_horario:{ label: 'Horario pelvis ginecológica', color: '#6a1b9a' },
  };

  let _filas = [];
  let _reglasCache = []; // reglas configuradas (leerReglasAgenda) — se usa para
                          // nombres de reglas custom en los badges, y en el modal
  let _colapsado = null;     // Set<fecha> de "próximos" — null = sin inicializar (primer render)
  let _colapsadoHist = null; // Set<fecha> de "históricos" — arranca todo colapsado
  let _mostrarReportados = false; // por defecto oculta lo ya reportado

  function _reglaInfo(id) {
    if (REGLAS[id]) return REGLAS[id];
    const r = _reglasCache.find(x => x.id === id);
    if (r) return { label: r.nombre, color: '#666' };
    return { label: id || 'Otra', color: '#666' };
  }

  // dd/MM/yyyy -> Date, para poder ordenar
  function _aFecha(dd_mm_yyyy) {
    const [dd, mm, yyyy] = (dd_mm_yyyy || '').split('/').map(Number);
    return new Date(yyyy || 0, (mm || 1) - 1, dd || 1);
  }

  const DIAS_LABEL_LARGO = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  function _esPasada(dd_mm_yyyy) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return _aFecha(dd_mm_yyyy) < hoy;
  }

  // Punto de entrada único: aplica búsqueda de texto y (salvo que el toggle
  // esté prendido) oculta lo ya marcado como reportado. Todavía sin separar
  // pasado/futuro — eso lo hacen _proximos()/_historicos() sobre esta base.
  function _base() {
    const busqueda = document.getElementById('validaciones-buscar').value.trim().toLowerCase();
    let arr = _filas.filter(f => _mostrarReportados || !f.reportado);
    if (busqueda) {
      arr = arr.filter(f => `${f.paciente} ${f.documento} ${f.practica} ${f.motivo}`.toLowerCase().includes(busqueda));
    }
    return arr;
  }

  function _proximos()   { return _base().filter(f => !_esPasada(f.fecha)); }
  function _historicos() { return _base().filter(f =>  _esPasada(f.fecha)); }

  function _poblarSelectReglas() {
    const sel = document.getElementById('validaciones-regla');
    if (sel.dataset.poblado) return;
    for (const [id, info] of Object.entries(REGLAS)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = info.label;
      sel.appendChild(opt);
    }
    sel.dataset.poblado = '1';
  }

  function _filtradas() {
    const regla = document.getElementById('validaciones-regla').value;
    const base  = _proximos();
    return regla ? base.filter(f => f.regla === regla) : base;
  }

  function _filtradasHist() {
    const regla = document.getElementById('validaciones-regla').value;
    const base  = _historicos();
    return regla ? base.filter(f => f.regla === regla) : base;
  }

  // Las tarjetas siempre muestran el desglose completo de PRÓXIMOS (solo
  // respetan la búsqueda de texto, no el filtro de regla) — si no, al
  // filtrar por una categoría desaparecerían las demás y no se podría
  // cambiar de categoría con un clic. No suman lo histórico: son para lo
  // accionable, no para el archivo.
  function _renderResumen() {
    const filas       = _proximos();
    const reglaActiva = document.getElementById('validaciones-regla').value;
    const porRegla     = {};
    for (const f of filas) porRegla[f.regla] = (porRegla[f.regla] || 0) + 1;

    function tarjeta(id, n, label, color) {
      const activa = reglaActiva === id;
      return `<div class="validaciones-card" data-regla="${id}" style="
          background:var(--surface);border:1px solid ${activa ? color : 'var(--border)'};
          border-left:4px solid ${color};border-radius:var(--radius);padding:1rem;text-align:center;
          cursor:pointer;user-select:none;
          ${activa ? `box-shadow:0 0 0 2px ${color}55` : ''}
        " title="${id ? 'Filtrar por ' + label : 'Ver todas'}">
        <div style="font-size:1.8rem;font-weight:700;color:${color}">${n}</div>
        <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">${label}${activa && id ? ' ✓' : ''}</div>
      </div>`;
    }

    const tarjetas = [
      tarjeta('', filas.length, 'Total (ver todas)', 'var(--navy)'),
      ...Object.entries(porRegla).map(([id, n]) => {
        const info = _reglaInfo(id);
        return tarjeta(id, n, info.label, info.color);
      })
    ];

    document.getElementById('validaciones-resumen').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem">
        ${tarjetas.join('')}
      </div>`;

    document.getElementById('validaciones-resumen').querySelectorAll('[data-regla]').forEach(card => {
      card.addEventListener('click', () => {
        const sel = document.getElementById('validaciones-regla');
        const clickeada = card.dataset.regla;
        // Clic de nuevo sobre la misma categoría ya activa → vuelve a "Todas"
        sel.value = (sel.value === clickeada && clickeada !== '') ? '' : clickeada;
        _render();
      });
    });
  }

  function _renderContainer(filas) {
    const cont       = document.getElementById('validaciones-container');
    const controles  = document.getElementById('validaciones-controles');

    if (!filas.length) {
      controles.innerHTML = '';
      cont.innerHTML = `
        <div style="text-align:center;padding:3rem;color:var(--text-3)">
          <div style="font-size:3rem">✅</div>
          <div style="margin-top:1rem">${_filas.length ? 'Sin resultados para el filtro actual' : 'Sin problemas de agenda detectados'}</div>
        </div>`;
      return;
    }

    // Agrupar por fecha, orden cronológico ascendente (más próximo primero)
    const porFecha = {};
    for (const f of filas) {
      if (!porFecha[f.fecha]) porFecha[f.fecha] = [];
      porFecha[f.fecha].push(f);
    }
    const fechas = Object.keys(porFecha).sort((a, b) => _aFecha(a) - _aFecha(b));
    for (const fecha of fechas) {
      porFecha[fecha].sort((a, b) => a.hora.localeCompare(b.hora));
    }

    // Primer render: todo colapsado salvo el día más próximo, para no
    // arrancar con un scroll larguísimo.
    if (_colapsado === null) {
      _colapsado = new Set(fechas.slice(1));
    }

    controles.innerHTML = `
      <button type="button" id="btn-validaciones-expandir-todo" class="btn-sm">Expandir todo</button>
      <button type="button" id="btn-validaciones-colapsar-todo" class="btn-sm">Colapsar todo</button>`;

    cont.innerHTML = fechas.map(fecha => {
      const items = porFecha[fecha].map(f => {
        const info = _reglaInfo(f.regla);
        return `
          <div style="
            background:var(--surface);
            border:1px solid var(--border);
            border-left:4px solid ${info.color};
            border-radius:var(--radius);
            padding:.7rem .85rem;
            ${f.reportado ? 'opacity:.6' : ''}
          ">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.3rem">
              <span style="font-weight:700;font-size:.85rem;color:var(--navy)">${f.hora}</span>
              <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:${info.color}22;color:${info.color};white-space:nowrap">${info.label}</span>
            </div>
            <div style="font-weight:600;font-size:.8rem;color:var(--text)">${f.motivo}${f.reportado ? ' <span style="color:#2e7d32;font-weight:700">· ✓ Reportado</span>' : ''}</div>
            <div style="margin-top:.2rem;font-size:.73rem;color:var(--text-2)">${f.practica}</div>
            <div style="margin-top:.2rem;font-size:.7rem;color:var(--text-3)">${f.paciente} — ${f.documento} · ${f.origen || '—'}</div>
            <button type="button" class="btn-sm validaciones-btn-reportar" data-hash="${f.hash}" data-reportado="${f.reportado ? '1' : '0'}" style="margin-top:.5rem;width:100%;font-size:11px">
              ${f.reportado ? '↺ Desmarcar' : '✓ Marcar reportado'}
            </button>
          </div>`;
      }).join('');

      const n         = porFecha[fecha].length;
      const diaLbl    = DIAS_LABEL_LARGO[_aFecha(fecha).getDay()];
      const colapsado = _colapsado.has(fecha);
      return `
        <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface)">
          <div class="validaciones-fecha-header" data-fecha="${fecha}" style="
            cursor:pointer;user-select:none;
            display:flex;align-items:center;justify-content:space-between;gap:.5rem;
            background:var(--bg);padding:.6rem 1rem;border-bottom:1px solid var(--border);
          ">
            <span style="display:flex;align-items:center;gap:.6rem;min-width:0">
              <span style="font-size:.7rem;transition:transform .15s;display:inline-block;transform:rotate(${colapsado ? '-90deg' : '0deg'})">▾</span>
              <span style="font-weight:700;font-size:.88rem;color:var(--navy)">${diaLbl} ${fecha}</span>
            </span>
            <span style="font-size:.7rem;font-weight:700;color:#fff;background:var(--navy);border-radius:20px;padding:2px 9px;flex-shrink:0">${n}</span>
          </div>
          <div style="display:${colapsado ? 'none' : 'flex'};flex-direction:column;gap:.5rem;padding:.75rem">${items}</div>
        </div>`;
    }).join('');

    cont.querySelectorAll('.validaciones-fecha-header').forEach(el => {
      el.addEventListener('click', () => {
        const fecha = el.dataset.fecha;
        if (_colapsado.has(fecha)) _colapsado.delete(fecha); else _colapsado.add(fecha);
        _renderContainer(_filtradas());
      });
    });
    document.getElementById('btn-validaciones-expandir-todo').addEventListener('click', () => {
      _colapsado.clear();
      _renderContainer(_filtradas());
    });
    document.getElementById('btn-validaciones-colapsar-todo').addEventListener('click', () => {
      _colapsado = new Set(fechas);
      _renderContainer(_filtradas());
    });
    cont.querySelectorAll('.validaciones-btn-reportar').forEach(btn => {
      btn.addEventListener('click', () => _marcarReportado(btn.dataset.hash, btn.dataset.reportado !== '1'));
    });
  }

  async function _marcarReportado(hash, reportado) {
    try {
      await API.marcarValidacionReportada(hash, reportado);
      const f = _filas.find(x => x.hash === hash);
      if (f) f.reportado = reportado;
      App.toast(reportado ? 'Marcado como reportado' : 'Desmarcado', 'ok');
      _render();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  // ── Históricos: columna izquierda, dos columnas de chips, todo colapsado
  // por defecto (solo referencia — lo accionable vive en "Próximos" a la
  // derecha). Al hacer clic una chip se expande a las dos columnas para
  // mostrar el detalle, sin desarmar el resto de la grilla.
  function _renderHistoricos() {
    const cont  = document.getElementById('validaciones-historicos');
    const filas = _filtradasHist();

    const porFecha = {};
    for (const f of filas) {
      if (!porFecha[f.fecha]) porFecha[f.fecha] = [];
      porFecha[f.fecha].push(f);
    }
    // Más reciente primero — lo último que pasó es lo más probable de revisar.
    const fechas = Object.keys(porFecha).sort((a, b) => _aFecha(b) - _aFecha(a));
    for (const fecha of fechas) porFecha[fecha].sort((a, b) => a.hora.localeCompare(b.hora));

    if (_colapsadoHist === null) _colapsadoHist = new Set(fechas);

    const header = `<div style="font-weight:700;font-size:.8rem;color:var(--text-2);text-transform:uppercase;letter-spacing:.03em;margin-bottom:.6rem">📋 Históricos${filas.length ? ` (${filas.length})` : ''}</div>`;

    if (!fechas.length) {
      cont.innerHTML = header + `<div style="font-size:.78rem;color:var(--text-3)">Sin problemas pasados.</div>`;
      return;
    }

    const chips = fechas.map(fecha => {
      const n         = porFecha[fecha].length;
      const colapsado = _colapsadoHist.has(fecha);
      const detalle = colapsado ? '' : `
        <div style="display:flex;flex-direction:column;gap:.4rem;margin-top:.6rem">
          ${porFecha[fecha].map(f => {
            const info = _reglaInfo(f.regla);
            return `
              <div style="padding:.4rem .6rem;border-left:3px solid ${info.color};background:var(--surface);border-radius:4px;font-size:.75rem;line-height:1.4;display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap">
                <span><strong>${f.hora}</strong> · ${f.paciente} — ${f.documento}</span>
                <span style="color:${info.color};font-weight:700">${info.label}</span>
              </div>`;
          }).join('')}
        </div>`;
      return `
        <div class="validaciones-hist-chip" data-fecha="${fecha}" style="
          ${colapsado ? '' : 'grid-column:1/-1;'}
          background:var(--bg);border:1px solid var(--border);border-radius:6px;
          padding:.4rem .7rem;cursor:pointer;user-select:none;
        ">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
            <span style="display:flex;align-items:center;gap:.4rem;font-size:.78rem;color:var(--text-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="font-size:.65rem;display:inline-block;transition:transform .15s;transform:rotate(${colapsado ? '-90deg' : '0deg'})">▾</span>
              ${fecha}
            </span>
            <span style="font-size:.68rem;font-weight:700;color:var(--text-3);flex-shrink:0">${n}</span>
          </div>
          ${detalle}
        </div>`;
    }).join('');

    cont.innerHTML = header + `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem">${chips}</div>`;

    cont.querySelectorAll('.validaciones-hist-chip').forEach(el => {
      el.addEventListener('click', () => {
        const fecha = el.dataset.fecha;
        if (_colapsadoHist.has(fecha)) _colapsadoHist.delete(fecha); else _colapsadoHist.add(fecha);
        _renderHistoricos();
      });
    });
  }

  function _render() {
    _renderResumen();
    _renderContainer(_filtradas());
    _renderHistoricos();
  }

  // ── Modal: gestionar reglas (lista ↔ formulario, mismo overlay) ────────
  const DIAS_LABEL = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MODOS = {
    prohibido_en_ventana: 'Prohibido en este horario',
    reservado_en_ventana: 'Reservado en este horario (todo lo demás, prohibido)',
    solo_en_ventanas:     'Solo permitido en estos horarios',
  };

  let _idEditando  = null; // null = nueva regla
  let _formVentanas = [];

  function _abrirModalReglas() {
    document.getElementById('reglas-modal-overlay').classList.remove('hidden');
    _cargarReglasModal();
  }

  function _cerrarModalReglas() {
    document.getElementById('reglas-modal-overlay').classList.add('hidden');
  }

  async function _cargarReglasModal() {
    document.getElementById('reglas-modal-titulo').textContent = 'Reglas de agenda';
    document.getElementById('reglas-modal-body').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    document.getElementById('reglas-modal-footer').innerHTML = '';
    try {
      _reglasCache = await API.leerReglasAgenda();
      _renderListaReglas();
    } catch (err) {
      document.getElementById('reglas-modal-body').innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function _resumenVentanas(ventanas) {
    return (ventanas || []).map(v => {
      const dias = (v.dias || []).map(d => DIAS_LABEL[d]).join('/');
      return `${dias} ${v.horaDesde}-${v.horaHasta}`;
    }).join(' · ');
  }

  function _renderListaReglas() {
    document.getElementById('reglas-modal-titulo').textContent = 'Reglas de agenda';

    const filas = _reglasCache.map(r => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:.5rem;${r.activa === false ? 'opacity:.55' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem">${r.nombre}${r.activa === false ? ' <span style="font-weight:400;color:var(--text-3)">(inactiva)</span>' : ''}</div>
          <div style="font-size:.78rem;color:var(--text-2);margin-top:.15rem">${MODOS[r.modo] || r.modo} — ${r.palabraClave}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.15rem">${_resumenVentanas(r.ventanas)}</div>
        </div>
        <button class="btn-sm" data-editar="${r.id}">✏️</button>
        <button class="btn-sm" data-eliminar="${r.id}" style="color:var(--danger)">🗑</button>
      </div>`).join('');

    document.getElementById('reglas-modal-body').innerHTML = filas ||
      '<div style="text-align:center;padding:2rem;color:var(--text-3)">Sin reglas configuradas todavía</div>';

    document.getElementById('reglas-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-reglas-cancelar-lista">Cerrar</button>
      <button class="btn-primary" id="btn-reglas-nueva">+ Nueva regla</button>`;

    document.getElementById('reglas-modal-body').querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', () => _abrirFormulario(_reglasCache.find(r => r.id === btn.dataset.editar)));
    });
    document.getElementById('reglas-modal-body').querySelectorAll('[data-eliminar]').forEach(btn => {
      btn.addEventListener('click', () => _eliminarRegla(btn.dataset.eliminar));
    });
    document.getElementById('btn-reglas-cancelar-lista').addEventListener('click', _cerrarModalReglas);
    document.getElementById('btn-reglas-nueva').addEventListener('click', () => _abrirFormulario(null));
  }

  async function _eliminarRegla(id) {
    const regla = _reglasCache.find(r => r.id === id);
    if (!confirm(`¿Eliminar la regla "${regla ? regla.nombre : id}"? Esta acción no se puede deshacer.`)) return;
    try {
      await API.eliminarReglaAgenda(id);
      App.toast('Regla eliminada', 'ok');
      _cargarReglasModal();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  function _htmlVentana(idx, v) {
    const dias = DIAS_LABEL.map((lbl, d) => `
      <label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--text-2);cursor:pointer">
        <input type="checkbox" class="ventana-dia" value="${d}" ${v.dias.includes(d) ? 'checked' : ''}>
        ${lbl}
      </label>`).join('');

    return `
      <div class="ventana-row" data-idx="${idx}" style="border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <span style="font-size:.78rem;font-weight:700;color:var(--text-2);text-transform:uppercase">Ventana ${idx + 1}</span>
          <button type="button" class="btn-sm" data-quitar-ventana="${idx}" style="color:var(--danger)">Quitar</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.5rem">${dias}</div>
        <div class="form-row" style="margin-bottom:0">
          <div class="form-group"><label>Desde</label><input type="time" class="ventana-desde" value="${v.horaDesde}"></div>
          <div class="form-group"><label>Hasta</label><input type="time" class="ventana-hasta" value="${v.horaHasta}"></div>
        </div>
      </div>`;
  }

  function _renderVentanas() {
    const cont = document.getElementById('reglas-form-ventanas');
    cont.innerHTML = _formVentanas.map((v, i) => _htmlVentana(i, v)).join('');
    cont.querySelectorAll('[data-quitar-ventana]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.quitarVentana, 10);
        _formVentanas.splice(idx, 1);
        if (_formVentanas.length === 0) _formVentanas.push({ dias: [], horaDesde: '08:00', horaHasta: '17:00' });
        _renderVentanas();
      });
    });
  }

  function _abrirFormulario(regla) {
    _idEditando = regla ? regla.id : null;
    _formVentanas = regla ? JSON.parse(JSON.stringify(regla.ventanas)) : [{ dias: [], horaDesde: '08:00', horaHasta: '17:00' }];

    document.getElementById('reglas-modal-titulo').textContent = regla ? 'Editar regla' : 'Nueva regla';

    document.getElementById('reglas-modal-body').innerHTML = `
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Nombre</label>
        <input type="text" id="reglas-form-nombre" value="${regla ? regla.nombre.replace(/"/g,'&quot;') : ''}" placeholder="Ej: Franja exclusiva de cardio los miércoles">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Modo</label>
        <select id="reglas-form-modo">
          ${Object.entries(MODOS).map(([v, lbl]) => `<option value="${v}" ${regla && regla.modo === v ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Palabra(s) clave en la práctica</label>
        <input type="text" id="reglas-form-palabra" value="${regla ? regla.palabraClave.replace(/"/g,'&quot;') : ''}" placeholder="Ej: CARDIACA — o varias separadas por coma">
      </div>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Motivo (se muestra cuando se detecta el problema)</label>
        <input type="text" id="reglas-form-motivo" value="${regla ? regla.motivo.replace(/"/g,'&quot;') : ''}" placeholder="Texto que va a ver jefatura en Validaciones">
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;margin-bottom:1rem;cursor:pointer">
        <input type="checkbox" id="reglas-form-activa" ${!regla || regla.activa !== false ? 'checked' : ''}> Regla activa
      </label>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span style="font-size:.78rem;font-weight:700;color:var(--text-2);text-transform:uppercase">Ventanas horarias</span>
        <button type="button" class="btn-sm" id="btn-reglas-agregar-ventana">+ Agregar ventana</button>
      </div>
      <div id="reglas-form-ventanas"></div>
      <div id="reglas-form-error" style="color:#c62828;font-size:.8rem;margin-top:.5rem"></div>
    `;

    _renderVentanas();

    document.getElementById('btn-reglas-agregar-ventana').addEventListener('click', () => {
      _formVentanas.push({ dias: [], horaDesde: '08:00', horaHasta: '17:00' });
      _renderVentanas();
    });

    document.getElementById('reglas-modal-footer').innerHTML = `
      <button class="btn-sm" id="btn-reglas-cancelar-form">Cancelar</button>
      <button class="btn-primary" id="btn-reglas-guardar">Guardar</button>`;

    document.getElementById('btn-reglas-cancelar-form').addEventListener('click', _renderListaReglas);
    document.getElementById('btn-reglas-guardar').addEventListener('click', _guardarFormulario);
  }

  async function _guardarFormulario() {
    const errorEl = document.getElementById('reglas-form-error');
    errorEl.textContent = '';

    const nombre  = document.getElementById('reglas-form-nombre').value.trim();
    const modo    = document.getElementById('reglas-form-modo').value;
    const palabra = document.getElementById('reglas-form-palabra').value.trim();
    const motivo  = document.getElementById('reglas-form-motivo').value.trim();
    const activa  = document.getElementById('reglas-form-activa').checked;

    if (!nombre || !palabra || !motivo) {
      errorEl.textContent = 'Completá nombre, palabra clave y motivo.';
      return;
    }

    const ventanas = [];
    const filas = document.querySelectorAll('#reglas-form-ventanas .ventana-row');
    for (const fila of filas) {
      const dias = [...fila.querySelectorAll('.ventana-dia:checked')].map(cb => parseInt(cb.value, 10));
      const horaDesde = fila.querySelector('.ventana-desde').value;
      const horaHasta = fila.querySelector('.ventana-hasta').value;
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

    const regla = { id: _idEditando || undefined, nombre, modo, palabraClave: palabra, motivo, activa, ventanas };

    try {
      await API.guardarReglaAgenda(regla);
      App.toast('Regla guardada', 'ok');
      await _cargarReglasModal();
    } catch (err) {
      errorEl.textContent = 'Error: ' + err.message;
    }
  }

  // ── Reporte imprimible (diario / semanal) ───────────────────
  // Abre una pestaña nueva con una tabla lista para imprimir / guardar
  // como PDF (Ctrl+P → Guardar como PDF) — sin dependencias externas.
  function _reporteHTML(filas, titulo, subtitulo) {
    const porFecha = {};
    for (const f of filas) {
      if (!porFecha[f.fecha]) porFecha[f.fecha] = [];
      porFecha[f.fecha].push(f);
    }
    const fechas = Object.keys(porFecha).sort((a, b) => _aFecha(a) - _aFecha(b));
    for (const fecha of fechas) porFecha[fecha].sort((a, b) => a.hora.localeCompare(b.hora));

    const grupos = fechas.map(fecha => {
      const diaLbl = DIAS_LABEL_LARGO[_aFecha(fecha).getDay()];
      const filasHtml = porFecha[fecha].map(f => `
        <tr>
          <td>${f.hora}</td>
          <td>${f.paciente}</td>
          <td>${f.documento}</td>
          <td>${f.practica}</td>
          <td>${_reglaInfo(f.regla).label}</td>
          <td>${f.motivo}</td>
        </tr>`).join('');
      return `
        <h3>${diaLbl} ${fecha} <span class="n">(${porFecha[fecha].length})</span></h3>
        <table>
          <thead><tr><th>Hora</th><th>Paciente</th><th>DNI</th><th>Estudio</th><th>Regla</th><th>Motivo</th></tr></thead>
          <tbody>${filasHtml}</tbody>
        </table>`;
    }).join('');

    const ahora = new Date().toLocaleString('es-AR');

    return `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#222;padding:24px;max-width:900px;margin:0 auto}
        h1{font-size:20px;margin-bottom:2px}
        .subtitulo{color:#666;font-size:13px;margin-bottom:2px}
        .generado{color:#999;font-size:11px;margin-bottom:20px}
        h3{font-size:14px;background:#1a3a5c;color:#fff;padding:6px 10px;border-radius:4px;margin-top:20px;margin-bottom:6px}
        h3 .n{font-weight:400;opacity:.8}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}
        th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}
        th{background:#f0f0f0}
        .vacio{color:#666;padding:20px 0}
        @media print{ body{padding:0} h3{-webkit-print-color-adjust:exact;print-color-adjust:exact} th{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
      </style></head>
      <body>
        <h1>${titulo}</h1>
        <div class="subtitulo">${subtitulo}</div>
        <div class="generado">Generado el ${ahora} — RMN Santojanni</div>
        ${filas.length ? grupos : '<div class="vacio">Sin problemas de agenda detectados en este período.</div>'}
      </body></html>`;
  }

  function _abrirReporte(html) {
    const ventana = window.open('', '_blank');
    if (!ventana) { App.toast('El navegador bloqueó la ventana del reporte — habilitá pop-ups para este sitio.', 'error'); return; }
    ventana.document.write(html);
    ventana.document.close();
    ventana.onload = () => ventana.print();
  }

  // Los reportes solo incluyen lo que todavía no se marcó como reportado —
  // no tiene sentido re-enviar algo que ya se avisó, independientemente de
  // si el toggle "Mostrar reportados" está prendido en la vista.
  function _reporteDiario() {
    const hoy = API.hoy(); // dd/MM/yyyy
    const filas = _filas.filter(f => f.fecha === hoy && !f.reportado);
    _abrirReporte(_reporteHTML(filas, 'Reporte diario de turnos a corregir', `Turnos con problemas de agenda para hoy, ${hoy}`));
  }

  function _reporteSemanal() {
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio); fin.setDate(fin.getDate() + 6);
    const filas = _filas.filter(f => { const d = _aFecha(f.fecha); return d >= inicio && d <= fin && !f.reportado; });
    const desdeStr = API.fechaAStr(inicio), hastaStr = API.fechaAStr(fin);
    _abrirReporte(_reporteHTML(filas, 'Reporte semanal de turnos a corregir', `Turnos con problemas de agenda del ${desdeStr} al ${hastaStr}`));
  }

  async function cargar() {
    const loading = document.getElementById('validaciones-loading');
    const cont    = document.getElementById('validaciones-container');
    loading.classList.remove('hidden');
    cont.innerHTML = '';

    try {
      _poblarSelectReglas();
      const [filas, reglas] = await Promise.all([
        API.leerValidacionesAgenda(),
        API.leerReglasAgenda().catch(() => _reglasCache), // no romper la vista si esto falla
      ]);
      _filas = filas;
      _reglasCache = reglas;
      _render();
    } catch (err) {
      cont.innerHTML = `<div style="color:#c62828;padding:1rem">Error: ${err.message}</div>`;
    } finally {
      loading.classList.add('hidden');
    }
  }

  function init() {
    document.getElementById('btn-validaciones-recargar').addEventListener('click', cargar);
    document.getElementById('btn-reporte-diario').addEventListener('click', _reporteDiario);
    document.getElementById('btn-reporte-semanal').addEventListener('click', _reporteSemanal);
    document.getElementById('validaciones-regla').addEventListener('change', _render);
    document.getElementById('validaciones-buscar').addEventListener('input', _render);
    document.getElementById('validaciones-mostrar-reportados').addEventListener('change', (e) => {
      _mostrarReportados = e.target.checked;
      _render();
    });
    document.getElementById('btn-reglas-gestionar').addEventListener('click', _abrirModalReglas);
    document.getElementById('btn-reglas-modal-cerrar').addEventListener('click', _cerrarModalReglas);
    document.getElementById('reglas-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'reglas-modal-overlay') _cerrarModalReglas();
    });
  }

  return { init, cargar };
})();
