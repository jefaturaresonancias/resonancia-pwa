// Mis licencias (30/9/2026, a pedido): cada técnico carga sus vacaciones,
// días de estudio o permisos y ve lo que tiene cargado. Escribe en la misma
// tabla que Licencias del panel de jefatura (sistema2): entra como
// "Solicitado" y jefatura la aprueba desde el panel.
// Privacidad: se entra con nombre + DNI (validado en el servidor contra el
// CUIL) y el servidor devuelve solo lo de ese técnico. La sesión vive solo
// en memoria y se cierra al ir a cualquier otra vista (cerrar()).
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

  let _tecnicos = [];
  let _reglas = null; // texto de las reglas (api_vac_reglas), se carga una vez
  let _sesion = null; // { tecnico, dni, nombre } — solo en memoria
  let _datos = null;  // { anio, registros, saldo }

  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const $ = (id) => document.getElementById(id);

  function init() {
    $('lic-tipo').innerHTML = TIPOS.map((t) => `<option value="${t.id}">${t.emoji} ${t.label}</option>`).join('');
    $('lic-entrar').addEventListener('click', _entrar);
    $('lic-dni').addEventListener('keydown', (e) => { if (e.key === 'Enter') _entrar(); });
    $('lic-salir').addEventListener('click', cerrar);
    $('lic-enviar').addEventListener('click', _solicitar);
  }

  // Reglas de licencias tal como las valida sistema2 (mismo texto que ve
  // jefatura en el panel), visibles cada vez que se abre la pantalla.
  async function _cargarReglas() {
    if (!_reglas) _reglas = await RailwayAPI.reglasLicencias();
    const grupos = {};
    _reglas.forEach((r) => { (grupos[r.tipo] = grupos[r.tipo] || []).push(r.texto); });
    const orden = ['GENERAL', ...TIPOS.map((t) => t.id)].filter((t) => grupos[t]);
    $('lic-reglas').innerHTML = `<details open style="border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .85rem;background:var(--surface);margin-bottom:1rem">
      <summary style="cursor:pointer;font-weight:700;font-size:.82rem;color:var(--navy)">📘 Reglas de licencias</summary>
      ${orden.map((t) => `<div style="margin-top:.5rem;font-size:.8rem"><b>${t === 'GENERAL' ? 'Generales' : `${TIPO[t].emoji} ${TIPO[t].label}`}</b>
        <ul style="margin:.2rem 0 0 1.1rem;padding:0;color:var(--text-2)">${grupos[t].map((x) => `<li>${_esc(x)}</li>`).join('')}</ul></div>`).join('')}
    </details>`;
  }

  // Al abrir la vista: reglas + solo la lista de nombres (sin datos de nadie).
  async function cargar() {
    _mostrar();
    _cargarReglas().catch((err) => App.toast('No se pudieron cargar las reglas: ' + err.message, 'warn'));
    if (_tecnicos.length) return;
    try {
      _tecnicos = await RailwayAPI.tecnicosLicencias();
      $('lic-tecnico').innerHTML = '<option value="">— Elegí tu nombre —</option>' +
        _tecnicos.map((t) => `<option value="${_esc(t.iniciales)}">${_esc(t.nombre)}</option>`).join('');
    } catch (err) {
      App.toast('Error cargando la lista de técnicos: ' + err.message, 'error');
    }
  }

  // Cierra la sesión y borra de pantalla todo lo del técnico.
  function cerrar() {
    _sesion = null;
    _datos = null;
    if (!$('lic-dni')) return;
    $('lic-dni').value = '';
    $('lic-tecnico').value = '';
    ['lic-desde', 'lic-hasta', 'lic-obs'].forEach((id) => { $(id).value = ''; });
    $('lic-saldos').innerHTML = '';
    $('lic-lista').innerHTML = '';
    _mostrar();
  }

  function _mostrar() {
    $('lic-login').classList.toggle('hidden', !!_sesion);
    $('lic-sesion').classList.toggle('hidden', !_sesion);
  }

  async function _entrar() {
    const tecnico = $('lic-tecnico').value;
    const dni = $('lic-dni').value.trim();
    if (!tecnico || !dni) { App.toast('Elegí tu nombre y escribí tu DNI', 'warn'); return; }
    const btn = $('lic-entrar');
    btn.disabled = true;
    try {
      await _cargarMisDatos(tecnico, dni);
      $('lic-dni').value = '';
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function _cargarMisDatos(tecnico, dni) {
    const res = await RailwayAPI.misLicencias(tecnico, dni);
    _sesion = { tecnico: res.tecnico.iniciales, dni, nombre: res.tecnico.nombre };
    _datos = { anio: res.anio, registros: res.registros || [], saldo: res.saldo };
    _mostrar();
    _render();
  }

  function _render() {
    if (!_sesion) return;
    $('lic-quien').textContent = _sesion.nombre;
    const { anio, registros, saldo } = _datos;

    const pendientes = (tipo) => registros.filter((r) => r.tipo === tipo && r.estado === 'Solicitado' && Number(r.anio) === anio)
      .reduce((acc, r) => acc + (Number(r.diasHab) || 0), 0);
    const tarjetas = (saldo || []).filter((p) => p.disponible > 0 || p.tomado > 0);
    $('lic-saldos').innerHTML = !tarjetas.length
      ? `<div style="font-size:.8rem;color:var(--text-3);margin-bottom:.75rem">Todavía no tenés saldos configurados para ${anio} — lo carga jefatura.</div>`
      : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.6rem;margin-bottom:1rem">' +
        tarjetas.map((p) => {
          const t = TIPO[p.tipo] || { emoji: '', label: p.tipo };
          const pend = pendientes(p.tipo);
          return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .8rem;background:var(--surface)">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.04em">${t.emoji} ${t.label} ${anio}</div>
            <div style="font-size:1.3rem;font-weight:800;color:var(--navy)">${p.restante} <span style="font-size:.75rem;font-weight:600;color:var(--text-2)">de ${p.disponible} días</span></div>
            <div style="font-size:.72rem;color:var(--text-3)">${p.tomado} tomados${pend ? ` · ${pend} pendientes de aprobación` : ''}</div>
          </div>`;
        }).join('') + '</div>';

    const lista = $('lic-lista');
    if (!registros.length) {
      lista.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-3)">No tenés licencias cargadas desde ${anio}.</div>`;
      return;
    }
    lista.innerHTML = '<div style="font-weight:700;font-size:.82rem;color:var(--navy);margin:.25rem 0 .5rem">Lo que tenés cargado</div>' +
      registros.map((r) => {
        const t = TIPO[r.tipo] || { emoji: '', label: r.tipo };
        const e = ESTADO[r.estado] || ESTADO.Solicitado;
        const dias = Number(r.diasHab) || 0;
        const rango = r.fechaInicio === r.fechaFin ? _dmy(r.fechaInicio) : `${_dmy(r.fechaInicio)} al ${_dmy(r.fechaFin)}`;
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.6rem .85rem;
            border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);margin-bottom:.4rem">
          <div style="font-size:.82rem;line-height:1.5;min-width:0">
            <strong>${t.emoji} ${t.label}</strong> · ${rango} · ${dias} día${dias === 1 ? '' : 's'} hábil${dias === 1 ? '' : 'es'}
            <span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:4px;background:${e.fondo};color:${e.color}">${e.texto}</span>
            ${r.observaciones ? `<br><span style="color:var(--text-2)">${_esc(r.observaciones)}</span>` : ''}
          </div>
          ${r.estado === 'Solicitado' ? `<button type="button" class="btn-sm" data-cancelar="${_esc(r.id)}" style="flex-shrink:0">Cancelar</button>` : ''}
        </div>`;
      }).join('');
    lista.querySelectorAll('[data-cancelar]').forEach((btn) => btn.addEventListener('click', () => _cancelar(btn.dataset.cancelar)));
  }

  async function _solicitar() {
    if (!_sesion) return;
    const tipo = $('lic-tipo').value;
    const desde = $('lic-desde').value;
    const hasta = $('lic-hasta').value || desde;
    const obs = $('lic-obs').value.trim();
    if (!desde) { App.toast('Elegí la fecha desde', 'warn'); return; }
    if (hasta < desde) { App.toast('La fecha "hasta" no puede ser anterior a "desde"', 'warn'); return; }
    const rango = desde === hasta ? _dmy(desde) : `${_dmy(desde)} al ${_dmy(hasta)}`;
    if (!confirm(`¿Enviar solicitud de ${TIPO[tipo].label}, ${rango}?\n\nQueda pendiente hasta que jefatura la apruebe.`)) return;

    const btn = $('lic-enviar');
    btn.disabled = true;
    try {
      await RailwayAPI.solicitarLicencia({ tecnico: _sesion.tecnico, dni: _sesion.dni, tipo, fechaInicio: desde, fechaFin: hasta, observaciones: obs });
      App.toast('✅ Solicitud enviada — queda pendiente de aprobación', 'ok');
      ['lic-desde', 'lic-hasta', 'lic-obs'].forEach((id) => { $(id).value = ''; });
      await _cargarMisDatos(_sesion.tecnico, _sesion.dni);
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function _cancelar(id) {
    if (!_sesion || !confirm('¿Cancelar esta solicitud? Se borra (todavía no estaba aprobada).')) return;
    try {
      await RailwayAPI.cancelarSolicitudLicencia(id, _sesion.tecnico, _sesion.dni);
      App.toast('Solicitud cancelada', 'ok');
      await _cargarMisDatos(_sesion.tecnico, _sesion.dni);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  return { init, cargar, cerrar };
})();
