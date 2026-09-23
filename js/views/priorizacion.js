// Priorización de informes (23/9/2026, a pedido) — cola manual compartida:
// buscar un paciente por DNI contra el RIS (`estudios`, vía
// api_buscarEstudioPorDNI) y sumarlo a la lista, o cargarlo a mano si no
// aparece ahí. La lista vive en sistema2-node (lista_prioridad_informe),
// agrupada por región del cuerpo y ordenada por días desde el estudio —
// el más atrasado primero — para que jefatura sepa qué informar antes.
const PriorizacionView = (() => {
  let _items = [];
  let _colapsado = new Set();
  let _resultadoBusqueda = null; // último resultado de _buscar(), para poder "Agregar" sin volver a pedirlo

  function init() {
    document.getElementById('pri-buscar-btn').addEventListener('click', _buscar);
    document.getElementById('pri-dni').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _buscar();
    });
    document.getElementById('pri-manual-btn').addEventListener('click', () => _mostrarFormManual());
    document.getElementById('pri-exportar-btn').addEventListener('click', exportarPDF);
  }

  // Contenido del chip de PEL según pel_verificacion_manual (23/9/2026) —
  // null = nunca se verificó todavía, no es un "no está" real, así que no
  // se muestra nada (string vacío, no una etiqueta neutra) hasta que se
  // aprieta "Verificar PEL" al menos una vez.
  function _chipPelHTML(pelEstado) {
    if (pelEstado === 'FINALIZADO') {
      return `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--success-bg);color:var(--success)">✅ Finalizado en PEL</span>`;
    }
    if (pelEstado === 'A INFORMAR' || pelEstado === 'PRELIMINAR') {
      return `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--warn-bg);color:var(--warn)">🟡 A informar en PEL</span>`;
    }
    if (pelEstado === 'NO_ENCONTRADO') {
      return `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--danger-bg);color:var(--danger)">❌ No está en PEL</span>`;
    }
    return '';
  }

  function _splitApellidoNombre(str) {
    const [ap, ...resto] = String(str || '').split(',');
    return { apellido: (ap || '').trim(), nombre: resto.join(',').trim() };
  }

  function _limpiarBusqueda() {
    document.getElementById('pri-dni').value = '';
    document.getElementById('pri-resultado').innerHTML = '';
    _resultadoBusqueda = null;
  }

  async function _buscar() {
    const dni = document.getElementById('pri-dni').value.trim();
    if (!dni) { App.toast('Ingresá un DNI', 'warn'); return; }

    const cont = document.getElementById('pri-resultado');
    cont.innerHTML = '<div class="loading-bar">⏳ Buscando…</div>';
    try {
      const estudios = await RailwayAPI.buscarEstudioPorDni(dni);
      _resultadoBusqueda = estudios;
      if (!estudios.length) {
        cont.innerHTML = `<div style="padding:.75rem;background:var(--warn-bg);border:1px solid var(--warn);border-radius:var(--radius);font-size:.85rem;color:var(--text)">
          No se encontró ningún estudio con DNI ${dni} en el RIS.
          <button type="button" class="btn-sm" id="pri-manual-btn-2" style="margin-left:.5rem">➕ Cargar a mano</button>
        </div>`;
        document.getElementById('pri-manual-btn-2').addEventListener('click', () => _mostrarFormManual(dni));
        return;
      }
      cont.innerHTML = estudios.map((e, i) => {
        const { apellido, nombre } = _splitApellidoNombre(e.apellido_nombre);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;
            padding:.6rem .85rem;border:1px solid var(--border);border-radius:var(--radius);
            background:var(--surface);margin-bottom:.4rem">
            <div style="font-size:.82rem;line-height:1.5">
              <strong>${apellido}, ${nombre}</strong> — DNI ${e.documento}<br>
              <span style="color:var(--text-2)">${e.practica}</span><br>
              <span style="color:var(--text-3)">${e.fecha} ${e.hora || ''} · ${e.estado || '—'}</span>
            </div>
            <button type="button" class="btn-sm" data-agregar-ris="${i}" style="flex-shrink:0">➕ Agregar</button>
          </div>`;
      }).join('') + `<button type="button" class="btn-sm" id="pri-manual-btn-2" style="margin-top:.3rem">➕ No es este — cargar a mano</button>`;

      cont.querySelectorAll('[data-agregar-ris]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const e = _resultadoBusqueda[Number(btn.dataset.agregarRis)];
          const { apellido, nombre } = _splitApellidoNombre(e.apellido_nombre);
          _agregar({ dni: e.documento, apellido, nombre, estudio: e.practica, fechaEstudio: e.fecha, origenDato: 'ris' });
        });
      });
      document.getElementById('pri-manual-btn-2').addEventListener('click', () => _mostrarFormManual(dni));
    } catch (err) {
      cont.innerHTML = `<div style="color:var(--danger);font-size:.85rem">Error buscando: ${err.message}</div>`;
    }
  }

  function _mostrarFormManual(dniPrecargado) {
    const cont = document.getElementById('pri-resultado');
    cont.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:.85rem;background:var(--surface)">
        <div style="font-weight:700;font-size:.82rem;color:var(--navy);margin-bottom:.5rem">Cargar paciente a mano</div>
        <div class="form-row" style="display:flex;gap:.6rem;flex-wrap:wrap">
          <div class="form-group" style="flex:1;min-width:110px"><label>DNI</label><input type="text" id="pri-m-dni" value="${dniPrecargado || ''}"></div>
          <div class="form-group" style="flex:1;min-width:140px"><label>Apellido</label><input type="text" id="pri-m-apellido"></div>
          <div class="form-group" style="flex:1;min-width:140px"><label>Nombre</label><input type="text" id="pri-m-nombre"></div>
        </div>
        <div class="form-row" style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.5rem">
          <div class="form-group" style="flex:2;min-width:200px"><label>Estudio</label><input type="text" id="pri-m-estudio" placeholder="ej. Cerebro sin contraste"></div>
          <div class="form-group" style="flex:1;min-width:140px"><label>Fecha del estudio</label><input type="date" id="pri-m-fecha"></div>
        </div>
        <div style="display:flex;gap:.5rem;margin-top:.65rem">
          <button type="button" class="btn-sm" id="pri-manual-agregar">➕ Agregar a la lista</button>
          <button type="button" class="btn-sm" id="pri-manual-cancelar">Cancelar</button>
        </div>
      </div>`;
    document.getElementById('pri-manual-agregar').addEventListener('click', _agregarManual);
    document.getElementById('pri-manual-cancelar').addEventListener('click', _limpiarBusqueda);
  }

  async function _agregarManual() {
    const dni      = document.getElementById('pri-m-dni').value.trim();
    const apellido = document.getElementById('pri-m-apellido').value.trim();
    const nombre   = document.getElementById('pri-m-nombre').value.trim();
    const estudio  = document.getElementById('pri-m-estudio').value.trim();
    const fecha    = document.getElementById('pri-m-fecha').value;
    if (!dni || !apellido || !nombre || !estudio || !fecha) {
      App.toast('Completá todos los campos', 'warn'); return;
    }
    await _agregar({ dni, apellido, nombre, estudio, fechaEstudio: fecha, origenDato: 'manual' });
  }

  async function _agregar(datos) {
    try {
      await RailwayAPI.agregarAListaPrioridad(datos);
      App.toast(`✅ ${datos.apellido}, ${datos.nombre} agregado a la lista`, 'ok');
      _limpiarBusqueda();
      cargar();
    } catch (err) {
      App.toast('Error al agregar: ' + err.message, 'error');
    }
  }

  async function _quitar(id, nombreCompleto) {
    if (!confirm(`¿Sacar a ${nombreCompleto} de la lista de priorización?`)) return;
    try {
      await RailwayAPI.quitarDeListaPrioridad(id);
      App.toast('Sacado de la lista', 'ok');
      cargar();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  // Dispara bot-verificar-pel-dni.js --dni=<dni> (rpc/listaPrioridad.js,
  // jefatura-rmn-sistema2) — consulta de solo lectura, busca el DNI
  // directo en PEL sin depender de que tenga un reclamo activo (por eso
  // sirve para cualquier paciente de esta lista). No escribe nada en
  // `reclamos` ni descarga informes — solo confirma si está cargado en
  // PEL. Corregido 23/9/2026 (mismo día): apuntaba a bot-verificar-pel.js,
  // que solo cruza reclamos YA activos y no hacía nada para el resto.
  // No espera el resultado acá: se ve en logs-bots del panel de Bots.
  // fecha = fechaEstudio del item (clave junto con el DNI en
  // pel_verificacion_manual) — sin esto el bot no sabría bajo qué fila
  // guardar el resultado. id = id del item en esta lista, para actualizar
  // su chip en cuanto el bot termina, sin esperar a la próxima carga de
  // toda la lista (mismo patrón de polling que ya se usaba para el viejo
  // botón "Cargar en Suitestensa" de Lista del día, sacado el 22/9/2026).
  async function _verificarPel(dni, fecha, id, btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Disparando…';
    const desde = new Date();
    try {
      await RailwayAPI.verificarPelPorDni(dni, fecha);
      App.toast('🤖 Consultando PEL…', 'ok');
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = '🔍 Verificar PEL';
      return;
    }
    btn.textContent = '⏳ Consultando…';

    // El bot tarda ~50s (login SIGEHOS + VPN + navegar PEL) — mismo
    // margen que ya se usaba para Suitestensa.
    const TIMEOUT_MS = 150000, INTERVALO_MS = 5000;
    const poll = async () => {
      let r = null;
      try { r = await RailwayAPI.leerEstadoPelItem(dni, fecha); } catch (e) { /* reintenta en el próximo tick */ }

      const vigente = r && r.pelVerificadoEn && new Date(r.pelVerificadoEn) >= desde;
      if (vigente) {
        const item = _items.find((it) => it.id === id);
        if (item) { item.pelEstado = r.pelEstado; item.pelVerificadoEn = r.pelVerificadoEn; }
        const chip = document.querySelector(`[data-pel-chip="${id}"]`);
        const html = _chipPelHTML(r.pelEstado);
        if (chip) chip.innerHTML = html ? ' · ' + html : '';
        btn.disabled = false;
        btn.textContent = '🔍 Verificar PEL';
        return;
      }

      if (Date.now() - desde.getTime() >= TIMEOUT_MS) {
        btn.disabled = false;
        btn.textContent = '🔍 Reintentar';
        App.toast('Sin respuesta de PEL todavía — revisar panel de Bots', 'warn');
        return;
      }
      setTimeout(poll, INTERVALO_MS);
    };
    setTimeout(poll, INTERVALO_MS);
  }

  async function cargar() {
    const cont = document.getElementById('pri-lista');
    cont.innerHTML = '<div class="loading-bar">⏳ Cargando…</div>';
    try {
      _items = await RailwayAPI.leerListaPrioridad();
      _render();
    } catch (err) {
      cont.innerHTML = `<div style="color:var(--danger);font-size:.85rem;padding:1rem">Error cargando la lista: ${err.message}</div>`;
    }
  }

  // Agrupa por región (más atrasada primero) y ordena cada grupo por días
  // desde el estudio (más atrasado primero) — usado tanto por _render()
  // como por exportarPDF(), así la hoja impresa sale en el mismo orden
  // que se ve en pantalla.
  function _agrupar() {
    const porRegion = {};
    for (const it of _items) {
      if (!porRegion[it.region]) porRegion[it.region] = [];
      porRegion[it.region].push(it);
    }
    for (const region in porRegion) porRegion[region].sort((a, b) => b.diasDesdeEstudio - a.diasDesdeEstudio);
    const regiones = Object.keys(porRegion).sort(
      (a, b) => porRegion[b][0].diasDesdeEstudio - porRegion[a][0].diasDesdeEstudio
    );
    return { porRegion, regiones };
  }

  function _render() {
    const cont = document.getElementById('pri-lista');
    document.getElementById('pri-contador').textContent = _items.length
      ? `${_items.length} paciente${_items.length === 1 ? '' : 's'} en la lista`
      : '';

    if (!_items.length) {
      cont.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-3)">
        <div style="font-size:3rem">✅</div><div style="margin-top:1rem">Sin pacientes en la lista de priorización</div></div>`;
      return;
    }

    const { porRegion, regiones } = _agrupar();

    cont.innerHTML = regiones.map((region) => {
      const filas = porRegion[region];
      const colapsado = _colapsado.has(region);
      const items = filas.map((it) => {
        const urgencia = it.diasDesdeEstudio >= 15 ? 'var(--danger)' : it.diasDesdeEstudio >= 7 ? 'var(--warn)' : 'var(--text-2)';
        const badgeReclamo = it.reclamado === true
          ? `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--danger-bg);color:var(--danger)">🔴 Reclamado #${it.nroReclamo || ''}</span>`
          : it.reclamado === null
            ? `<span style="font-size:9px;color:var(--text-3)">reclamo no verificado</span>`
            : '';
        // Chip de PEL (23/9/2026) — refleja pel_verificacion_manual, subida
        // por bot-verificar-pel-dni.js al terminar. null = nunca se
        // verificó todavía (sin chip, no es un "no está" real).
        const chipPelHTML = _chipPelHTML(it.pelEstado);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;
            padding:.6rem .85rem;border:1px solid var(--border);border-left:4px solid ${urgencia};
            border-radius:var(--radius);background:var(--surface);margin-bottom:.4rem">
            <div style="font-size:.82rem;line-height:1.5;min-width:0">
              <strong>${it.apellido}, ${it.nombre}</strong> — DNI ${it.dni}
              ${badgeReclamo ? ' · ' + badgeReclamo : ''}
              <span data-pel-chip="${it.id}">${chipPelHTML ? ' · ' + chipPelHTML : ''}</span><br>
              <span style="color:var(--text-2)">${it.estudio}</span><br>
              <span style="color:${urgencia};font-weight:700">${it.diasDesdeEstudio} día${it.diasDesdeEstudio === 1 ? '' : 's'} desde el estudio</span>
              <span style="color:var(--text-3)"> · ${it.fechaEstudio}</span>
            </div>
            <div style="display:flex;gap:.4rem;flex-shrink:0">
              <button type="button" class="btn-sm" data-verificar-pel="${it.dni}" data-fecha="${it.fechaEstudio}" data-id="${it.id}" style="white-space:nowrap">🔍 Verificar PEL</button>
              <button type="button" class="btn-sm" data-quitar="${it.id}" data-nombre="${it.apellido}, ${it.nombre}">✕ Quitar</button>
            </div>
          </div>`;
      }).join('');

      return `
        <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface);margin-bottom:.75rem">
          <div class="pri-region-header" data-region="${region}" style="
            cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;gap:.5rem;
            background:var(--bg);padding:.6rem 1rem;border-bottom:1px solid var(--border)">
            <span style="display:flex;align-items:center;gap:.6rem">
              <span style="font-size:.7rem;transition:transform .15s;display:inline-block;transform:rotate(${colapsado ? '-90deg' : '0deg'})">▾</span>
              <span style="font-weight:700;font-size:.88rem;color:var(--navy)">${region}</span>
            </span>
            <span style="font-size:.7rem;font-weight:700;color:#fff;background:var(--navy);border-radius:20px;padding:2px 9px">${filas.length}</span>
          </div>
          <div style="display:${colapsado ? 'none' : 'flex'};flex-direction:column;padding:.75rem">${items}</div>
        </div>`;
    }).join('');

    cont.querySelectorAll('.pri-region-header').forEach((el) => {
      el.addEventListener('click', () => {
        const region = el.dataset.region;
        if (_colapsado.has(region)) _colapsado.delete(region); else _colapsado.add(region);
        _render();
      });
    });
    cont.querySelectorAll('[data-quitar]').forEach((btn) => {
      btn.addEventListener('click', () => _quitar(Number(btn.dataset.quitar), btn.dataset.nombre));
    });
    cont.querySelectorAll('[data-verificar-pel]').forEach((btn) => {
      btn.addEventListener('click', () => _verificarPel(btn.dataset.verificarPel, btn.dataset.fecha, Number(btn.dataset.id), btn));
    });
  }

  // Entregable en papel de la lista completa (23/9/2026, a pedido) — mismo
  // patrón que panoramaSemanal.js: ventana nueva + print nativo del
  // navegador, sin librerías. Siempre todo expandido (ignora _colapsado —
  // eso es solo un estado de pantalla) y en el mismo orden que _render().
  function exportarPDF() {
    if (!_items.length) { App.toast('No hay nada para exportar', 'warn'); return; }
    const { porRegion, regiones } = _agrupar();
    const hoy = new Date().toLocaleDateString('es-AR');

    const filasHtml = (filas) => filas.map((it) => `
      <tr>
        <td>${it.apellido}, ${it.nombre}</td>
        <td>${it.dni}</td>
        <td>${it.estudio}</td>
        <td>${it.fechaEstudio}</td>
        <td style="text-align:center;font-weight:700">${it.diasDesdeEstudio}</td>
        <td>${it.reclamado === true ? '🔴 Reclamado' + (it.nroReclamo ? ' #' + it.nroReclamo : '') : ''}</td>
      </tr>`).join('');

    const seccionesHtml = regiones.map((region) => `
      <h3>${region} <span style="font-weight:400;color:#666">(${porRegion[region].length})</span></h3>
      <table>
        <thead><tr><th>Paciente</th><th>DNI</th><th>Estudio</th><th>Fecha estudio</th><th>Días</th><th>Reclamo</th></tr></thead>
        <tbody>${filasHtml(porRegion[region])}</tbody>
      </table>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Priorización de informes</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:16px;color:#1a2332}
        h1{font-size:16px;margin:0 0 2px}
        .sub{font-size:11px;color:#666;margin-bottom:16px}
        h3{font-size:13px;color:#1a3a5c;border-bottom:1px solid #1a3a5c;padding-bottom:3px;margin:18px 0 6px}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}
        th{text-align:left;background:#f4f6f9;padding:4px 6px;border-bottom:1px solid #d0d7e2}
        td{padding:4px 6px;border-bottom:1px solid #eee}
        @page{size:portrait;margin:12mm}
      </style></head>
      <body>
        <h1>Priorización de informes</h1>
        <div class="sub">Generado el ${hoy} · ${_items.length} paciente${_items.length === 1 ? '' : 's'}</div>
        ${seccionesHtml}
      </body></html>`;

    const ventana = window.open('', '_blank');
    if (!ventana) { App.toast('El navegador bloqueó la ventana del PDF — habilitá pop-ups para este sitio.', 'error'); return; }
    ventana.document.write(html);
    ventana.document.close();
    ventana.onload = () => ventana.print();
  }

  return { init, cargar, exportarPDF };
})();
