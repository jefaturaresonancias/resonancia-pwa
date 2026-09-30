// Mis licencias (30/9/2026, a pedido): cada técnico carga sus vacaciones,
// días de estudio o permisos y ve lo que tiene cargado. Escribe en la misma
// tabla que Vacaciones del panel de jefatura (sistema2), así queda al día
// sin sincronizar nada: entra como "Solicitado" y jefatura la aprueba desde
// el panel.
const LicenciasView = (() => {
  const TIPOS = [
    { id: 'VERANO', label: 'Vacaciones', emoji: '🏖️' },
    { id: 'ESTUDIO', label: 'Días de estudio', emoji: '📚' },
    { id: 'PERMISO', label: 'Permiso (días particulares)', emoji: '📋' },
    { id: 'PROFILACTICAS', label: 'Profilácticas', emoji: '💊' },
    { id: 'ESTRES', label: 'Estrés', emoji: '🧘' },
  ];
  const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
  const ESTADO = {
    Solicitado: { fondo: 'var(--warn-bg)', color: 'var(--warn)', texto: '⏳ Pendiente de aprobación' },
    Aprobado: { fondo: 'var(--success-bg)', color: 'var(--success)', texto: '✅ Aprobada' },
    Completado: { fondo: 'var(--bg)', color: 'var(--text-2)', texto: '✔️ Tomada' },
    Rechazado: { fondo: 'var(--danger-bg)', color: 'var(--danger)', texto: '✖ Rechazada' },
  };
  const KEY_TECNICO = 'licencias_tecnico';

  let _tecnicos = [];
  let _registros = [];
  let _saldos = [];
  let _tecnico = null;

  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const _anioActual = () => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 4));

  function init() {
    const sel = document.getElementById('lic-tecnico');
    try { _tecnico = localStorage.getItem(KEY_TECNICO); } catch (e) { _tecnico = null; }
    sel.addEventListener('change', () => {
      _tecnico = sel.value || null;
      try { if (_tecnico) localStorage.setItem(KEY_TECNICO, _tecnico); } catch (e) { /* sin storage: se elige cada vez */ }
      _render();
    });
    document.getElementById('lic-tipo').innerHTML = TIPOS.map((t) => `<option value="${t.id}">${t.emoji} ${t.label}</option>`).join('');
    document.getElementById('lic-enviar').addEventListener('click', _solicitar);
  }

  async function cargar() {
    const lista = document.getElementById('lic-lista');
    lista.innerHTML = '<div class="loading-bar">⏳ Cargando…</div>';
    try {
      const [tecnicos, registros, saldos] = await Promise.all([
        _tecnicos.length ? _tecnicos : RailwayAPI.leerTecnicos(),
        RailwayAPI.leerLicencias(),
        RailwayAPI.leerSaldosLicencias(_anioActual()),
      ]);
      _tecnicos = tecnicos;
      _registros = registros;
      _saldos = saldos;
      _renderSelector();
      _render();
    } catch (err) {
      lista.innerHTML = `<div style="color:var(--danger);font-size:.85rem;padding:1rem">Error cargando licencias: ${_esc(err.message)}</div>`;
    }
  }

  function _renderSelector() {
    const sel = document.getElementById('lic-tecnico');
    if (_tecnico && !_tecnicos.some((t) => t.iniciales === _tecnico)) _tecnico = null;
    sel.innerHTML = '<option value="">— Elegí tu nombre —</option>' +
      _tecnicos.map((t) => `<option value="${_esc(t.iniciales)}"${t.iniciales === _tecnico ? ' selected' : ''}>${_esc(t.nombreCompleto || t.iniciales)}</option>`).join('');
  }

  function _render() {
    const saldosEl = document.getElementById('lic-saldos');
    const lista = document.getElementById('lic-lista');
    const form = document.getElementById('lic-form');
    form.classList.toggle('hidden', !_tecnico);
    if (!_tecnico) {
      saldosEl.innerHTML = '';
      lista.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-3)">Elegí tu nombre para ver y cargar tus licencias.</div>';
      return;
    }

    const anio = _anioActual();
    const mias = _registros.filter((r) => r.tecnico === _tecnico && Number(r.anio) >= anio)
      .sort((a, b) => (a.fechaInicio < b.fechaInicio ? 1 : -1));

    // Saldos del año (solo los tipos con tope anual) + días pendientes de aprobación.
    const saldo = _saldos.find((s) => s.iniciales === _tecnico);
    const pendientes = (tipo) => mias.filter((r) => r.tipo === tipo && r.estado === 'Solicitado' && Number(r.anio) === anio)
      .reduce((acc, r) => acc + (Number(r.diasHab) || 0), 0);
    saldosEl.innerHTML = !saldo
      ? '<div style="font-size:.8rem;color:var(--text-3);margin-bottom:.75rem">Todavía no tenés saldos configurados para ' + anio + ' — lo carga jefatura.</div>'
      : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.6rem;margin-bottom:1rem">' +
        saldo.porTipo.filter((p) => p.disponible > 0 || p.tomado > 0).map((p) => {
          const t = TIPO[p.tipo] || { emoji: '', label: p.tipo };
          const pend = pendientes(p.tipo);
          return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .8rem;background:var(--surface)">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.04em">${t.emoji} ${t.label} ${anio}</div>
            <div style="font-size:1.3rem;font-weight:800;color:var(--navy)">${p.restante} <span style="font-size:.75rem;font-weight:600;color:var(--text-2)">de ${p.disponible} días</span></div>
            <div style="font-size:.72rem;color:var(--text-3)">${p.tomado} tomados${pend ? ` · ${pend} pendientes de aprobación` : ''}</div>
          </div>`;
        }).join('') + '</div>';

    if (!mias.length) {
      lista.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-3)">No tenés licencias cargadas desde ' + anio + '.</div>';
      return;
    }
    lista.innerHTML = '<div style="font-weight:700;font-size:.82rem;color:var(--navy);margin:.25rem 0 .5rem">Lo que tenés cargado</div>' +
      mias.map((r) => {
        const t = TIPO[r.tipo] || { emoji: '', label: r.tipo };
        const e = ESTADO[r.estado] || ESTADO.Solicitado;
        const rango = r.fechaInicio === r.fechaFin ? _dmy(r.fechaInicio) : `${_dmy(r.fechaInicio)} al ${_dmy(r.fechaFin)}`;
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.6rem .85rem;
            border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);margin-bottom:.4rem">
          <div style="font-size:.82rem;line-height:1.5;min-width:0">
            <strong>${t.emoji} ${t.label}</strong> · ${rango} · ${Number(r.diasHab) || 0} día${Number(r.diasHab) === 1 ? '' : 's'} hábil${Number(r.diasHab) === 1 ? '' : 'es'}
            <span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:4px;background:${e.fondo};color:${e.color}">${e.texto}</span>
            ${r.observaciones ? `<br><span style="color:var(--text-2)">${_esc(r.observaciones)}</span>` : ''}
          </div>
          ${r.estado === 'Solicitado' ? `<button type="button" class="btn-sm" data-cancelar="${_esc(r.id)}" style="flex-shrink:0">Cancelar</button>` : ''}
        </div>`;
      }).join('');
    lista.querySelectorAll('[data-cancelar]').forEach((btn) => btn.addEventListener('click', () => _cancelar(btn.dataset.cancelar)));
  }

  async function _solicitar() {
    const tipo = document.getElementById('lic-tipo').value;
    const desde = document.getElementById('lic-desde').value;
    const hasta = document.getElementById('lic-hasta').value || desde;
    const obs = document.getElementById('lic-obs').value.trim();
    if (!_tecnico) { App.toast('Elegí tu nombre primero', 'warn'); return; }
    if (!desde) { App.toast('Elegí la fecha desde', 'warn'); return; }
    if (hasta < desde) { App.toast('La fecha "hasta" no puede ser anterior a "desde"', 'warn'); return; }
    const t = TIPO[tipo];
    const nombre = (_tecnicos.find((x) => x.iniciales === _tecnico) || {}).nombreCompleto || _tecnico;
    const rango = desde === hasta ? _dmy(desde) : `${_dmy(desde)} al ${_dmy(hasta)}`;
    if (!confirm(`¿Enviar solicitud de ${t.label} para ${nombre}, ${rango}?\n\nQueda pendiente hasta que jefatura la apruebe.`)) return;

    const btn = document.getElementById('lic-enviar');
    btn.disabled = true;
    try {
      await RailwayAPI.solicitarLicencia({ tecnico: _tecnico, tipo, fechaInicio: desde, fechaFin: hasta, observaciones: obs });
      App.toast('✅ Solicitud enviada — queda pendiente de aprobación', 'ok');
      document.getElementById('lic-desde').value = '';
      document.getElementById('lic-hasta').value = '';
      document.getElementById('lic-obs').value = '';
      await cargar();
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function _cancelar(id) {
    if (!confirm('¿Cancelar esta solicitud? Se borra (todavía no estaba aprobada).')) return;
    try {
      await RailwayAPI.cancelarSolicitudLicencia(id, _tecnico);
      App.toast('Solicitud cancelada', 'ok');
      await cargar();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  return { init, cargar };
})();
