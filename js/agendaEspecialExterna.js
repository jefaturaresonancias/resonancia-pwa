// js/agendaEspecialExterna.js — Lógica compartida de ncx.html/neurologia.html
// (26/8/2026). Páginas propias para coordinadores externos de NCX/
// Neurología: solo cargan un turno nuevo dentro de su franja reservada y
// ven lo que ya cargaron — sin acceso al resto de la agenda. Autenticadas
// con el PIN de su especialidad (pin_roles), nunca con el login de
// Railway (RailwayAPI.agendaEspecial*Publico va sin token de sesión).
// window.AGENDA_ESPECIAL_TIPO ('NCX'|'NEUROLOGIA') lo define cada HTML.
(() => {
  const TIPO = window.AGENDA_ESPECIAL_TIPO;
  const DIAS_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  let _pin = null;
  let _ventana = null;

  function _minAHora(m) {
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function _horaAMin(h) {
    const [hh, mm] = h.split(':');
    return parseInt(hh, 10) * 60 + parseInt(mm, 10);
  }
  function _fechaInputADMY(v) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  function _toast(msg, tipo) {
    const el = document.getElementById('ae-toast');
    el.textContent = msg;
    el.className = 'ae-toast' + (tipo ? ' ' + tipo : '');
    el.classList.remove('hidden');
    clearTimeout(_toast._t);
    _toast._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // ── Fecha: solo habilitar días de semana permitidos ─────────────
  function _validarFecha() {
    const input = document.getElementById('ae-fecha');
    const err = document.getElementById('ae-fecha-error');
    if (!input.value) { err.textContent = ''; return false; }
    const [y, m, d] = input.value.split('-').map(Number);
    const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!_ventana.diasSemana.includes(dia)) {
      const permitidos = _ventana.diasSemana.map((x) => DIAS_LABEL[x]).join(', ');
      err.textContent = `Esa fecha cae ${DIAS_LABEL[dia]} — solo se puede cargar los días: ${permitidos}.`;
      return false;
    }
    err.textContent = '';
    return true;
  }

  function _poblarHoras() {
    const sel = document.getElementById('ae-hora');
    sel.innerHTML = '';
    const desde = _horaAMin(_ventana.horaDesde);
    const hasta = _horaAMin(_ventana.horaHasta);
    for (let m = desde; m < hasta; m += 20) {
      const opt = document.createElement('option');
      opt.value = _minAHora(m);
      opt.textContent = _minAHora(m);
      sel.appendChild(opt);
    }
  }

  function _renderPropios(turnos) {
    const cont = document.getElementById('ae-lista-propios');
    if (!turnos.length) {
      cont.innerHTML = '<div class="ae-vacio">Todavía no cargaste ningún turno.</div>';
      return;
    }
    cont.innerHTML = turnos.map((t) => {
      const [y, m, d] = t.fecha.split('-');
      return `<div class="ae-item">
        <div class="ae-item-fecha">${d}/${m}/${y} · ${_minAHora(t.mins)}</div>
        <div class="ae-item-nombre">${t.apellido}, ${t.nombre} <span class="ae-item-dni">(DNI ${t.dni})</span></div>
        <div class="ae-item-estudio">${t.estudio}</div>
      </div>`;
    }).join('');
  }

  async function _refrescarPropios() {
    try {
      const turnos = await RailwayAPI.agendaEspecialPropiosPublico(TIPO, _pin);
      _renderPropios(turnos);
    } catch (err) {
      _toast('No se pudo actualizar la lista: ' + err.message, 'error');
    }
  }

  async function _poblarEstudios() {
    const sel = document.getElementById('ae-estudio');
    sel.innerHTML = '<option value="">Cargando…</option>';
    const estudios = await RailwayAPI.agendaEspecialEstudiosPublico(TIPO, _pin);
    sel.innerHTML = '<option value="">— Seleccionar estudio —</option>' +
      estudios.map((e) => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
  }

  async function _desbloquear() {
    const pinInput = document.getElementById('ae-pin');
    const btn = document.getElementById('ae-btn-ingresar');
    const err = document.getElementById('ae-pin-error');
    const pin = pinInput.value.trim();
    if (!pin) return;
    btn.disabled = true; btn.textContent = 'Verificando…';
    try {
      const turnos = await RailwayAPI.agendaEspecialPropiosPublico(TIPO, pin);
      _pin = pin;
      document.getElementById('ae-screen-pin').classList.add('hidden');
      document.getElementById('ae-screen-form').classList.remove('hidden');
      _renderPropios(turnos);
      await _poblarEstudios();
    } catch (e) {
      err.textContent = e.message || 'PIN incorrecto';
      pinInput.value = '';
      pinInput.focus();
    } finally {
      btn.disabled = false; btn.textContent = 'Ingresar';
    }
  }

  async function _confirmar(ev) {
    ev.preventDefault();
    if (!_validarFecha()) return;
    const btn = document.getElementById('ae-btn-confirmar');
    const nombre = document.getElementById('ae-nombre').value.trim();
    const apellido = document.getElementById('ae-apellido').value.trim();
    const dni = document.getElementById('ae-dni').value.trim();
    const estudio = document.getElementById('ae-estudio').value;
    const fecha = _fechaInputADMY(document.getElementById('ae-fecha').value);
    const hora = document.getElementById('ae-hora').value;
    const observaciones = document.getElementById('ae-observaciones').value.trim();

    if (!nombre || !apellido || !dni || !estudio) {
      _toast('Completá nombre, apellido, DNI y estudio.', 'error');
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await RailwayAPI.agendaEspecialAsignarPublico({ tipo: TIPO, pin: _pin, nombre, apellido, dni, estudio, fecha, hora, observaciones });
      _toast('Turno cargado correctamente.', 'ok');
      document.getElementById('ae-form').reset();
      document.getElementById('ae-fecha-error').textContent = '';
      await _refrescarPropios();
    } catch (err) {
      _toast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Cargar turno';
    }
  }

  async function init() {
    const cfg = await RailwayAPI.agendaEspecialConfigPublico();
    _ventana = cfg[TIPO];
    const permitidos = _ventana.diasSemana.map((x) => DIAS_LABEL[x]).join(', ');
    document.getElementById('ae-ventana-info').textContent =
      `Solo se pueden cargar turnos los días ${permitidos}, de ${_ventana.horaDesde} a ${_ventana.horaHasta}hs.`;
    _poblarHoras();

    document.getElementById('ae-btn-ingresar').addEventListener('click', _desbloquear);
    document.getElementById('ae-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') _desbloquear(); });
    document.getElementById('ae-form').addEventListener('submit', _confirmar);
    document.getElementById('ae-fecha').addEventListener('change', _validarFecha);
    document.getElementById('ae-fecha').min = new Date().toISOString().slice(0, 10);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
