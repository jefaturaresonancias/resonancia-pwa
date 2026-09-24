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
  let _tabActiva = 'todos'; // 'todos' | 'sin_categoria' | codigo de categoría (NEURO/CUERPO/MSK/...)
  let _vista = 'activos'; // 'activos' | 'resueltos'
  let _orden = 'fecha_asc'; // 'fecha_asc' (más atrasado primero, default de siempre) | 'fecha_desc'

  function init() {
    document.getElementById('pri-buscar-btn').addEventListener('click', _buscar);
    document.getElementById('pri-dni').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _buscar();
    });
    document.getElementById('pri-manual-btn').addEventListener('click', () => _mostrarFormManual());
    document.getElementById('pri-exportar-btn').addEventListener('click', exportarPDF);
    document.getElementById('pri-verificar-todos-btn').addEventListener('click', _verificarTodos);
    document.getElementById('pri-orden').addEventListener('change', (e) => {
      _orden = e.target.value;
      _render();
    });
  }

  // Activos / Resueltos (24/9/2026, a pedido: "que se pase a otra pestaña
  // o apartado de resueltos para después poder hacer un listado") —
  // "Quitar" y "Resuelto (retirado)" ya no borran, archivan (ver
  // rpc/listaPrioridad.js) — esto es dónde se ven después. Selector
  // aparte de las pestañas de categoría: cambia qué se pide al server
  // (cargar()), las de categoría siguen funcionando igual adentro de
  // cualquiera de las dos vistas.
  function _renderVista() {
    const cont = document.getElementById('pri-vista');
    const vistas = [{ id: 'activos', nombre: '📋 Activos' }, { id: 'resueltos', nombre: '✅ Resueltos' }];
    cont.innerHTML = vistas.map((v) => {
      const activa = _vista === v.id;
      return `<button type="button" data-vista="${v.id}" style="
        padding:.45rem 1rem;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;
        border:1.5px solid ${activa ? 'var(--navy)' : 'var(--border)'};
        background:${activa ? 'var(--navy)' : 'var(--surface)'};color:${activa ? '#fff' : 'var(--text-2)'}">
        ${v.nombre}
      </button>`;
    }).join('');
    cont.querySelectorAll('[data-vista]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.vista === _vista) return;
        _vista = btn.dataset.vista;
        _tabActiva = 'todos';
        _colapsado = new Set();
        cargar();
      });
    });
  }

  // Pestañas Neuro/Cuerpo/MSK/... (23/9/2026, a pedido: "vamos a necesitar
  // pestañas para poder hacer PDFs y visualizaciones distintas") — las
  // categorías salen del item (ya clasificado server-side contra
  // CATEGORIAS_ESTUDIO, ver rpc/listaPrioridad.js), no de una config
  // aparte acá: solo se muestran pestañas de categorías que realmente
  // tienen algún paciente en este momento, más "Todos" y, si corresponde,
  // "Sin categoría" (nada matcheó ninguna palabra clave configurada).
  function _categoriasPresentes() {
    const porCodigo = new Map();
    let hayFueraDeCategoria = false;
    _items.forEach((it) => {
      if (!it.categorias || !it.categorias.length) { hayFueraDeCategoria = true; return; }
      it.categorias.forEach((c) => { if (!porCodigo.has(c.codigo)) porCodigo.set(c.codigo, c.nombre); });
    });
    return { categorias: Array.from(porCodigo, ([codigo, nombre]) => ({ codigo, nombre })), hayFueraDeCategoria };
  }

  function _itemsFiltrados() {
    if (_tabActiva === 'todos') return _items;
    if (_tabActiva === 'sin_categoria') return _items.filter((it) => !it.categorias || !it.categorias.length);
    return _items.filter((it) => (it.categorias || []).some((c) => c.codigo === _tabActiva));
  }

  function _renderTabs() {
    const cont = document.getElementById('pri-tabs');
    const { categorias, hayFueraDeCategoria } = _categoriasPresentes();
    if (!categorias.length) { cont.innerHTML = ''; return; } // todo en una sola bolsa — no vale la pena mostrar pestañas

    // Si la pestaña activa dejó de tener sentido (se vació esa categoría,
    // o se quitó el único item sin categorizar) volvemos a "Todos" en vez
    // de mostrar una pestaña activa vacía sin aviso.
    const activaSigueExistiendo = _tabActiva === 'todos'
      || (_tabActiva === 'sin_categoria' && hayFueraDeCategoria)
      || categorias.some((c) => c.codigo === _tabActiva);
    if (!activaSigueExistiendo) _tabActiva = 'todos';

    const tabs = [{ codigo: 'todos', nombre: 'Todos' }, ...categorias];
    if (hayFueraDeCategoria) tabs.push({ codigo: 'sin_categoria', nombre: 'Sin categoría' });

    cont.innerHTML = tabs.map((t) => {
      const activa = _tabActiva === t.codigo;
      return `<button type="button" data-tab="${t.codigo}" style="
        padding:.4rem .9rem;border-radius:20px;font-size:.78rem;font-weight:700;cursor:pointer;
        border:1px solid ${activa ? 'var(--navy)' : 'var(--border)'};
        background:${activa ? 'var(--navy)' : 'var(--surface)'};color:${activa ? '#fff' : 'var(--text-2)'}">
        ${t.nombre}
      </button>`;
    }).join('');

    cont.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _tabActiva = btn.dataset.tab;
        _colapsado = new Set(); // pestaña nueva, que arranque expandida
        _render();
      });
    });
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

  // Estado de envío del informe (23/9/2026, a pedido) — solo llega con
  // valor cuando el bot ya vio FINALIZADO en PEL y el paciente tiene
  // reclamo (ver rpc/listaPrioridad.js): ¿ya se cargó el informe para
  // enviar, ya se mandó, o todavía no se bajó?
  function _chipEstadoEnvioHTML(estadoEnvio) {
    if (estadoEnvio === 'enviado') {
      return `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--success-bg);color:var(--success)">📤 Ya enviado</span>`;
    }
    if (estadoEnvio === 'cargado_para_envio') {
      return `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--warn-bg);color:var(--warn)">📋 Cargado, falta enviar</span>`;
    }
    if (estadoEnvio === 'sin_cargar') {
      return `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--bg);color:var(--text-2);border:1px solid var(--border)">⏳ Informe sin cargar</span>`;
    }
    return '';
  }

  // fechaEstudio viaja en ISO (AAAA-MM-DD, lo que ya devuelve el backend) —
  // se muestra en DD/MM/AAAA (23/9/2026, a pedido).
  function _isoADmy(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
  }

  async function _toggleVerificadoManual(id, checked) {
    try {
      await RailwayAPI.marcarVerificadoManualListaPrioridad(id, checked);
      const item = _items.find((it) => it.id === id);
      if (item) item.verificadoManual = checked;
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
      cargar(); // por si quedó desincronizado con el servidor
    }
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
              <span style="color:var(--text-3)">${_isoADmy(e.fecha)} ${e.hora || ''} · ${e.estado || '—'}</span>
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
    if (!confirm(`¿Sacar a ${nombreCompleto} de la lista activa? Pasa a "Resueltos", no se borra.`)) return;
    try {
      await RailwayAPI.quitarDeListaPrioridad(id);
      App.toast('✅ Pasado a Resueltos', 'ok');
      cargar();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  // Deshace un "Quitar" hecho por error (24/9/2026) — vuelve el item a la
  // lista activa.
  async function _reactivar(id, nombreCompleto) {
    try {
      await RailwayAPI.reactivarListaPrioridad(id);
      App.toast(`↺ ${nombreCompleto} vuelve a Activos`, 'ok');
      cargar();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    }
  }

  // "Resuelto (retirado)" (23/9/2026, a pedido) — para cuando ya se sabe
  // que el paciente retiró el estudio por otra vía: cierra el reclamo de
  // una en reclamos-rmn-backend (resuelto + archivado) y saca el item de
  // esta lista, sin pasar por el circuito digital normal de envío.
  async function _resolverYArchivar(id, reclamoId, nombreCompleto) {
    if (!confirm(`¿Marcar el reclamo de ${nombreCompleto} como resuelto y archivarlo? Usalo solo si ya sabés que retiró el estudio por otra vía.`)) return;
    try {
      await RailwayAPI.resolverYArchivarReclamoDesdeLista(reclamoId);
      await RailwayAPI.quitarDeListaPrioridad(id);
      App.toast('✅ Reclamo resuelto y archivado — pasa a Resueltos', 'ok');
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

  let _polleoTodosActivo = false; // evita armar dos polling en paralelo si se aprieta el botón dos veces

  // Botón "Verificar todos en PEL" (24/9/2026, a pedido: "correrlos todos
  // juntos") — un solo bot recorre TODOS los pacientes activos en una
  // sesión de PEL (ver api_listaPrioridad_verificarPelTodos). Con listas
  // de 100+ pacientes esto puede tardar bastante — el polling acá es
  // liviano (leerEstadoPelTodos, sin cruzar reclamos-rmn-backend) y se
  // frena solo apenas ve que ya se verificaron todos, sin esperar el
  // timeout entero.
  async function _verificarTodos() {
    const btn = document.getElementById('pri-verificar-todos-btn');
    const activos = _items.length;
    if (!activos) { App.toast('No hay pacientes en la lista', 'warn'); return; }
    if (!confirm(`Esto va a consultar PEL para los ${activos} pacientes activos de la lista, uno por uno en una sola corrida — puede tardar bastante (varios minutos cada 10 pacientes aprox.). ¿Confirmar?`)) return;

    btn.disabled = true;
    btn.textContent = '⏳ Disparando…';
    let cantidad = activos;
    try {
      const res = await RailwayAPI.verificarPelTodos();
      cantidad = res.cantidad || activos;
      App.toast(`🤖 Verificando ${cantidad} paciente(s) en PEL — se va actualizando solo, podés seguir usando la app`, 'ok');
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = '🔍 Verificar todos en PEL';
      return;
    }
    btn.textContent = `⏳ Verificando (0/${cantidad})…`;

    if (_polleoTodosActivo) return;
    _polleoTodosActivo = true;
    const desde = new Date();
    const TIMEOUT_MS = 50 * 60 * 1000, INTERVALO_MS = 30000;

    const _docKey = (dni) => String(dni || '').replace(/^(DNI|CIBO|RP)\s*/i, '').trim().replace(/^0+/, '');

    const poll = async () => {
      let verificaciones = [];
      try { verificaciones = await RailwayAPI.leerEstadoPelTodos(); } catch (e) { /* reintenta en el próximo tick */ }

      const porClave = {};
      verificaciones.forEach((v) => { porClave[v.fecha + '_' + v.documento] = v; });
      let cambiaron = false, verificadosDesde = 0;
      _items.forEach((it) => {
        const v = porClave[it.fechaEstudio + '_' + _docKey(it.dni)];
        const vigente = v && v.pelVerificadoEn && new Date(v.pelVerificadoEn) >= desde;
        if (vigente) {
          verificadosDesde++;
          if (it.pelEstado !== v.pelEstado) cambiaron = true;
          it.pelEstado = v.pelEstado;
          it.pelVerificadoEn = v.pelVerificadoEn;
        }
      });
      if (cambiaron) _render();
      btn.textContent = `⏳ Verificando (${verificadosDesde}/${cantidad})…`;

      if (verificadosDesde >= cantidad || Date.now() - desde.getTime() >= TIMEOUT_MS) {
        _polleoTodosActivo = false;
        btn.disabled = false;
        btn.textContent = '🔍 Verificar todos en PEL';
        App.toast(verificadosDesde >= cantidad
          ? `✅ Verificación en lote terminada (${verificadosDesde}/${cantidad})`
          : `Se dejó de sondear tras 50 min (${verificadosDesde}/${cantidad}) — puede seguir corriendo del lado del bot, revisar panel de Bots`, 'ok');
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
      _items = _vista === 'resueltos'
        ? await RailwayAPI.leerResueltosListaPrioridad()
        : await RailwayAPI.leerListaPrioridad();
      _render();
    } catch (err) {
      cont.innerHTML = `<div style="color:var(--danger);font-size:.85rem;padding:1rem">Error cargando la lista: ${err.message}</div>`;
    }
  }

  // fechaEstudio es ISO (AAAA-MM-DD) — comparación de string alcanza.
  // fecha_asc = más antigua primero (mismo orden de siempre, equivalente a
  // ordenar por diasDesdeEstudio descendente); fecha_desc lo invierte
  // (24/9/2026, a pedido: "opciones para ordenar el listado por fecha
  // ascendente y descendente").
  function _compararFecha(a, b) {
    const cmp = (a.fechaEstudio || '').localeCompare(b.fechaEstudio || '');
    return _orden === 'fecha_desc' ? -cmp : cmp;
  }

  // Agrupa por región y ordena cada grupo por fecha del estudio según
  // _orden — usado tanto por _render() como por exportarPDF(), así la
  // hoja impresa sale en el mismo orden que se ve en pantalla. Recibe la
  // lista explícita (ya filtrada por pestaña) en vez de mirar _items
  // directo. El orden de las regiones (cuál sección aparece primero)
  // sigue el mismo criterio que cada grupo, mirando su primer item ya
  // ordenado.
  function _agrupar(items) {
    const porRegion = {};
    for (const it of items) {
      if (!porRegion[it.region]) porRegion[it.region] = [];
      porRegion[it.region].push(it);
    }
    for (const region in porRegion) porRegion[region].sort(_compararFecha);
    const regiones = Object.keys(porRegion).sort(
      (a, b) => _compararFecha(porRegion[a][0], porRegion[b][0])
    );
    return { porRegion, regiones };
  }

  function _render() {
    const cont = document.getElementById('pri-lista');
    _renderVista();
    _renderTabs();
    const filtrados = _itemsFiltrados();
    document.getElementById('pri-contador').textContent = _items.length
      ? `${filtrados.length} de ${_items.length} paciente${_items.length === 1 ? '' : 's'}`
      : '';

    if (!filtrados.length) {
      const vacioTexto = _items.length ? 'Sin pacientes en esta pestaña'
        : _vista === 'resueltos' ? 'Todavía no se resolvió ningún paciente' : 'Sin pacientes en la lista de priorización';
      cont.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-3)">
        <div style="font-size:3rem">✅</div><div style="margin-top:1rem">${vacioTexto}</div></div>`;
      return;
    }

    const { porRegion, regiones } = _agrupar(filtrados);

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
        const chipEnvioHTML = _chipEstadoEnvioHTML(it.estadoEnvio);

        // En "Resueltos" no tiene sentido volver a verificar PEL ni cerrar
        // el reclamo de nuevo — solo mostrar cuándo se archivó y dejar
        // reabrirlo por si "Quitar" se apretó de más.
        const acciones = _vista === 'resueltos'
          ? `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.3rem;flex-shrink:0">
              <button type="button" class="btn-sm" data-reactivar="${it.id}" data-nombre="${it.apellido}, ${it.nombre}" style="white-space:nowrap">↺ Volver a Activos</button>
              <span style="font-size:.68rem;color:var(--text-3)">${it.archivadoEn ? 'archivado ' + new Date(it.archivadoEn).toLocaleDateString('es-AR') : ''}</span>
            </div>`
          : `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.4rem;flex-shrink:0">
              <div style="display:flex;gap:.4rem">
                <button type="button" class="btn-sm" data-verificar-pel="${it.dni}" data-fecha="${it.fechaEstudio}" data-id="${it.id}" style="white-space:nowrap">🔍 Verificar PEL</button>
                ${it.reclamado && it.reclamoId ? `<button type="button" class="btn-sm" data-resolver="${it.id}" data-reclamo-id="${it.reclamoId}" data-nombre="${it.apellido}, ${it.nombre}" style="white-space:nowrap">✅ Resuelto (retirado)</button>` : ''}
                <button type="button" class="btn-sm" data-quitar="${it.id}" data-nombre="${it.apellido}, ${it.nombre}">✕ Quitar</button>
              </div>
              <label style="display:flex;align-items:center;gap:4px;font-size:.7rem;color:var(--text-2);cursor:pointer;white-space:nowrap">
                <input type="checkbox" data-verif-manual="${it.id}" ${it.verificadoManual ? 'checked' : ''}>
                Verificado a mano
              </label>
            </div>`;

        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;
            padding:.6rem .85rem;border:1px solid var(--border);border-left:4px solid ${urgencia};
            border-radius:var(--radius);background:var(--surface);margin-bottom:.4rem">
            <div style="font-size:.82rem;line-height:1.5;min-width:0">
              <strong>${it.apellido}, ${it.nombre}</strong> — DNI ${it.dni}
              ${badgeReclamo ? ' · ' + badgeReclamo : ''}
              <span data-pel-chip="${it.id}">${chipPelHTML ? ' · ' + chipPelHTML : ''}</span>
              ${chipEnvioHTML ? ' · ' + chipEnvioHTML : ''}<br>
              <span style="color:var(--text-2)">${it.estudio}</span><br>
              <span style="color:${urgencia};font-weight:700">${it.diasDesdeEstudio} día${it.diasDesdeEstudio === 1 ? '' : 's'} desde el estudio</span>
              <span style="color:var(--text-3)"> · ${_isoADmy(it.fechaEstudio)}</span>
            </div>
            ${acciones}
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
    cont.querySelectorAll('[data-verif-manual]').forEach((cb) => {
      cb.addEventListener('change', () => _toggleVerificadoManual(Number(cb.dataset.verifManual), cb.checked));
    });
    cont.querySelectorAll('[data-resolver]').forEach((btn) => {
      btn.addEventListener('click', () => _resolverYArchivar(Number(btn.dataset.resolver), btn.dataset.reclamoId, btn.dataset.nombre));
    });
    cont.querySelectorAll('[data-reactivar]').forEach((btn) => {
      btn.addEventListener('click', () => _reactivar(Number(btn.dataset.reactivar), btn.dataset.nombre));
    });
  }

  // Entregable en papel de la lista completa (23/9/2026, a pedido) — mismo
  // patrón que panoramaSemanal.js: ventana nueva + print nativo del
  // navegador, sin librerías. Siempre todo expandido (ignora _colapsado —
  // eso es solo un estado de pantalla) y en el mismo orden que _render().
  function exportarPDF() {
    const filtrados = _itemsFiltrados();
    if (!filtrados.length) { App.toast('No hay nada para exportar en esta pestaña', 'warn'); return; }
    const { porRegion, regiones } = _agrupar(filtrados);
    const hoy = new Date().toLocaleDateString('es-AR');
    const base = _vista === 'resueltos' ? 'Resueltos' : 'Priorización de informes';
    const tituloTab = _tabActiva === 'todos' ? base
      : _tabActiva === 'sin_categoria' ? base + ' — Sin categoría'
      : base + ' — ' + (_categoriasPresentes().categorias.find((c) => c.codigo === _tabActiva) || {}).nombre;

    const ENVIO_LABEL = { enviado: '📤 Enviado', cargado_para_envio: '📋 Falta enviar', sin_cargar: '⏳ Sin cargar' };
    const filasHtml = (filas) => filas.map((it) => `
      <tr>
        <td>${it.apellido}, ${it.nombre}</td>
        <td>${it.dni}</td>
        <td>${it.estudio}</td>
        <td>${_isoADmy(it.fechaEstudio)}</td>
        <td style="text-align:center;font-weight:700">${it.diasDesdeEstudio}</td>
        <td>${it.reclamado === true ? '🔴 Reclamado' + (it.nroReclamo ? ' #' + it.nroReclamo : '') : ''}</td>
        <td>${it.pelEstado || ''}</td>
        <td>${ENVIO_LABEL[it.estadoEnvio] || ''}</td>
        <td style="text-align:center">${it.verificadoManual ? '✔️' : ''}</td>
      </tr>`).join('');

    const seccionesHtml = regiones.map((region) => `
      <h3>${region} <span style="font-weight:400;color:#666">(${porRegion[region].length})</span></h3>
      <table>
        <thead><tr><th>Paciente</th><th>DNI</th><th>Estudio</th><th>Fecha estudio</th><th>Días</th><th>Reclamo</th><th>PEL</th><th>Envío</th><th>A mano</th></tr></thead>
        <tbody>${filasHtml(porRegion[region])}</tbody>
      </table>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${tituloTab}</title>
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
        <h1>${tituloTab}</h1>
        <div class="sub">Generado el ${hoy} · ${filtrados.length} paciente${filtrados.length === 1 ? '' : 's'}</div>
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
