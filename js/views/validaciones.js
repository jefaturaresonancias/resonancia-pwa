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

  function _reglaInfo(id) {
    return REGLAS[id] || { label: id || 'Otra', color: '#666' };
  }

  // dd/MM/yyyy -> Date, para poder ordenar
  function _aFecha(dd_mm_yyyy) {
    const [dd, mm, yyyy] = (dd_mm_yyyy || '').split('/').map(Number);
    return new Date(yyyy || 0, (mm || 1) - 1, dd || 1);
  }

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
    const regla    = document.getElementById('validaciones-regla').value;
    const busqueda = document.getElementById('validaciones-buscar').value.trim().toLowerCase();

    return _filas.filter(f => {
      if (regla && f.regla !== regla) return false;
      if (!busqueda) return true;
      const texto = `${f.paciente} ${f.documento} ${f.practica} ${f.motivo}`.toLowerCase();
      return texto.includes(busqueda);
    });
  }

  function _renderResumen(filas) {
    const porRegla = {};
    for (const f of filas) porRegla[f.regla] = (porRegla[f.regla] || 0) + 1;

    const tarjetas = [
      `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;text-align:center">
        <div style="font-size:1.8rem;font-weight:700;color:var(--navy)">${filas.length}</div>
        <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">Total</div>
      </div>`,
      ...Object.entries(porRegla).map(([id, n]) => {
        const info = _reglaInfo(id);
        return `<div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${info.color};border-radius:var(--radius);padding:1rem;text-align:center">
          <div style="font-size:1.8rem;font-weight:700;color:${info.color}">${n}</div>
          <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">${info.label}</div>
        </div>`;
      })
    ];

    document.getElementById('validaciones-resumen').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem">
        ${tarjetas.join('')}
      </div>`;
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

      return `
        <div>
          <div style="font-weight:700;font-size:.85rem;color:var(--text-2);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.03em">${fecha}</div>
          <div style="display:flex;flex-direction:column;gap:.5rem">${items}</div>
        </div>`;
    }).join('');
  }

  function _render() {
    const filtradas = _filtradas();
    _renderResumen(filtradas);
    _renderContainer(filtradas);
  }

  async function cargar() {
    const loading = document.getElementById('validaciones-loading');
    const cont    = document.getElementById('validaciones-container');
    loading.classList.remove('hidden');
    cont.innerHTML = '';

    try {
      _poblarSelectReglas();
      _filas = await API.leerValidacionesAgenda();
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
  }

  return { init, cargar };
})();
