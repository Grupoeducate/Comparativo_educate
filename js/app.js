/**
 * Visor Educate 360° - Aplicación Principal
 * Orquestador General según Informe de Decisiones Arquitectónicas y Funcionales v1.0
 * 
 * Funcionalidades y Mejoras implementadas:
 * 1. Pantalla de login limpia con cajas vacías y logo ampliado.
 * 2. Carga transparente y autónoma desde subcarpeta data/{dane}/ sin ventanas emergentes.
 * 3. Botones de acción (Consultar, Limpiar, Exportar) ubicados debajo de los filtros.
 * 4. KPI cards limpias sin iconos.
 * 5. Barra apilada cromática en la tabla de Resumen de Desempeño por Grado.
 * 6. Valores numéricos directos en barras de promedios por área.
 * 7. Interactividad para ocultar/mostrar líneas de áreas en la Curva de Evolución Temporal.
 * 8. Gráfico Comparativo por Grado y Grupo en Evolución Institucional.
 * 9. Gráfico de desempeño en las 3 pruebas por área en la Ficha del Estudiante.
 * 10. Desglose de grados y grupos en Seguimiento por Área y Distribución de Desempeños al seleccionar 'todos'.
 * 11. Desglose de grados y grupos por ciclo en Consulta por Ciclo al seleccionar 'todos'.
 * 12. Eliminación de la opción de imprimir/guardar en PDF en Centro de Exportación.
 */

const App = (function() {
  // Estado general de la aplicación
  let state = {
    configs: {
      institucion: null,
      usuarios: null,
      pruebas: null,
      escalas: null,
      desempenos: null,
      areas: null
    },
    rawRecords: [],
    currentFilteredRecords: [],
    activeModule: 'dashboard',
    selectedArea: 'Matematicas',
    selectedStudent: null,
    rankingLimit: 10,
    distributionGroupBy: 'grado'
  };

  // Mapeo oficial de columnas en el CSV para Áreas y Componentes
  const AREA_COLUMNS = {
    'Lenguaje': 'LENGUAJE',
    'Matematicas': 'MATEMÁTICAS',
    'Ciencias Naturales': 'CIENCIAS NATURALES',
    'Sociales': 'SOCIALES Y CIUDADANAS',
    'Ingles': 'INGLÉS'
  };

  const COMPONENT_COLUMNS = {
    'Estadistica': 'ESTADÍSTICA',
    'Geometria': 'GEOMETRÍA',
    'Aritmetica': 'ARITMÉTICA',
    'Biologia': 'BIOLOGÍA',
    'Fisica': 'FÍSICA',
    'Quimica': 'QUÍMICA',
    'CTS': 'CIENCIA TECNOLOGÍA Y SOCIEDAD.',
    'Ciencias Sociales': 'CIENCIAS SOCIALES',
    'Competencias Ciudadanas': 'COMPETENCIAS CIUDADANAS'
  };

  /**
   * Inicialización de la aplicación al cargar el DOM
   */
  async function init() {
    try {
      showLoading(true);
      await loadConfigurations();
      setupAuth();
      setupNavigation();
      setupEventListeners();

      // Sesión restaurada válida solo si el DANE sigue registrado y con datos publicados
      if (window.Auth && window.Auth.isSessionValid()) {
        const session = window.Auth.getSession();
        updateUserUI(session);
        try {
          await loadDataset(session.dane);
          bootApplication();
        } catch (datasetErr) {
          console.error(datasetErr);
          window.Auth.logout();
        }
      } else {
        showLoginOverlay(true);
      }
    } catch (err) {
      console.error('Error durante la inicialización de Visor Educate 360°:', err);
      showGlobalError('Error cargando los datos iniciales. Por favor recargue la página.');
    } finally {
      showLoading(false);
    }
  }

  /**
   * Carga los archivos JSON de configuración.
   * Fuente de verdad: config/*.json (usuarios, institución, pruebas, escalas, desempeños, áreas).
   * Ventaja sobre config_data.js: sirve cuando el visor se publica en hosting estático (GitHub Pages).
   * El bundle window.EDUCATE360_CONFIG queda como respaldo para apertura local con file://.
   */
  async function loadConfigurations() {
    const cfg = window.EDUCATE360_CONFIG || {};

    // Devuelve null cuando el JSON no está disponible (por ejemplo bajo file://)
    const fetchJson = async (path) => {
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        return null;
      }
    };

    // Resolución de configuración: JSON publicado > bundle config_data.js > respaldo mínimo
    const pick = async (path, bundled, hardFallback) => {
      const fetched = await fetchJson(path);
      if (fetched) return fetched;
      if (bundled) return bundled;
      return hardFallback;
    };

    const institucion = await pick('config/institucion.json', cfg.institucion, {
      nombre: 'Colegio Cambridge',
      dane: '425377076576',
      ciudad: 'Bogotá',
      anio_lectivo: 2026,
      ciclos: {
        "0": ["0", "Transición"],
        "1": ["1", "2", "3"],
        "2": ["4", "5"],
        "3": ["6", "7"],
        "4": ["8", "9"],
        "5": ["10", "11"]
      }
    });

    // Sin usuarios registrados no hay acceso posible: no se usa ningún usuario por defecto
    const usuarios = await pick('config/usuarios.json', cfg.usuarios, { usuarios: [] });

    const pruebas = await pick('config/pruebas.json', cfg.pruebas, {
      pruebas: [
        { id: 'ALFA', nombre: 'Misión Alfa', tipo: 'periodica', orden: 1 },
        { id: 'BETA', nombre: 'Misión Beta', tipo: 'periodica', orden: 2 },
        { id: 'GAMMA', nombre: 'Misión Gamma', tipo: 'periodica', orden: 3 }
      ]
    });

    const escalas = await pick('config/escalas.json', cfg.escalas, {});
    const desempenos = await pick('config/desempenos.json', cfg.desempenos, {});
    const areas = await pick('config/areas.json', cfg.areas, {
      areas: [
        { nombre: 'Lenguaje', orden: 1, componentes: [] },
        { nombre: 'Matematicas', orden: 2, componentes: ['Estadistica', 'Geometria', 'Aritmetica'] },
        { nombre: 'Ciencias Naturales', orden: 3, componentes: ['Biologia', 'Fisica', 'Quimica', 'CTS'] },
        { nombre: 'Sociales', orden: 4, componentes: ['Ciencias Sociales', 'Competencias Ciudadanas'] },
        { nombre: 'Ingles', orden: 5, componentes: [] }
      ]
    });

    state.configs = { institucion, usuarios, pruebas, escalas, desempenos, areas };
  }

  /**
   * Carga y parsea el archivo de pruebas dirigiéndose a la subcarpeta identificada con el DANE ingresado.
   * Solo se aceptan archivos dentro de data/{dane}/: no existen rutas genéricas compartidas entre instituciones.
   */
  async function loadDataset(dane) {
    let csvText = '';
    const cleanDane = String(dane || '').trim();

    if (!cleanDane) {
      throw new Error('No hay un código DANE activo en la sesión para cargar el consolidado.');
    }

    // 1. Revisar si el consolidado data/{dane}/ ya está precargado en memoria
    if (window.EDUCATE360_DATA && window.EDUCATE360_DATA[cleanDane]) {
      const dataObj = window.EDUCATE360_DATA[cleanDane];
      csvText = typeof dataObj === 'object' && dataObj.value ? dataObj.value : dataObj;
      console.log(`[Educate 360°] Consolidado institucional data/${cleanDane}/ cargado directamente desde memoria.`);
    }

    // 2. Si no está en memoria, intentar fetch únicamente dentro de la carpeta del DANE
    if (!csvText) {
      const pathsToTry = [
        `data/${cleanDane}/consolidado_total.csv`,
        `data/${cleanDane}/dashboard_data.csv`
      ];
      
      for (const p of pathsToTry) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            csvText = await res.text();
            console.log(`[Educate 360°] Datos cargados exitosamente desde: ${p}`);
            break;
          }
        } catch (e) {
          // Continuar al siguiente path
        }
      }
    }

    if (!csvText) {
      throw new Error(`No se encontró el consolidado de pruebas en data/${cleanDane}/. Publique la carpeta de la institución antes de habilitar el acceso.`);
    }

    state.rawRecords = parseCsvText(csvText);
    if (state.rawRecords.length === 0) {
      throw new Error(`El consolidado de data/${cleanDane}/ no contiene registros legibles. Verifique el archivo y su separador de columnas.`);
    }
    state.currentFilteredRecords = [...state.rawRecords];
  }

  /**
   * Detecta el separador del consolidado a partir de la línea de encabezados.
   * Cada institución exporta su archivo con punto y coma (;) o con coma (,).
   */
  function detectDelimiter(headerLine) {
    const candidates = [';', ',', '\t'];
    let best = ';';
    let bestColumns = 1;
    candidates.forEach(candidate => {
      const columns = splitDelimitedLine(headerLine, candidate).length;
      if (columns > bestColumns) {
        best = candidate;
        bestColumns = columns;
      }
    });
    return best;
  }

  /**
   * Separa una línea de CSV respetando los campos entre comillas dobles.
   */
  function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        cells.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    cells.push(current);
    return cells;
  }

  /**
   * Parseador robusto de CSV con autodetección de separador (; o ,)
   */
  function parseCsvText(text) {
    if (!text) return [];
    const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const lines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    const delimiter = detectDelimiter(lines[0]);
    const headers = splitDelimitedLine(lines[0], delimiter).map(h => h.trim());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = splitDelimitedLine(line, delimiter);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] !== undefined ? cols[idx].trim() : '';
      });
      records.push(row);
    }
    return records;
  }

  /**
   * Configuración de la capa de autenticación con usuarios.json.
   * El login valida registro del DANE, existencia de data/{dane}/ y coincidencia de clave.
   */
  function setupAuth() {
    window.Auth.init(state.configs.institucion, state.configs.usuarios);

    window.Auth.onAuthStateChanged(async (isAuthed, session) => {
      if (isAuthed && session) {
        showLoginOverlay(false);
        updateUserUI(session);
        showLoading(true);
        try {
          await loadDataset(session.dane);
          bootApplication();
        } catch (err) {
          console.error(err);
          // Sin consolidado publicado no se habilita el visor para esa institución
          window.Auth.logout();
          showGlobalError(err.message || `No se pudieron cargar los datos de data/${session.dane}/`);
        } finally {
          showLoading(false);
        }
      } else {
        showLoginOverlay(true);
      }
    });

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const daneInp = document.getElementById('login-dane');
        const pinInp = document.getElementById('login-pin');
        const errEl = document.getElementById('login-error');
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        if (!daneInp || !pinInp) return;

        if (submitBtn) submitBtn.disabled = true;
        if (errEl) errEl.style.display = 'none';

        try {
          const result = await window.Auth.login(daneInp.value, pinInp.value);
          if (!result.success && errEl) {
            errEl.textContent = result.message;
            errEl.style.display = 'block';
            if (pinInp) pinInp.value = '';
            pinInp.focus();
          }
        } catch (err) {
          console.error(err);
          if (errEl) {
            errEl.textContent = 'No fue posible verificar sus credenciales. Intente nuevamente.';
            errEl.style.display = 'block';
          }
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (confirm('¿Desea cerrar la sesión del Visor Educate 360°?')) {
          window.Auth.logout();
        }
      });
    }
  }

  function showLoginOverlay(show) {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
      if (show) {
        const daneInp = document.getElementById('login-dane');
        const pinInp = document.getElementById('login-pin');
        const errEl = document.getElementById('login-error');
        if (daneInp) daneInp.value = '';
        if (pinInp) pinInp.value = '';
        if (errEl) errEl.style.display = 'none';
      }
    }
  }

  function updateUserUI(session) {
    const instNameEl = document.getElementById('top-inst-name');
    const instDaneEl = document.getElementById('top-inst-dane');
    const instYearEl = document.getElementById('top-inst-year');

    const s = session || {};
    const inst = state.configs.institucion || {};
    if (instNameEl) instNameEl.textContent = s.institucion || inst.nombre || 'Colegio Cambridge';
    if (instDaneEl) instDaneEl.textContent = `DANE: ${s.dane || inst.dane || '425377076576'}`;
    if (instYearEl) instYearEl.textContent = `Año: ${inst.anio_lectivo || '2026'}`;
  }

  /**
   * Inicializa la interfaz una vez validado el acceso
   */
  function bootApplication() {
    window.Filters.init(state.rawRecords, state.configs, (filteredRows) => {
      state.currentFilteredRecords = filteredRows;
      renderActiveModule();
    });

    state.currentFilteredRecords = window.Filters.getFilteredRecords();
    renderActiveModule();
  }

  /**
   * Configura la navegación por pestañas de módulos
   */
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-module]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.getAttribute('data-module');
        switchModule(target);
      });
    });
  }

  function switchModule(moduleName) {
    state.activeModule = moduleName;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-module') === moduleName);
    });

    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.remove('active');
    });

    const activeView = document.getElementById(`view-${moduleName}`);
    if (activeView) {
      activeView.classList.add('active');
    }

    renderActiveModule();
  }

  function renderActiveModule() {
    switch (state.activeModule) {
      case 'dashboard':
        renderDashboardModule();
        break;
      case 'evolucion':
        renderEvolucionModule();
        break;
      case 'ranking':
        renderRankingModule();
        break;
      case 'areas':
        renderAreasModule();
        break;
      case 'desempenos':
        renderDesempenosModule();
        break;
      case 'ciclos':
        renderCiclosModule();
        break;
      case 'trazabilidad':
        renderTrazabilidadModule();
        break;
      case 'exportacion':
        renderExportacionModule();
        break;
    }
  }

  /**
   * Eventos globales adicionales
   */
  function setupEventListeners() {
    // Ranking limit select
    const selRankingLimit = document.getElementById('ranking-limit-select');
    if (selRankingLimit) {
      selRankingLimit.addEventListener('change', (e) => {
        state.rankingLimit = e.target.value === 'all' ? 99999 : parseInt(e.target.value, 10);
        renderRankingModule();
      });
    }

    // Modal close button
    const btnCloseModal = document.getElementById('btn-close-student-modal');
    const modalBackdrop = document.getElementById('student-modal-backdrop');
    if (btnCloseModal && modalBackdrop) {
      btnCloseModal.addEventListener('click', () => {
        modalBackdrop.classList.remove('active');
      });
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          modalBackdrop.classList.remove('active');
        }
      });
    }

    // Export Buttons
    const btnExportExcel = document.getElementById('btn-export-excel-action');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => {
        window.Exports.exportFilteredData(
          state.currentFilteredRecords,
          state.configs.institucion,
          window.Filters.getState()
        );
      });
    }
  }

  /**
   * Renderiza la barra de contexto pedagógico en las vistas de Detalle Pedagógico
   * Muestra el grado seleccionado y los grupos de ese grado con interacción rápida
   */
  function renderPedagogicalContextBar(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const filterState = window.Filters.getState();
    const currentGrado = filterState.grado;
    const currentGrupo = filterState.grupo;
    const availableGroups = window.Filters.getGroupsForGrade(currentGrado);

    const gradoLabel = currentGrado !== 'todos' ? `Grado ${currentGrado}°` : 'Todos los Grados (1° a 10°)';
    
    let groupsHtml = '';
    if (availableGroups.length > 0) {
      groupsHtml = availableGroups.map(grp => {
        const isSelected = currentGrupo === grp;
        return `<span class="badge-group-item ${isSelected ? 'active' : ''}" 
                  onclick="App.quickSelectGrupo('${grp}')" 
                  title="Filtrar por Grupo ${grp}">
                  Grupo ${grp} ${isSelected ? '✓' : ''}
                </span>`;
      }).join('');
    } else {
      groupsHtml = '<span style="font-size:0.75rem; color:var(--text-muted);">Sin grupos registrados</span>';
    }

    container.innerHTML = `
      <div class="pedagogical-context-banner">
        <div class="pedagogical-context-info">
          <div class="context-block">
            <span class="context-label">Grado Seleccionado:</span>
            <span class="badge-grado-selected">${gradoLabel}</span>
          </div>
          <div class="context-block">
            <span class="context-label">Grupos de este Grado (${availableGroups.length}):</span>
            <div class="context-groups-wrapper">
              <span class="badge-group-item ${currentGrupo === 'todos' ? 'active' : ''}" 
                onclick="App.quickSelectGrupo('todos')" 
                title="Ver todos los grupos">
                Todos
              </span>
              ${groupsHtml}
            </div>
          </div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">
          ${state.currentFilteredRecords.length} estudiantes analizados
        </div>
      </div>
    `;
  }

  function quickSelectGrupo(grupo) {
    window.Filters.setFilter('grupo', grupo);
  }

  // ==========================================================================
  // MÓDULO 1: Dashboard Ejecutivo
  // ==========================================================================

  function renderDashboardModule() {
    const records = state.currentFilteredRecords;

    const totalEstudiantes = new Set(records.map(r => window.Filters.normalizarNombre(r.ESTUDIANTE))).size;
    const totalGrados = new Set(records.map(r => r.GRADO).filter(Boolean)).size;
    const totalGrupos = new Set(records.map(r => `${r.GRADO}-${r.GRUPO}`).filter(Boolean)).size;

    const scores = records
      .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
      .filter(s => !isNaN(s));
    
    const generalAverage = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0;

    const areaAverages = {};
    const areasList = ['Lenguaje', 'Matematicas', 'Ciencias Naturales', 'Sociales', 'Ingles'];
    
    areasList.forEach(areaName => {
      const col = AREA_COLUMNS[areaName];
      const areaScores = records
        .map(r => parseFloat(String(r[col] || '').replace(',', '.')))
        .filter(s => !isNaN(s));
      areaAverages[areaName] = areaScores.length > 0
        ? areaScores.reduce((a, b) => a + b, 0) / areaScores.length
        : 0;
    });

    let bestArea = { name: 'N/A', avg: 0 };
    let criticalArea = { name: 'N/A', avg: 5.1 };

    Object.entries(areaAverages).forEach(([name, avg]) => {
      if (avg > bestArea.avg) bestArea = { name, avg };
      if (avg > 0 && avg < criticalArea.avg) criticalArea = { name, avg };
    });

    if (criticalArea.avg > 5.0) criticalArea = { name: 'Ninguna', avg: 0 };

    const distribution = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
    records.forEach(r => {
      const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO);
      if (distribution[info.key] !== undefined) {
        distribution[info.key]++;
      }
    });

    setText('kpi-promedio-general', generalAverage > 0 ? generalAverage.toFixed(2) : '-');
    setText('kpi-estudiantes-total', totalEstudiantes);
    setText('kpi-grados-total', totalGrados);
    setText('kpi-grupos-total', totalGrupos);
    setText('kpi-mejor-area-nombre', bestArea.name);
    setText('kpi-mejor-area-score', bestArea.avg > 0 ? `${bestArea.avg.toFixed(2)} / 5.0` : '-');
    setText('kpi-area-critica-nombre', criticalArea.name);
    setText('kpi-area-critica-score', criticalArea.avg > 0 ? `${criticalArea.avg.toFixed(2)} / 5.0` : '-');

    const genInfo = window.Filters.getDesempenoInfo(
      generalAverage >= 4.8 ? 'Superior' :
      generalAverage >= 4.0 ? 'Alto' :
      generalAverage >= 3.6 ? 'Basico' : 'Bajo'
    );
    const badgeEl = document.getElementById('kpi-promedio-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="badge-dot"></span> Desempeño ${genInfo.label}`;
      badgeEl.className = `badge-desempeno badge-${genInfo.key.toLowerCase()}`;
    }

    // Gráfico comparativo de áreas con valores numéricos sobre las barras
    window.Charts.renderExecutiveOverview('chart-dashboard-areas', areaAverages, distribution);
    window.Charts.renderExecutiveDonut('chart-dashboard-donut', distribution);

    renderDashboardGradesTable(records, areasList);
  }

  /**
   * Resumen de Desempeño por Grado con barra apilada cromática
   * Cumple con Requerimiento 5: después de los 4 badges de desempeño, coloca la barra apilada con los colores oficiales
   */
  function renderDashboardGradesTable(records, areasList) {
    const container = document.getElementById('dashboard-grades-table-body');
    if (!container) return;

    const grades = [...new Set(records.map(r => r.GRADO).filter(Boolean))]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    let html = '';
    grades.forEach(g => {
      const gradeRecords = records.filter(r => r.GRADO === g);
      const scores = gradeRecords
        .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
        .filter(s => !isNaN(s));
      const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '-';

      const perfCounts = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
      gradeRecords.forEach(r => {
        const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO);
        if (perfCounts[info.key] !== undefined) {
          perfCounts[info.key]++;
        }
      });

      const total = perfCounts.Bajo + perfCounts.Basico + perfCounts.Alto + perfCounts.Superior || 1;
      const pB = (perfCounts.Bajo / total) * 100;
      const pBs = (perfCounts.Basico / total) * 100;
      const pA = (perfCounts.Alto / total) * 100;
      const pS = (perfCounts.Superior / total) * 100;

      html += `
        <tr>
          <td><strong>Grado ${g}°</strong></td>
          <td>${gradeRecords.length}</td>
          <td class="score-cell">${avg}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span class="badge-desempeno badge-bajo" title="Bajo">${perfCounts.Bajo}</span>
              <span class="badge-desempeno badge-basico" title="Básico">${perfCounts.Basico}</span>
              <span class="badge-desempeno badge-alto" title="Alto">${perfCounts.Alto}</span>
              <span class="badge-desempeno badge-superior" title="Superior">${perfCounts.Superior}</span>
              <div class="mini-stacked-bar" style="flex:1; min-width:130px; max-width:200px; height:14px; background:#e2e8f0; border-radius:4px; overflow:hidden; display:flex; box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);" title="Distribución: Bajo ${pB.toFixed(1)}%, Básico ${pBs.toFixed(1)}%, Alto ${pA.toFixed(1)}%, Superior ${pS.toFixed(1)}%">
                ${pB > 0 ? `<div style="width:${pB}%; height:100%; background:#bf0000;" title="Bajo: ${perfCounts.Bajo} (${pB.toFixed(1)}%)"></div>` : ''}
                ${pBs > 0 ? `<div style="width:${pBs}%; height:100%; background:#ffbf00;" title="Básico: ${perfCounts.Basico} (${pBs.toFixed(1)}%)"></div>` : ''}
                ${pA > 0 ? `<div style="width:${pA}%; height:100%; background:#01b1f0;" title="Alto: ${perfCounts.Alto} (${pA.toFixed(1)}%)"></div>` : ''}
                ${pS > 0 ? `<div style="width:${pS}%; height:100%; background:#01af51;" title="Superior: ${perfCounts.Superior} (${pS.toFixed(1)}%)"></div>` : ''}
              </div>
            </div>
          </td>
        </tr>`;
    });

    container.innerHTML = html || '<tr><td colspan="4" class="text-center">Sin datos disponibles</td></tr>';
  }

  // ==========================================================================
  // Pruebas disponibles en el consolidado de la institución
  // ==========================================================================

  /**
   * Catálogo de pruebas configurado en config/pruebas.json, ordenado por 'orden'.
   */
  function getPruebaCatalog() {
    const raw = (state.configs.pruebas && state.configs.pruebas.pruebas) ? state.configs.pruebas.pruebas : [];
    return raw.slice().sort((a, b) => (Number(a.orden) || 99) - (Number(b.orden) || 99));
  }

  /**
   * Código de prueba normalizado, tal como llega en la columna PRUEBA del consolidado.
   */
  function pruebaCode(value) {
    return String(value === undefined || value === null ? '' : value).trim().toUpperCase();
  }

  /**
   * Posición de una prueba dentro del catálogo configurado. Las no configuradas van al final.
   */
  function pruebaOrder(code) {
    const catalog = getPruebaCatalog();
    const idx = catalog.findIndex(cp => {
      const id = pruebaCode(cp.id);
      const nombre = pruebaCode(cp.nombre);
      return id === code || nombre === code || nombre.endsWith(' ' + code);
    });
    return idx === -1 ? catalog.length : idx;
  }

  /**
   * Pruebas realmente presentes en el consolidado de la institución.
   * Las gráficas, tablas y filtros solo muestran estas pruebas: nunca ejes de pruebas inexistentes en el CSV.
   */
  function getAvailablePruebas(records) {
    const source = records || state.rawRecords || [];
    const present = [];
    source.forEach(r => {
      const code = pruebaCode(r.PRUEBA);
      if (code && !present.includes(code)) present.push(code);
    });

    const csvOrder = new Map(present.map((code, idx) => [code, idx]));
    return present.sort((a, b) => {
      const byCatalog = pruebaOrder(a) - pruebaOrder(b);
      if (byCatalog !== 0) return byCatalog;
      return csvOrder.get(a) - csvOrder.get(b);
    });
  }

  // ==========================================================================
  // MÓDULO 2: Evolución Institucional (secuencia de pruebas del consolidado)
  // ==========================================================================

  function renderEvolucionModule() {
    const records = state.currentFilteredRecords;
    const pruebas = getAvailablePruebas();
    const areasList = ['Lenguaje', 'Matematicas', 'Ciencias Naturales', 'Sociales', 'Ingles'];

    const generalAverages = [];
    const areaAveragesMap = {};
    areasList.forEach(a => areaAveragesMap[a] = []);

    pruebas.forEach(p => {
      const pRecords = records.filter(r => String(r.PRUEBA).toUpperCase() === p);
      const scores = pRecords
        .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
        .filter(s => !isNaN(s));
      const pAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      generalAverages.push(pAvg);

      areasList.forEach(a => {
        const col = AREA_COLUMNS[a];
        const aScores = pRecords
          .map(r => parseFloat(String(r[col] || '').replace(',', '.')))
          .filter(s => !isNaN(s));
        const aAvg = aScores.length > 0 ? aScores.reduce((x, y) => x + y, 0) / aScores.length : 0;
        areaAveragesMap[a].push(aAvg);
      });
    });

    // Gráfico de línea interactivo (permite ocultar/mostrar líneas de área haciendo clic en la leyenda)
    if (pruebas.length > 0) {
      window.Charts.renderEvolutionChart('chart-evolucion-general', {
        pruebas,
        promedioGeneral: generalAverages,
        areas: areaAveragesMap
      });
    }

    const tbody = document.getElementById('table-evolucion-body');
    if (tbody && pruebas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">El consolidado no contiene pruebas registradas.</td></tr>';
    }
    if (tbody && pruebas.length > 0) {
      let html = '';
      pruebas.forEach((p, idx) => {
        const pRecords = records.filter(r => String(r.PRUEBA).toUpperCase() === p);
        const prevAvg = idx > 0 ? generalAverages[idx - 1] : null;
        const currentAvg = generalAverages[idx];
        let deltaBadge = '<span class="evolution-delta-badge delta-neutral">-</span>';

        if (prevAvg !== null && prevAvg > 0 && currentAvg > 0) {
          const diff = currentAvg - prevAvg;
          if (diff > 0) {
            deltaBadge = `<span class="evolution-delta-badge delta-positive">+${diff.toFixed(2)}</span>`;
          } else if (diff < 0) {
            deltaBadge = `<span class="evolution-delta-badge delta-negative">${diff.toFixed(2)}</span>`;
          } else {
            deltaBadge = `<span class="evolution-delta-badge delta-neutral">0.00</span>`;
          }
        }

        html += `
          <tr>
            <td><strong>Misión ${p}</strong></td>
            <td>${pRecords.length}</td>
            <td class="score-cell">${currentAvg > 0 ? currentAvg.toFixed(2) : '-'}</td>
            <td>${deltaBadge}</td>
            <td>${areaAveragesMap['Lenguaje'][idx] > 0 ? areaAveragesMap['Lenguaje'][idx].toFixed(2) : '-'}</td>
            <td>${areaAveragesMap['Matematicas'][idx] > 0 ? areaAveragesMap['Matematicas'][idx].toFixed(2) : '-'}</td>
            <td>${areaAveragesMap['Ciencias Naturales'][idx] > 0 ? areaAveragesMap['Ciencias Naturales'][idx].toFixed(2) : '-'}</td>
            <td>${areaAveragesMap['Sociales'][idx] > 0 ? areaAveragesMap['Sociales'][idx].toFixed(2) : '-'}</td>
            <td>${areaAveragesMap['Ingles'][idx] > 0 ? areaAveragesMap['Ingles'][idx].toFixed(2) : '-'}</td>
          </tr>`;
      });

      tbody.innerHTML = html;
    }

    // Requerimiento 8: Gráfica vertical con nombre "Comparativo por grado y grupo"
    window.Charts.renderGradeGroupComparison(
      'chart-evolucion-grados-grupos',
      records,
      areasList
    );
  }

  // ==========================================================================
  // MÓDULO 3: Ranking Institucional
  // ==========================================================================

  function renderRankingModule() {
    const records = state.currentFilteredRecords;
    const tbody = document.getElementById('table-ranking-body');
    if (!tbody) return;

    const sorted = [...records].sort((a, b) => {
      const sA = parseFloat(String(a.PUNTAJE).replace(',', '.')) || 0;
      const sB = parseFloat(String(b.PUNTAJE).replace(',', '.')) || 0;
      if (sB !== sA) return sB - sA;
      const pA = parseInt(a.PUESTO, 10) || 9999;
      const pB = parseInt(b.PUESTO, 10) || 9999;
      return pA - pB;
    });

    const displayRecords = sorted.slice(0, state.rankingLimit);

    let html = '';
    displayRecords.forEach((row, index) => {
      const rankNum = index + 1;
      let puestoBadge = `<span class="puesto-badge">${rankNum}</span>`;
      if (rankNum === 1) puestoBadge = `<span class="puesto-badge puesto-1">1</span>`;
      else if (rankNum === 2) puestoBadge = `<span class="puesto-badge puesto-2">2</span>`;
      else if (rankNum === 3) puestoBadge = `<span class="puesto-badge puesto-3">3</span>`;

      const desInfo = window.Filters.getDesempenoInfo(row.DESEMPEÑO);
      const studentName = row.ESTUDIANTE || 'Sin Nombre';

      html += `
        <tr>
          <td>${puestoBadge}</td>
          <td>
            <strong>${escapeHtml(studentName)}</strong>
            <div style="font-size:0.7rem; color:var(--text-muted);">Doc: ${row.DOCUMENTO || 'N/A'}</div>
          </td>
          <td>Grado ${row.GRADO}°</td>
          <td>Grupo ${row.GRUPO}</td>
          <td><span class="badge-desempeno" style="background:#f1f5f9; color:#334155;">Misión ${row.PRUEBA}</span></td>
          <td class="score-cell">${row.PUNTAJE}</td>
          <td>
            <span class="badge-desempeno badge-${desInfo.key.toLowerCase()}">
              <span class="badge-dot"></span> ${desInfo.label}
            </span>
          </td>
          <td>
            <button class="btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" 
              onclick="App.openStudentModal('${escapeForJs(studentName)}')">
              Ver Ficha
            </button>
          </td>
        </tr>`;
    });

    tbody.innerHTML = html || '<tr><td colspan="8" class="text-center">No se encontraron estudiantes para este ranking</td></tr>';
  }

  // ==========================================================================
  // MÓDULO 4: Seguimiento por Área y Componentes (Detalle Pedagógico)
  // ==========================================================================

  function renderAreasModule() {
    renderPedagogicalContextBar('context-banner-areas');

    const records = state.currentFilteredRecords;
    const filterState = window.Filters.getState();
    const isAllGrades = filterState.grado === 'todos';
    const areasConfig = state.configs.areas ? state.configs.areas.areas : [];
    
    const tabsContainer = document.getElementById('areas-tabs-container');
    if (tabsContainer) {
      tabsContainer.innerHTML = areasConfig.map(a => `
        <button class="area-tab-btn ${a.nombre === state.selectedArea ? 'active' : ''}" 
          onclick="App.setSelectedArea('${a.nombre}')">
          ${a.nombre}
        </button>
      `).join('');
    }

    const currentAreaCfg = areasConfig.find(a => a.nombre === state.selectedArea) || areasConfig[0];
    if (!currentAreaCfg) return;

    const areaCol = AREA_COLUMNS[currentAreaCfg.nombre];
    const areaScores = records
      .map(r => parseFloat(String(r[areaCol] || '').replace(',', '.')))
      .filter(s => !isNaN(s));
    const areaAvg = areaScores.length > 0 ? areaScores.reduce((a, b) => a + b, 0) / areaScores.length : 0;

    const componentsData = {};
    if (currentAreaCfg.componentes && currentAreaCfg.componentes.length > 0) {
      currentAreaCfg.componentes.forEach(compName => {
        const col = COMPONENT_COLUMNS[compName] || compName.toUpperCase();
        const compScores = records
          .map(r => parseFloat(String(r[col] || '').replace(',', '.')))
          .filter(s => !isNaN(s));
        componentsData[compName] = compScores.length > 0 
          ? compScores.reduce((a, b) => a + b, 0) / compScores.length 
          : 0;
      });
    }

    const compGrid = document.getElementById('area-components-grid');
    if (compGrid) {
      let compHtml = `
        <div class="component-card" style="border-left: 4px solid var(--primary);">
          <div class="component-title">Área General (${currentAreaCfg.nombre})</div>
          <div class="component-score">${areaAvg > 0 ? areaAvg.toFixed(2) : '-'} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">/ 5.0</span></div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${(areaAvg / 5.0) * 100}%; background:var(--primary);"></div>
          </div>
        </div>
      `;

      Object.entries(componentsData).forEach(([compName, score]) => {
        const pct = (score / 5.0) * 100;
        compHtml += `
          <div class="component-card">
            <div class="component-title">${compName}</div>
            <div class="component-score">${score > 0 ? score.toFixed(2) : '-'} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">/ 5.0</span></div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width:${pct}%; background:#64748b;"></div>
            </div>
          </div>
        `;
      });

      compGrid.innerHTML = compHtml;
    }

    const titleEl = document.getElementById('title-chart-area-components');
    const subtitleEl = document.getElementById('subtitle-chart-area-components');

    // Requerimiento 10: Cuando 'todos' está seleccionado, muestra el promedio de cada grado y de cada grupo
    if (isAllGrades) {
      if (titleEl) titleEl.textContent = `Promedios por Grado y Grupo en ${currentAreaCfg.nombre}`;
      if (subtitleEl) subtitleEl.textContent = `Desglose institucional de todos los grados y sus grupos en ${currentAreaCfg.nombre}`;
      window.Charts.renderAreaAllGradesGroupsChart(
        'chart-area-components',
        currentAreaCfg.nombre,
        records
      );
    } else {
      if (titleEl) titleEl.textContent = `Comparativa de Componentes - ${currentAreaCfg.nombre}`;
      if (subtitleEl) subtitleEl.textContent = `Puntajes de componentes de ${currentAreaCfg.nombre} vs máximo esperado`;
      window.Charts.renderAreaComponentsChart(
        'chart-area-components',
        currentAreaCfg.nombre,
        areaAvg,
        componentsData
      );
    }
  }

  function setSelectedArea(areaName) {
    state.selectedArea = areaName;
    renderAreasModule();
  }

  // ==========================================================================
  // MÓDULO 5: Distribución de Desempeños (Detalle Pedagógico)
  // ==========================================================================

  function renderDesempenosModule() {
    renderPedagogicalContextBar('context-banner-desempenos');

    const records = state.currentFilteredRecords;
    const filterState = window.Filters.getState();
    const isAllGrades = filterState.grado === 'todos';

    let categories = [];
    let bajoArr = [];
    let basicoArr = [];
    let altoArr = [];
    let superiorArr = [];

    // Requerimiento 10: Cuando la opción todos está seleccionada, se muestra por grado y por cada grupo
    const uniqueGrades = [...new Set(records.map(r => r.GRADO).filter(Boolean))]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    uniqueGrades.forEach(g => {
      const gRecords = records.filter(r => r.GRADO === g);
      
      // Categoría del Grado completo
      categories.push(`Grado ${g}°`);
      const cG = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
      gRecords.forEach(r => {
        const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO);
        if (cG[info.key] !== undefined) cG[info.key]++;
      });
      bajoArr.push(cG.Bajo);
      basicoArr.push(cG.Basico);
      altoArr.push(cG.Alto);
      superiorArr.push(cG.Superior);

      // Grupos del grado
      const groups = [...new Set(gRecords.map(r => r.GRUPO).filter(Boolean))].sort();
      groups.forEach(grp => {
        const grpRecords = gRecords.filter(r => r.GRUPO === grp);
        categories.push(`G ${g}°-${grp}`);
        const cGrp = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
        grpRecords.forEach(r => {
          const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO);
          if (cGrp[info.key] !== undefined) cGrp[info.key]++;
        });
        bajoArr.push(cGrp.Bajo);
        basicoArr.push(cGrp.Basico);
        altoArr.push(cGrp.Alto);
        superiorArr.push(cGrp.Superior);
      });
    });

    window.Charts.renderStackedPerformance(
      'chart-desempenos-stacked',
      categories,
      bajoArr,
      basicoArr,
      altoArr,
      superiorArr
    );

    const tbody = document.getElementById('table-desempenos-body');
    if (tbody) {
      let html = '';
      categories.forEach((cat, idx) => {
        const b = bajoArr[idx];
        const bs = basicoArr[idx];
        const a = altoArr[idx];
        const s = superiorArr[idx];
        const total = b + bs + a + s || 1;
        const isGradeRow = cat.startsWith('Grado ');

        html += `
          <tr style="${isGradeRow ? 'background-color:#f8fafc; font-weight:700;' : ''}">
            <td><strong>${cat}</strong></td>
            <td>${total}</td>
            <td><span class="badge-desempeno badge-bajo">${b} (${((b/total)*100).toFixed(1)}%)</span></td>
            <td><span class="badge-desempeno badge-basico">${bs} (${((bs/total)*100).toFixed(1)}%)</span></td>
            <td><span class="badge-desempeno badge-alto">${a} (${((a/total)*100).toFixed(1)}%)</span></td>
            <td><span class="badge-desempeno badge-superior">${s} (${((s/total)*100).toFixed(1)}%)</span></td>
          </tr>`;
      });
      tbody.innerHTML = html;
    }
  }

  // ==========================================================================
  // MÓDULO 6: Consulta por Ciclo (Detalle Pedagógico)
  // ==========================================================================

  function renderCiclosModule() {
    renderPedagogicalContextBar('context-banner-ciclos');

    const records = state.currentFilteredRecords;
    const filterState = window.Filters.getState();
    const ciclos = (state.configs.institucion && state.configs.institucion.ciclos) ? state.configs.institucion.ciclos : {
      "1": ["1", "2", "3"],
      "2": ["4", "5"],
      "3": ["6", "7"],
      "4": ["8", "9"],
      "5": ["10", "11"]
    };

    const cyclesData = {};
    const tbody = document.getElementById('table-ciclos-body');

    let html = '';
    Object.entries(ciclos).forEach(([cNum, gList]) => {
      const cRecords = records.filter(r => gList.includes(String(r.GRADO).trim()));
      const scores = cRecords
        .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
        .filter(s => !isNaN(s));
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      
      const label = `Ciclo ${cNum}`;
      cyclesData[label] = {
        promedio: avg,
        totalEstudiantes: cRecords.length,
        grados: gList.join('°, ') + '°'
      };

      html += `
        <tr>
          <td><strong>${label}</strong></td>
          <td>Grados: ${cyclesData[label].grados}</td>
          <td>${cRecords.length}</td>
          <td class="score-cell">${avg > 0 ? avg.toFixed(2) : '-'}</td>
          <td>
            <button class="btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" 
              onclick="Filters.setFilter('ciclo', '${cNum}')">
              Filtrar Ciclo
            </button>
          </td>
        </tr>`;
    });

    if (tbody) tbody.innerHTML = html;
    window.Charts.renderCyclesComparison('chart-ciclos-comparison', cyclesData);

    // Requerimiento 11: Desglose de grados y grupos por ciclo cuando se selecciona 'todos' o un ciclo
    const drilldownCard = document.getElementById('card-ciclos-drilldown');
    if (drilldownCard) {
      drilldownCard.style.display = 'block';
      let activeCiclos = ciclos;
      if (filterState.ciclo !== 'todos' && ciclos[filterState.ciclo]) {
        activeCiclos = { [filterState.ciclo]: ciclos[filterState.ciclo] };
      }
      window.Charts.renderCyclesDrilldown('chart-ciclos-drilldown', records, activeCiclos);
    }
  }

  // ==========================================================================
  // MÓDULO 7: Trazabilidad de Estudiantes (Detalle Pedagógico)
  // ==========================================================================

  function renderTrazabilidadModule() {
    renderPedagogicalContextBar('context-banner-trazabilidad');

    const searchInput = document.getElementById('student-search-input');
    const resultsContainer = document.getElementById('student-search-autocomplete');

    if (searchInput && resultsContainer) {
      searchInput.oninput = function() {
        const val = window.Filters.normalizarNombre(searchInput.value);
        if (val.length < 2) {
          resultsContainer.style.display = 'none';
          return;
        }

        const matched = [];
        const seen = new Set();

        state.rawRecords.forEach(r => {
          const norm = window.Filters.normalizarNombre(r.ESTUDIANTE);
          const doc = String(r.DOCUMENTO || '');
          if ((norm.includes(val) || doc.includes(val)) && !seen.has(norm)) {
            seen.add(norm);
            matched.push({
              nombre: r.ESTUDIANTE,
              documento: r.DOCUMENTO,
              grado: r.GRADO,
              grupo: r.GRUPO
            });
          }
        });

        if (matched.length > 0) {
          resultsContainer.innerHTML = matched.slice(0, 8).map(m => `
            <div class="autocomplete-item" onclick="App.openStudentModal('${escapeForJs(m.nombre)}')">
              <div>
                <div class="autocomplete-name">${escapeHtml(m.nombre)}</div>
                <div class="autocomplete-meta">Doc: ${m.documento} | Grado ${m.grado}° (${m.grupo})</div>
              </div>
              <span class="badge-desempeno badge-alto">Ver Ficha</span>
            </div>
          `).join('');
          resultsContainer.style.display = 'block';
        } else {
          resultsContainer.style.display = 'none';
        }
      };
    }
  }

  /**
   * Abre la Ficha y Trazabilidad de un Estudiante en la ventana emergente
   * Cumple con Requerimiento 9: muestra la evolución global y el desempeño por área en las 3 pruebas
   */
  function openStudentModal(studentName) {
    const norm = window.Filters.normalizarNombre(studentName);
    const tests = state.rawRecords.filter(r => window.Filters.normalizarNombre(r.ESTUDIANTE) === norm);
    if (tests.length === 0) return;

    const order = new Map(getAvailablePruebas().map((code, idx) => [code, idx]));
    const orderOf = (value) => {
      const code = pruebaCode(value);
      return order.has(code) ? order.get(code) : order.size + 1;
    };
    tests.sort((a, b) => orderOf(a.PRUEBA) - orderOf(b.PRUEBA));

    const latest = tests[tests.length - 1];
    setText('modal-student-name', latest.ESTUDIANTE);
    setText('modal-student-meta', `Documento: ${latest.DOCUMENTO} | Último Grado: ${latest.GRADO}° (Grupo ${latest.GRUPO})`);

    const tbody = document.getElementById('modal-student-history-body');
    if (tbody) {
      tbody.innerHTML = tests.map(t => {
        const info = window.Filters.getDesempenoInfo(t.DESEMPEÑO);
        return `
          <tr>
            <td><strong>Misión ${t.PRUEBA}</strong></td>
            <td>Grado ${t.GRADO}° (${t.GRUPO})</td>
            <td>Puesto ${t.PUESTO || '-'}</td>
            <td class="score-cell">${t.PUNTAJE}</td>
            <td>
              <span class="badge-desempeno badge-${info.key.toLowerCase()}">
                <span class="badge-dot"></span> ${info.label}
              </span>
            </td>
            <td>${t.LENGUAJE || '-'}</td>
            <td>${t['MATEMÁTICAS'] || '-'}</td>
            <td>${t['CIENCIAS NATURALES'] || '-'}</td>
            <td>${t['SOCIALES Y CIUDADANAS'] || '-'}</td>
            <td>${t['INGLÉS'] || '-'}</td>
          </tr>
        `;
      }).join('');
    }

    const studentTestsData = tests.map(t => ({
      prueba: t.PRUEBA,
      puntaje: parseFloat(String(t.PUNTAJE).replace(',', '.')) || 0
    }));

    // Gráfico 1: Evolución temporal del puntaje global
    window.Charts.renderStudentHistory('chart-student-modal-history', studentTestsData);

    // Requerimiento 9: Comparativa de desempeño en cada área en las 3 pruebas (Alfa, Beta, Gamma)
    window.Charts.renderStudentAreasComparison(
      'chart-student-modal-areas-comparison',
      tests,
      ['Lenguaje', 'Matematicas', 'Ciencias Naturales', 'Sociales', 'Ingles']
    );

    const modalBackdrop = document.getElementById('student-modal-backdrop');
    if (modalBackdrop) modalBackdrop.classList.add('active');
  }

  // ==========================================================================
  // MÓDULO 8: Centro de Exportación
  // ==========================================================================

  function renderExportacionModule() {
    const records = state.currentFilteredRecords;
    const filterState = window.Filters.getState();

    setText('export-count-records', `${records.length} registros listos para exportar`);
    setText('export-filter-summary', `
      Filtros: Tipo [${filterState.tipoPrueba}], Prueba [${filterState.prueba}], 
      Ciclo [${filterState.ciclo}], Grado [${filterState.grado}], Grupo [${filterState.grupo}]
    `);
  }

  // ==========================================================================
  // Funciones Auxiliares
  // ==========================================================================

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text !== undefined && text !== null ? text : '';
  }

  function showLoading(show) {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
  }

  function showGlobalError(msg) {
    alert(msg);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeForJs(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // Inicialización al cargar la ventana
  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    switchModule,
    setSelectedArea,
    openStudentModal,
    quickSelectGrupo
  };
})();

// Exportar globalmente
window.App = App;
