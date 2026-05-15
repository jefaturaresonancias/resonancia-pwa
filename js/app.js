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

    // Cargar datos de la vista al activarla
    if (id === "agenda") AgendaView.cargar();
    if (id === "lista")  ListaView.cargar();
    if (id === "turno")  { TurnoView.abrirPanel(); return; }
    if (id === "stats")  StatsView.cargar();
  }

  // ── Abrir turno con fecha/hora prellenos (desde agenda) ───
  function abrirTurnoConFechaHora(fecha, hora) {
    TurnoView.abrirPanel(fecha, hora);
  }

  // ── Mostrar opciones de un turno (click en celda) ─────────
  let _turnoSeleccionado = null;

  function mostrarOpcionesTurno(fila, tooltipEncoded) {
    if (!fila) return;
    const tip = tooltipEncoded ? decodeURIComponent(tooltipEncoded) : "";
    _turnoSeleccionado = { fila: parseInt(fila), tooltip: tip };

    const body = document.getElementById("panel-opciones-body");
    body.innerHTML = `
      <div style="background:var(--bg);border-radius:8px;padding:1rem;font-size:13px;white-space:pre-line;color:var(--text-2)">${tip}</div>
      <button id="btn-op-modificar" class="btn-primary" style="padding:12px;font-size:14px">✏️ Modificar turno</button>
      <button id="btn-op-anular" style="padding:12px;font-size:14px;border-radius:6px;border:2px solid var(--danger);background:transparent;color:var(--danger);font-weight:700;cursor:pointer">🗑 Anular turno</button>
    `;

    document.getElementById("btn-op-anular").addEventListener("click", async () => {
      if (!confirm(`¿Anular este turno?\n\n${tip}\n\nEsta acción no se puede deshacer.`)) return;
      try {
        await API.anular(_turnoSeleccionado.fila);
        toast("Turno anulado", "ok");
        cerrarOpcionesTurno();
        refrescarAgenda();
      } catch(e) { toast("Error: "+e.message, "error"); }
    });

    document.getElementById("btn-op-modificar").addEventListener("click", () => {
      const filaGuardada = _turnoSeleccionado.fila;
      const tipGuardado  = tip;
      cerrarOpcionesTurno();
      TurnoView.abrirPanelModificar(filaGuardada, tipGuardado);
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
  function _actualizarRolUI() {
    const rol = Config.getRol();
    const badge = document.getElementById("topbar-rol-label");
    badge.textContent = rol === "tecnico" ? "Técnico"
                      : rol === "jefatura" ? "Jefatura"
                      : rol === "admin"    ? "Admin"
                      : "Administrativo";

    // Vista default según rol
    const defaultView = rol === "jefatura" ? "stats" : "agenda";

    // Mostrar/ocultar items según rol
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = (rol === "administrativo" || rol === "jefatura" || rol === "admin") ? "" : "none";
    });
    document.querySelectorAll(".tecnico-only").forEach(el => {
      el.style.display = rol === "tecnico" ? "" : "none";
    });
    document.querySelectorAll(".jefatura-only").forEach(el => {
      el.style.display = rol === "jefatura" ? "" : "none";
    });
    document.querySelectorAll(".admin-jefatura-only").forEach(el => {
      el.style.display = (rol === "admin" || rol === "jefatura") ? "" : "none";
    });

    // Reordenar nav: técnico ve Lista primero
    const navAgenda = document.getElementById("nav-agenda");
    const navLista  = document.getElementById("nav-lista");
    if (rol === "tecnico") {
      navLista.style.order  = "1";
      navAgenda.style.order = "2";
    } else {
      navAgenda.style.order = "1";
      navLista.style.order  = "2";
    }

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
          const pinCorrecto = _pinRolObjetivo === "admin"
            ? Config.getPinAdmin()
            : Config.getPinJefatura();
          if (_pinActual === pinCorrecto) {
            Config.setRol(_pinRolObjetivo);
            document.getElementById("screen-pin").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
            _actualizarRolUI();
          } else {
            document.getElementById("pin-error").textContent = "PIN incorrecto";
            setTimeout(() => { _pinActual = ""; _actualizarPuntos(); document.getElementById("pin-error").textContent = ""; }, 800);
          }
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
  function _initNav() {
    document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });

    document.getElementById("nav-cambiar-pin").addEventListener("click", () => {
      const rol = Config.getRol();
      const pinActual = rol === "admin" ? Config.getPinAdmin() : Config.getPinJefatura();
      const nuevo = prompt(`PIN actual confirmado.\nIngresá el nuevo PIN de ${rol === "admin" ? "Admin" : "Jefatura"} (4 dígitos):`);
      if (!nuevo) return;
      if (!/^\d{4}$/.test(nuevo)) { toast("El PIN debe tener exactamente 4 dígitos", "error"); return; }
      const confirmar = prompt("Repetí el nuevo PIN:");
      if (nuevo !== confirmar) { toast("Los PINs no coinciden", "error"); return; }
      if (rol === "admin") Config.setPinAdmin(nuevo);
      else Config.setPinJefatura(nuevo);
      toast("PIN actualizado correctamente", "ok");
    });

    document.getElementById("btn-cambiar-rol").addEventListener("click", () => {
      Config.setRol("");
      document.getElementById("screen-rol").classList.remove("hidden");
      document.getElementById("screen-pin").classList.add("hidden");
      document.getElementById("app").classList.add("hidden");
    });

    document.getElementById("btn-refresh").addEventListener("click", () => {
      if (_viewActual === "agenda") AgendaView.cargar();
      if (_viewActual === "lista")  ListaView.cargar();
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
    StatsView.init();
    _initPin();

    // Si ya tiene URL guardada, saltar el setup
    if (Config.isReady()) {
      // Verificar conexión en segundo plano
      API.ping().catch(() => {
        toast("⚠️ No se pudo conectar con el servidor. Verificá la conexión.", "error");
      });

      // Si tiene rol guardado, ir directo a la app
      if (Config.getRol()) {
        document.getElementById("screen-setup").classList.add("hidden");
        document.getElementById("screen-rol").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        _actualizarRolUI();
      } else {
        _irARol();
      }
    }
  }

  // ── Service Worker ────────────────────────────────────────
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(err => {
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