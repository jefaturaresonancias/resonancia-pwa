// js/views/panoramaSemanal.js — Panorama semanal de franjas/límites,
// compartido entre Config (embebido, sección propia) y Agenda (modal desde
// un botón en el header) — 28/8/2026, a pedido, para no duplicar la misma
// grilla en dos vistas. Coloreada con la MISMA lógica de prioridades que
// la agenda real (api_agenda_previewSemanal, rpc/agenda.js) para que esta
// vista nunca muestre algo distinto de lo que realmente bloquea. Todo sale
// de datos reales — nada hardcodeado.

const PanoramaSemanal = (() => {
  const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
  const DIAS_LABEL = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
  const ROW_H = 30; // px por hora — altura total = 24 * ROW_H

  const STYLES = {
    bloqueo: { bg: 'repeating-linear-gradient(45deg,#d96a67 0 5px,#c85451 5px 10px)', border: '1px solid #b94b48', fg: '#fff' },
    tipo:    { bg: '#f7dc9a', border: '1px solid #e0b445', fg: '#5d4614' },
    tipoAlt: { bg: '#f6c545', border: '1px solid #d9a41e', fg: '#4d3a08' },
    neuro:   { bg: '#b6acea', border: '1px solid #8b7ad6', fg: '#2f2560' },
    mama:    { bg: '#f0b7bf', border: '1px solid #d98e9a', fg: '#5a2630' },
    cardio:  { bg: '#eaa9b1', border: '1px solid #d0808c', fg: '#54222c' },
    estudio: { bg: '#fff',    border: '1px dashed #a79f95', fg: '#6b645c' }
  };

  // Clasifica un slot real (tipo/label/codigo/origen/bloquea, tal como los
  // devuelve api_agenda_previewSemanal) en una de las 7 categorías de
  // estilo de arriba. No hay un campo "categoría" en el backend — se
  // deriva acá de las mismas señales que ya distinguen estos casos en el
  // resto del sistema (código, origen, palabras clave del nombre).
  function _categoriaDeSlot(s) {
    const label = (s.label || '').toLowerCase();
    if (s.tipo === 'franja') {
      if (s.codigo === 'DESCOM') return 'bloqueo';
      if (/mamaria/.test(label)) return 'mama';
      if (s.codigo === 'NCX' || /neurocirug/.test(label)) return 'neuro';
      if (/neurolog/.test(label)) return 'neuro';
      return 'estudio';
    }
    if (s.tipo === 'franja_origen') {
      return s.origen === 'DELEGACION/VICTOR' ? 'tipoAlt' : 'tipo';
    }
    if (s.tipo === 'bloqueo_rec') {
      if (s.origen === 'DELEGACION/VICTOR') return 'tipoAlt';
      if (s.origen) return 'tipo';
      if (/mamaria/.test(label)) return 'mama';
      if (/neurocirug/.test(label)) return 'neuro';
      if (/neurolog/.test(label)) return 'neuro';
      if (/cardiolog/.test(label)) return 'cardio';
      if (s.bloquea === false) return 'tipo'; // informativa (ej. Internados CEDETAC)
      return 'bloqueo';
    }
    return 'estudio';
  }

  // Slots de 30min (tal como llegan) → bandas contiguas mergeadas, para
  // que un mismo bloque de 4hs se dibuje como UNA caja, no 8 celditas.
  // Mergea por LABEL solamente (no por categoría): el evaluador real tiene
  // un desajuste de borde conocido y a propósito no unificado (ver
  // _evaluarSlotAgenda en rpc/agenda.js) donde el último sub-slot de una
  // franja reservada por origen puede perder esa coincidencia por un
  // minuto — sin esto, "Solo internados" se veía partido en dos cajas
  // pegadas con distinto color por esa nada.
  function _mergeBandas(slots) {
    const bandas = [];
    let open = null;
    (slots || []).forEach(s => {
      const cat = (s.tipo && s.tipo !== 'libre') ? _categoriaDeSlot(s) : null;
      if (open && cat && open.label === s.label) {
        open.to = s.mins + 30;
        return;
      }
      if (open) bandas.push(open);
      open = cat ? { from: s.mins, to: s.mins + 30, label: s.label, categoria: cat } : null;
    });
    if (open) bandas.push(open);
    return bandas;
  }

  function _horaMin(mins) { return String(Math.floor(mins/60)).padStart(2,'0') + ':' + String(mins%60).padStart(2,'0'); }
  function _minDeHora(hora) {
    const [h, m] = String(hora || '').split(':');
    return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
  }
  function _minHastaDeHora(hora) {
    const m = _minDeHora(hora);
    return m === 0 ? 1440 : m; // "00:00" como hora hasta = fin del día
  }

  // Límites de turnos por franja agrupados por su firma de días (para no
  // asumir "Lun-Vie / Sáb-Dom" a fuego — si el día de mañana alguien arma
  // una config distinta, esto se adapta solo) — cada grupo se llena 0-24hs
  // con huecos marcados como "sin límite propio".
  function _gruposCupos(limitesFranja) {
    const activos = (limitesFranja || []).filter(r => r.activa !== false);
    const porFirma = new Map();
    activos.forEach(r => {
      const dias = (r.dias && r.dias.length) ? [...r.dias].sort((a, b) => a - b) : [];
      const firma = dias.join(',');
      if (!porFirma.has(firma)) porFirma.set(firma, { dias, reglas: [] });
      porFirma.get(firma).reglas.push(r);
    });
    return [...porFirma.values()].map(g => {
      g.reglas.sort((a, b) => _minDeHora(a.horaDesde) - _minDeHora(b.horaDesde));
      const bandas = [];
      let cursor = 0;
      g.reglas.forEach(r => {
        const desde = _minDeHora(r.horaDesde), hasta = _minHastaDeHora(r.horaHasta);
        if (desde > cursor) bandas.push({ from: cursor, to: desde, limite: null });
        bandas.push({ from: desde, to: hasta, limite: r.limite });
        cursor = Math.max(cursor, hasta);
      });
      if (cursor < 1440) bandas.push({ from: cursor, to: 1440, limite: null });
      const label = g.dias.length ? g.dias.map(d => DIAS_LABEL[d]).join('/') : 'Todos los días';
      return { label, bandas };
    });
  }

  const QUE_SOBRETURNO = {
    paciente: () => 'sobreturnos',
    estudio: (r) => `sobreturno de "${r.valor}"`,
    region: (r) => `sobreturno «${r.valor}»`,
    global_dia: () => 'regiones de sobreturno',
    pacientes_dia: () => 'pacientes de sobreturno'
  };
  function _diasAbrev(dias) {
    return (dias && dias.length) ? dias.map(d => DIAS_LABEL[d]).join('/') : 'todos los días';
  }

  // ── Render de la grilla (colores por CSS vars — para embeber en la app) ──
  function _renderLeyenda() {
    return [
      { label: 'Cerrado / bloqueo', sw: STYLES.bloqueo.bg },
      { label: 'Solo cierto tipo de paciente', sw: '#f2c14b' },
      { label: 'Franja exclusiva', sw: '#8b7ad6' },
      { label: 'Restricción de estudio', sw: '#fff', dashed: true }
    ].map(l => `
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--text-2);padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:4px">
        <span style="width:12px;height:12px;border-radius:2px;flex-shrink:0;background:${l.sw};${l.dashed ? 'border:1px dashed #a79f95' : ''}"></span>${l.label}
      </span>`).join("");
  }

  function renderGrid(panoramaDias) {
    if (!panoramaDias || !panoramaDias.length) {
      return `<div style="font-size:12px;color:var(--text-3)">No se pudo cargar el panorama — reintentá más tarde</div>`;
    }
    const porDia = {};
    panoramaDias.forEach(d => { porDia[d.diaSemana] = d.slots; });
    const totalH = ROW_H * 24;

    const headerDias = ORDEN_DIAS.map(dia =>
      `<div style="flex:1;min-width:0;text-align:center"><div style="font-size:12.5px;font-weight:650">${DIAS_LABEL[dia]}</div></div>`
    ).join("");

    const gutter = [];
    for (let h = 0; h <= 24; h += 2) {
      gutter.push(`<span style="position:absolute;right:8px;top:${h*ROW_H}px;transform:translateY(-50%);font-size:10.5px;color:#9a938a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${h === 24 ? '24' : String(h).padStart(2,'0')}</span>`);
    }

    const columnas = ORDEN_DIAS.map(dia => {
      const bandas = _mergeBandas(porDia[dia]);
      const bloques = bandas.map(b => {
        const st = STYLES[b.categoria] || STYLES.estudio;
        const h = (b.to - b.from) / 60 * ROW_H;
        const alto = h >= 30;
        return `<div title="${b.label} · ${_horaMin(b.from)}–${_horaMin(b.to)}"
          style="position:absolute;left:3px;right:3px;top:${b.from/60*ROW_H}px;height:${h-2}px;border-radius:3px;overflow:hidden;padding:3px 5px;box-sizing:border-box;background:${st.bg};border:${st.border};color:${st.fg};display:flex;flex-direction:column;justify-content:center;gap:1px;cursor:default">
          <div style="font-size:10.5px;font-weight:650;line-height:1.15">${b.label}</div>
          ${alto ? `<div style="font-size:9.5px;opacity:.72;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${_horaMin(b.from)}–${_horaMin(b.to)}</div>` : ''}
        </div>`;
      }).join("");
      return `<div style="flex:1;min-width:0;position:relative;height:${totalH}px;border:1px solid #eae5df;border-radius:4px;background-color:#fcfbfa;background-image:repeating-linear-gradient(to bottom,#eae5df 0 1px,rgba(0,0,0,0) 1px ${ROW_H*2}px)">${bloques}</div>`;
    }).join("");

    return { headerDias, gutter: gutter.join(""), columnas, totalH };
  }

  function renderCupos(limitesFranja) {
    const grupos = _gruposCupos(limitesFranja);
    const totalH = ROW_H * 24;
    const cabeceras = grupos.map(g => `<div style="width:150px;flex-shrink:0;padding-left:14px;font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:#8a8279">Cupo ${g.label}</div>`).join("");
    const columnas = grupos.map(g => {
      const bandas = g.bandas.map(c => {
        const cero = c.limite === 0;
        const bar = c.limite === null ? '#ddd8d1' : cero ? '#c85451' : '#8fae8b';
        const valor = c.limite === null ? 'Sin límite propio' : cero ? 'Sin turnos (máx 0)' : `Máx ${c.limite} turno(s)`;
        return `<div style="position:absolute;left:14px;right:0;top:${c.from/60*ROW_H}px;height:${(c.to-c.from)/60*ROW_H}px;box-sizing:border-box;border-left:3px solid ${bar};padding:4px 0 4px 10px;display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:12px;font-weight:650;color:${cero ? '#b94b48' : 'inherit'}">${valor}</div>
          <div style="font-size:10px;color:#8a8279;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${_horaMin(c.from)}–${_horaMin(c.to === 1440 ? 0 : c.to)}</div>
        </div>`;
      }).join("");
      return `<div style="width:150px;flex-shrink:0;position:relative;height:${totalH}px;padding-left:14px">${bandas}</div>`;
    }).join("");
    return { cabeceras, columnas };
  }

  function renderTablaLimites(limitesSobreturno, limitesFranja) {
    const filasSobreturno = (limitesSobreturno || []).filter(r => r.activa !== false).map(r => `
      <div style="display:flex;align-items:baseline;gap:12px;padding:7px 0;border-top:1px solid #f0ece6">
        <div style="width:180px;flex-shrink:0;font-size:12px;color:var(--text-2)">${r.nombre}</div>
        <div style="font-size:14px;font-weight:650;width:30px;flex-shrink:0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${r.limite}</div>
        <div style="font-size:12px;flex:1;min-width:0">${(QUE_SOBRETURNO[r.ambito]||(()=>r.ambito))(r)}</div>
        <div style="margin-left:auto;font-size:11px;color:#8a8279;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;flex-shrink:0">${_diasAbrev(r.dias)}</div>
      </div>`).join("");
    const filasFranja = (limitesFranja || []).filter(r => r.activa !== false).map(r => `
      <div style="display:flex;align-items:baseline;gap:12px;padding:7px 0;border-top:1px solid #f0ece6">
        <div style="width:160px;flex-shrink:0;font-size:12px;color:var(--text-2)">${r.nombre}</div>
        <div style="font-size:14px;font-weight:650;width:24px;flex-shrink:0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${r.limite===0?'#b94b48':'inherit'}">${r.limite}</div>
        <div style="font-size:12px;flex:1;min-width:0">turnos</div>
        <div style="margin-left:auto;font-size:11px;color:#8a8279;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;flex-shrink:0">${r.horaDesde}–${r.horaHasta} · ${_diasAbrev(r.dias)}</div>
      </div>`).join("");

    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px">
      <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:6px;padding:16px 20px 18px">
        <div style="font-size:12.5px;font-weight:650;margin-bottom:4px">🚫 Límites de sobreturno activos</div>
        ${filasSobreturno || `<div style="font-size:11.5px;color:var(--text-3);font-style:italic;padding:8px 0">Ninguno configurado</div>`}
      </div>
      <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:6px;padding:16px 20px 18px">
        <div style="font-size:12.5px;font-weight:650;margin-bottom:4px">📊 Límites de turnos por franja activos</div>
        ${filasFranja || `<div style="font-size:11.5px;color:var(--text-3);font-style:italic;padding:8px 0">Ninguno configurado</div>`}
      </div>
    </div>`;
  }

  // Sección completa (grilla + leyenda + tablas de límites), con encabezado
  // propio — usada tal cual por Config; Agenda arma su propio encabezado de
  // modal y solo pide las piezas (renderGrid/renderCupos/renderTablaLimites).
  function renderCompleto(panoramaDias, limitesSobreturno, limitesFranja, opts) {
    opts = opts || {};
    if (!panoramaDias || !panoramaDias.length) {
      return `<div style="font-size:12px;color:var(--text-3)">No se pudo cargar — reintentá recargando</div>`;
    }
    const grid = renderGrid(panoramaDias);
    const cupos = renderCupos(limitesFranja);
    const encabezado = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:14px;flex-wrap:wrap">
        ${opts.ocultarTitulo ? '<div></div>' : `<div>
          <span style="font-weight:600;font-size:16px">🗺️ Panorama semanal de la agenda</span>
          <div style="font-size:12.5px;color:var(--text-2);margin-top:4px;max-width:640px">Franjas, bloqueos y cupos recurrentes de Lun a Dom, 00 a 24hs. Cada bloque indica qué se puede agendar (pasá el mouse para el detalle) — mismo criterio que aplica la agenda real.</div>
        </div>`}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
          ${opts.botonExportarId ? `<button id="${opts.botonExportarId}" style="font-size:12px">📄 Exportar PDF</button>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${_renderLeyenda()}</div>
        </div>
      </div>`;

    return `<div>
      ${encabezado}
      <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:6px;padding:18px 20px 22px">
        <div style="display:flex;align-items:flex-end;gap:0;padding-left:46px;padding-right:8px;margin-bottom:8px">
          <div style="flex:1;display:flex;gap:6px">${grid.headerDias}</div>
          ${cupos.cabeceras}
        </div>
        <div style="display:flex;align-items:stretch;overflow-x:auto">
          <div style="width:46px;flex-shrink:0;position:relative;height:${grid.totalH}px">${grid.gutter}</div>
          <div style="flex:1;display:flex;gap:6px;min-width:600px">${grid.columnas}</div>
          ${cupos.columnas}
        </div>
      </div>
      ${renderTablaLimites(limitesSobreturno, limitesFranja)}
    </div>`;
  }

  // ── Carga de datos (Agenda no tiene esto pre-cargado como Config) ──
  async function cargarDatos() {
    const [panoramaDias, limitesSobreturno, limitesFranja] = await Promise.all([
      RailwayAPI.obtenerAgendaPreviewSemanal(),
      RailwayAPI.leerLimitesSobreturno().catch(() => []),
      RailwayAPI.leerLimitesTurnosFranja().catch(() => [])
    ]);
    return { panoramaDias, limitesSobreturno, limitesFranja };
  }

  // ── Exportar a PDF (misma técnica que reportes de Validaciones: pestaña
  // nueva + Ctrl+P → Guardar como PDF, sin dependencias externas). Usa
  // colores concretos en vez de var(--...) porque la pestaña nueva no
  // hereda el stylesheet de la app.
  function _exportarHTML(panoramaDias, limitesSobreturno, limitesFranja) {
    const porDia = {};
    (panoramaDias || []).forEach(d => { porDia[d.diaSemana] = d.slots; });
    const totalH = ROW_H * 24;
    const ahora = new Date().toLocaleString('es-AR');

    const leyenda = [
      { label: 'Cerrado / bloqueo', sw: STYLES.bloqueo.bg },
      { label: 'Solo cierto tipo de paciente', sw: '#f2c14b' },
      { label: 'Franja exclusiva', sw: '#8b7ad6' },
      { label: 'Restricción de estudio', sw: '#fff', dashed: true }
    ].map(l => `
      <div style="display:flex;align-items:center;gap:7px;padding:6px 10px;background:#fff;border:1px solid #e2ddd6;border-radius:4px;font-size:11.5px;color:#4a443d">
        <span style="width:12px;height:12px;border-radius:2px;background:${l.sw};${l.dashed ? 'border:1px dashed #a79f95' : ''}"></span>${l.label}
      </div>`).join("");

    const headerDias = ORDEN_DIAS.map(dia => `<div style="flex:1;min-width:0;text-align:center;font-size:12.5px;font-weight:650;color:#211f1d">${DIAS_LABEL[dia]}</div>`).join("");

    const gutter = [];
    for (let h = 0; h <= 24; h += 2) {
      gutter.push(`<span style="position:absolute;right:8px;top:${h*ROW_H}px;transform:translateY(-50%);font-size:10.5px;color:#9a938a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${h === 24 ? '24' : String(h).padStart(2,'0')}</span>`);
    }

    const columnas = ORDEN_DIAS.map(dia => {
      const bandas = _mergeBandas(porDia[dia]);
      const bloques = bandas.map(b => {
        const st = STYLES[b.categoria] || STYLES.estudio;
        const h = (b.to - b.from) / 60 * ROW_H;
        return `<div style="position:absolute;left:3px;right:3px;top:${b.from/60*ROW_H}px;height:${h-2}px;border-radius:3px;overflow:hidden;padding:3px 5px;box-sizing:border-box;background:${st.bg};border:${st.border};color:${st.fg};display:flex;flex-direction:column;justify-content:center;gap:1px">
          <div style="font-size:10.5px;font-weight:650;line-height:1.15">${b.label}</div>
          ${h >= 30 ? `<div style="font-size:9.5px;opacity:.72;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${_horaMin(b.from)}–${_horaMin(b.to)}</div>` : ''}
        </div>`;
      }).join("");
      return `<div style="flex:1;min-width:0;position:relative;height:${totalH}px;border:1px solid #eae5df;border-radius:4px;background-color:#fcfbfa">${bloques}</div>`;
    }).join("");

    const grupos = _gruposCupos(limitesFranja);
    const cabecerasCupos = grupos.map(g => `<div style="width:130px;flex-shrink:0;padding-left:14px;font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:#8a8279">Cupo ${g.label}</div>`).join("");
    const columnasCupos = grupos.map(g => {
      const bandas = g.bandas.map(c => {
        const cero = c.limite === 0;
        const bar = c.limite === null ? '#ddd8d1' : cero ? '#c85451' : '#8fae8b';
        const valor = c.limite === null ? 'Sin límite propio' : cero ? 'Sin turnos (máx 0)' : `Máx ${c.limite} turno(s)`;
        return `<div style="position:absolute;left:14px;right:0;top:${c.from/60*ROW_H}px;height:${(c.to-c.from)/60*ROW_H}px;box-sizing:border-box;border-left:3px solid ${bar};padding:4px 0 4px 8px">
          <div style="font-size:11px;font-weight:650;color:${cero ? '#b94b48' : '#211f1d'}">${valor}</div>
          <div style="font-size:9.5px;color:#8a8279;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${_horaMin(c.from)}–${_horaMin(c.to === 1440 ? 0 : c.to)}</div>
        </div>`;
      }).join("");
      return `<div style="width:130px;flex-shrink:0;position:relative;height:${totalH}px">${bandas}</div>`;
    }).join("");

    const filasSobreturno = (limitesSobreturno || []).filter(r => r.activa !== false).map(r => `
      <div style="display:flex;align-items:baseline;gap:10px;padding:6px 0;border-top:1px solid #f0ece6;font-size:11.5px">
        <div style="width:170px;flex-shrink:0;color:#6b645c">${r.nombre}</div>
        <div style="font-weight:650;width:26px;flex-shrink:0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${r.limite}</div>
        <div style="flex:1;min-width:0;color:#211f1d">${(QUE_SOBRETURNO[r.ambito]||(()=>r.ambito))(r)}</div>
        <div style="margin-left:auto;color:#8a8279;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap">${_diasAbrev(r.dias)}</div>
      </div>`).join("");
    const filasFranja = (limitesFranja || []).filter(r => r.activa !== false).map(r => `
      <div style="display:flex;align-items:baseline;gap:10px;padding:6px 0;border-top:1px solid #f0ece6;font-size:11.5px">
        <div style="width:150px;flex-shrink:0;color:#6b645c">${r.nombre}</div>
        <div style="font-weight:650;width:22px;flex-shrink:0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${r.limite===0?'#b94b48':'#211f1d'}">${r.limite}</div>
        <div style="flex:1;min-width:0;color:#211f1d">turnos</div>
        <div style="margin-left:auto;color:#8a8279;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap">${r.horaDesde}–${r.horaHasta} · ${_diasAbrev(r.dias)}</div>
      </div>`).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>Panorama semanal de la agenda</title>
      <style>
        body{margin:0;background:#fff;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#211f1d;padding:20px 24px}
        h1{margin:0;font-size:19px;font-weight:650}
        .sub{margin:5px 0 0;font-size:12px;color:#6b645c;max-width:760px}
        .gen{margin:4px 0 16px;font-size:10.5px;color:#999}
        .card{border:1px solid #e2ddd6;border-radius:6px;padding:14px 16px 18px;margin-bottom:16px}
        .panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .panel h2{margin:0 0 6px;font-size:12px;font-weight:650}
        @page{size:landscape;margin:10mm}
        @media print{ body{-webkit-print-color-adjust:exact;print-color-adjust:exact} * {-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important} }
      </style></head>
      <body>
        <h1>Panorama semanal de la agenda</h1>
        <div class="sub">Franjas, bloqueos y cupos recurrentes de Lun a Dom, 00 a 24hs — mismo criterio que aplica la agenda real.</div>
        <div class="gen">Generado el ${ahora} — RMN Santojanni</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${leyenda}</div>
        <div class="card">
          <div style="display:flex;align-items:flex-end;gap:0;padding-left:40px;margin-bottom:6px">
            <div style="flex:1;display:flex;gap:5px">${headerDias}</div>
            ${cabecerasCupos}
          </div>
          <div style="display:flex;align-items:stretch">
            <div style="width:40px;flex-shrink:0;position:relative;height:${totalH}px">${gutter.join("")}</div>
            <div style="flex:1;display:flex;gap:5px">${columnas}</div>
            ${columnasCupos}
          </div>
        </div>
        <div class="panels">
          <div class="card panel"><h2>🚫 Límites de sobreturno activos</h2>${filasSobreturno || '<div style="font-size:11px;color:#999;font-style:italic">Ninguno configurado</div>'}</div>
          <div class="card panel"><h2>📊 Límites de turnos por franja activos</h2>${filasFranja || '<div style="font-size:11px;color:#999;font-style:italic">Ninguno configurado</div>'}</div>
        </div>
      </body></html>`;
  }

  function exportarPDF(panoramaDias, limitesSobreturno, limitesFranja) {
    const html = _exportarHTML(panoramaDias, limitesSobreturno, limitesFranja);
    const ventana = window.open('', '_blank');
    if (!ventana) { App.toast('El navegador bloqueó la ventana del PDF — habilitá pop-ups para este sitio.', 'error'); return; }
    ventana.document.write(html);
    ventana.document.close();
    ventana.onload = () => ventana.print();
  }

  // ── Modal (para el botón de Agenda) ─────────────────────────
  let _datosModal = null;

  async function abrirModal() {
    const overlay = document.getElementById('panorama-modal-overlay');
    const body = document.getElementById('panorama-modal-body');
    overlay.classList.remove('hidden');
    body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-3)">⏳ Cargando…</div>';
    try {
      _datosModal = await cargarDatos();
      body.innerHTML = renderCompleto(_datosModal.panoramaDias, _datosModal.limitesSobreturno, _datosModal.limitesFranja, { ocultarTitulo: true });
    } catch (err) {
      body.innerHTML = `<div style="color:#c62828">Error: ${err.message}</div>`;
    }
  }

  function cerrarModal() {
    document.getElementById('panorama-modal-overlay').classList.add('hidden');
  }

  function initModal() {
    document.getElementById('btn-panorama-modal-cerrar').addEventListener('click', cerrarModal);
    document.getElementById('panorama-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'panorama-modal-overlay') cerrarModal();
    });
    document.getElementById('btn-panorama-exportar-pdf').addEventListener('click', () => {
      if (!_datosModal) return;
      exportarPDF(_datosModal.panoramaDias, _datosModal.limitesSobreturno, _datosModal.limitesFranja);
    });
  }

  return { renderCompleto, cargarDatos, exportarPDF, abrirModal, cerrarModal, initModal };
})();
