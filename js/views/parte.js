// js/views/parte.js — Lector de Parte Diario PDF (port del script Python)

const ParteView = (() => {
  let _filas    = [];
  let _fecha    = "";
  let _pdfLib   = null;

  // ── Cargar PDF.js desde CDN ───────────────────────────────
  async function _cargarPDFJS() {
    if (_pdfLib) return _pdfLib;
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) { _pdfLib = window.pdfjsLib; resolve(_pdfLib); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        _pdfLib = window.pdfjsLib;
        resolve(_pdfLib);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Cargar SheetJS ────────────────────────────────────────
  async function _cargarXLSX() {
    if (window.XLSX) return window.XLSX;
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload  = () => resolve(window.XLSX);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  PARSER — fiel al script Python
  // ══════════════════════════════════════════════════════════

  const RE_HORA   = /(?<!\d)(\d{1,2}:\d{2})(?!\d)/g;
  const RE_DOC    = /(DNI|CIBO|RP)\s+(\d+)/i;
  const RE_NOMBRE = /\b([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})*,\s*[A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})*)\b/;
  const RE_PRAC   = /((?:RESONANCIA|ANGIORRESON|COLANGIO|TOMOGRAF|ECOGRAF|DENSITOM|RX\b|TAC\b).+?)(?=\bDNI\b|\bCIBO\b|\bRP\b|\bTURNO\b|\bSOBRETURNO\b|$)/is;
  const RE_EMAIL  = /\S+@\S+/g;
  const RE_FIN    = /\b(TURNO|SOBRETURNO|ESTADO|AS\b|AU\b|CN\b)/i;
  const RE_ESTADO = /\d{3,}\s+([A-Z]{2,3})\s*$/;
  const CANCELADOS = new Set(["CA","CN","CAN","NP","AUS"]);
  const IGNORAR    = ["TIPO DE","APELLIDO Y","PARTE DIARIO","HOSP SANTOJANNI"];

  function _limpiar(s) { return s.replace(/\s+/g, " ").trim(); }

  function _procesarBloque(hora, bloque) {
    bloque = _limpiar(bloque);

    // Filtrar cancelados
    const mEstado = RE_ESTADO.exec(bloque);
    if (mEstado && CANCELADOS.has(mEstado[1].toUpperCase())) return null;

    // Documento
    const mDoc = RE_DOC.exec(bloque);
    if (!mDoc) return null;
    const documento = `${mDoc[1].toUpperCase()} ${mDoc[2]}`;
    const posDoc    = bloque.indexOf(mDoc[0]);
    const posDocEnd = posDoc + mDoc[0].length;

    // Práctica — antes del doc
    let practica = "";
    const antes = bloque.slice(0, posDoc);
    const mP = RE_PRAC.exec(antes);
    if (mP) {
      practica = _limpiar(mP[1]);
    } else {
      // Después del doc (formato Técnico)
      let despues = bloque.slice(posDocEnd).replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, "");
      const mP2 = RE_PRAC.exec(despues);
      if (mP2) practica = _limpiar(mP2[1]);
    }
    if (practica) practica = RE_FIN.exec(practica)
      ? practica.slice(0, RE_FIN.exec(practica).index).trim()
      : practica;

    // Apellido y nombre
    const bloquesinEmail = bloque.replace(RE_EMAIL, "");
    const nombres = [];
    let m;
    const reN = new RegExp(RE_NOMBRE.source, "g");
    while ((m = reN.exec(bloquesinEmail)) !== null) nombres.push(_limpiar(m[1]));

    let apellido = "";
    for (const n of nombres) {
      if (n.length > 4 && !IGNORAR.some(ig => n.toUpperCase().includes(ig))) {
        apellido = n; break;
      }
    }

    if (!documento || !apellido) return null;
    return { hora, documento, apellido_nombre: apellido, practica: _acortarPractica(practica) };
  }

  // ── Acortar práctica: quita prefijos largos y deja solo región + modalidad ──
  function _acortarPractica(practica) {
    if (!practica) return "";

    // Separar por " - " para manejar múltiples estudios
    const partes = practica.split(/\s*-\s*/);
    const acortadas = partes.map(p => {
      let s = p.trim().toUpperCase();

      // Quitar prefijos comunes
      const prefijos = [
        "RESONANCIA MAGNETICA DE ",
        "RESONANCIA MAGNETICA FUNCIONAL DE ",
        "RESONANCIA MAGNETICA ",
        "ANGIORRESONANCIA DE ",
        "ANGIORRESONANCIA ",
        "COLANGIORRESONANCIA DE ",
        "COLANGIORRESONANCIA ",
        "COLANGIO RESONANCIA DE ",
        "COLANGIO-RESONANCIA DE ",
      ];
      for (const pref of prefijos) {
        if (s.startsWith(pref)) { s = s.slice(pref.length); break; }
      }

      // Capitalizar primera letra de cada palabra clave
      return s.charAt(0) + s.slice(1).toLowerCase();
    });

    return acortadas.join(" · ");
  }

  function _parsearTexto(texto) {
    // Fecha
    let fecha = "";
    let mF = /FECHA[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(texto);
    if (mF) fecha = mF[1];
    else {
      mF = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/.exec(texto);
      if (mF) fecha = mF[1];
    }

    // Dividir por hora
    const textoPlano = _limpiar(texto);
    const reH = /(?<!\d)(\d{1,2}:\d{2})(?!\d)/g;
    const partes = textoPlano.split(reH);

    const registros = [];
    for (let i = 0; i < partes.length; i++) {
      if (/^\d{1,2}:\d{2}$/.test(partes[i].trim())) {
        const hora   = partes[i].trim();
        const bloque = partes[i + 1] || "";
        const rec    = _procesarBloque(hora, bloque);
        if (rec) registros.push(rec);
        i++;
      }
    }

    // Deduplicar
    const vistos = new Set();
    const unicos = [];
    for (const r of registros) {
      const clave = `${r.hora}|${r.documento}`;
      if (!vistos.has(clave)) { vistos.add(clave); unicos.push(r); }
    }

    return { fecha, filas: unicos };
  }

  // ── Extraer texto del PDF ─────────────────────────────────
  async function _extraerTexto(arrayBuffer) {
    const lib  = await _cargarPDFJS();
    const pdf  = await lib.getDocument({ data: arrayBuffer }).promise;
    let texto  = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      texto += content.items.map(i => i.str).join(" ") + "\n";
    }
    return texto;
  }

  // ══════════════════════════════════════════════════════════
  //  RENDER TABLA
  // ══════════════════════════════════════════════════════════

  function _render(filas, filtro) {
    const tbody = document.getElementById("parte-tbody");
    const info  = document.getElementById("parte-info");

    const lista = filtro
      ? filas.filter(f =>
          Object.values(f).some(v => v.toLowerCase().includes(filtro.toLowerCase())))
      : filas;

    info.textContent = filtro
      ? `${lista.length} de ${filas.length} registros`
      : `${filas.length} registros`;

    tbody.innerHTML = lista.map((f, i) => `
      <tr class="${i%2===0?"parte-par":"parte-impar"}">
        <td style="text-align:center;font-weight:700;color:var(--navy)">${i+1}</td>
        <td style="text-align:center;font-weight:700;font-size:15px">${f.hora}</td>
        <td style="text-align:center;font-family:monospace">${f.documento}</td>
        <td style="font-weight:600">${f.apellido_nombre}</td>
        <td style="color:var(--text-2)">${f.practica}</td>
      </tr>`).join("");
  }

  // ── Exportar Excel ────────────────────────────────────────
  async function _exportarExcel() {
    if (!_filas.length) return;
    const XLSX = await _cargarXLSX();

    const datos = [
      ["N°","HORA","DOCUMENTO","APELLIDO Y NOMBRE","TIPO DE PRÁCTICA"],
      ..._filas.map((f,i) => [i+1, f.hora, f.documento, f.apellido_nombre, f.practica])
    ];

    const ws = XLSX.utils.aoa_to_sheet(datos);
    ws["!cols"] = [{wch:5},{wch:8},{wch:16},{wch:30},{wch:55}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parte Diario");

    const fn = `Parte_Diario_${(_fecha||"").replace(/\//g,"-")}.xlsx`;
    XLSX.writeFile(wb, fn);
    App.toast(`Excel descargado: ${fn}`, "ok");
  }

  // ── Copiar al portapapeles ────────────────────────────────
  function _copiar() {
    if (!_filas.length) return;
    const lineas = [
      `Fecha: ${_fecha}`,
      "HORA\tDOCUMENTO\tAPELLIDO Y NOMBRE\tTIPO DE PRÁCTICA",
      ..._filas.map(f => `${f.hora}\t${f.documento}\t${f.apellido_nombre}\t${f.practica}`)
    ];
    navigator.clipboard.writeText(lineas.join("\n"))
      .then(() => App.toast(`${_filas.length} registros copiados al portapapeles`, "ok"))
      .catch(() => App.toast("Error al copiar", "error"));
  }

  // ── Procesar archivo ──────────────────────────────────────
  async function _procesarArchivo(file) {
    if (!file || file.type !== "application/pdf") {
      App.toast("Seleccioná un archivo PDF válido.", "error"); return;
    }

    const zona     = document.getElementById("parte-dropzone");
    const progress = document.getElementById("parte-progress");
    const tabla    = document.getElementById("parte-tabla-wrap");

    zona.classList.add("hidden");
    progress.classList.remove("hidden");
    progress.textContent = "⏳ Leyendo PDF...";

    try {
      const buffer = await file.arrayBuffer();
      progress.textContent = "⏳ Extrayendo texto...";
      const texto  = await _extraerTexto(buffer);
      progress.textContent = "⏳ Procesando registros...";
      const result = _parsearTexto(texto);

      _fecha = result.fecha;
      _filas = result.filas;

      document.getElementById("parte-fecha-label").textContent =
        _fecha ? `Fecha del parte: ${_fecha}` : "Fecha no detectada";
      document.getElementById("parte-archivo-label").textContent = `📄 ${file.name}`;
      document.getElementById("btn-parte-excel").disabled = false;
      document.getElementById("btn-parte-copiar").disabled = false;
      document.getElementById("btn-parte-ris").disabled = false;
      document.getElementById("parte-filtro").value = "";

      _render(_filas, "");
      progress.classList.add("hidden");
      tabla.classList.remove("hidden");
      App.toast(`${_filas.length} registros cargados`, "ok");
    } catch(err) {
      progress.classList.add("hidden");
      zona.classList.remove("hidden");
      App.toast("Error al procesar el PDF: " + err.message, "error");
    }
  }

  // ── Cargar a agenda RIS ──────────────────────────────────
  // ── Parser Excel del parte estadístico ──────────────────
  async function _parsearExcelRIS(file) {
    const btn = document.getElementById("btn-parte-excel-ris");
    btn.disabled = true; btn.textContent = "⏳ Procesando…";

    try {
      // Cargar SheetJS si no está disponible
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const data = await file.arrayBuffer();
      const wb   = window.XLSX.read(data, { type: "array", cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "dd/mm/yyyy" });

      // Buscar fecha en fila 3 (índice 2), columna F (índice 5)
      let fechaStr = "";
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const row = rows[i];
        for (let j = 0; j < row.length; j++) {
          if (String(row[j]||"").trim() === "FECHA:" && row[j+1]) {
            fechaStr = String(row[j+1]).trim();
            break;
          }
        }
        if (fechaStr) break;
      }

      if (!fechaStr) {
        App.toast("No se encontró la fecha en el Excel", "error");
        return;
      }

      // Normalizar fecha a dd/MM/yyyy
      if (fechaStr.includes("-")) {
        const p = fechaStr.split("-");
        fechaStr = `${p[2]}/${p[1]}/${p[0]}`;
      }

      // Encontrar fila de headers (HORA, DOCUMENTO, etc.)
      let dataStart = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] && String(rows[i][0]||"").trim().toUpperCase() === "HORA") {
          dataStart = i + 1;
          break;
        }
      }

      if (dataStart === -1) {
        App.toast("No se encontró la tabla de datos en el Excel", "error");
        return;
      }

      // Parsear filas de datos
      // Cols: 0=HORA, 1=DOCUMENTO, 2=FEC_NAC, 3=APELLIDO Y NOMBRE, 4=PRÁCTICA, 5=TIPO_ATENCION, 6=ESTADO, 7=DOMICILIO, 8=COBERTURA, 9=AMBITO
      const filas = [];
      const vistos = new Set(); // dedup por documento

      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const hora      = String(row[0]||"").trim();
        const documento = String(row[1]||"").trim();
        const nombre    = String(row[3]||"").trim();
        let   practica  = String(row[4]||"").trim();

        const estado    = String(row[6]||"").trim().toUpperCase();
        const cobertura = String(row[8]||"").trim();
        const ambito    = String(row[9]||"").trim();

        if (!hora || !documento || !nombre) continue;
        if (estado === "CA") continue; // Turno cancelado — no cargar
        // Mapear códigos de estado a texto legible
        const estadoMap = { "AS": "Asignado", "PR": "Presente", "CA": "Cancelado", "AT": "Atendido", "AU": "Ausente", "SU": "Suspendido" };
        const estadoTexto = estadoMap[estado] || estado;

        // Agrupar prácticas del mismo paciente (mismo documento)
        const docKey = documento.replace(/^DNI\s*/i,"").trim();
        if (vistos.has(docKey)) {
          const existente = filas.find(f => f.documento.replace(/^DNI\s*/i,"").trim() === docKey);
          if (existente) {
            const practicaNorm = _acortarPractica(practica);
            if (!existente.practica.includes(practicaNorm)) {
              existente.practica += " · " + practicaNorm;
            }
          }
          continue;
        }

        vistos.add(docKey);
        filas.push({
          hora,
          documento,
          apellido_nombre: nombre,
          practica:   _acortarPractica(practica),
          cobertura,
          ambito,
          estado: estadoTexto
        });
      }

      if (filas.length === 0) {
        App.toast("No se encontraron datos en el Excel", "error");
        return;
      }

      // Confirmar y cargar
      if (!confirm(`Excel del ${fechaStr}: ${filas.length} pacientes encontrados.

¿Cargar a la agenda RIS?`)) return;

      btn.textContent = "⏳ Cargando…";
      const resultado = await API.escribirRIS(fechaStr, filas);
      App.toast(`✅ ${resultado.mensaje}`, "ok");

    } catch(err) {
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "📊 Cargar Excel RIS";
    }
  }

  // ── Actualizar estados desde Excel ──────────────────────
  async function _actualizarEstados(file) {
    const btn = document.getElementById("btn-actualizar-estados");
    btn.disabled = true; btn.textContent = "⏳ Actualizando…";

    try {
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const data = await file.arrayBuffer();
      const wb   = window.XLSX.read(data, { type: "array", cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "dd/mm/yyyy" });

      // Buscar fecha
      let fechaStr = "";
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const row = rows[i];
        for (let j = 0; j < (row||[]).length; j++) {
          if (String(row[j]||"").trim() === "FECHA:" && row[j+1]) {
            fechaStr = String(row[j+1]).trim();
            break;
          }
        }
        if (fechaStr) break;
      }
      if (!fechaStr) { App.toast("No se encontró la fecha en el Excel", "error"); return; }
      if (fechaStr.includes("-")) {
        const p = fechaStr.split("-");
        fechaStr = `${p[2]}/${p[1]}/${p[0]}`;
      }

      // Buscar inicio de datos
      let dataStart = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] && String(rows[i][0]||"").trim().toUpperCase() === "HORA") {
          dataStart = i + 1; break;
        }
      }
      if (dataStart === -1) { App.toast("No se encontró la tabla de datos", "error"); return; }

      const estadoMap = { "AS": "Asignado", "PR": "Presente", "AT": "Atendido", "CA": "Cancelado", "AU": "Ausente", "SU": "Suspendido" };
      const actualizaciones = [];
      const vistos = new Set();

      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const hora      = String(row[0]||"").trim();
        const documento = String(row[1]||"").trim();
        const estado    = String(row[6]||"").trim().toUpperCase();
        if (!hora || !documento) continue;

        const docKey = documento.replace(/^DNI\s*/i,"").trim();
        if (vistos.has(docKey)) continue;
        vistos.add(docKey);

        actualizaciones.push({
          hora,
          documento,
          estado: estadoMap[estado] || estado,
          cancelado: estado === "CA"
        });
      }

      if (!confirm(`Excel del ${fechaStr}: actualizar estados de ${actualizaciones.length} pacientes?

Solo se modificará la columna ESTADO en BD_RIS.`)) return;

      const res = await API.actualizarEstadosRIS(fechaStr, actualizaciones);
      App.toast(`✅ ${res.mensaje}`, "ok");

    } catch(err) {
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🔄 Actualizar estados";
    }
  }

  async function _cargarRIS() {
    if (!_filas.length || !_fecha) {
      App.toast("Primero cargá un PDF.", "error"); return;
    }
    const btn = document.getElementById("btn-parte-ris");
    btn.disabled = true;
    btn.textContent = "⏳ Verificando…";

    try {
      // Verificar duplicados primero
      const verif = await API.verificarRIS(_fecha);
      const existentes = new Set(verif.hashes || []);

      const nuevas = _filas.filter(f => {
        const hash = `${_fecha}|${f.hora}|${(f.documento||"").trim().toUpperCase()}`;
        return !existentes.has(hash);
      });

      if (nuevas.length === 0) {
        App.toast(`Sin cambios — los ${_filas.length} registros ya estaban en la agenda RIS.`);
        btn.disabled = false; btn.textContent = "📅 Cargar a agenda RIS";
        return;
      }

      const descartadas = _filas.length - nuevas.length;
      if (!confirm(
        `Se agregarán ${nuevas.length} registro${nuevas.length!==1?"s":""} nuevos a la agenda RIS del ${_fecha}.
` +
        (descartadas > 0 ? `${descartadas} ya existían y se omiten.
` : "") +
        `
¿Confirmar?`
      )) {
        btn.disabled = false; btn.textContent = "📅 Cargar a agenda RIS"; return;
      }

      btn.textContent = "⏳ Guardando…";
      const resp = await API.escribirRIS(_fecha, nuevas);
      App.toast(resp.mensaje, "ok");

      // Marcar visualmente las filas cargadas
      document.querySelectorAll("#parte-tbody tr").forEach((tr, i) => {
        const f    = _filas[i];
        if (!f) return;
        const hash = `${_fecha}|${f.hora}|${(f.documento||"").trim().toUpperCase()}`;
        if (!existentes.has(hash)) tr.style.background = "#e8f5e9";
      });

    } catch(err) {
      App.toast("Error: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "📅 Cargar a agenda RIS";
    }
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    // Drag & drop
    const zona = document.getElementById("parte-dropzone");
    zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("parte-drag"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("parte-drag"));
    zona.addEventListener("drop", e => {
      e.preventDefault(); zona.classList.remove("parte-drag");
      const file = e.dataTransfer.files[0];
      if (file) _procesarArchivo(file);
    });

    document.getElementById("parte-input-file").addEventListener("change", e => {
      if (e.target.files[0]) _procesarArchivo(e.target.files[0]);
    });

    document.getElementById("btn-parte-abrir").addEventListener("click", () => {
      document.getElementById("parte-input-file").click();
    });

    document.getElementById("btn-parte-nuevo").addEventListener("click", () => {
      _filas = []; _fecha = "";
      document.getElementById("parte-tabla-wrap").classList.add("hidden");
      document.getElementById("parte-dropzone").classList.remove("hidden");
      document.getElementById("btn-parte-excel").disabled = true;
      document.getElementById("btn-parte-copiar").disabled = true;
      document.getElementById("btn-parte-ris").disabled = true;
      document.getElementById("parte-input-file").value = "";
    });

    document.getElementById("btn-parte-excel").addEventListener("click", _exportarExcel);
    document.getElementById("btn-parte-copiar").addEventListener("click", _copiar);
    document.getElementById("btn-parte-ris").addEventListener("click", _cargarRIS);
    document.getElementById("btn-parte-excel-ris").addEventListener("click", () => {
      document.getElementById("parte-input-excel-ris").click();
    });
    document.getElementById("parte-input-excel-ris").addEventListener("change", async e => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      for (const file of files) {
        await _parsearExcelRIS(file);
      }
      e.target.value = "";
    });
    document.getElementById("btn-actualizar-estados").addEventListener("click", () => {
      document.getElementById("parte-input-estados").click();
    });
    document.getElementById("parte-input-estados").addEventListener("change", async e => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      for (const file of files) {
        await _actualizarEstados(file);
      }
      e.target.value = "";
    });

    document.getElementById("parte-filtro").addEventListener("input", e => {
      _render(_filas, e.target.value.trim());
    });
  }

  return { init };
})();