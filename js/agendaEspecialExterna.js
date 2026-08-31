// js/agendaEspecialExterna.js — Lógica compartida de ncx.html/neurologia.html
// (26/8/2026). Páginas propias para coordinadores externos de NCX/
// Neurología: cargan, modifican y anulan turnos dentro de su franja reservada
// y ven lo que ya cargaron — sin acceso al resto de la agenda. Autenticadas
// con el PIN de su especialidad (pin_roles), nunca con el login de
// Railway (RailwayAPI.agendaEspecial*Publico va sin token de sesión).
// window.AGENDA_ESPECIAL_TIPO ('NCX'|'NEUROLOGIA') lo define cada HTML.
(() => {
  const TIPO = window.AGENDA_ESPECIAL_TIPO;
  const DIAS_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  let _pin = null;
  let _ventana = null;
  let _propios = [];             // todos los turnos ya cargados para esta especialidad (desde hoy)
  let _duracionEstudios = {};    // { nombre: minutos }
  let _turnoSeleccionado = null; // turno abierto en el modal de opciones
  let _turnoEnEdicion = null;    // turno en proceso de modificación en el formulario

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

  // ── Ocupados del día elegido + horas disponibles ────────────────
  // Sin esto no hay forma de saber qué horario está libre — se recalculan al
  // cambiar fecha o estudio. Si se está modificando un turno, se excluye dicho
  // turno de los ocupados para permitir conservar su horario original o cambiarlo.
  function _ocupadosDelDia(fechaISO) {
    return _propios.filter((t) => {
      if (t.fecha !== fechaISO) return false;
      if (_turnoEnEdicion && t.id === _turnoEnEdicion.id) return false;
      return true;
    }).sort((a, b) => a.mins - b.mins);
  }

  function _renderOcupadosDia(ocupados, fechaISO) {
    const cont = document.getElementById('ae-ocupados-dia');
    if (!fechaISO) { cont.innerHTML = ''; return; }
    if (!ocupados.length) {
      cont.innerHTML = '<div class="ae-vacio">Sin turnos cargados ese día — todos los horarios de la lista están libres.</div>';
      return;
    }
    cont.innerHTML = `<div class="ae-ocupados-titulo">Ya cargado ese día:</div>` + ocupados.map((t) => `
      <div class="ae-item" data-id="${t.id}">
        <div class="ae-item-fecha">${_minAHora(t.mins)}</div>
        <div class="ae-item-nombre">${t.apellido}, ${t.nombre}</div>
        <div class="ae-item-estudio">${t.estudio}</div>
      </div>`).join('');

    cont.querySelectorAll('.ae-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id, 10);
        const t = _propios.find((x) => x.id === id);
        if (t) _abrirModalTurno(t);
      });
    });
  }

  function _actualizarDisponibilidad() {
    const fechaInput = document.getElementById('ae-fecha').value;
    const fechaISO = fechaInput || null;
    const estudioElegido = document.getElementById('ae-estudio').value;
    const duracionNueva = _duracionEstudios[estudioElegido] || 20;
    const ocupados = fechaISO ? _ocupadosDelDia(fechaISO) : [];

    _renderOcupadosDia(ocupados, fechaISO);

    const sel = document.getElementById('ae-hora');
    const valorPrevio = sel.value;
    sel.innerHTML = '';
    const desde = _horaAMin(_ventana.horaDesde);
    const hasta = _horaAMin(_ventana.horaHasta);

    let m = desde;
    while (m < hasta) {
      const finNueva = m + duracionNueva;
      const choque = ocupados.find((t) => {
        const durOcupado = _duracionEstudios[t.estudio] || 20;
        return m < t.mins + durOcupado && finNueva > t.mins;
      });
      if (choque) {
        const durOcupado = _duracionEstudios[choque.estudio] || 20;
        m = choque.mins + durOcupado;
        continue;
      }
      const opt = document.createElement('option');
      opt.value = _minAHora(m);
      opt.textContent = _minAHora(m);
      sel.appendChild(opt);
      m += 20;
    }
    const sigueDisponible = [...sel.options].some((o) => o.value === valorPrevio);
    if (sigueDisponible) sel.value = valorPrevio;
  }

  function _renderPropios(turnos) {
    _propios = turnos;
    const cont = document.getElementById('ae-lista-propios');
    if (!turnos.length) {
      cont.innerHTML = '<div class="ae-vacio">Todavía no cargaste ningún turno.</div>';
    } else {
      cont.innerHTML = turnos.map((t) => {
        const [y, m, d] = t.fecha.split('-');
        return `<div class="ae-item" data-id="${t.id}" title="Hacé clic para ver opciones o modificar este turno">
          <div class="ae-item-fecha">${d}/${m}/${y} · ${_minAHora(t.mins)}</div>
          <div class="ae-item-nombre">${t.apellido}, ${t.nombre} <span class="ae-item-dni">(DNI ${t.dni})</span></div>
          <div class="ae-item-estudio">${t.estudio}</div>
        </div>`;
      }).join('');

      cont.querySelectorAll('.ae-item').forEach((item) => {
        item.addEventListener('click', () => {
          const id = parseInt(item.dataset.id, 10);
          const t = _propios.find((x) => x.id === id);
          if (t) _abrirModalTurno(t);
        });
      });
    }
    _actualizarDisponibilidad();
    _renderGrilla();
  }

  // ── Grilla visual de próximos horarios ──────────────────────────
  const CANTIDAD_FECHAS_GRILLA = 6;

  function _proximasFechas(n) {
    const fechas = [];
    const cur = new Date();
    cur.setUTCHours(0, 0, 0, 0);
    let guard = 0;
    while (fechas.length < n && guard < 90) {
      if (_ventana.diasSemana.includes(cur.getUTCDay())) {
        fechas.push(cur.toISOString().slice(0, 10));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
      guard++;
    }
    return fechas;
  }

  function _fechaISOaEtiqueta(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dia = DIAS_LABEL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${dia.slice(0, 3)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  function _renderGrilla() {
    const cont = document.getElementById('ae-grilla');
    if (!cont) return;
    const fechas = _proximasFechas(CANTIDAD_FECHAS_GRILLA);
    const desde = _horaAMin(_ventana.horaDesde);
    const hasta = _horaAMin(_ventana.horaHasta);

    let html = '<table class="ae-grilla-tabla"><thead><tr><th>Hora</th>';
    fechas.forEach((f) => { html += `<th>${_fechaISOaEtiqueta(f)}</th>`; });
    html += '</tr></thead><tbody>';

    for (let m = desde; m < hasta; m += 20) {
      html += `<tr><td class="ae-grilla-hora">${_minAHora(m)}</td>`;
      fechas.forEach((f) => {
        const ocupado = _propios.find((t) => {
          if (t.fecha !== f) return false;
          if (_turnoEnEdicion && t.id === _turnoEnEdicion.id) return false;
          const dur = _duracionEstudios[t.estudio] || 20;
          return m < t.mins + dur && (m + 20) > t.mins;
        });
        if (ocupado) {
          const esInicio = ocupado.mins === m;
          html += `<td class="ae-grilla-celda ae-grilla-ocupada" data-id="${ocupado.id}" title="${ocupado.estudio} — Hacé clic para ver opciones o modificar">${esInicio ? ocupado.apellido : ''}</td>`;
        } else {
          html += `<td class="ae-grilla-celda ae-grilla-libre" data-fecha="${f}" data-hora="${_minAHora(m)}">libre</td>`;
        }
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    cont.innerHTML = html;

    // Clic en libre -> precarga fecha y hora en el formulario
    cont.querySelectorAll('.ae-grilla-libre').forEach((celda) => {
      celda.addEventListener('click', () => {
        document.getElementById('ae-fecha').value = celda.dataset.fecha;
        _validarFecha();
        _actualizarDisponibilidad();
        const selHora = document.getElementById('ae-hora');
        if ([...selHora.options].some((o) => o.value === celda.dataset.hora && !o.disabled)) {
          selHora.value = celda.dataset.hora;
        }
        document.getElementById('ae-nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // Clic en ocupado -> abre opciones del turno (modificar/anular)
    cont.querySelectorAll('.ae-grilla-ocupada').forEach((celda) => {
      celda.addEventListener('click', () => {
        const id = parseInt(celda.dataset.id, 10);
        const turno = _propios.find((t) => t.id === id);
        if (turno) _abrirModalTurno(turno);
      });
    });
  }

  // ── Modal de Opciones del Turno (Modificar / Anular) ────────────
  function _abrirModalTurno(turno) {
    _turnoSeleccionado = turno;
    const [y, m, d] = turno.fecha.split('-');
    const horaStr = _minAHora(turno.mins);
    const body = document.getElementById('ae-modal-body');
    body.innerHTML = `
      <div class="ae-modal-info">
        <div class="ae-modal-info-paciente">${turno.apellido}, ${turno.nombre}</div>
        <div class="ae-modal-info-detalle"><strong>DNI:</strong> ${turno.dni}</div>
        <div class="ae-modal-info-detalle"><strong>Fecha y Hora:</strong> ${d}/${m}/${y} · ${horaStr} hs</div>
        <div class="ae-modal-info-detalle"><strong>Estudio:</strong> ${turno.estudio}</div>
        ${turno.observaciones ? `<div class="ae-modal-info-obs"><strong>Observaciones:</strong> ${turno.observaciones}</div>` : ''}
      </div>
    `;
    document.getElementById('ae-modal-overlay').classList.remove('hidden');
  }

  function _cerrarModalTurno() {
    document.getElementById('ae-modal-overlay').classList.add('hidden');
    _turnoSeleccionado = null;
  }

  async function _anularTurno() {
    if (!_turnoSeleccionado) return;
    const t = _turnoSeleccionado;
    const [y, m, d] = t.fecha.split('-');
    const horaStr = _minAHora(t.mins);
    const resumen = `${t.apellido}, ${t.nombre}\nDNI: ${t.dni}\nFecha: ${d}/${m}/${y} ${horaStr} hs\nEstudio: ${t.estudio}`;
    if (!confirm(`¿Anular este turno?\n\n${resumen}\n\nEsta acción no se puede deshacer.`)) return;

    const btnAnular = document.getElementById('ae-btn-op-anular');
    btnAnular.disabled = true; btnAnular.textContent = 'Anulando…';
    try {
      await RailwayAPI.agendaEspecialAnularPublico(TIPO, _pin, t.id);
      _toast('Turno anulado correctamente.', 'ok');
      _cerrarModalTurno();
      if (_turnoEnEdicion && _turnoEnEdicion.id === t.id) {
        _cancelarModificacion();
      }
      await _refrescarPropios();
    } catch (err) {
      _toast('Error al anular: ' + err.message, 'error');
    } finally {
      btnAnular.disabled = false; btnAnular.textContent = '🗑 Anular turno';
    }
  }

  function _iniciarModificacion(turno) {
    _cerrarModalTurno();
    _turnoEnEdicion = turno;

    document.getElementById('ae-nombre').value = turno.nombre;
    document.getElementById('ae-apellido').value = turno.apellido;
    document.getElementById('ae-dni').value = turno.dni;
    document.getElementById('ae-estudio').value = turno.estudio;
    document.getElementById('ae-fecha').value = turno.fecha;
    document.getElementById('ae-observaciones').value = turno.observaciones || '';

    const [y, m, d] = turno.fecha.split('-');
    const horaStr = _minAHora(turno.mins);
    const aviso = document.getElementById('ae-aviso-modificar');
    aviso.innerHTML = `
      <div>✏️ Modificando turno de <strong>${turno.apellido}, ${turno.nombre}</strong> (${d}/${m}/${y} ${horaStr} hs)</div>
      <button type="button" id="ae-btn-cancelar-mod" class="ae-btn-cancelar">Cancelar</button>
    `;
    aviso.classList.remove('hidden');
    document.getElementById('ae-btn-cancelar-mod').addEventListener('click', _cancelarModificacion);

    document.getElementById('ae-btn-confirmar').textContent = '✓ Guardar cambios';

    _validarFecha();
    _actualizarDisponibilidad();

    const selHora = document.getElementById('ae-hora');
    if ([...selHora.options].some((o) => o.value === horaStr)) {
      selHora.value = horaStr;
    }

    _renderGrilla();
    aviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function _cancelarModificacion() {
    _turnoEnEdicion = null;
    const aviso = document.getElementById('ae-aviso-modificar');
    aviso.classList.add('hidden');
    aviso.innerHTML = '';
    document.getElementById('ae-btn-confirmar').textContent = 'Cargar turno';

    const fechaPrevia = document.getElementById('ae-fecha').value;
    document.getElementById('ae-form').reset();
    document.getElementById('ae-fecha').value = fechaPrevia;
    document.getElementById('ae-fecha-error').textContent = '';

    _actualizarDisponibilidad();
    _renderGrilla();
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
    _duracionEstudios = {};
    estudios.forEach((e) => { _duracionEstudios[e.nombre] = Number(e.duracion) || 20; });
    sel.innerHTML = '<option value="">— Seleccionar estudio —</option>' +
      estudios.map((e) => `<option value="${e.nombre}">${e.nombre} (${e.duracion} min)</option>`).join('');
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
      await _poblarEstudios();
      _renderPropios(turnos);
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
    if (!hora) {
      _toast('No hay ningún horario libre en ese día para la duración de este estudio.', 'error');
      return;
    }

    if (_turnoEnEdicion) {
      const [yO, mO, dO] = _turnoEnEdicion.fecha.split('-');
      const horaOrig = _minAHora(_turnoEnEdicion.mins);
      const confirmar = confirm(`¿Modificar turno?\n\nDE: ${_turnoEnEdicion.apellido}, ${_turnoEnEdicion.nombre} — ${dO}/${mO}/${yO} ${horaOrig} hs (${_turnoEnEdicion.estudio})\n\nA: ${apellido}, ${nombre} — ${fecha} ${hora} hs (${estudio})\n\n¿Confirmás?`);
      if (!confirmar) return;

      btn.disabled = true; btn.textContent = 'Modificando…';
      try {
        await RailwayAPI.agendaEspecialModificarPublico({
          tipo: TIPO, pin: _pin, id: _turnoEnEdicion.id,
          nombre, apellido, dni, estudio, fecha, hora, observaciones
        });
        _toast('Turno modificado correctamente.', 'ok');
        _cancelarModificacion();
        await _refrescarPropios();
      } catch (err) {
        _toast('Error al modificar: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await RailwayAPI.agendaEspecialAsignarPublico({ tipo: TIPO, pin: _pin, nombre, apellido, dni, estudio, fecha, hora, observaciones });
      _toast('Turno cargado correctamente.', 'ok');
      const fechaPrevia = document.getElementById('ae-fecha').value;
      document.getElementById('ae-form').reset();
      document.getElementById('ae-fecha').value = fechaPrevia;
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

    document.getElementById('ae-btn-ingresar').addEventListener('click', _desbloquear);
    document.getElementById('ae-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') _desbloquear(); });
    document.getElementById('ae-form').addEventListener('submit', _confirmar);
    document.getElementById('ae-fecha').addEventListener('change', () => { _validarFecha(); _actualizarDisponibilidad(); });
    document.getElementById('ae-estudio').addEventListener('change', _actualizarDisponibilidad);
    document.getElementById('ae-fecha').min = new Date().toISOString().slice(0, 10);

    // Modal de opciones
    document.getElementById('ae-btn-modal-cerrar').addEventListener('click', _cerrarModalTurno);
    document.getElementById('ae-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'ae-modal-overlay') _cerrarModalTurno();
    });
    document.getElementById('ae-btn-op-modificar').addEventListener('click', () => {
      if (_turnoSeleccionado) _iniciarModificacion(_turnoSeleccionado);
    });
    document.getElementById('ae-btn-op-anular').addEventListener('click', _anularTurno);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
