// js/views/lista.js — Vista lista del día (técnico + administrativo)

const ListaView = (() => {
  let _fecha  = new Date();
  _fecha.setHours(0, 0, 0, 0);
  // Cache de duracion estimada por texto de practica de RIS (evita pedir
  // de nuevo lo mismo en cada re-render del mismo dia). El calculo en si
  // vive en el backend (api_tiempoPractica_estimarDuraciones, misma
  // formula ya confirmada por el usuario el 14/8/2026 para el sugeridor
  // de sobreturno -- no se reinventa aca) porque requiere clasificar cada
  // tramo a su region (lib/clasificacion.js), logica que solo existe del
  // lado de Node. Bug real 9/9/2026 que motiva esto: esta vista insertaba
  // cada entrada de RIS como una fila puntual sin ocupar los minutos que
  // realmente dura, dejando "+ Libre" minutos que en la turnera real de
  // SIGEHOS estaban asignados (confirmado por el usuario, DNI 35161855 y
  // 4604880).
  const _duracionRISCache = new Map();

  async function _cargarDuracionesRIS(risDelDia) {
    const faltantes = risDelDia
      .map(r => r.practica)
      .filter(p => p && !_duracionRISCache.has(p));
    if (faltantes.length === 0) return;
    try {
      const duraciones = await RailwayAPI.estimarDuracionesPractica(faltantes);
      faltantes.forEach((p, i) => _duracionRISCache.set(p, duraciones[i] || 20));
    } catch (_) {
      faltantes.forEach(p => _duracionRISCache.set(p, 20)); // fallback conservador, no bloquea el render
    }
  }

  function _duracionRIS(practica) {
    return _duracionRISCache.get(practica) || 20;
  }

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

  // Carga manual en Suitestensa (26/8/2026) — dada de baja del todo
  // 22/9/2026 (bot-cargar-suitestensa.js pausado, "ya no se usa"): se
  // sacaron los botones "Cargar en Suitestensa" de todas las tarjetas/
  // filas de esta vista (ver _render más abajo).

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
    // (mismo DNI o apellido), no se agrega como fila aparte (evita
    // mostrar dos veces al mismo paciente).
    const turnoPorDni      = new Map(turnos.map(t => [String(t.dni).trim().replace(/^0+/, ""), t]));
    const turnoPorApellido = new Map(turnos.map(t => [(t.apellido||"").trim().toUpperCase(), t]));
    // Ventanas [mins, mins+duracion+margen) realmente ocupadas por un
    // estudio de RIS sin turno propio — bug real 9/9/2026 (DNI 35161855
    // ACOSTA EDUARDO y DNI 96365423 BALDERA JORGE): esta vista insertaba
    // la fila de RIS en un solo instante, dejando los slots siguientes
    // marcados "+ Libre" aunque el resonador siguiera ocupado de verdad.
    // MARGEN_ENTRE_ESTUDIOS_MIN cubre el cambio de paciente/sala entre un
    // estudio y el siguiente (confirmado por el usuario: ningún estudio
    // real arranca a los 5-10' de que termina el anterior, aunque la
    // duración estimada por región dé ese resto "libre" en el papel — el
    // contraste compartido entre tramos de un mismo estudio combinado,
    // ej. "cerebro con contraste · órbitas" sin repetir "con contraste"
    // en el segundo tramo, es una fuente conocida de subestimar la
    // duración real). Se registran acá las ventanas y se filtran los
    // slots "libre" que caen adentro, recién después de armar `filas`.
    const MARGEN_ENTRE_ESTUDIOS_MIN = 10;
    const ventanasOcupadasRIS = [];
    for (const r of risDelDia) {
      const mins = _parseMins(r.hora);
      if (mins < MIN_I || mins >= MIN_F) continue;
      const dniRIS   = String(r.documento || "").replace(/[A-Z]+\s*/i,"").trim().replace(/^0+/,"");
      const apellRIS = String(r.apellido_nombre || "").split(",")[0].trim().toUpperCase();
      const turnoCoincidente = turnoPorDni.get(dniRIS) || turnoPorApellido.get(apellRIS);
      if (turnoCoincidente) {
        continue;
      }
      filas.push({ slot: { tipo: "ris" }, turno: null, mins, esRIS: true, ris: r });
      ventanasOcupadasRIS.push([mins, mins + _duracionRIS(r.practica) + MARGEN_ENTRE_ESTUDIOS_MIN]);
    }
    // Agregar turnos que no coinciden con ningún slot del grid
    const minsEnFilas = new Set(filas.filter(f=>f.turno).map(f=>f.turno.fila));
    for (const t of turnos) {
      if (!minsEnFilas.has(t.fila)) {
        filas.push({ slot: { tipo: "turno" }, turno: t, mins: t.mins, esRIS: false });
      }
    }
    if (ventanasOcupadasRIS.length) {
      const filasSinHuecosRIS = filas.filter(f => {
        if (!f.slot || f.slot.tipo !== "libre") return true;
        return !ventanasOcupadasRIS.some(([desde, hasta]) => f.mins >= desde && f.mins < hasta);
      });
      filas.length = 0;
      filas.push(...filasSinHuecosRIS);
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
            // pasó más arriba, ver el `continue` de la sección de RIS) — acá
            // solo cayeron en el mismo índice de columna porque comparten
            // horario. Son dos pacientes distintos mostrados lado a lado.
            if (turno && ris) {
              const pres   = turno.presente === "Presente";
              const origenUp = (turno.origen||"").toUpperCase();
              const esInt  = origenUp.includes("INTERN");
              const presBadge = pres
                ? `<span class="btn-card-done">✓ Presente</span>`
                : `<button class="btn-card-pres" data-turno-id="${turno.turnoId}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;
              cards.push(`<div class="card-turno card-split ${pres?"presente":""} ${esInt?"card-int":""}">
                <div>
                  <div class="hora-big ${pres?"ok":""}">${hora}</div>
                  <div class="hora-sub">${origenUp}</div>
                </div>
                <div style="flex:1;display:flex;gap:8px;min-width:0">
                  <div class="card-body" style="flex:1;border-right:2px dashed #ddd;padding-right:8px">
                    <div class="card-nombre ${pres?"ok":""}">${turno.apellido}, ${turno.nombre}</div>
                    <div class="card-estudio">${turno.estudio}</div>
                    <div class="card-meta"><span class="card-dni">${turno.dni}</span>${turno.observaciones?`<span class="card-obs-icon" title="${turno.observaciones.replace(/"/g,'&quot;')}">📝</span>`:""}</div>
                    ${turno.creadoEn?`<div class="card-obs" style="opacity:.6">🗓️ Cargado el: ${turno.creadoEn}</div>`:""}
                    ${turno.tecnicoAsigno?`<div class="card-obs" style="opacity:.6">👤 ${turno.tecnicoAsigno}</div>`:""}
                  </div>
                  <div class="card-body" style="flex:1;opacity:.7">
                    <div style="font-size:9px;font-weight:700;color:#aaa;margin-bottom:2px">RIS</div>
                    <div class="card-nombre" style="font-size:12px;font-style:italic;color:#888">${ris.apellido_nombre}</div>
                    <div class="card-estudio" style="color:#aaa">${ris.practica}</div>
                  </div>
                </div>
                <div class="card-right">
                  ${esInt?`<span class="origen-tag-card int">Internación</span>`:""}
                  ${presBadge}
                  <button class="btn-card-anular" data-turno-id="${turno.turnoId}" data-nombre="${turno.nombre} ${turno.apellido}">Anular</button>
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
                : `<button class="btn-card-pres" data-turno-id="${turno.turnoId}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;
              cards.push(`<div class="card-turno ${pres?"presente":""} ${esInt?"card-int":""}">
                <div>
                  <div class="hora-big ${pres?"ok":""}">${hora}</div>
                  <div class="hora-sub">${origenUp}</div>
                </div>
                <div class="card-body">
                  <div class="card-nombre ${pres?"ok":""}">${turno.apellido}, ${turno.nombre}</div>
                  <div class="card-estudio">${turno.estudio}</div>
                  <div class="card-meta"><span class="card-dni">${turno.dni}</span>${turno.observaciones?`<span class="card-obs-icon" title="${turno.observaciones.replace(/"/g,'&quot;')}">📝</span>`:""}</div>
                  ${turno.creadoEn?`<div class="card-obs" style="opacity:.6">🗓️ Cargado el: ${turno.creadoEn}</div>`:""}
                  ${turno.tecnicoAsigno?`<div class="card-obs" style="opacity:.6">👤 ${turno.tecnicoAsigno}</div>`:""}
                </div>
                <div class="card-right">
                  ${esInt?`<span class="origen-tag-card int">Internación</span>`:""}
                  ${presBadge}
                  <button class="btn-card-anular" data-turno-id="${turno.turnoId}" data-nombre="${turno.nombre} ${turno.apellido}">Anular</button>
                </div>
              </div>`);
            }
            // Solo RIS
            else if (ris) {
              cards.push(`<div class="row-ris">
                <div class="hora-ris">${hora}</div>
                <div class="ris-body">
                  <div class="ris-nombre">${ris.apellido_nombre}</div>
                  <div class="ris-estudio">${ris.practica}</div>
                </div>
                <div class="ris-acciones">
                  <span class="ris-badge">RIS</span>
                </div>
              </div>`);
            }
          }
          return cards.join("");
        }).join("");

        // Bind botones
        contenedor.querySelectorAll(".btn-card-pres").forEach(btn => {
          btn.addEventListener("click", async () => {
            const turnoId = btn.dataset.turnoId;
            const nombre = btn.dataset.nombre;
            if (!confirm(`¿Dar presente a ${nombre}?`)) return;
            btn.disabled = true; btn.textContent = "Guardando…";
            try {
              await RailwayAPI.presente(turnoId);
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
            const turnoId = btn.dataset.turnoId;
            const nombre = btn.dataset.nombre;
            if (!confirm(`¿Anular el turno de ${nombre}?

Esta acción no se puede deshacer.`)) return;
            btn.disabled = true;
            try {
              await RailwayAPI.anular(turnoId);
              App.toast(`Turno anulado: ${nombre}`, "ok");
              await cargar();
            } catch(err) {
              App.toast("Error: "+err.message, "error");
              btn.disabled = false;
            }
          });
        });
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
        return `<tr class="fila-ris-row">
          <td class="td-hora" style="color:#999;font-size:13px">${hora}</td>
          <td class="ris-nombre">${nombre}</td>
          <td class="ris-nombre">${apellido}</td>
          <td class="ris-dni">${dniNum}</td>
          <td class="ris-estudio">${r.practica}</td>
          <td><span class="ris-badge">RIS</span></td>
          <td></td>
          <td></td>
          <td></td>
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
        : `<button class="btn-presente" data-turno-id="${turno.turnoId}" data-nombre="${turno.nombre} ${turno.apellido}">Presente</button>`;

      return `<tr class="${rowCls}" data-fila="${turno.fila}" data-turno-id="${turno.turnoId}">
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
          <button class="btn-sm btn-anular" data-turno-id="${turno.turnoId}" data-nombre="${turno.nombre} ${turno.apellido}" style="color:#c62828;border-color:#c62828">Anular</button>
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
        const turnoId = btn.dataset.turnoId;
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Dar presente a ${nombre}?`)) return;
        btn.disabled = true; btn.textContent = "Guardando…";
        try {
          await RailwayAPI.presente(turnoId);
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
        const turnoId = btn.dataset.turnoId;
        const nombre = btn.dataset.nombre;
        if (!confirm(`¿Anular el turno de ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
        btn.disabled = true;
        try {
          await RailwayAPI.anular(turnoId);
          App.toast(`Turno anulado: ${nombre}`, "ok");
          await cargar();
        } catch(err) {
          App.toast("Error: "+err.message, "error");
          btn.disabled = false;
        }
      });
    });
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
      await _cargarDuracionesRIS(risDelDia);
      const agendaDia = agendaArr && agendaArr[0] ? agendaArr[0] : null;
      _render(agendaDia, turnos, filtro, risDelDia);
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
  }

  return { init, cargar, setFecha };
})();