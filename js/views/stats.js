// js/views/stats.js — Estadísticas de jefatura

const StatsView = (() => {

  // ── Regiones y mapeo desde nombres de práctica ────────────
  const REGIONES = [
    { key: "CEREBRO/ANGIO",    match: ["cerebro","angio","orbita","oido","nariz","silla","hipofis","peñasco","penasco","macizo","facial","craneo"] },
    { key: "MACIZO FACIAL",    match: ["macizo","facial","senos paranasales","orbita"] },
    { key: "PEÑASCO",          match: ["peñasco","penasco","oido"] },
    { key: "HIPOFISIS",        match: ["hipofis","silla turca"] },
    { key: "CUELLO",           match: ["cuello","laringe","faringe","tiroides"] },
    { key: "TORAX",            match: ["torax","pulmon","mediastino","mama","mamaria","cardiaca","corazon"] },
    { key: "ABDOMEN/COLANGIO", match: ["abdomen","higado","pancreas","bazo","colangio","via biliar","suprarrenal"] },
    { key: "PELVIS",           match: ["pelvis","prostata","vejiga","utero","ovario","ginecol","recto"] },
    { key: "CADERAS",          match: ["cadera","sacroiliaca","sacroiliac"] },
    { key: "RODILLAS",         match: ["rodilla"] },
    { key: "TOBILLO/PIE",      match: ["tobillo","pie","calcaneo"] },
    { key: "HOMBRO",           match: ["hombro"] },
    { key: "CODO",             match: ["codo"] },
    { key: "MUÑECA",           match: ["muñeca","muneca"] },
    { key: "MANO",             match: ["mano","dedo"] },
    { key: "COLUMNA CERVICAL", match: ["cervical"] },
    { key: "COLUMNA DORSAL",   match: ["dorsal"] },
    { key: "COLUMNA LUMBAR",   match: ["lumbar","lumbosacra"] },
    { key: "COLUMNA COMPLETA", match: ["columna completa"] },
    { key: "CARDIACA",         match: ["cardiaca","corazon"] },
    { key: "ESPECTRO",         match: ["espectro","espectroscop"] },
    { key: "FUNCIONAL",        match: ["funcional"] },
    { key: "MAMARIA",          match: ["mamaria","mama"] },
    { key: "FETAL/OBSTETR.",   match: ["fetal","obstetrica","embarazo"] },
    { key: "OTRAS REGIONES",   match: [] },
  ];

  function _clasificar(estudio) {
    const e = estudio.toLowerCase();
    for (const r of REGIONES) {
      if (r.key === "OTRAS REGIONES") continue;
      if (r.match.some(m => e.includes(m))) return r.key;
    }
    return "OTRAS REGIONES";
  }

  function _tieneContraste(estudio) {
    const e = estudio.toLowerCase();
    return e.includes("con contraste") || e.includes("gadolinio") || e.includes("c/c");
  }

  // ── Calcular estadísticas desde turnos ────────────────────
  function _calcular(turnos) {
    const mapa = {};
    for (const r of REGIONES) mapa[r.key] = { sin: 0, con: 0 };

    let totalPacientes = new Set();
    let totalEstudios  = 0;
    let totalContraste = 0;

    for (const t of turnos) {
      totalPacientes.add(t.dni);
      const estudios = t.estudio.split(/[,·]/).map(s => s.trim()).filter(Boolean);
      for (const est of estudios) {
        totalEstudios++;
        const region = _clasificar(est);
        const conC   = _tieneContraste(est);
        if (conC) { mapa[region].con++; totalContraste++; }
        else        mapa[region].sin++;
      }
    }

    return { mapa, pacientes: totalPacientes.size, estudios: totalEstudios, contraste: totalContraste };
  }

  // ── Render tabla ──────────────────────────────────────────
  function _render(turnos, mesLabel) {
    const { mapa, pacientes, estudios, contraste } = _calcular(turnos);

    const totalSin = Object.values(mapa).reduce((a,r) => a+r.sin, 0);
    const totalCon = Object.values(mapa).reduce((a,r) => a+r.con, 0);

    const filas = REGIONES.map(r => {
      const { sin, con } = mapa[r.key];
      if (sin === 0 && con === 0) return "";
      const pctSin = totalSin > 0 ? ((sin/totalSin)*100).toFixed(1) : "0.0";
      const pctCon = totalCon > 0 ? ((con/totalCon)*100).toFixed(1) : "0.0";
      return `<tr>
        <td class="st-region">${r.key}</td>
        <td class="st-num">${sin}</td>
        <td class="st-pct">${pctSin}</td>
        <td class="st-num st-con">${con}</td>
        <td class="st-pct">${pctCon}</td>
      </tr>`;
    }).join("");

    // Cajas de contraste (15ml/frasco, 25 frascos/caja)
    const frascos = contraste;
    const cajas   = Math.ceil(frascos / 25);

    document.getElementById("stats-content").innerHTML = `
      <div class="st-header-row">
        <h3 class="st-mes">${mesLabel}</h3>
        <div class="st-summary">
          <span class="st-chip">👥 ${pacientes} pacientes</span>
          <span class="st-chip">🔬 ${estudios} estudios</span>
          <span class="st-chip st-chip-contrast">💉 ${contraste} × 15ml · ${cajas} caja${cajas!==1?"s":""}</span>
        </div>
      </div>
      <div style="overflow-x:auto">
      <table class="st-table">
        <thead>
          <tr>
            <th rowspan="2" class="st-th-region">REGIÓN</th>
            <th colspan="2" class="st-th-sin">SIN CONTRASTE</th>
            <th colspan="2" class="st-th-con">CON CONTRASTE</th>
          </tr>
          <tr>
            <th class="st-th-n">N</th><th class="st-th-p">%</th>
            <th class="st-th-n">N</th><th class="st-th-p">%</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr class="st-total">
            <td><strong>TOTALES</strong></td>
            <td class="st-num"><strong>${totalSin}</strong></td>
            <td class="st-pct"><strong>100</strong></td>
            <td class="st-num st-con"><strong>${totalCon}</strong></td>
            <td class="st-pct"><strong>100</strong></td>
          </tr>
        </tfoot>
      </table>
      </div>`;
  }

  // ── Exportar Excel ────────────────────────────────────────
  async function _exportar(turnos, mesLabel) {
    if (!window.XLSX) {
      await new Promise((res,rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const { mapa, pacientes, estudios, contraste } = _calcular(turnos);
    const totalSin = Object.values(mapa).reduce((a,r)=>a+r.sin,0);
    const totalCon = Object.values(mapa).reduce((a,r)=>a+r.con,0);
    const cajas = Math.ceil(contraste/25);

    const rows = [
      ["ESTADÍSTICA PACIENTES ATENDIDOS — RESONANCIA MAGNÉTICA"],
      ["HOSPITAL DONACIÓN FRANCISCO SANTOJANNI"],
      [],
      [mesLabel],
      [],
      ["REGIÓN","SIN CONTRASTE","%","CON CONTRASTE","%"],
    ];
    for (const r of REGIONES) {
      const { sin, con } = mapa[r.key];
      if (sin===0 && con===0) continue;
      rows.push([r.key, sin,
        totalSin>0?parseFloat((sin/totalSin*100).toFixed(1)):0,
        con,
        totalCon>0?parseFloat((con/totalCon*100).toFixed(1)):0
      ]);
    }
    rows.push(["TOTALES", totalSin, 100, totalCon, 100]);
    rows.push([]);
    rows.push(["PACIENTES", pacientes]);
    rows.push(["TOTAL ESTUDIOS", estudios]);
    rows.push([]);
    rows.push(["CONTRASTE", contraste+"  15ml X FRASCO", "", "TOTAL", contraste]);
    rows.push(["CAJAS", cajas+"  25 FRASCOS X CAJA"]);

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:22},{wch:15},{wch:8},{wch:15},{wch:8}];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Estadística");
    window.XLSX.writeFile(wb, `Estadistica_${mesLabel.replace(/\s/g,"_")}.xlsx`);
    App.toast("Excel descargado", "ok");
  }

  // ── Carga ─────────────────────────────────────────────────
  async function cargar() {
    const sel   = document.getElementById("stats-mes");
    const year  = parseInt(document.getElementById("stats-anio").value);
    const mes   = parseInt(sel.value);
    const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const mesLabel = `${MESES[mes]} ${year}`;

    const loading = document.getElementById("stats-loading");
    loading.classList.remove("hidden");
    document.getElementById("stats-content").innerHTML = "";

    try {
      // Pedir los días del mes completo
      const diasMes = new Date(year, mes, 0).getDate();
      const desde   = `01/${String(mes).padStart(2,"0")}/${year}`;
      const agendaArr = await API.agenda(desde, diasMes, 20);

      // Extraer todos los turnos únicos del mes
      const turnosMap = {};
      for (const dia of agendaArr) {
        for (const s of dia.slots) {
          if (s.tipo === "turno" && s.fila && !turnosMap[s.fila]) {
            turnosMap[s.fila] = {
              dni:     s.dni || "",
              estudio: s.estudio || "",
              origen:  s.origen || ""
            };
          }
        }
      }

      const turnos = Object.values(turnosMap);
      if (turnos.length === 0) {
        document.getElementById("stats-content").innerHTML =
          '<div class="empty-state">Sin turnos para el período seleccionado.</div>';
        return;
      }

      _render(turnos, mesLabel);
      document.getElementById("btn-stats-excel").onclick = () => _exportar(turnos, mesLabel);
      document.getElementById("btn-stats-excel").disabled = false;

    } catch(err) {
      App.toast("Error: " + err.message, "error");
    } finally {
      loading.classList.add("hidden");
    }
  }

  function init() {
    // Setear año y mes actual por defecto
    const hoy = new Date();
    document.getElementById("stats-anio").value = hoy.getFullYear();
    document.getElementById("stats-mes").value  = hoy.getMonth() + 1;
    document.getElementById("btn-stats-ver").addEventListener("click", cargar);
  }

  return { init, cargar };
})();