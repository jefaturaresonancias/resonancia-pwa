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

  function _porTexto() {
    const busqueda = document.getElementById('validaciones-buscar').value.trim().toLowerCase();
    if (!busqueda) return _filas;
    return _filas.filter(f => {
      const texto = `${f.paciente} ${f.documento} ${f.practica} ${f.motivo}`.toLowerCase();
      return texto.includes(busqueda);
    });
  }

  function _filtradas() {
    const regla = document.getElementById('validaciones-regla').value;
    const base  = _porTexto();
    return regla ? base.filter(f => f.regla === regla) : base;
  }

  // Las tarjetas siempre muestran el desglose completo (solo respetan la
  // búsqueda de texto, no el filtro de regla) — si no, al filtrar por una
  // categoría desaparecerían las demás y no se podría cambiar de categoría
  // con un clic.
  function _renderResumen() {
    const filas       = _porTexto();
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
    const cont = document.getElementById('validaciones-container');

    if (!filas.length) {
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

    cont.innerHTML = fechas.map(fecha => {
      const items = porFecha[fecha].map(f => {
        const info = _reglaInfo(f.regla);
        return `
          <div style="
            background:var(--surface);
            border:1px solid var(--border);
            border-left:4px solid ${info.color};
            border-radius:var(--radius);
            padding:1rem 1.25rem;
            display:flex;
            align-items:flex-start;
            gap:1rem;
          ">
            <div style="font-weight:700;font-size:.95rem;color:var(--navy);min-width:48px">${f.hora}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem;flex-wrap:wrap">
                <span style="
                  font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
                  background:${info.color}22;color:${info.color}
                ">${info.label}</span>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--bg);color:var(--text-3);text-transform:uppercase">${f.origen || '—'}</span>
              </div>
              <div style="font-weight:600;font-size:.9rem;color:var(--text)">${f.motivo}</div>
              <div style="margin-top:.25rem;font-size:.8rem;color:var(--text-2)">${f.practica}</div>
              <div style="margin-top:.25rem;font-size:.75rem;color:var(--text-3)">${f.paciente} — ${f.documento}</div>
            </div>
          </div>`;
      }).join('');

      const n       = porFecha[fecha].length;
      const diaLbl  = DIAS_LABEL_LARGO[_aFecha(fecha).getDay()];
      return `
        <div>
          <div style="
            position:sticky;top:0;z-index:1;
            display:flex;align-items:baseline;gap:.6rem;
            background:var(--navy);color:#fff;
            padding:.5rem .9rem;border-radius:var(--radius);margin-bottom:.6rem;
          ">
            <span style="font-weight:700;font-size:.95rem">${diaLbl} ${fecha}</span>
            <span style="font-size:.75rem;opacity:.75">${n} ${n === 1 ? 'problema' : 'problemas'}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:.5rem">${items}</div>
        </div>`;
    }).join('');
  }

  function _render() {
    _renderResumen();
    _renderContainer(_filtradas());
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
    document.getElementById('validaciones-regla').addEventListener('change', _render);
    document.getElementById('validaciones-buscar').addEventListener('input', _render);
    document.getElementById('btn-reglas-gestionar').addEventListener('click', _abrirModalReglas);
    document.getElementById('btn-reglas-modal-cerrar').addEventListener('click', _cerrarModalReglas);
    document.getElementById('reglas-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'reglas-modal-overlay') _cerrarModalReglas();
    });
  }

  return { init, cargar };
})();
