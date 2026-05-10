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
    if (id === "turno")  TurnoView.cargarEstudios();
  }

  // ── Abrir turno con fecha/hora prellenos (desde agenda) ───
  function abrirTurnoConFechaHora(fecha, hora) {
    showView("turno");
    TurnoView.cargarEstudios().then(() => {
      TurnoView.prefill(fecha, hora);
    });
  }

  // ── Mostrar opciones de un turno (click en celda) ─────────
  function mostrarOpcionesTurno(fila) {
    // Por ahora sólo avisa; en el futuro se puede abrir un modal de anular/modificar
    // toast(`Turno seleccionado (fila ${fila}). Usá Buscar para modificarlo.`);
  }

  // ── Refrescar agenda tras asignar turno ───────────────────
  function refrescarAgenda() {
    if (_viewActual === "agenda") AgendaView.cargar();
  }

  // ── Actualizar label del rol en topbar ───────────────────
  function _actualizarRolUI() {
    const rol = Config.getRol();
    const badge = document.getElementById("topbar-rol-label");
    badge.textContent = rol === "tecnico" ? "Técnico" : "Administrativo";

    // Vista default según rol
    const defaultView = rol === "tecnico" ? "lista" : "agenda";

    // Mostrar/ocultar items solo para admin
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = rol === "administrativo" ? "" : "none";
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

    document.getElementById("btn-cambiar-rol").addEventListener("click", () => {
      document.getElementById("screen-rol").classList.remove("hidden");
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

  function irAListaDia(fechaStr) {
    ListaView.setFecha(fechaStr);
    showView("lista");
  }

  function abrirTurnoConCondicion(fecha, hora, condicion) {
    showView("turno");
    TurnoView.cargarEstudios().then(() => {
      TurnoView.prefill(fecha, hora, condicion);
    });
  }

  return { init, toast, showView, abrirTurnoConFechaHora, abrirTurnoConCondicion, mostrarOpcionesTurno, refrescarAgenda, irAListaDia };
})();

// Arrancar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => App.init());