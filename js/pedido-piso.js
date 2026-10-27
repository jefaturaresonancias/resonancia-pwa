// pedido-piso.js — datos del pedido de piso que viajan dentro de las
// observaciones de un turno de INTERNACIÓN (27/10/2026, a pedido: "si se
// marcó sin informe que se vea más claro, y el comentario del médico que
// autoriza también"). Los escribe la página de técnicos (reclamos-rmn) al
// dar el turno: "… — Autorizó: Dr. X (comentario) — SIN INFORME — …".
// También cuenta como sin informe si el comentario lo dice (ej. "Solo 3D,
// sin informe"). Lo usan agenda.js, lista.js y app.js.
const PedidoPiso = (() => {
  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function info(turno) {
    const t = turno || {};
    if (!/INTERNACI/i.test(String(t.origen || ""))) return { sinInforme: false, autorizo: "", comentario: "" };
    const obs = String(t.observaciones || "");
    const m = obs.match(/Autorizó:\s*([^(—]+?)\s*(?:\(([^)]*)\))?\s*(?:—|$)/);
    return {
      sinInforme: /sin informe/i.test(obs),
      autorizo: m ? m[1].trim() : "",
      comentario: m && m[2] ? m[2].trim() : "",
    };
  }

  // Etiqueta para la celda / tarjeta.
  function badge(turno) {
    return info(turno).sinInforme ? `<span class="badge-sin-informe">SIN INFORME</span>` : "";
  }

  // Línea "💬 comentario" para donde hay lugar (celda expandida, lista).
  function lineaComentario(turno, color) {
    const i = info(turno);
    if (!i.comentario) return "";
    return `<span class="slot-detalle" style="${color ? `color:${color};` : ""}font-weight:600">💬 ${_esc(i.comentario)}</span>`;
  }

  // Líneas en texto plano para el globo y "Opciones del turno" (van después
  // de la línea de origen: no mover las 4 primeras, otras partes las leen).
  function lineasTip(turno) {
    const i = info(turno);
    return (i.sinInforme ? "\n🚫 SIN INFORME" : "") +
      (i.autorizo ? `\n👨‍⚕️ Autorizó: ${i.autorizo}${i.comentario ? " — 💬 " + i.comentario : ""}` : "");
  }

  // Resalta esas líneas cuando el texto se muestra como HTML.
  function resaltar(html) {
    return String(html)
      .replace("🚫 SIN INFORME", '<span style="color:#e65100;font-weight:800">🚫 SIN INFORME</span>')
      .replace(/(👨‍⚕️ Autorizó:[^<\n]*)/, "<b>$1</b>");
  }

  return { info, badge, lineaComentario, lineasTip, resaltar };
})();
