// js/views/lista.js — Vista lista del día (técnico + administrativo)

const ListaView = (() => {
  let _fecha  = new Date();
  _fecha.setHours(0, 0, 0, 0);

  // ── colores de origen ─────────────────────────────────────
  const ORIGEN_STYLE = {
    "AMBULATORIO": { bg: "#e8f5e9", border: "#4a9e5c", text: "#1a5e28" },
    "GUARDIA":     { bg: "#e3f2fd", border: "#2a7ab5", text: "#0a3d6b" },
    "INTERNACIÓN": { bg: "#fff8e1", border: "#c9a000", text: "#7a4f00" },
    "INTERNACION": { bg: "#fff8e1", border: "#c9a000", text: "#7a4f00" },
    "DIRECCIÓN":   { bg: "#f3e5f5", border: "#7c5cb5", text: "#3d1e7a" },
    "DIRECCION":   { bg: "#f3e5f5", border: "#7c5cb5", text: "#3d1e7a" },
    "TRASLADO":    { bg: "#e0f7fa", border: "#1a6e8a", text: "#0a3d52" },
    "DELEGACION/VICTOR": { bg: "#fff3e0", border: "#c9762a", text: "#7a3d00" },
  };
  function _origen(o) {
    return ORIGEN_STYLE[(o||"").toUpperCase()] || { bg: "#fce4ec", border: "#c9506a", text: "#7a1f35" };
  }

  // ── carga manual en Suitestensa (26/8/2026, ver plan "Disparo manual
  // de carga en Suitestensa") ────────────────────────────────
  function _dmyAIso(dmy) {
    const [d, m, y] = String(dmy || "").split("/");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // No hace un `await cargar()` al terminar (a diferencia de Presente/
  // Anular): recargar toda la lista mientras hay otras filas en polling
  // perdería su estado. El botón mismo refleja el resultado final.
  async function _dispararCargaSuitestensa(btn) {
    const hashes = (btn.dataset.hashes || "").split(",").filter(Boolean);
    const fecha  = _dmyAIso(btn.dataset.fecha);
    const nombre = btn.dataset.nombre;
    if (hashes.length === 0) { App.toast("No se pudo identificar el turno (sin hash)", "error"); return; }
    if (!confirm(`¿Cargar a ${nombre} en Suitestensa?`)) return;

    const fila = btn.closest(".row-ris, tr, .card-turno");
    const estadoEl = fila ? fila.querySelector(".suitestensa-estado") : null;
    const desde = new Date();

    btn.disabled = true;
    btn.textContent = "Encolando…";
    if (estadoEl) estadoEl.innerHTML = "";

    try {
      await RailwayAPI.cargarEnSuitestensa(hashes, fecha);
    } catch (err) {
      App.toast("Error al encolar: " + err.message, "error");
      btn.disabled = false;
      btn.textContent = "Cargar en Suitestensa";
      return;
    }
    btn.textContent = "Cargando…";

    // 120s se quedaba corto (bug real 2026-08-29/30, DNI 25434659: cargó
    // bien pero tardó 134s de punta a punta) — más margen tras subir el
    // timeout de navegación de Suitestensa de 40s a 60s (ver
    // resonancia-bot, config.js#TIMEOUT_NAV_SUITESTENSA) para tolerar la
    // red lenta del hospital, pero sin llegar a los 3 minutos (pedido
    // 30/8/2026, se sentía muy largo desde la PWA).
    const TIMEOUT_MS = 150000, INTERVALO_MS = 5000;

    // Barra de progreso (pedido 30/8/2026): se llena a un ritmo constante
    // durante los TIMEOUT_MS de espera — no refleja el progreso real del
    // bot (no hay forma de saberlo desde acá), es una referencia visual de
    // cuánto falta para el timeout. Un solo <div> con transición CSS,
    // arrancada en el siguiente frame para que el navegador registre el
    // ancho inicial (0%) antes de animar a 100%.
    if (estadoEl) {
      estadoEl.innerHTML = '<div class="suitestensa-progress"><div class="suitestensa-progress-fill"></div></div>';
      const fill = estadoEl.querySelector(".suitestensa-progress-fill");
      requestAnimationFrame(() => {
        fill.style.transitionDuration = TIMEOUT_MS + "ms";
        fill.style.width = "100%";
      });
    }

    const poll = async () => {
      let filas = [];
      try { filas = await RailwayAPI.estadoSuitestensa(hashes); } catch (e) { /* reintenta en el próximo tick */ }

      // Solo cuentan filas actualizadas DESPUÉS del click — evita confundir
      // el estado de un intento anterior (ej. un 'error' viejo) con el
      // resultado de este click.
      const vigentes = filas.filter(f => new Date(f.actualizado_en) >= desde);
      const resueltos = hashes.map(h => vigentes.find(f => f.hash === h)).filter(Boolean);

      if (resueltos.length === hashes.length) {
        const filaError = resueltos.find(f => f.estado === "error" || f.estado === "error_permanente");
        const filaSinMapeo = resueltos.find(f => f.estado === "sin_mapeo");
        btn.disabled = false;
        // Se muestra el detalle_error real (ej. bloqueo por horario
        // administrativo, o el motivo puntual del fallo) en vez de un
        // genérico "❌ error" — el técnico necesita saber POR QUÉ, no solo
        // que falló (pedido 28/8/2026, tras sumar el bloqueo horario).
        if (filaError)      { btn.textContent = "Reintentar"; if (estadoEl) estadoEl.textContent = "❌ " + (filaError.detalle_error || "error"); }
        else if (filaSinMapeo) { btn.textContent = "Reintentar"; if (estadoEl) estadoEl.textContent = "⚠️ " + (filaSinMapeo.detalle_error || "sin mapeo"); }
        else               { btn.textContent = "✅ Cargado"; btn.disabled = true; if (estadoEl) estadoEl.textContent = "✅ OK"; }
        return;
      }

      if (Date.now() - desde.getTime() >= TIMEOUT_MS) {
        btn.disabled = false;
        btn.textContent = "Reintentar";
        if (estadoEl) estadoEl.textContent = "⏱ sin respuesta, revisar panel de bots";
        return;
      }

      setTimeout(poll, INTERVALO_MS);
    };
    setTimeout(poll, INTERVALO_MS);
  }

  function _bindBotonSuitestensa(root) {
    if (!root) return;
    root.querySelectorAll(".btn-suitestensa").forEach(btn => {
      btn.addEventListener("click", () => _dispararCargaSuitestensa(btn));
    });
  }

  // ── excepción horaria (28/8/2026) — válvula de escape auditable para
  // cuando falta el administrativo dentro de su propio horario. No hay
  // login individual en esta app (Config.getRol() solo da el rol, PIN
  // compartido) — motivo y "quién" los tipea la persona en el modal, no
  // se pueden auto-completar. El bot decide server-side si el horario
  // actual está bloqueado (_sinAdministrativo); acá no se replica esa
  // regla, el botón de activar queda siempre disponible — activarla
  // fuera de horario bloqueado simplemente no tiene efecto (el bot ni la
  // consulta si ya está en horario técnico permitido). ──────────────────
  async function _cargarBannerExcepcion() {
    const cont = document.getElementById("lista-excepcion-suitestensa");
    if (!cont) return;
    let excepcion = null;
    try { excepcion = await RailwayAPI.estadoExcepcionSuitestensa(); } catch (e) { /* deja el banner anterior */ return; }

    if (excepcion) {
      const vence = new Date(excepcion.expira_en).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      cont.innerHTML = `
        <div class="excepcion-banner-activa">
          ⚠️ Excepción horaria activa por <strong>${excepcion.activado_por}</strong>: "${excepcion.motivo}" — vence a las ${vence}
          <button id="btn-excepcion-desactivar" class="btn-sm">Desactivar</button>
        </div>`;
      document.getElementById("btn-excepcion-desactivar").addEventListener("click", _desactivarExcepcion);
    } else {
      cont.innerHTML = `<button id="btn-excepcion-activar" class="btn-sm">⚠️ Activar excepción horaria (falta el administrativo)</button>`;
      document.getElementById("btn-excepcion-activar").addEventListener("click", _abrirModalExcepcion);
    }
  }

  function _abrirModalExcepcion() {
    document.getElementById("excepcion-modal-titulo").textContent = "Activar excepción horaria";
    document.getElementById("excepcion-modal-body").innerHTML = `
      <p style="color:var(--text-3);font-size:.85rem;margin-bottom:.75rem">
        Usar solo cuando el administrativo no está disponible en su propio horario —
        se registra quién la activa y por qué, y vence sola en 3 horas.
      </p>
      <div class="form-group" style="margin-bottom:.75rem">
        <label>Tu nombre</label>
        <input type="text" id="excepcion-form-nombre" placeholder="¿Quién activa la excepción?">
      </div>
      <div class="form-group">
        <label>Motivo</label>
        <textarea id="excepcion-form-motivo" rows="3" placeholder="¿Por qué falta el administrativo?"></textarea>
      </div>`;
    document.getElementById("excepcion-modal-footer").innerHTML = `
      <button class="btn-sm" id="btn-excepcion-cancelar">Cancelar</button>
      <button class="btn-primary" id="btn-excepcion-confirmar">Activar por 3hs</button>`;
    document.getElementById("btn-excepcion-cancelar").addEventListener("click", _cerrarModalExcepcion);
    document.getElementById("btn-excepcion-confirmar").addEventListener("click", _confirmarExcepcion);
    document.getElementById("excepcion-modal-overlay").classList.remove("hidden");
  }

  function _cerrarModalExcepcion() {
    document.getElementById("excepcion-modal-overlay").classList.add("hidden");
  }

  async function _confirmarExcepcion() {
    const nombre = document.getElementById("excepcion-form-nombre").value.trim();
    const motivo = document.getElementById("excepcion-form-motivo").value.trim();
    if (!nombre) { App.toast("Falta tu nombre", "error"); return; }
    if (!motivo) { App.toast("Falta el motivo", "error"); return; }

    const btn = document.getElementById("btn-excepcion-confirmar");
    btn.disabled = true;
    try {
      await RailwayAPI.activarExcepcionSuitestensa(motivo, nombre);
      _cerrarModalExcepcion();
      App.toast("Excepción horaria activada por 3hs", "ok");
      await _cargarBannerExcepcion();
    } catch (err) {
      App.toast("Error al activar: " + err.message, "error");
      btn.disabled = false;
    }
  }

  async function _desactivarExcepcion() {
    const nombre = prompt("Tu nombre (para el registro):");
    if (nombre === null) return;
    if (!confirm("¿Desactivar la excepción horaria ahora?")) return;
    try {
      await RailwayAPI.desactivarExcepcionSuitestensa(nombre.trim() || "sin especificar");
      App.toast("Excepción horaria desactivada", "ok");
      await _cargarBannerExcepcion();
    } catch (err) {
      App.toast("Error al desactivar: " + err.message, "error");
    }
  }

  // ── render combinado: slots de agenda + turnos ────────────
  function _render(agendaDia, turnos, filtro, risDelDia) {
    risDelDia = risDelDia || [];
    const tbody  = document.getElementById("lista-tbody");
    const empty  = document.getElementById("lista-empty");
    const stats  = document.getElementById("lista-stats");

    const MIN_I = 0, MIN_F = 24*60;
    const fechaStr = API.fechaAStr(_fecha);

    // Construir mapa minutos → turno
    const turnoMap = {};
    for (const t of turnos) {
      turnoMap[t.mins] = t;
    }

    // Construir filas: un slot por cada entrada de la agenda (libres + ocupados)
    const filas = [];
    if (agendaDia && agendaDia.slots) {
      for (const s of agendaDia.slots) {
        if (s.mins < MIN_I || s.mins >= MIN_F) continue;
        if (s.tipo === "continuacion") continue;
        const turno = turnoMap[s.mins];
        filas.push({ slot: s, turno: turno || null, mins: s.mins, esRIS: false });
      }
    } else {
      for (const t of turnos) {
        filas.push({ slot: { tipo: "turno" }, turno: t, mins: t.mins, esRIS: false });
      }
    }

    // Agregar filas RIS intercaladas — si coincide con un turno propio
    // (mismo DNI o apellido), no se agrega como fila aparte: se le pegan
    // los hashes de RIS al turno para que esa fila pueda mostrar "Cargar
    // en Suitestensa" (antes se descartaban sin más, dejando un turno que
    // ya tiene su estudio en RIS sin ninguna forma de mandarlo a
    // Suitestensa — bug encontrado 27/8/2026, ver comentario de `hashes`
    // en rpc/ris.js#api_leerRISRango: esa era la idea original).
    const turnoPorDni      = new Map(turnos.map(t => [String(t.dni).trim().replace(/^0+/, ""), t]));
    const turnoPorApellido = new Map(turnos.map(t => [(t.apellido||"").trim().toUpperCase(), t]));
    for (const r of risDelDia) {
      const mins = _parseMins(r.hora);
      if (mins < MIN_I || mins >= MIN_F) continue;
      const dniRIS   = String(r.documento || "").replace(/[A-Z]+\s*/i,"").trim().replace(/^0+/,"");
      const apellRIS = String(r.apellido_nombre || "").split(",")[0].trim().toUpperCase();
      const turnoCoincidente = turnoPorDni.get(dniRIS) || turnoPorApellido.get(apellRIS);
      if (turnoCoincidente) {
        turnoCoincidente._risHashes = [...(turnoCoincidente._risHashes || []), ...(r.hashes || [])];
        continue;
      }
      filas.push({ slot: { tipo: "ris" }, turno: null, mins, esRIS: true, ris: r });
    }
    // Agregar turnos que no coinciden con ningún slot del grid
    const minsEnFilas = new Set(filas.filter(f=>f.turno).map(f=>f.turno.fila));
    for (const t of turnos) {
      if (!minsEnFilas.has(t.fila)) {
        filas.push({ slot: { tipo: "turno" }, turno: t, mins: t.mins, esRIS: false });
      }
    }
    filas.sort((a, b) => a.mins - b.mins);

    // Aplicar filtro
    const filasFiltradas = filtro
      ? filas.filter(f => {
          if (!f.turno) return false;
          return (f.turno.nombre + " " + f.turno.apellido).toLowerCase().includes(filtro.toLowerCase())
              || f.turno.dni.includes(filtro);
        })
      : filas;

    const presentes = turnos.filter(t => t.presente === "Presente").length;
    const cntRIS = risDelDia.length;
    stats.textContent = `${turnos.length} turnos · ${presentes} presentes · ${turnos.length - presentes} pendientes · ${filas.filter(f=>f.slot&&f.slot.tipo==="libre").length} libres${cntRIS > 0 ? ` · 📋 ${cntRIS} RIS` : ""}`;

    if (filasFiltradas.length === 0) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const esTecnico = Config.getRol() === "tecnico";

    // Mostrar contenedor correcto
    const listaContainer = document.getElementById("lista-container");
    if (esTecnico) {
      listaContainer.classList.add("tecnico-cards");
      listaContainer.classList.remove("admin-tabla");
    } else {
      listaContainer.classList.add("admin-tabla");
      listaContainer.classList.remove("tecnico-cards");
    }

    // Vista técnico: layout de tarjetas agrupado por horario
    if (esTecnico) {
      const contenedor = document.getElementById("lista-cards");
      if (contenedor) {
        // Agrupar filas por minutos
        const grupos = {};
        for (const fila of filasFiltradas) {
          if (!fila.turno && !fila.esRIS) continue;
          const key = fila.mins;
          if (!grupos[key]) grupos[key] = { mins: fila.mins, turnos: [], ris: [] };
          if (fila.esRIS)   grupos[key].ris.push(fila.ris);
          else if (fila.turno) grupos[key].turnos.push(fila.turno);
        }

        const minsOrdenados = Object.keys(grupos).map(Number).sort((a,b)=>a-b);

        contenedor.innerHTML = minsOrdenados.map(mins => {
          const g   = grupos[mins];
          const h   = String(Math.floor(mins/60)).padStart(2,"0");
          const m   = String(mins%60).padStart(2,"0");
          const hora = `${h}:${m}`;

          // Determinar cuántas columnas: max(turnos, ris) pero al menos 1
          const maxCols = Math.max(g.turnos.length, g.ris.length);
          const cards   = [];

          for (let i = 0; i < maxCols; i++) {
            const turno = g.turnos[i] || null;
            const ris   = g.ris[i]   || null;

            // Si hay turno + RIS → tarjeta dividida. OJO: este `ris` NO está
            // correlacionado con `turno` (el matcheo real por DNI/apellido ya
            // pasó más arriba y le pegó sus hashes a `turno._risHashes`) — acá
            // solo cayeron en el mismo índice de columna porque comparten
            // horario. Son dos pacientes distintos mostrados lado a lado.
            // Bug real 28/8/2026: esta tarjeta nunca tuvo botón de Suitestensa
            // para el lado RIS, así que un paciente sin turno propio que
            // compartía horario con otro que sí lo tenía quedaba sin forma de
            // cargarse — y si había 2 turnos + 2 RIS en el mismo horario,
            // AMBOS RIS cabían en tarjetas divididas y ninguno tenía botón.
            if (turno && ris) {
              const pres   = turno.presente === "Presente";
              const origenUp = (turno.origen||"").toUpperCase();
              const esInt  = origenUp.includes("INTERN");
              const presBadge = pres
                ? `<span class="btn-card-done">✓ Presente</span>`
                : `<button class="btn-card-pres" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;
              const hashesAttrRis = (ris.hashes || []).join(",");
              cards.push(`<div class="card-turno card-split ${pres?"presente":""} ${esInt?"card-int":""}">
                <div>
                  <div class="hora-big ${pres?"ok":""}">${hora}</div>
                  <div class="hora-sub">${origenUp}</div>
                </div>
                <div style="flex:1;display:flex;gap:8px;min-width:0">
                  <div class="card-body" style="flex:1;border-right:2px dashed #ddd;padding-right:8px">
                    <div class="card-nombre ${pres?"ok":""}">${turno.apellido}, ${turno.nombre}</div>
                    <div class="card-estudio">${turno.estudio}</div>
                    <div class="card-meta"><span class="card-dni">${turno.dni}</span>${turno.observaciones?`<span class="card-obs">${turno.observaciones}</span>`:""}</div>
                  </div>
                  <div class="card-body" style="flex:1;opacity:.7">
                    <div style="font-size:9px;font-weight:700;color:#aaa;margin-bottom:2px">RIS</div>
                    <div class="card-nombre" style="font-size:12px;font-style:italic;color:#888">${ris.apellido_nombre}</div>
                    <div class="card-estudio" style="color:#aaa">${ris.practica}</div>
                    <span class="suitestensa-estado" data-hashes="${hashesAttrRis}" style="display:block;font-size:10px"></span>
                    <button class="btn-suitestensa" data-hashes="${hashesAttrRis}" data-fecha="${fechaStr}" data-nombre="${ris.apellido_nombre}" style="margin-top:2px">Cargar en Suitestensa</button>
                  </div>
                </div>
                <div class="card-right">
                  ${esInt?`<span class="origen-tag-card int">Internación</span>`:""}
                  ${presBadge}
                  <button class="btn-card-anular" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}">Anular</button>
                </div>
              </div>`);
            }
            // Solo turno
            else if (turno) {
              const pres   = turno.presente === "Presente";
              const origenUp = (turno.origen||"").toUpperCase();
              const esInt  = origenUp.includes("INTERN");
              const presBadge = pres
                ? `<span class="btn-card-done">✓ Presente</span>`
                : `<button class="btn-card-pres" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;
              const risHashes = turno._risHashes || [];
              const hashesAttr = risHashes.join(",");
              const suitestensaHtml = risHashes.length
                ? `<span class="suitestensa-estado" data-hashes="${hashesAttr}" style="display:block;font-size:10px"></span>
                   <button class="btn-suitestensa" data-hashes="${hashesAttr}" data-fecha="${fechaStr}" data-nombre="${turno.nombre} ${turno.apellido}">Cargar en Suitestensa</button>`
                : "";
              cards.push(`<div class="card-turno ${pres?"presente":""} ${esInt?"card-int":""}">
                <div>
                  <div class="hora-big ${pres?"ok":""}">${hora}</div>
                  <div class="hora-sub">${origenUp}</div>
                </div>
                <div class="card-body">
                  <div class="card-nombre ${pres?"ok":""}">${turno.apellido}, ${turno.nombre}</div>
                  <div class="card-estudio">${turno.estudio}</div>
                  <div class="card-meta"><span class="card-dni">${turno.dni}</span>${turno.observaciones?`<span class="card-obs">${turno.observaciones}</span>`:""}</div>
                </div>
                <div class="card-right">
                  ${esInt?`<span class="origen-tag-card int">Internación</span>`:""}
                  ${presBadge}
                  <button class="btn-card-anular" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}">Anular</button>
                  ${suitestensaHtml}
                </div>
              </div>`);
            }
            // Solo RIS
            else if (ris) {
              const hashesAttr = (ris.hashes || []).join(",");
              cards.push(`<div class="row-ris">
                <div class="hora-ris">${hora}</div>
                <div class="ris-body">
                  <div class="ris-nombre">${ris.apellido_nombre}</div>
                  <div class="ris-estudio">${ris.practica}</div>
                </div>
                <div class="ris-acciones">
                  <span class="ris-badge">RIS</span>
                  <span class="suitestensa-estado" data-hashes="${hashesAttr}"></span>
                  <button class="btn-suitestensa" data-hashes="${hashesAttr}" data-fecha="${ris.fecha}" data-nombre="${ris.apellido_nombre}">Cargar en Suitestensa</button>
                </div>
              </div>`);
            }
          }
          return cards.join("");
        }).join("");

        // Bind botones
        contenedor.querySelectorAll(".btn-card-pres").forEach(btn => {
          btn.addEventListener("click", async () => {
            const fila   = parseInt(btn.dataset.fila);
            const nombre = btn.dataset.nombre;
            if (!confirm(`¿Dar presente a ${nombre}?`)) return;
            btn.disabled = true; btn.textContent = "Guardando…";
            try {
              await RailwayAPI.presente(fila);
              App.toast(`Presente: ${nombre}`, "ok");
              await cargar();
            } catch(err) {
              App.toast("Error: "+err.message, "error");
              btn.disabled = false; btn.textContent = "Presente";
            }
          });
        });

        contenedor.querySelectorAll(".btn-card-anular").forEach(btn => {
          btn.addEventListener("click", async () => {
            const fila   = parseInt(btn.dataset.fila);
            const nombre = btn.dataset.nombre;
            if (!confirm(`¿Anular el turno de ${nombre}?

Esta acción no se puede deshacer.`)) return;
            btn.disabled = true;
            try {
              await RailwayAPI.anular(fila);
              App.toast(`Turno anulado: ${nombre}`, "ok");
              await cargar();
            } catch(err) {
              App.toast("Error: "+err.message, "error");
              btn.disabled = false;
            }
          });
        });

        _bindBotonSuitestensa(contenedor);
      }
      document.getElementById("lista-empty").classList.toggle("hidden", filasFiltradas.some(f=>f.turno||f.esRIS));
      return;
    }

    tbody.innerHTML = filasFiltradas.map((fila) => {
      const { slot, turno, mins, esRIS } = fila;
      const h = String(Math.floor(mins/60)).padStart(2,"0");
      const m = String(mins%60).padStart(2,"0");
      const hora = `${h}:${m}`;

      // Técnico no ve slots libres ni continuaciones
      if (esTecnico && !turno && !esRIS) return "";

      // ── FILA RIS ──
      if (esRIS) {
        const r    = fila.ris;
        // Separar "APELLIDO, NOMBRE" en partes
        const partes   = (r.apellido_nombre || "").split(",");
        const apellido = (partes[0] || "").trim();
        const nombre   = (partes[1] || "").trim();
        // Extraer solo el número del documento
        const dniNum   = String(r.documento || "").replace(/^(DNI|CIBO|RP)\s*/i,"").trim();
        const hashesAttr = (r.hashes || []).join(",");
        return `<tr class="fila-ris-row">
          <td class="td-hora" style="color:#999;font-size:13px">${hora}</td>
          <td class="ris-nombre">${nombre}</td>
          <td class="ris-nombre">${apellido}</td>
          <td class="ris-dni">${dniNum}</td>
          <td class="ris-estudio">${r.practica}</td>
          <td><span class="ris-badge">RIS</span></td>
          <td><span class="suitestensa-estado" data-hashes="${hashesAttr}"></span></td>
          <td></td>
          <td><button class="btn-suitestensa" data-hashes="${hashesAttr}" data-fecha="${r.fecha}" data-nombre="${nombre} ${apellido}">Cargar en Suitestensa</button></td>
          <td></td>
        </tr>`;
      }

      // ── SLOT LIBRE — solo para administrativo ──
      if (slot.tipo === "libre") {
        if (esTecnico) return "";
        return `<tr class="fila-libre" data-mins="${mins}" data-fecha="${fechaStr}" style="cursor:pointer" title="Clic para asignar turno en este horario">
          <td class="td-hora" style="color:#aaa">${hora}</td>
          <td colspan="6" style="color:#bbb;font-style:italic;font-size:12px">
            <span style="color:#4a9e5c;font-weight:600">+ Libre</span> — clic para asignar turno
          </td>
          <td></td><td></td><td></td>
        </tr>`;
      }

      // ── BLOQUEO / FRANJA ──
      // Lista del día es para saber a quién mandar a la cola del resonador,
      // no para agendar — las franjas/restricciones (ej. "Solo sin
      // contraste", "Franja de descompresión") no son pacientes y no
      // tienen que aparecer acá para ningún rol, ni siquiera como fila
      // clickeable (bug encontrado 27/8/2026: inundaban la lista con una
      // fila por cada slot vacío de la franja).
      if (!turno) {
        if (slot.tipo === "franja" || slot.tipo === "franja_origen") return "";
        const bg    = slot.color || "#f5f5f5";
        const label = slot.label || slot.tipo || "";
        // Bloqueo puro — ocultar en vista técnico
        if (esTecnico) return "";
        return `<tr style="background:${bg}18">
          <td class="td-hora" style="color:#bbb">${hora}</td>
          <td colspan="6" style="color:#bbb;font-size:11px;font-style:italic">${label}</td>
          <td></td><td></td><td></td>
        </tr>`;
      }

      // ── TURNO ASIGNADO ──
      const est  = _origen(turno.origen);
      const pres = turno.presente === "Presente";
      const rowCls = pres ? "presente-row" : "";
      const presBadge = pres
        ? `<span class="presente-badge">✅ Presente<br><span style="font-weight:400;font-size:10px;color:#666">${turno.tsPresente||""}</span></span>`
        : `<button class="btn-presente" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;

      // Turno con estudio ya reflejado en RIS (mismo DNI/apellido — ver
      // más arriba) → puede mandarse a Suitestensa igual que una fila de
      // RIS. Todavía no está en RIS → nada que hacer acá hasta que llegue
      // (no hay ningún hash para inventarle, ver rpc/ris.js).
      const risHashes = turno._risHashes || [];
      const hashesAttr = risHashes.join(",");
      const suitestensaHtml = risHashes.length
        ? `<span class="suitestensa-estado" data-hashes="${hashesAttr}" style="display:block;font-size:10px;margin-top:4px"></span>
           <button class="btn-suitestensa" data-hashes="${hashesAttr}" data-fecha="${fechaStr}" data-nombre="${turno.nombre} ${turno.apellido}" style="margin-top:2px">Cargar en Suitestensa</button>`
        : "";

      return `<tr class="${rowCls}" data-fila="${turno.fila}">
        <td class="td-hora">${hora}</td>
        <td class="td-nombre">${turno.nombre}</td>
        <td>${turno.apellido}</td>
        <td class="td-dni">${turno.dni}</td>
        <td>${turno.estudio}</td>
        <td><span class="origen-tag" style="background:${est.bg};border-color:${est.border};color:${est.text}">${turno.origen}</span></td>
        <td class="td-obs">${turno.observaciones||""}</td>
        <td class="td-asigno" style="font-size:12px;color:var(--text-2)">${turno.tecnicoAsigno||""}</td>
        <td>${presBadge}</td>
        <td>
          <button class="btn-sm btn-anular" data-fila="${turno.fila}" data-nombre="${turno.nombre} ${turno.apellido}" style="color:#c62828;border-color:#c62828">Anular</button>
          ${suitestensaHtml}
        </td>
      </tr>`;
    }).join("");

    // ── click en slot libre → asignar turno ──
    tbody.querySelectorAll(".fila-libre").forEach(tr => {
      tr.addEventListener("click", () => {
        const mins  = parseInt(tr.dataset.mins);
        const fecha = tr.dataset.fecha;
        const h = String(Math.floor(mins/60)).padStart(2,"0");
        const m = String(mins%60).padStart(2,"0");
        App.abrirTurnoConFechaHora(fecha, `${h}:${m}`);
      });
    });

    // ── botón presente ──
    tbody.querySelectorAll(".btn-presente").forEach(btn => {
      btn.addEventListener("click", async () => {
        const fila   = parseInt(btn.dataset.fila);
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Dar presente a ${nombre}?`)) return;
        btn.disabled = true; btn.textContent = "Guardando…";
        try {
          await RailwayAPI.presente(fila);
          App.toast(`Presente: ${nombre}`, "ok");
          await cargar();
        } catch(err) {
          App.toast("Error: "+err.message, "error");
          btn.disabled = false; btn.textContent = "Presente";
        }
      });
    });

    // ── botón anular ──
    tbody.querySelectorAll(".btn-anular").forEach(btn => {
      btn.addEventListener("click", async () => {
        const fila   = parseInt(btn.dataset.fila);
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Anular el turno de ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
        btn.disabled = true;
        try {
          await RailwayAPI.anular(fila);
          App.toast(`Turno anulado: ${nombre}`, "ok");
          await cargar();
        } catch(err) {
          App.toast("Error: "+err.message, "error");
          btn.disabled = false;
        }
      });
    });

    _bindBotonSuitestensa(tbody);
  }

  // ── carga ─────────────────────────────────────────────────
  async function cargar() {
    const loading  = document.getElementById("lista-loading");
    const filtro   = document.getElementById("lista-filtro").value;
    _actualizarLabel();
    loading.classList.remove("hidden");
    try {
      const fechaStr = API.fechaAStr(_fecha);
      const [agendaArr, turnos, risPorFecha] = await Promise.all([
        RailwayAPI.agenda(fechaStr, 1, 20),
        RailwayAPI.turnos(fechaStr),
        RailwayAPI.leerRISRango(fechaStr, 1).catch(() => ({}))
      ]);
      const risDelDia = risPorFecha[fechaStr] || [];
      const agendaDia = agendaArr && agendaArr[0] ? agendaArr[0] : null;
      _render(agendaDia, turnos, filtro, risDelDia);
      _cargarBannerExcepcion();
    } catch(err) {
      App.toast("Error cargando lista: "+err.message, "error");
      document.getElementById("lista-tbody").innerHTML = "";
      document.getElementById("lista-empty").textContent = "Error: "+err.message;
      document.getElementById("lista-empty").classList.remove("hidden");
    } finally {
      loading.classList.add("hidden");
    }
  }

  function _actualizarLabel() {
    const DIAS  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    document.getElementById("lista-fecha-label").textContent =
      `${DIAS[_fecha.getDay()]} ${_fecha.getDate()} de ${MESES[_fecha.getMonth()]}`;
  }

  function _parseMins(hora) {
    if (!hora) return 0;
    const s   = String(hora).trim();
    const isPM = /p\.m\./i.test(s);
    const isAM = /a\.m\./i.test(s);
    const p   = s.replace(/a\.m\.|p\.m\./gi,"").trim().split(":");
    let h = parseInt(p[0]||0);
    const m = parseInt(p[1]||0);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h*60 + m;
  }

  function setFecha(fechaStr) {
    const p = fechaStr.split("/");
    _fecha = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
    _fecha.setHours(0,0,0,0);
  }

  function init() {
    document.getElementById("btn-dia-ant").onclick = () => {
      _fecha.setDate(_fecha.getDate()-1); cargar();
    };
    document.getElementById("btn-dia-sig").onclick = () => {
      _fecha.setDate(_fecha.getDate()+1); cargar();
    };
    document.getElementById("btn-lista-hoy").onclick = () => {
      _fecha = new Date(); _fecha.setHours(0,0,0,0); cargar();
    };
    document.getElementById("lista-filtro").addEventListener("input", () => cargar());

    document.getElementById("btn-excepcion-modal-cerrar").addEventListener("click", _cerrarModalExcepcion);
    document.getElementById("excepcion-modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "excepcion-modal-overlay") _cerrarModalExcepcion();
    });
  }

  return { init, cargar, setFecha };
})();