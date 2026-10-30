// excepcion-pin.js — turno asignado con PIN de excepción de jefatura/admin
// (30/10/2026, a pedido: "cuando se usa el pin de excepción quiero que quede
// marcado en el turno que se asigna por ese medio en rojo visible"). El dato
// viene del servidor en `excepcionPin` ({ rol, por, fecha } o null). Lo usan
// agenda.js, lista.js y app.js.
const ExcepcionPin = (() => {
  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function de(turno) {
    return (turno && turno.excepcionPin) || null;
  }

  // "Asignado con PIN de excepción (jefatura) por X el 30/10/2026 10:15"
  function texto(turno) {
    const e = de(turno);
    if (!e) return "";
    return `Asignado con PIN de excepción (${e.rol})` +
      (e.por ? ` por ${e.por}` : "") +
      (e.fecha ? ` el ${String(e.fecha).slice(0, 16)}` : "");
  }

  // Etiqueta roja para la celda / tarjeta.
  function badge(turno) {
    return de(turno) ? `<span class="badge-excepcion-pin" title="${_esc(texto(turno))}">⚠ EXCEPCIÓN</span>` : "";
  }

  // Clase que pinta el borde rojo grueso de la celda / tarjeta.
  function clase(turno) {
    return de(turno) ? " turno-excepcion-pin" : "";
  }

  // Línea en texto plano para el globo y "Opciones del turno" (va al final).
  function lineaTip(turno) {
    return de(turno) ? `\n⚠️ ${texto(turno)}` : "";
  }

  function resaltar(html) {
    return String(html).replace(/(⚠️ Asignado con PIN de excepción[^<\n]*)/,
      '<span style="color:#d50000;font-weight:800">$1</span>');
  }

  return { de, texto, badge, clase, lineaTip, resaltar };
})();
