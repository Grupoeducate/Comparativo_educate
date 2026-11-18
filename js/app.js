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

  // Columnas de áreas: fuente única en window.Filters (getAreaColumn/getAreaLabel/getAreaScore).
  // 'Lenguaje' depende de la escala: LENGUAJE en periódicas y LECTURA CRÍTICA en Saber.

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
      anio_lectivo: 2026
    });

    // Sin usuarios registrados no hay acceso posible: no se usa ningún usuario por defecto
    const usuarios = await pick('config/usuarios.json', cfg.usuarios, { usuarios: [] });

    // Sin catálogo de pruebas configurado no se inventan nombres: las etiquetas
    // se resuelven con el código presente en el consolidado.
    const pruebas = await pick('config/pruebas.json', cfg.pruebas, { pruebas: [] });

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
   * Deriva el Puntaje Global oficial de las filas Saber que llegaron sin PUNTAJE,
   * aplicando la ponderación ICFES (Resolución 268 de 2020) sobre las áreas (0 a 100).
   * Marca cada fila derivada con PUNTAJE_DERIVADO sin alterar las columnas originales.
   * Se ejecuta una sola vez, justo después de cargar el consolidado y de inicializar
   * Filters (que ya tiene la configuración de escalas).
   */
  function derivarPuntajesGlobales() {
    let derivados = 0;
    state.rawRecords.forEach(r => {
      if (window.Filters.getTipoPrueba(r.PRUEBA) !== 'saber') return;
      const actual = parseFloat(String(r.PUNTAJE || '').replace(',', '.'));
      if (!isNaN(actual) && actual > 0) return;
      const pg = window.Filters.calcularPuntajeGlobal(r);
      if (pg !== null && !isNaN(pg)) {
        r.PUNTAJE = String(pg);
        r.PUNTAJE_DERIVADO = 'true';
        derivados++;
      }
    });
    if (derivados > 0) {
      console.log(`[Educate 360°] Puntaje global derivado con la ponderación ICFES para ${derivados} registros Saber sin PUNTAJE.`);
    }
  }

  /**
   * Inicializa la interfaz una vez validado el acceso
   */
  function bootApplication() {
    window.Filters.init(state.rawRecords, state.configs, (filteredRows) => {
      state.currentFilteredRecords = filteredRows;
      renderActiveModule();
    });

    derivarPuntajesGlobales();

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

    const gradoLabel = currentGrado !== 'todos' ? `Grado ${currentGrado}°` : 'Todos los Grados';
    
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

  /**
   * Tipos de escala realmente presentes en los registros, en orden estable
   * (Periódicas primero). Alimenta las gráficas separadas por escala.
   */
  function getTiposPresentes(records) {
    const encontrados = [];
    (records || []).forEach(r => {
      const tipo = window.Filters.getTipoPrueba(r.PRUEBA);
      if (!encontrados.includes(tipo)) encontrados.push(tipo);
    });
    return ['periodica', 'saber'].filter(t => encontrados.includes(t));
  }

  /**
   * Mecanismo reutilizable de separación por escala:
   * - Limpia el contenedor y destruye las instancias previas de sus canvas.
   * - Crea un bloque por cada tipo presente con título, rango de escala y canvas
   *   con id `${containerId}-${tipo}`, y delega el dibujo a buildFn.
   * Solo se generan bloques para los tipos con datos: una institución con una
   * sola escala conserva exactamente una gráfica.
   */
  function renderSplitCharts(containerId, tipos, buildFn) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Destruye las gráficas previas del contenedor (incluye canvas eliminados del DOM)
    container.querySelectorAll('canvas[id]').forEach(canvas => {
      window.Charts.destroyChart(canvas.id);
    });
    container.innerHTML = '';

    // Abreviaturas oficiales de las áreas para la fórmula de ponderación ICFES
    const ABREVIATURAS_PONDERACION = {
      'LECTURA CRÍTICA': 'LC',
      'MATEMÁTICAS': 'MA',
      'CIENCIAS NATURALES': 'CN',
      'SOCIALES Y CIUDADANAS': 'SC',
      'INGLÉS': 'IN'
    };

    const tiposPresentes = (tipos || []).filter(t => t === 'periodica' || t === 'saber');

    tiposPresentes.forEach((tipo, idx) => {
      const escala = window.Filters.getEscala(tipo);
      const escalaArea = window.Filters.getEscalaArea(tipo);
      const pond = window.Filters.getPonderacion(tipo);
      const titulo = tipo === 'saber' ? 'Pruebas Saber' : 'Pruebas Periódicas';

      // Texto de escalas: en Saber se muestran AMBAS (áreas 0–100 y puntaje global 0–500
      // con su fórmula oficial); en periódicas área y puntaje comparten la escala 1 a 5.
      let textoEscala;
      if (pond) {
        const formula = Object.entries(pond.pesos)
          .map(([columna, peso]) => `${peso}·${ABREVIATURAS_PONDERACION[columna] || columna}`)
          .join(' + ');
        textoEscala = `Áreas ${escalaArea.minimo} a ${escalaArea.maximo} · Puntaje global ${escala.minimo} a ${escala.maximo} (${formula})/${pond.divisor} × ${pond.factor}`;
      } else {
        textoEscala = `Áreas y puntaje ${escalaArea.minimo} a ${escalaArea.maximo}`;
      }

      const block = document.createElement('div');
      block.className = 'chart-block' + (idx > 0 ? ' with-divider' : '');
      block.innerHTML = `
        <div class="chart-block-header">
          <div class="chart-block-title">${titulo}</div>
          <div class="chart-block-scale">${textoEscala} · Niveles: ${window.Filters.getNivelLabels(tipo).join(', ')}</div>
        </div>
        <div class="chart-container">
          <canvas id="${containerId}-${tipo}"></canvas>
        </div>
      `;
      container.appendChild(block);

      if (typeof buildFn === 'function') {
        buildFn(`${containerId}-${tipo}`, tipo, escala);
      }
    });
  }

  /**
   * Lista de áreas académicas del consolidado (claves internas de config/areas.json).
   */
  function getAreasList() {
    return ['Lenguaje', 'Matematicas', 'Ciencias Naturales', 'Sociales', 'Ingles'];
  }

  /**
   * Mapa de etiquetas visibles por área para la escala indicada.
   * En pruebas Saber el área de Lenguaje se muestra como "Lectura Crítica".
   */
  function getEtiquetasAreas(tipo) {
    const etiquetas = {};
    getAreasList().forEach(a => {
      etiquetas[a] = window.Filters.getAreaLabel(a, tipo);
    });
    return etiquetas;
  }

  /**
   * Áreas resueltas para gráficas: clave interna, etiqueta visible y columna
   * del CSV correspondiente a la escala indicada.
   */
  function getAreasResueltas(tipo) {
    return getAreasList().map(a => ({
      key: a,
      label: window.Filters.getAreaLabel(a, tipo),
      col: window.Filters.getAreaColumn(a, tipo)
    }));
  }

  /**
   * Promedio por área académica de un subconjunto de registros (un solo tipo de escala).
   */
  function computeAreaAverages(records, areasList, tipo) {
    const areaAverages = {};
    areasList.forEach(areaName => {
      const areaScores = records
        .map(r => window.Filters.getAreaScore(r, areaName, tipo))
        .filter(s => !isNaN(s));
      areaAverages[areaName] = areaScores.length > 0
        ? areaScores.reduce((a, b) => a + b, 0) / areaScores.length
        : 0;
    });
    return areaAverages;
  }

  /**
   * Distribución de desempeños de un subconjunto de registros según la escala
   * de la prueba de cada fila. Las claves son las ranuras internas estables.
   */
  function computeDistribution(records) {
    const distribution = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
    records.forEach(r => {
      const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO, window.Filters.getTipoPrueba(r.PRUEBA));
      if (distribution[info.key] !== undefined) {
        distribution[info.key]++;
      }
    });
    return distribution;
  }

  function renderDashboardModule() {
    const records = state.currentFilteredRecords;

    const totalEstudiantes = new Set(records.map(r => window.Filters.normalizarNombre(r.ESTUDIANTE))).size;
    const totalGrados = new Set(records.map(r => r.GRADO).filter(Boolean)).size;
    const totalGrupos = new Set(records.map(r => `${r.GRADO}-${r.GRUPO}`).filter(Boolean)).size;

    setText('kpi-estudiantes-total', totalEstudiantes);
    setText('kpi-grados-total', totalGrados);
    setText('kpi-grupos-total', totalGrupos);

    const areasList = getAreasList();
    const tipos = getTiposPresentes(records);

    // Los promedios generales solo son comparables dentro de una misma escala
    if (tipos.length !== 1) {
      // Con escalas mixtas (o sin registros tras los filtros) el promedio general no es comparable
      setText('kpi-promedio-general', '-');
      setText('kpi-mejor-area-nombre', '-');
      setText('kpi-mejor-area-score', '-');
      setText('kpi-area-critica-nombre', '-');
      setText('kpi-area-critica-score', '-');
      setText('kpi-promedio-hint', tipos.length > 1
        ? 'Escalas mixtas: el promedio general no es comparable'
        : 'Sin registros para los filtros aplicados');

      const badgeEl = document.getElementById('kpi-promedio-badge');
      if (badgeEl) {
        badgeEl.innerHTML = '<span class="badge-dot"></span> Escalas mixtas';
        badgeEl.className = 'badge-desempeno badge-mixta';
      }
    } else {
      const tipo = tipos[0];
      const escala = window.Filters.getEscala(tipo);
      // Los KPI de mejor/crítica comparan ÁREAS: usan la escala de áreas (0–100 en Saber),
      // mientras el promedio general usa la escala global del PUNTAJE (0–500 en Saber).
      const escalaArea = window.Filters.getEscalaArea(tipo);

      const scores = records
        .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
        .filter(s => !isNaN(s));

      const generalAverage = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

      const areaAverages = computeAreaAverages(records, areasList, tipo);

      let bestArea = { name: 'N/A', avg: 0 };
      let criticalArea = { name: 'N/A', avg: escalaArea.maximo + 0.1 };

      Object.entries(areaAverages).forEach(([name, avg]) => {
        if (avg > bestArea.avg) bestArea = { name, avg };
        if (avg > 0 && avg < criticalArea.avg) criticalArea = { name, avg };
      });

      if (criticalArea.avg > escalaArea.maximo) criticalArea = { name: 'Ninguna', avg: 0 };

      setText('kpi-promedio-general', generalAverage > 0 ? generalAverage.toFixed(2) : '-');
      setText('kpi-mejor-area-nombre', window.Filters.getAreaLabel(bestArea.name, tipo));
      setText('kpi-mejor-area-score', bestArea.avg > 0 ? `${bestArea.avg.toFixed(2)} / ${escalaArea.maximo}` : '-');
      setText('kpi-area-critica-nombre', window.Filters.getAreaLabel(criticalArea.name, tipo));
      setText('kpi-area-critica-score', criticalArea.avg > 0 ? `${criticalArea.avg.toFixed(2)} / ${escalaArea.maximo}` : '-');

      // Aclaración del promedio general: en Saber es el Puntaje Global oficial ponderado
      // (IG = (3·LC + 3·MA + 3·CN + 3·SC + 1·IN)/13, PG = IG×5), no el promedio simple de áreas.
      setText('kpi-promedio-hint', tipo === 'saber'
        ? 'Puntaje Global oficial ICFES (ponderado)'
        : 'Promedio en escala de 1 a 5');

      // Nivel de desempeño del promedio según la escala oficial del tipo
      const genNivel = window.Filters.getNivelPorPuntaje(tipo, generalAverage);
      const badgeEl = document.getElementById('kpi-promedio-badge');
      if (badgeEl) {
        badgeEl.innerHTML = `<span class="badge-dot"></span> Desempeño ${genNivel.label}`;
        badgeEl.className = `badge-desempeno badge-${genNivel.key.toLowerCase()}`;
      }
    }

    // Gráficas separadas por escala (una sola cuando la institución usa un único tipo)
    const areaAveragesPorTipo = {};
    const distributionPorTipo = {};
    tipos.forEach(tipo => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      areaAveragesPorTipo[tipo] = computeAreaAverages(recsTipo, areasList, tipo);
      distributionPorTipo[tipo] = computeDistribution(recsTipo);
    });

    // Promedio comparativo por área con valores numéricos sobre las barras.
    // Las áreas se grafican en su ESCALA DE ÁREAS (0–100 en Saber, 1–5 en periódicas).
    renderSplitCharts('split-chart-dashboard-areas', tipos, (canvasId, tipo, escala) => {
      window.Charts.renderExecutiveOverview(
        canvasId,
        areaAveragesPorTipo[tipo],
        distributionPorTipo[tipo],
        { escala: window.Filters.getEscalaArea(tipo), niveles: window.Filters.getNiveles(tipo), etiquetas: getEtiquetasAreas(tipo) }
      );
    });

    // Distribución institucional por escala
    renderSplitCharts('split-chart-dashboard-donut', tipos, (canvasId, tipo, escala) => {
      window.Charts.renderExecutiveDonut(
        canvasId,
        distributionPorTipo[tipo],
        { escala, niveles: window.Filters.getNiveles(tipo) }
      );
    });

    renderDashboardGradesTable(records, areasList, tipos);
  }

  /**
   * Resumen de Desempeño por Grado con barra apilada cromática.
   * Cuando el consolidado mezcla escalas, se genera una fila por grado y tipo,
   * con etiquetas y colores de los niveles de la escala correspondiente.
   */
  function renderDashboardGradesTable(records, areasList, tipos) {
    const container = document.getElementById('dashboard-grades-table-body');
    if (!container) return;

    const tiposPresentes = Array.isArray(tipos) && tipos.length > 0 ? tipos : getTiposPresentes(records);
    const mixto = tiposPresentes.length > 1;

    let html = '';
    tiposPresentes.forEach(tipo => {
      const escala = window.Filters.getEscala(tipo);
      const niveles = window.Filters.getNiveles(tipo);
      const colores = window.Filters.getNivelColors(tipo);
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);

      const grades = [...new Set(recsTipo.map(r => r.GRADO).filter(Boolean))]
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      grades.forEach(g => {
        const gradeRecords = recsTipo.filter(r => r.GRADO === g);
        const scores = gradeRecords
          .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
          .filter(s => !isNaN(s));
        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '-';

        const perfCounts = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
        gradeRecords.forEach(r => {
          const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO, tipo);
          if (perfCounts[info.key] !== undefined) {
            perfCounts[info.key]++;
          }
        });

        const total = perfCounts.Bajo + perfCounts.Basico + perfCounts.Alto + perfCounts.Superior || 1;
        const porcentajes = niveles.map(n => (perfCounts[n.key] / total) * 100);

        const etiquetaGrado = mixto ? `${escala.etiqueta} · Grado ${g}°` : `Grado ${g}°`;
        const tituloDistribucion = `Distribución (${escala.etiqueta}): ` +
          niveles.map((n, i) => `${n.label} ${porcentajes[i].toFixed(1)}%`).join(', ');

        const badges = niveles.map(n =>
          `<span class="badge-desempeno badge-${n.key.toLowerCase()}" title="${n.label}">${perfCounts[n.key]}</span>`
        ).join('');

        const segmentos = niveles.map((n, i) => porcentajes[i] > 0
          ? `<div style="width:${porcentajes[i]}%; height:100%; background:${colores[i]};" title="${n.label}: ${perfCounts[n.key]} (${porcentajes[i].toFixed(1)}%)"></div>`
          : ''
        ).join('');

        html += `
          <tr>
            <td><strong>${etiquetaGrado}</strong></td>
            <td>${gradeRecords.length}</td>
            <td class="score-cell">${avg}</td>
            <td>
              <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                ${badges}
                <div class="mini-stacked-bar" style="flex:1; min-width:130px; max-width:200px; height:14px; background:#e2e8f0; border-radius:4px; overflow:hidden; display:flex; box-shadow:inset 0 1px 2px rgba(0,0,0,0.1);" title="${tituloDistribucion}">
                  ${segmentos}
                </div>
              </div>
            </td>
          </tr>`;
      });
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
   * Etiqueta visible de una prueba: el nombre de config/pruebas.json cuando el
   * código coincide; en caso contrario el código presente en el consolidado,
   * sin asumir nombres de pruebas que no están en los datos.
   */
  function pruebaLabel(codigo) {
    const code = pruebaCode(codigo);
    const cfg = getPruebaCatalog().find(cp => {
      const nombre = pruebaCode(cp.nombre);
      return pruebaCode(cp.id) === code || nombre === code || nombre.endsWith(' ' + code);
    });
    return cfg && cfg.nombre ? cfg.nombre : code;
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

  /**
   * Calcula los promedios generales y por área de una lista de pruebas.
   * Cada prueba usa su propia escala: en Saber el área de Lenguaje se lee de
   * LECTURA CRÍTICA y en periódicas de LENGUAJE.
   */
  function computeEvolucionData(records, pruebas, areasList) {
    const generalAverages = [];
    const areaAveragesMap = {};
    areasList.forEach(a => areaAveragesMap[a] = []);

    pruebas.forEach(p => {
      const pRecords = records.filter(r => String(r.PRUEBA).toUpperCase() === p);
      const tipoPrueba = window.Filters.getTipoPrueba(p);
      const scores = pRecords
        .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
        .filter(s => !isNaN(s));
      const pAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      generalAverages.push(pAvg);

      areasList.forEach(a => {
        const aScores = pRecords
          .map(r => window.Filters.getAreaScore(r, a, tipoPrueba))
          .filter(s => !isNaN(s));
        const aAvg = aScores.length > 0 ? aScores.reduce((x, y) => x + y, 0) / aScores.length : 0;
        areaAveragesMap[a].push(aAvg);
      });
    });

    return { generalAverages, areaAveragesMap };
  }

  function renderEvolucionModule() {
    const records = state.currentFilteredRecords;
    // La matriz solo muestra las pruebas que sobreviven a los filtros activos
    const pruebas = getAvailablePruebas(records);
    const areasList = getAreasList();
    const tipos = getTiposPresentes(records);

    // Curva de crecimiento por escala: una gráfica por cada tipo presente
    renderSplitCharts('split-chart-evolucion', tipos, (canvasId, tipo, escala) => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      const pruebasTipo = getAvailablePruebas(recsTipo);
      if (pruebasTipo.length === 0) return;

      const { generalAverages, areaAveragesMap } = computeEvolucionData(recsTipo, pruebasTipo, areasList);

      // Leyenda con la etiqueta visible de cada área según la escala
      const areasLabeled = {};
      const coloresArea = {};
      areasList.forEach(a => {
        const label = window.Filters.getAreaLabel(a, tipo);
        areasLabeled[label] = areaAveragesMap[a];
        coloresArea[label] = window.Charts.AREA_COLORS[a] || '#0284c7';
      });

      // Gráfico de línea interactivo (permite ocultar/mostrar líneas de área haciendo clic en la leyenda)
      if (tipo === 'saber') {
        // En Saber el puntaje global (0 a 500) y las áreas (0 a 100) no comparten escala:
        // se dibujan dos curvas para no aplastar las líneas de área contra el eje global.
        const canvasBase = document.getElementById(canvasId);
        if (canvasBase && canvasBase.parentElement) {
          const contenedorBase = canvasBase.parentElement;
          const areasId = `${canvasId}-areas`;
          contenedorBase.insertAdjacentHTML('beforebegin', '<div class="chart-block-scale">Puntaje global por prueba (0 a 500)</div>');
          contenedorBase.insertAdjacentHTML('afterend', `<div class="chart-block-scale" style="margin-top:1rem;">Promedios por área (0 a 100)</div><div class="chart-container" style="min-height:280px;"><canvas id="${areasId}"></canvas></div>`);

          window.Charts.renderEvolutionChart(canvasId, {
            pruebas: pruebasTipo,
            promedioGeneral: generalAverages
          }, { escala, niveles: window.Filters.getNiveles(tipo) });

          window.Charts.renderEvolutionChart(areasId, {
            pruebas: pruebasTipo,
            promedioGeneral: null,
            areas: areasLabeled,
            colores: coloresArea
          }, { escala: window.Filters.getEscalaArea(tipo), niveles: window.Filters.getNiveles(tipo) });
        }
        return;
      }

      window.Charts.renderEvolutionChart(canvasId, {
        pruebas: pruebasTipo,
        promedioGeneral: generalAverages,
        areas: areasLabeled,
        colores: coloresArea
      }, { escala, niveles: window.Filters.getNiveles(tipo) });
    });

    const { generalAverages, areaAveragesMap } = computeEvolucionData(records, pruebas, areasList);

    const tbody = document.getElementById('table-evolucion-body');
    if (tbody && pruebas.length === 0) {
      const hayPruebasEnConsolidado = getAvailablePruebas().length > 0;
      const mensaje = hayPruebasEnConsolidado
        ? 'Ninguna prueba del consolidado coincide con los filtros aplicados.'
        : 'El consolidado no contiene pruebas registradas.';
      tbody.innerHTML = `<tr><td colspan="10" class="text-center">${mensaje}</td></tr>`;
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

        // Escala oficial de la prueba: puntaje global y escala de áreas, para que
        // los promedios de la matriz sean interpretables en cada columna.
        const tipoPrueba = window.Filters.getTipoPrueba(p);
        const escalaPrueba = window.Filters.getEscala(tipoPrueba);
        const escalaAreaPrueba = window.Filters.getEscalaArea(tipoPrueba);

        html += `
          <tr>
            <td><strong>${escapeHtml(pruebaLabel(p))}</strong></td>
            <td>${escalaPrueba.etiqueta} ${escalaPrueba.minimo}–${escalaPrueba.maximo} · Áreas ${escalaAreaPrueba.minimo}–${escalaAreaPrueba.maximo}</td>
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
    // Separada por escala para no mezclar puntajes 1-5 con puntajes 0-500 en un mismo eje.
    // Las barras son promedios de ÁREAS: se pasa la escala de áreas (0–100 en Saber).
    renderSplitCharts('split-chart-evolucion-grupos', tipos, (canvasId, tipo, escala) => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      if (recsTipo.length === 0) return;
      window.Charts.renderGradeGroupComparison(
        canvasId,
        recsTipo,
        getAreasResueltas(tipo),
        { escala: window.Filters.getEscalaArea(tipo) }
      );
    });
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

      const desInfo = window.Filters.getDesempenoInfo(row.DESEMPEÑO, window.Filters.getTipoPrueba(row.PRUEBA));
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
          <td><span class="badge-desempeno" style="background:#f1f5f9; color:#334155;">${escapeHtml(pruebaLabel(row.PRUEBA))}</span></td>
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

    // Promedio del área y de sus componentes por escala presente. Cada escala
    // lee su columna propia: en Saber el área de Lenguaje es LECTURA CRÍTICA
    // y en periódicas es LENGUAJE.
    let tiposArea = getTiposPresentes(records);

    const datosPorTipo = {};
    tiposArea.forEach(tipo => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      const areaScores = recsTipo
        .map(r => window.Filters.getAreaScore(r, currentAreaCfg.nombre, tipo))
        .filter(s => !isNaN(s));
      const componentsData = {};
      if (currentAreaCfg.componentes && currentAreaCfg.componentes.length > 0) {
        currentAreaCfg.componentes.forEach(compName => {
          const col = COMPONENT_COLUMNS[compName] || compName.toUpperCase();
          const compScores = recsTipo
            .map(r => parseFloat(String(r[col] || '').replace(',', '.')))
            .filter(s => !isNaN(s));
          componentsData[compName] = compScores.length > 0
            ? compScores.reduce((a, b) => a + b, 0) / compScores.length
            : 0;
        });
      }
      datosPorTipo[tipo] = {
        areaAvg: areaScores.length > 0 ? areaScores.reduce((a, b) => a + b, 0) / areaScores.length : 0,
        componentsData
      };
    });

    const compGrid = document.getElementById('area-components-grid');
    if (compGrid) {
      let compHtml = '';
      tiposArea.forEach(tipo => {
        // Las áreas se presentan en la ESCALA DE ÁREAS (0–100 en Saber, 1–5 en periódicas)
        const escalaArea = window.Filters.getEscalaArea(tipo);
        const maximo = escalaArea.maximo;
        const datos = datosPorTipo[tipo];
        const areaLabel = window.Filters.getAreaLabel(currentAreaCfg.nombre, tipo);
        const tituloGeneral = tiposArea.length > 1
          ? `Área General (${areaLabel} · ${escala.etiqueta})`
          : `Área General (${areaLabel})`;

        compHtml += `
          <div class="component-card" style="border-left: 4px solid var(--primary);">
            <div class="component-title">${tituloGeneral}</div>
            <div class="component-score">${datos.areaAvg > 0 ? datos.areaAvg.toFixed(2) : '-'} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">/ ${maximo}</span></div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width:${(datos.areaAvg / maximo) * 100}%; background:var(--primary);"></div>
            </div>
          </div>
        `;

        Object.entries(datos.componentsData).forEach(([compName, score]) => {
          const pct = (score / maximo) * 100;
          compHtml += `
            <div class="component-card">
              <div class="component-title">${compName}</div>
              <div class="component-score">${score > 0 ? score.toFixed(2) : '-'} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">/ ${maximo}</span></div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:${pct}%; background:#64748b;"></div>
              </div>
            </div>
          `;
        });
      });

      compGrid.innerHTML = compHtml;
    }

    const titleEl = document.getElementById('title-chart-area-components');
    const subtitleEl = document.getElementById('subtitle-chart-area-components');
    const areaTitulo = tiposArea.length === 1
      ? window.Filters.getAreaLabel(currentAreaCfg.nombre, tiposArea[0])
      : currentAreaCfg.nombre;

    // Requerimiento 10: Cuando 'todos' está seleccionado, muestra el promedio de cada grado y de cada grupo
    // La gráfica se separa por escala para no mezclar puntajes 1-5 con 0-500 en un mismo eje.
    if (isAllGrades) {
      if (titleEl) titleEl.textContent = `Promedios por Grado y Grupo en ${areaTitulo}`;
      if (subtitleEl) subtitleEl.textContent = `Desglose institucional de todos los grados y sus grupos en ${areaTitulo}`;
    } else {
      if (titleEl) titleEl.textContent = `Comparativa de Componentes - ${areaTitulo}`;
      if (subtitleEl) subtitleEl.textContent = `Puntajes de componentes de ${areaTitulo} vs máximo esperado`;
    }

    renderSplitCharts('split-chart-area-components', getTiposPresentes(records), (canvasId, tipo, escala) => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      if (recsTipo.length === 0) return;
      const areaLabel = window.Filters.getAreaLabel(currentAreaCfg.nombre, tipo);
      // Los puntajes graficados son de ÁREA/componentes: se pasa la escala de áreas
      const escalaArea = window.Filters.getEscalaArea(tipo);
      if (isAllGrades) {
        window.Charts.renderAreaAllGradesGroupsChart(canvasId, currentAreaCfg.nombre, recsTipo, {
          escala: escalaArea,
          areaLabel,
          col: window.Filters.getAreaColumn(currentAreaCfg.nombre, tipo)
        });
      } else {
        window.Charts.renderAreaComponentsChart(
          canvasId,
          areaLabel,
          datosPorTipo[tipo].areaAvg,
          datosPorTipo[tipo].componentsData,
          { escala: escalaArea }
        );
      }
    });
  }

  function setSelectedArea(areaName) {
    state.selectedArea = areaName;
    renderAreasModule();
  }

  // ==========================================================================
  // MÓDULO 5: Distribución de Desempeños (Detalle Pedagógico)
  // ==========================================================================

  /**
   * Leyenda oficial de colores construida según las escalas presentes.
   * Cada tipo muestra sus nombres oficiales y colores de config/escalas.json y config/desempenos.json.
   */
  function renderLeyendaDesempenos(tipos) {
    const cont = document.getElementById('leyenda-desempenos');
    if (!cont) return;

    const mixto = tipos.length > 1;
    cont.innerHTML = tipos.map(tipo => {
      const escala = window.Filters.getEscala(tipo);
      const niveles = window.Filters.getNiveles(tipo);
      const prefijo = mixto ? `<span class="legend-item legend-group">${escala.etiqueta}:</span>` : '';
      return prefijo + niveles.map(n => `
        <div class="legend-item" title="${n.label}: ${n.minimo} a ${n.maximo}">
          <span class="legend-color-box" style="background:${n.color};"></span>
          <span>${n.label}</span>
        </div>`).join('');
    }).join('');
    cont.style.display = tipos.length > 0 ? 'flex' : 'none';
  }

  /**
   * Categorías y conteos de desempeño de un subconjunto de registros (un solo tipo),
   * usando la escala de la prueba de cada fila.
   */
  function computeStackedData(records, tipo) {
    const data = { categories: [], bajo: [], basico: [], alto: [], superior: [] };

    const uniqueGrades = [...new Set(records.map(r => r.GRADO).filter(Boolean))]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    // Requerimiento 10: Cuando la opción todos está seleccionada, se muestra por grado y por cada grupo
    uniqueGrades.forEach(g => {
      const gRecords = records.filter(r => r.GRADO === g);

      // Categoría del Grado completo
      data.categories.push(`Grado ${g}°`);
      const cG = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
      gRecords.forEach(r => {
        const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO, tipo);
        if (cG[info.key] !== undefined) cG[info.key]++;
      });
      data.bajo.push(cG.Bajo);
      data.basico.push(cG.Basico);
      data.alto.push(cG.Alto);
      data.superior.push(cG.Superior);

      // Grupos del grado
      const groups = [...new Set(gRecords.map(r => r.GRUPO).filter(Boolean))].sort();
      groups.forEach(grp => {
        const grpRecords = gRecords.filter(r => r.GRUPO === grp);
        data.categories.push(`G ${g}°-${grp}`);
        const cGrp = { Bajo: 0, Basico: 0, Alto: 0, Superior: 0 };
        grpRecords.forEach(r => {
          const info = window.Filters.getDesempenoInfo(r.DESEMPEÑO, tipo);
          if (cGrp[info.key] !== undefined) cGrp[info.key]++;
        });
        data.bajo.push(cGrp.Bajo);
        data.basico.push(cGrp.Basico);
        data.alto.push(cGrp.Alto);
        data.superior.push(cGrp.Superior);
      });
    });

    return data;
  }

  function renderDesempenosModule() {
    renderPedagogicalContextBar('context-banner-desempenos');

    const records = state.currentFilteredRecords;
    const tipos = getTiposPresentes(records);

    renderLeyendaDesempenos(tipos);

    // Datos apilados por escala y gráfica separada por tipo presente
    const datosPorTipo = {};
    tipos.forEach(tipo => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      datosPorTipo[tipo] = computeStackedData(recsTipo, tipo);
    });

    renderSplitCharts('split-chart-desempenos', tipos, (canvasId, tipo, escala) => {
      const d = datosPorTipo[tipo];
      window.Charts.renderStackedPerformance(
        canvasId,
        d.categories,
        d.bajo,
        d.basico,
        d.alto,
        d.superior,
        { escala, niveles: window.Filters.getNiveles(tipo) }
      );
    });

    const tbody = document.getElementById('table-desempenos-body');
    if (tbody) {
      const mixto = tipos.length > 1;
      let html = '';
      tipos.forEach(tipo => {
        const niveles = window.Filters.getNiveles(tipo);
        const d = datosPorTipo[tipo];
        const prefijo = mixto ? `${window.Filters.getEscala(tipo).etiqueta} · ` : '';

        d.categories.forEach((cat, idx) => {
          const valores = [d.bajo[idx], d.basico[idx], d.alto[idx], d.superior[idx]];
          const total = valores.reduce((a, b) => a + b, 0) || 1;
          const isGradeRow = cat.startsWith('Grado ');

          const celdas = niveles.map((n, i) => {
            const count = valores[i];
            const pct = (count / total) * 100;
            return `<td><span class="badge-desempeno badge-${n.key.toLowerCase()}" title="${n.label}">${count} (${pct.toFixed(1)}%)</span></td>`;
          }).join('');

          html += `
            <tr style="${isGradeRow ? 'background-color:#f8fafc; font-weight:700;' : ''}">
              <td><strong>${prefijo}${cat}</strong></td>
              <td>${total}</td>
              ${celdas}
            </tr>`;
        });
      });
      tbody.innerHTML = html || '<tr><td colspan="6" class="text-center">Sin datos disponibles</td></tr>';
    }
  }

  // ==========================================================================
  // MÓDULO 6: Consulta por Ciclo (Detalle Pedagógico)
  // ==========================================================================

  function renderCiclosModule() {
    renderPedagogicalContextBar('context-banner-ciclos');

    const records = state.currentFilteredRecords;
    const filterState = window.Filters.getState();

    // Ciclos realmente presentes en el consolidado: se agrupan los grados con
    // registros según su ciclo oficial. No se muestran ciclos sin datos ni
    // grados que no aparezcan en el archivo.
    const ciclos = {};
    [...new Set(state.rawRecords.map(r => String(r.GRADO).trim()).filter(Boolean))]
      .sort(window.Filters.compararGrados)
      .forEach(grado => {
        const cNum = window.Filters.getCicloForGrade(grado);
        if (cNum === null) return;
        if (!ciclos[cNum]) ciclos[cNum] = [];
        ciclos[cNum].push(grado);
      });

    const tipos = getTiposPresentes(records);
    const tbody = document.getElementById('table-ciclos-body');

    // Promedios por ciclo calculados dentro de cada escala: nunca se mezclan
    // puntajes periódicos (1-5) con puntajes Saber (0-500) en un mismo ciclo.
    const cyclesDataPorTipo = {};
    tipos.forEach(tipo => {
      const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
      const cyclesData = {};
      Object.entries(ciclos).forEach(([cNum, gList]) => {
        const cRecords = recsTipo.filter(r => gList.includes(String(r.GRADO).trim()));
        const scores = cRecords
          .map(r => parseFloat(String(r.PUNTAJE).replace(',', '.')))
          .filter(s => !isNaN(s));
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        cyclesData[`Ciclo ${cNum}`] = {
          promedio: avg,
          totalEstudiantes: cRecords.length,
          grados: gList.join('°, ') + '°'
        };
      });
      cyclesDataPorTipo[tipo] = cyclesData;
    });

    // Tabla de estructura de ciclos: con escalas mixtas se genera una fila por
    // ciclo y tipo de prueba para no promediar escalas distintas en una sola celda.
    if (tbody) {
      const mixto = tipos.length > 1;
      let html = '';
      tipos.forEach(tipo => {
        const escala = window.Filters.getEscala(tipo);
        Object.entries(ciclos).forEach(([cNum]) => {
          const data = cyclesDataPorTipo[tipo][`Ciclo ${cNum}`];
          const label = mixto ? `Ciclo ${cNum} · ${escala.etiqueta}` : `Ciclo ${cNum}`;

          html += `
        <tr>
          <td><strong>${label}</strong></td>
          <td>Grados: ${data.grados}</td>
          <td>${data.totalEstudiantes}</td>
          <td class="score-cell">${data.promedio > 0 ? data.promedio.toFixed(2) : '-'}</td>
          <td>
            <button class="btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;"
              onclick="Filters.setFilter('ciclo', '${cNum}')">
              Filtrar Ciclo
            </button>
          </td>
        </tr>`;
        });
      });
      tbody.innerHTML = html;
    }

    // Comparativa inter-ciclos separada por escala (una sola gráfica cuando la
    // institución usa un único tipo de prueba)
    renderSplitCharts('split-chart-ciclos-comparison', tipos, (canvasId, tipo, escala) => {
      window.Charts.renderCyclesComparison(canvasId, cyclesDataPorTipo[tipo], { escala });
    });

    // Requerimiento 11: Desglose de grados y grupos por ciclo cuando se selecciona 'todos' o un ciclo.
    // También separado por escala para no mezclar puntajes en un mismo eje.
    const drilldownCard = document.getElementById('card-ciclos-drilldown');
    if (drilldownCard) {
      drilldownCard.style.display = 'block';
      let activeCiclos = ciclos;
      if (filterState.ciclo !== 'todos' && ciclos[filterState.ciclo]) {
        activeCiclos = { [filterState.ciclo]: ciclos[filterState.ciclo] };
      }
      renderSplitCharts('split-chart-ciclos-drilldown', tipos, (canvasId, tipo, escala) => {
        const recsTipo = records.filter(r => window.Filters.getTipoPrueba(r.PRUEBA) === tipo);
        window.Charts.renderCyclesDrilldown(canvasId, recsTipo, activeCiclos, { escala });
      });
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
        const info = window.Filters.getDesempenoInfo(t.DESEMPEÑO, window.Filters.getTipoPrueba(t.PRUEBA));
        // Columna de Lenguaje según la escala de la prueba (LENGUAJE o LECTURA CRÍTICA)
        const colLenguaje = window.Filters.getAreaColumn('Lenguaje', window.Filters.getTipoPrueba(t.PRUEBA));
        return `
          <tr>
            <td><strong>${escapeHtml(pruebaLabel(t.PRUEBA))}</strong></td>
            <td>Grado ${t.GRADO}° (${t.GRUPO})</td>
            <td>Puesto ${t.PUESTO || '-'}</td>
            <td class="score-cell">${t.PUNTAJE}</td>
            <td>
              <span class="badge-desempeno badge-${info.key.toLowerCase()}">
                <span class="badge-dot"></span> ${info.label}
              </span>
            </td>
            <td>${t[colLenguaje] || '-'}</td>
            <td>${t['MATEMÁTICAS'] || '-'}</td>
            <td>${t['CIENCIAS NATURALES'] || '-'}</td>
            <td>${t['SOCIALES Y CIUDADANAS'] || '-'}</td>
            <td>${t['INGLÉS'] || '-'}</td>
          </tr>
        `;
      }).join('');
    }

    // Una gráfica por cada tipo de prueba presente en la trayectoria del estudiante
    const tiposStudent = getTiposPresentes(tests);

    // Gráfico 1: Evolución temporal del puntaje global por escala
    renderSplitCharts('split-chart-student-history', tiposStudent, (canvasId, tipo, escala) => {
      const testsTipo = tests.filter(t => window.Filters.getTipoPrueba(t.PRUEBA) === tipo);
      if (testsTipo.length === 0) return;
      const studentTestsData = testsTipo.map(t => ({
        prueba: t.PRUEBA,
        puntaje: parseFloat(String(t.PUNTAJE).replace(',', '.')) || 0
      }));
      window.Charts.renderStudentHistory(canvasId, studentTestsData, { escala });
    });

    // Requerimiento 9: Comparativa de desempeño en cada área por escala.
    // Las barras son puntajes de ÁREA: se pasa la escala de áreas (0–100 en Saber).
    renderSplitCharts('split-chart-student-areas', tiposStudent, (canvasId, tipo, escala) => {
      const testsTipo = tests.filter(t => window.Filters.getTipoPrueba(t.PRUEBA) === tipo);
      if (testsTipo.length === 0) return;
      window.Charts.renderStudentAreasComparison(canvasId, testsTipo, getAreasResueltas(tipo), { escala: window.Filters.getEscalaArea(tipo) });
    });

    const modalBackdrop = document.getElementById('student-modal-backdrop');
    if (modalBackdrop) modalBackdrop.classList.add('active');
  }

  // ==========================================================================
  // MÓDULO 8: Centro de Exportación
  // ==========================================================================

  /**
   * Etiqueta visible de un tipo de prueba para resúmenes y exportación,
   * tomada de la escala configurada; nunca un tipo supuesto.
   */
  function etiquetaTipo(tipo) {
    if (tipo === 'todos') return 'Todos';
    return window.Filters.getEscala(tipo).etiqueta;
  }

  function renderExportacionModule() {
    const records = state.currentFilteredRecords;
    const filterState = window.Filters.getState();

    setText('export-count-records', `${records.length} registros listos para exportar`);
    setText('export-filter-summary', `
      Filtros: Tipo [${etiquetaTipo(filterState.tipoPrueba)}], Prueba [${filterState.prueba}], 
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
