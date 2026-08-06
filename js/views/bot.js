// js/views/bot.js — Monitor del Bot RIS
const BotView = (() => {

  function _statusColor(status) {
    if (status === 'OK')    return '#2e7d32';
    if (status === 'ERROR') return '#c62828';
    return '#666';
  }

  function _statusIcon(status) {
    if (status === 'OK')    return '✅';
    if (status === 'ERROR') return '❌';
    return '⚠️';
  }

  function _tipoBadge(mensaje) {
    if (mensaje.includes('[SEMANAL]')) return { label: 'Semanal', color: '#1a3a5c' };
    if (mensaje.includes('[DIARIO]'))  return { label: 'Diario',  color: '#2e7d32' };
    return { label: 'Manual', color: '#666' };
  }

  function _renderFilas(filas) {
    const cont = document.getElementById('bot-log-container');
    if (!filas.length) {
      cont.innerHTML = `
        <div style="text-align:center;padding:3rem;color:var(--text-3)">
          <div style="font-size:3rem">🤖</div>
          <div style="margin-top:1rem">Sin ejecuciones registradas aún</div>
        </div>`;
      return;
    }

    cont.innerHTML = filas.map(f => {
      const badge = _tipoBadge(f.mensaje);
      const msg   = f.mensaje
        .replace('[SEMANAL]','')
        .replace('[DIARIO]','')
        .trim();
      return `
        <div style="
          background:var(--surface);
          border:1px solid var(--border);
          border-left:4px solid ${_statusColor(f.status)};
          border-radius:var(--radius);
          padding:1rem 1.25rem;
          display:flex;
          align-items:flex-start;
          gap:1rem;
        ">
          <div style="font-size:1.5rem;line-height:1">${_statusIcon(f.status)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem;flex-wrap:wrap">
              <span style="font-weight:700;font-size:.95rem;color:var(--navy)">${f.fecha} ${f.hora}</span>
              <span style="
                font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
                background:${badge.color};color:#fff;text-transform:uppercase
              ">${badge.label}</span>
              <span style="
                font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
                background:${_statusColor(f.status)}22;color:${_statusColor(f.status)}
              ">${f.status}</span>
            </div>
            <div style="font-size:.85rem;color:var(--text-2);word-break:break-word">${msg}</div>
            ${f.maquina ? `<div style="margin-top:.25rem;font-size:.75rem;color:var(--text-3)">🖥️ ${f.maquina}</div>` : ''}
            ${f.filas > 0 ? `<div style="margin-top:.25rem;font-size:.8rem;font-weight:600;color:#1a3a5c">📥 ${f.filas} turnos nuevos</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function _renderResumen(filas) {
    const ok     = filas.filter(f => f.status === 'OK').length;
    const error  = filas.filter(f => f.status === 'ERROR').length;
    const ultima = filas[0];
    const turnosTotal = filas.reduce((s, f) => s + (f.filas || 0), 0);

    document.getElementById('bot-resumen').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;text-align:center">
          <div style="font-size:1.8rem;font-weight:700;color:#2e7d32">${ok}</div>
          <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">Ejecuciones OK</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;text-align:center">
          <div style="font-size:1.8rem;font-weight:700;color:#c62828">${error}</div>
          <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">Con error</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;text-align:center">
          <div style="font-size:1.8rem;font-weight:700;color:#1a3a5c">${turnosTotal}</div>
          <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">Turnos cargados</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;text-align:center">
          <div style="font-size:1.1rem;font-weight:700;color:${ultima ? _statusColor(ultima.status) : '#666'}">${ultima ? _statusIcon(ultima.status) + ' ' + ultima.fecha : '—'}</div>
          <div style="font-size:.75rem;color:var(--text-2);margin-top:.25rem">Última ejecución</div>
        </div>
      </div>`;
  }

  async function cargar() {
    const loading = document.getElementById('bot-loading');
    const cont    = document.getElementById('bot-log-container');
    loading.classList.remove('hidden');
    cont.innerHTML = '';

    try {
      const limite = document.getElementById('bot-limite').value || 20;
      const res    = await API.leerLog(limite);
      _renderResumen(res.filas);
      _renderFilas(res.filas);
    } catch(err) {
      cont.innerHTML = `<div style="color:#c62828;padding:1rem">Error: ${err.message}</div>`;
    } finally {
      loading.classList.add('hidden');
    }
  }

  function init() {
    document.getElementById('btn-bot-recargar').addEventListener('click', cargar);
    document.getElementById('bot-limite').addEventListener('change', cargar);
  }

  return { init, cargar };
})();