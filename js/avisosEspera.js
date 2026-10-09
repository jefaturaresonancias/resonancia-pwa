// js/avisosEspera.js — Aviso "🔔 Paciente esperando" (9/10/2026, a pedido:
// "simplemente para que el administrativo pueda avisar de que hay un
// paciente que está esperando"). Administrativo lo dispara desde la Lista
// del día (al dar Presente, o con "🔔 Avisar" en un paciente de RIS — ver
// js/views/lista.js) y les salta a técnico, jefatura y admin en cualquier
// pantalla de la PWA, aunque la ventana esté minimizada: cartel arriba,
// notificación de Windows, tres pitidos y el título de la pestaña
// titilando. "✓ Visto" es compartido: lo marca uno y se limpia en todas las
// PCs (rpc/avisosEspera.js en sistema2).
//
// Polling liviano cada 15 s, sin push: solo llega a las PCs con la PWA
// abierta. Con la ventana minimizada el navegador frena los timers y puede
// tardar hasta ~1 minuto. El sonido necesita que se haya hecho al menos un
// clic en la página desde que se abrió (regla de los navegadores).
const AvisosEspera = (() => {
  const ROLES_QUE_RECIBEN = ["tecnico", "jefatura", "admin"];
  const POLL_MS = 15 * 1000;
  const TITULO_BASE = document.title;
  let _pendientes = [];
  const _notificados = new Set(); // ids ya avisados en ESTA ventana (sonido + notificación una sola vez)
  let _audio = null;
  let _parpadeo = null;

  function _recibe() { return ROLES_QUE_RECIBEN.includes(Config.getRol()); }

  function _esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function _hora(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
    } catch (_) { return ""; }
  }

  // ── Sonido: tres pitidos con WebAudio, sin archivo de audio. ──
  function _desbloquearAudio() {
    try {
      if (!_audio) _audio = new (window.AudioContext || window.webkitAudioContext)();
      if (_audio.state === "suspended") _audio.resume();
    } catch (_) {}
  }
  function _sonar() {
    if (!_audio || _audio.state !== "running") return;
    try {
      const t0 = _audio.currentTime;
      [0, 0.35, 0.7].forEach((dt) => {
        const osc = _audio.createOscillator();
        const vol = _audio.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        vol.gain.setValueAtTime(0.0001, t0 + dt);
        vol.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
        vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.25);
        osc.connect(vol).connect(_audio.destination);
        osc.start(t0 + dt);
        osc.stop(t0 + dt + 0.3);
      });
    } catch (_) {}
  }

  // ── Notificación del sistema (Windows/Android). Va por el service worker
  // si está (el clic trae la ventana al frente, ver sw.js); si no, directo.
  async function _notificar(a) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const titulo = "🔔 Paciente esperando";
    const opciones = {
      body: a.paciente + (a.detalle ? " — " + a.detalle : ""),
      tag: "aviso-espera-" + a.id,
      requireInteraction: true, // queda en pantalla hasta que lo cierren
      icon: "icons/Icon-192.png",
    };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(titulo, opciones); return; }
    } catch (_) {}
    try {
      const n = new Notification(titulo, opciones);
      n.onclick = () => { window.focus(); n.close(); };
    } catch (_) {}
  }
  async function _cerrarNotificacion(id) {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      (await reg.getNotifications({ tag: "aviso-espera-" + id })).forEach((n) => n.close());
    } catch (_) {}
  }

  function _actualizarTitulo() {
    clearInterval(_parpadeo);
    _parpadeo = null;
    const n = _recibe() ? _pendientes.length : 0;
    if (!n) { document.title = TITULO_BASE; return; }
    const conAviso = `(${n}) 🔔 Paciente esperando`;
    document.title = conAviso;
    if (document.hidden) {
      let alterna = false;
      _parpadeo = setInterval(() => {
        alterna = !alterna;
        document.title = alterna ? TITULO_BASE : conAviso;
      }, 1000);
    }
  }

  function _render() {
    let box = document.getElementById("avisos-espera");
    if (!box) {
      box = document.createElement("div");
      box.id = "avisos-espera";
      box.setAttribute("role", "alert");
      document.body.appendChild(box);
    }
    const pedirPermiso = _recibe() && "Notification" in window && Notification.permission === "default";
    if (!_recibe() || (!_pendientes.length && !pedirPermiso)) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = _pendientes.map((a) => `
      <div class="aviso-espera-item">
        <span class="aviso-espera-icono" aria-hidden="true">🔔</span>
        <div class="aviso-espera-texto">
          <strong>Paciente esperando: ${_esc(a.paciente)}</strong>
          ${a.detalle ? `<span>${_esc(a.detalle)}</span>` : ""}
          <small>Avisó ${_esc(a.creadoPor || "administrativo")}${a.creadoEn ? " a las " + _hora(a.creadoEn) : ""}</small>
        </div>
        <button type="button" class="aviso-espera-visto" data-id="${a.id}">✓ Visto</button>
      </div>`).join("") +
      (pedirPermiso ? `<button type="button" class="aviso-espera-permiso">🔔 Activar avisos de Windows en esta PC</button>` : "");
    box.querySelectorAll(".aviso-espera-visto").forEach((b) =>
      b.addEventListener("click", () => _marcarVisto(Number(b.dataset.id), b)));
    const btnPermiso = box.querySelector(".aviso-espera-permiso");
    if (btnPermiso) btnPermiso.addEventListener("click", async () => {
      try { await Notification.requestPermission(); } catch (_) {}
      _render();
    });
  }

  async function _marcarVisto(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      await RailwayAPI.marcarAvisoEsperaVisto(id, Config.getRol());
    } catch (err) {
      App.toast("No se pudo marcar como visto: " + err.message, "error");
      if (btn) { btn.disabled = false; btn.textContent = "✓ Visto"; }
      return;
    }
    _pendientes = _pendientes.filter((a) => a.id !== id);
    _cerrarNotificacion(id);
    _render();
    _actualizarTitulo();
  }

  async function _tick() {
    if (!_recibe()) {
      if (_pendientes.length) { _pendientes = []; _render(); _actualizarTitulo(); }
      return;
    }
    let avisos;
    try { avisos = await RailwayAPI.leerAvisosEspera(); } catch (_) { return; } // sin red: reintenta en el próximo
    if (!avisos) return; // sin sesión: no molestar con el PIN
    _pendientes = avisos.filter((a) => !a.vistoEn);
    // Lo que ya marcó visto otra PC: cerrar la notificación que quedó abierta acá.
    avisos.filter((a) => a.vistoEn && _notificados.has(a.id)).forEach((a) => _cerrarNotificacion(a.id));
    const nuevos = _pendientes.filter((a) => !_notificados.has(a.id));
    nuevos.forEach((a) => _notificados.add(a.id));
    if (nuevos.length) {
      _sonar();
      nuevos.forEach(_notificar);
    }
    _render();
    _actualizarTitulo();
  }

  function init() {
    document.addEventListener("click", _desbloquearAudio, { capture: true });
    document.addEventListener("keydown", _desbloquearAudio, { capture: true });
    document.addEventListener("visibilitychange", _actualizarTitulo);
    _tick();
    setInterval(_tick, POLL_MS);
  }

  // refrescar(): lo llama la Lista del día después de avisar, para no
  // esperar al próximo ciclo (jefatura/admin también reciben).
  return { init, refrescar: _tick };
})();

AvisosEspera.init();
