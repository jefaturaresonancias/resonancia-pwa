// js/app.js — Controlador principal de la PWA

const App = (() => {
  let _viewActual = "";
  let _toastTimer = null;

  // ── Toast global ──────────────────────────────────────────
  function toast(msg, tipo = "") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast" + (tipo ? " " + tipo : "");
    el.classList.remove("hidden");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
  }

  // ── Mostrar / ocultar views ───────────────────────────────
  function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const view = document.getElementById("view-" + id);
    const btn  = document.getElementById("nav-" + id);
    if (view) view.classList.remove("hidden");
    if (btn)  btn.classList.add("active");
    _viewActual = id;
    // "Nuevo turno" es una acción/modal, no una vista real — si refrescan
    // estando ahí, que caiga en Agenda (no en lo que estaban viendo antes
    // de abrirla).
    try { sessionStorage.setItem("ultimaVista", id === "turno" ? "agenda" : id); } catch (e) {}

    // Cargar datos de la vista al activarla
    if (id === "agenda") AgendaView.cargar(true);
    if (id === "lista")  ListaView.cargar();
    if (id === "turno")  { TurnoView.abrirPanel(); return; }
    if (id === "pami")   PamiView.cargar();
    if (id === "config") ConfigView.cargar();
    if (id === "validaciones") ValidacionesView.cargar();
    if (id === "agenda-especial") AgendaEspecialView.cargar();
  }

  // ── Abrir turno con fecha/hora prellenos (desde agenda) ───
  function abrirTurnoConFechaHora(fecha, hora) {
    TurnoView.abrirPanel(fecha, hora);
  }

  // ── Mostrar opciones de un turno (click en celda) ─────────
  let _turnoSeleccionado = null;

  function mostrarOpcionesTurno(fila, tooltipEncoded, fecha, mins) {
    if (!fila) return;
    const tip = tooltipEncoded ? decodeURIComponent(tooltipEncoded) : "";
    _turnoSeleccionado = { fila: parseInt(fila), tooltip: tip, fecha, mins };

    const body = document.getElementById("panel-opciones-body");
    body.innerHTML = `
      <div style="background:var(--bg);border-radius:8px;padding:1rem;font-size:13px;white-space:pre-line;color:var(--text-2)">${tip}</div>
      <button id="btn-op-modificar" class="btn-primary" style="padding:12px;font-size:14px">✏️ Modificar turno</button>
      <button id="btn-op-anular" style="padding:12px;font-size:14px;border-radius:6px;border:2px solid var(--danger);background:transparent;color:var(--danger);font-weight:700;cursor:pointer">🗑 Anular turno</button>
    `;

    document.getElementById("btn-op-anular").addEventListener("click", async () => {
      if (!confirm(`¿Anular este turno?\n\n${tip}\n\nEsta acción no se puede deshacer.`)) return;
      try {
        await RailwayAPI.anular(_turnoSeleccionado.fila);
        toast("Turno anulado", "ok");
        cerrarOpcionesTurno();
        refrescarAgenda();
      } catch(e) { toast("Error: "+e.message, "error"); }
    });

    document.getElementById("btn-op-modificar").addEventListener("click", () => {
      const filaGuardada = _turnoSeleccionado.fila;
      const tipGuardado  = tip;
      const { fecha, mins } = _turnoSeleccionado;
      cerrarOpcionesTurno();
      TurnoView.abrirPanelModificar(filaGuardada, tipGuardado, fecha, mins);
    });

    document.getElementById("panel-opciones-turno").style.display = "flex";
    document.getElementById("panel-overlay-turno").style.display = "block";
  }

  function cerrarOpcionesTurno() {
    document.getElementById("panel-opciones-turno").style.display = "none";
    document.getElementById("panel-overlay-turno").style.display = "none";
    _turnoSeleccionado = null;
  }

  // ── Refrescar agenda tras asignar turno ───────────────────
  function refrescarAgenda() {
    if (_viewActual === "agenda") AgendaView.cargar();
  }

  // ── Actualizar label del rol en topbar ───────────────────
  function _actualizarRolUI(vistaRestaurar) {
    const rol = Config.getRol();
    const badge = document.getElementById("topbar-rol-label");
    badge.textContent = rol === "tecnico" ? "Técnico"
                      : rol === "jefatura" ? "Jefatura"
                      : rol === "admin"    ? "Admin"
                      : "Administrativo";

    // Mostrar/ocultar items según rol
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = (rol === "administrativo" || rol === "jefatura" || rol === "admin") ? "" : "none";
    });
    document.querySelectorAll(".tecnico-only").forEach(el => {
      el.style.display = rol === "tecnico" ? "" : "none";
    });
    document.querySelectorAll(".jefatura-only").forEach(el => {
      el.style.display = (rol === "jefatura" || rol === "admin") ? "" : "none";
    });
    // Solo jefatura (no admin): Jefatura y Estadísticas quedan afuera del rol admin.
    document.querySelectorAll(".jefatura-exclusivo").forEach(el => {
      el.style.display = (rol === "jefatura") ? "" : "none";
    });
    document.querySelectorAll(".admin-jefatura-only").forEach(el => {
      el.style.display = (rol === "admin" || rol === "jefatura") ? "" : "none";
    });

    // Reordenar nav: técnico ve Lista primero
    const navAgenda = document.getElementById("nav-agenda");
    const navLista  = document.getElementById("nav-lista");

    // "Lista del día" (26/8/2026, ver plan "Disparo manual de carga en
    // Suitestensa"): visible para técnico, admin y jefatura (no
    // administrativo) — el botón solo tiene la clase .tecnico-only en el
    // HTML, así que hace falta este chequeo dedicado DESPUÉS del loop
    // genérico de arriba para que gane la decisión final (agregarle una
    // segunda clase genérica al mismo botón no sirve: los loops de las
    // distintas clases se pisarían entre sí según el orden en que corren).
    navLista.style.display = (rol === "tecnico" || rol === "admin" || rol === "jefatura") ? "" : "none";

    if (rol === "tecnico") {
      navLista.style.order  = "1";
      navAgenda.style.order = "2";
    } else {
      navAgenda.style.order = "1";
      navLista.style.order  = "2";
    }
    document.getElementById("nav-cambiar-pin").style.order = "99";

    // A pedido (25/8/2026): administrativo y técnico ven un menú acotado
    // por ahora — el resto queda oculto (temporal, se revierte sacando
    // este bloque). Orden explícito por rol.
    const MENU_ACOTADO = {
      // "nav-turno" agregado 27/8/2026: había quedado afuera del whitelist
      // original del 25/8 — administrativo y técnico cargan turnos como
      // tarea principal, no podían quedar sin el botón.
      administrativo: ["nav-agenda", "nav-turno", "nav-buscar", "nav-reclamos", "nav-turnos-informes", "nav-agenda-especial"],
      // "nav-lista" agregado 26/8/2026: sin esto, este whitelist tapaba
      // "Lista del día" para el técnico aunque su clase .tecnico-only la
      // marcara visible — necesaria para el botón de carga en Suitestensa.
      tecnico:        ["nav-agenda", "nav-turno", "nav-reclamos", "nav-buscar", "nav-lista"],
    };
    if (MENU_ACOTADO[rol]) {
      const visibles = MENU_ACOTADO[rol];
      document.querySelectorAll("#sidebar .nav-btn").forEach(el => {
        if (!visibles.includes(el.id)) el.style.display = "none";
      });
      visibles.forEach((id, i) => { document.getElementById(id).style.display = ""; document.getElementById(id).style.order = String(i + 1); });
    }

    // Orden personalizado por el usuario (arrastrando) para este rol, si
    // guardó uno — pisa el orden por defecto de arriba.
    const ordenGuardado = _cargarOrdenSidebar(rol);
    if (ordenGuardado) _aplicarOrdenSidebar(ordenGuardado);

    // Vista a restaurar: la que se pide (última vista antes de refrescar),
    // pero solo si sigue siendo accesible para este rol — si no, a Agenda.
    let defaultView = vistaRestaurar || "agenda";
    const navBtn = document.getElementById("nav-" + defaultView);
    if (!navBtn || navBtn.style.display === "none") defaultView = "agenda";

    showView(defaultView);
  }

  // ── PIN de jefatura ──────────────────────────────────────
  let _pinActual = "";
  let _pinRolObjetivo = "jefatura"; // qué rol se está desbloqueando

  function _initPin() {
    document.getElementById("btn-jefatura-acceso").addEventListener("click", () => {
      _pinRolObjetivo = "jefatura";
      _pinActual = "";
      _actualizarPuntos();
      document.getElementById("pin-titulo").textContent = "Acceso Jefatura";
      document.getElementById("screen-rol").classList.add("hidden");
      document.getElementById("screen-pin").classList.remove("hidden");
      document.getElementById("pin-error").textContent = "";
    });

    document.getElementById("btn-admin-acceso").addEventListener("click", () => {
      _pinRolObjetivo = "admin";
      _pinActual = "";
      _actualizarPuntos();
      document.getElementById("pin-titulo").textContent = "Acceso Admin";
      document.getElementById("screen-rol").classList.add("hidden");
      document.getElementById("screen-pin").classList.remove("hidden");
      document.getElementById("pin-error").textContent = "";
    });

    document.querySelectorAll(".pin-btn[data-n]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (_pinActual.length >= 4) return;
        _pinActual += btn.dataset.n;
        _actualizarPuntos();
        if (_pinActual.length === 4) {
          const pinIngresado = _pinActual;
          _pinActual = "";
          document.getElementById("pin-error").textContent = "Verificando...";
          Config.validarPin(_pinRolObjetivo, pinIngresado).then(valido => {
            if (valido) {
              Config.setRol(_pinRolObjetivo);
              document.getElementById("pin-error").textContent = "";
              document.getElementById("screen-pin").classList.add("hidden");
              document.getElementById("app").classList.remove("hidden");
              _actualizarRolUI();
            } else {
              document.getElementById("pin-error").textContent = "PIN incorrecto";
              setTimeout(() => { _pinActual = ""; _actualizarPuntos(); document.getElementById("pin-error").textContent = ""; }, 800);
            }
          }).catch(err => {
            console.error("Error validando PIN:", err);
            document.getElementById("pin-error").textContent = "Error de conexión";
            setTimeout(() => { _pinActual = ""; _actualizarPuntos(); document.getElementById("pin-error").textContent = ""; }, 1500);
          });
        }
      });
    });

    document.getElementById("pin-cancel").addEventListener("click", () => {
      _pinActual = _pinActual.slice(0,-1);
      _actualizarPuntos();
    });
    document.getElementById("pin-clear").addEventListener("click", () => {
      _pinActual = "";
      _actualizarPuntos();
    });
    document.getElementById("btn-pin-volver").addEventListener("click", () => {
    document.getElementById("screen-pin").classList.add("hidden");
    document.getElementById("screen-rol").classList.remove("hidden");
    _pinActual = "";
    _actualizarPuntos();
    document.getElementById("pin-error").textContent = "";
    });
  }

  function _actualizarPuntos() {
    for (let i = 1; i <= 4; i++) {
      const d = document.getElementById("pin-d"+i);
      d.classList.toggle("pin-dot-active", i <= _pinActual.length);
    }
  }

  // ── Setup screen ──────────────────────────────────────────
  function _initSetup() {
    const input = document.getElementById("input-api-url");
    const btn   = document.getElementById("btn-setup-ok");

    // Pre-rellenar si ya hay URL guardada
    input.value = Config.getUrl();

    btn.addEventListener("click", async () => {
      const url = input.value.trim();
      if (!url || !url.startsWith("https://")) {
        toast("Ingresá una URL válida (debe comenzar con https://)", "error");
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Verificando…';
      try {
        Config.setUrl(url);
        await API.ping();
        _irARol();
      } catch (err) {
        toast("No se pudo conectar. Verificá la URL. Error: " + err.message, "error");
        Config.clearUrl();
        btn.disabled = false;
        btn.textContent = "Conectar";
      }
    });

    // Enter en el input
    input.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });
  }

  function _irARol() {
    document.getElementById("screen-setup").classList.add("hidden");
    document.getElementById("screen-rol").classList.remove("hidden");
  }

  function _irASetup() {
    document.getElementById("screen-setup").classList.remove("hidden");
    document.getElementById("screen-rol").classList.add("hidden");
    document.getElementById("app").classList.add("hidden");
  }

  // ── Role screen ───────────────────────────────────────────
  function _initRol() {
    document.querySelectorAll(".rol-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const rol = btn.dataset.rol;
        Config.setRol(rol);
        document.getElementById("screen-rol").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        _actualizarRolUI();
      });
    });
  }

  // ── Nav ───────────────────────────────────────────────────
  // ── Sidebar reordenable (arrastrar y soltar) ──────────────
  // Orden guardado por rol en localStorage — cada rol puede acomodar su
  // menú a su gusto sin afectar a los demás.
  function _sidebarOrderIds() {
    return [...document.querySelectorAll("#sidebar .nav-btn")]
      .sort((a, b) => (parseInt(a.style.order || "0", 10) - parseInt(b.style.order || "0", 10)))
      .map(b => b.id);
  }
  function _aplicarOrdenSidebar(ids) {
    ids.forEach((id, i) => { const el = document.getElementById(id); if (el) el.style.order = String(i + 1); });
  }
  function _guardarOrdenSidebar(rol, ids) {
    try { localStorage.setItem("navOrder_" + rol, JSON.stringify(ids)); } catch (e) {}
  }
  function _cargarOrdenSidebar(rol) {
    try { const raw = localStorage.getItem("navOrder_" + rol); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function _initSidebarDragDrop() {
    document.querySelectorAll("#sidebar .nav-btn").forEach(btn => {
      btn.draggable = true;
      btn.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", btn.id);
        e.dataTransfer.effectAllowed = "move";
        btn.classList.add("dragging");
      });
      btn.addEventListener("dragend", () => btn.classList.remove("dragging"));
      btn.addEventListener("dragover", e => { e.preventDefault(); btn.classList.add("drag-over"); });
      btn.addEventListener("dragleave", () => btn.classList.remove("drag-over"));
      btn.addEventListener("drop", e => {
        e.preventDefault();
        btn.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === btn.id) return;
        const ids  = _sidebarOrderIds();
        const from = ids.indexOf(draggedId);
        const to   = ids.indexOf(btn.id);
        if (from === -1 || to === -1) return;
        ids.splice(from, 1);
        ids.splice(to, 0, draggedId);
        _aplicarOrdenSidebar(ids);
        _guardarOrdenSidebar(Config.getRol(), ids);
      });
    });
  }

  function _initNav() {
    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
    _initSidebarDragDrop();

    document.getElementById("nav-cambiar-pin").addEventListener("click", async () => {
      const rol = Config.getRol();
      const pinActual = prompt(`Ingresá el PIN actual de ${rol === "admin" ? "Admin" : "Jefatura"}:`);
      if (!pinActual) return;
      const valido = await Config.validarPin(rol, pinActual);
      if (!valido) { App.toast("PIN actual incorrecto", "error"); return; }
      const nuevo = prompt("Ingresá el nuevo PIN (4 dígitos):");
      if (!nuevo) return;
      if (!/^\d{4}$/.test(nuevo)) { App.toast("El PIN debe tener exactamente 4 dígitos", "error"); return; }
      const confirmar = prompt("Repetí el nuevo PIN:");
      if (nuevo !== confirmar) { App.toast("Los PINs no coinciden", "error"); return; }
      try {
        const data = await RailwayAPI.cambiarPinRol(rol, pinActual, nuevo);
        if (data && data.ok) {
          App.toast("PIN actualizado correctamente", "ok");
        } else {
          App.toast(data && data.error ? data.error : "Error al actualizar el PIN", "error");
        }
      } catch {
        App.toast("Error de conexión", "error");
      }
    });

    document.getElementById("btn-cambiar-rol").addEventListener("click", () => {
      Config.setRol("");
      document.getElementById("screen-rol").classList.remove("hidden");
      document.getElementById("screen-pin").classList.add("hidden");
      document.getElementById("app").classList.add("hidden");
    });

    document.getElementById("btn-refresh").addEventListener("click", () => {
      if (_viewActual === "agenda") AgendaView.cargar(true);
      else if (_viewActual === "lista")  ListaView.cargar();
      else if (_viewActual === "pami")   PamiView.cargar();
      else if (_viewActual === "config") ConfigView.cargar();
      else if (_viewActual === "agenda-especial") AgendaEspecialView.cargar();
      else if (_viewActual === "bot") {
        const iframe = document.getElementById("iframe-bot");
        if (iframe) iframe.src = iframe.src;
      }
    });
  }

  // ── Topbar fecha ──────────────────────────────────────────
  function _actualizarFecha() {
    const DIAS  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const d = new Date();
    document.getElementById("topbar-fecha").textContent =
      `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // ── INIT ──────────────────────────────────────────────────
  function init() {
    _actualizarFecha();
    _initSetup();
    _initRol();
    _initNav();
    AgendaView.init();
    ListaView.init();
    TurnoView.init();
    BuscarView.init();
    ParteView.init();
    PamiView.init();
    ConfigView.init();
    ValidacionesView.init();
    AgendaEspecialView.init();
    _initPin();

    // Si ya tiene URL guardada, saltar el setup
    if (Config.isReady()) {
      // Verificar conexión en segundo plano
      API.ping().catch(() => {
        toast("⚠️ No se pudo conectar con el servidor. Verificá la conexión.", "error");
      });

      // Si tiene rol guardado, ir directo a la app — restaurando la vista
      // en la que estaba antes de refrescar, en vez de mandar siempre a Agenda.
      if (Config.getRol()) {
        document.getElementById("screen-setup").classList.add("hidden");
        document.getElementById("screen-rol").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        let ultimaVista = null;
        try { ultimaVista = sessionStorage.getItem("ultimaVista"); } catch (e) {}
        _actualizarRolUI(ultimaVista);
      } else {
        _irARol();
      }
    }
  }

  // ── Service Worker ────────────────────────────────────────
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("SW no registrado:", err);
    });
  }

  // Abrir formulario con aviso de RIS en ese horario
  function abrirTurnoConRIS(fecha, hora, risNombre, risPractica) {
    TurnoView.abrirPanel(fecha, hora, null, { nombre: risNombre, practica: risPractica });
  }

  function irAListaDia(fechaStr) {
    ListaView.setFecha(fechaStr);
    showView("lista");
  }

  function abrirTurnoConCondicion(fecha, hora, condicion) {
    TurnoView.abrirPanel(fecha, hora, condicion);
  }

  return { init, toast, showView, abrirTurnoConFechaHora, abrirTurnoConCondicion, abrirTurnoConRIS, mostrarOpcionesTurno, cerrarOpcionesTurno, refrescarAgenda, irAListaDia };
})();

// Arrancar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => App.init());