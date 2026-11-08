/**
 * Visor Educate 360° - Módulo de Filtros Globales y Normalización
 * Basado en las secciones 6, 7, 10 y 12 de informe.md
 * Actualizado con Botón Consultar y función de inspección de grupos por grado.
 */

const Filters = (function() {
  // Estado de los filtros activos (por defecto 'periodica' al no haber pruebas Saber)
  let state = {
    tipoPrueba: 'periodica',
    prueba: 'todos',
    ciclo: 'todos',
    grado: 'todos',
    grupo: 'todos',
    area: 'todos',
    search: ''
  };

  let dataset = [];
  let configInstitucion = {};
  let configPruebas = [];
  let onFilterChange = null;

  /**
   * Normalización oficial según Sección 7 de informe.md:
   * - Eliminar tildes
   * - Eliminar espacios dobles
   * - Convertir a mayúsculas
   * - trim()
   */
  function normalizarNombre(texto) {
    if (!texto) return '';
    return String(texto)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  /**
   * Homologación y obtención de información de desempeño oficial (Sección 9 y 10.4)
   * NO recalcula desempeño, conserva el dato oficial del CSV.
   */
  function getDesempenoInfo(desempenoStr) {
    if (!desempenoStr) {
      return { nivel: 'Basico', label: 'Sin Datos', color: '#94a3b8', orden: 2, key: 'Basico' };
    }
    const d = String(desempenoStr).toUpperCase().trim();
    
    // Bajo / Insuficiente (#bf0000)
    if (d.includes('BJ') || d.includes('BAJO') || d.includes('INSUF')) {
      return { nivel: 'Bajo', label: 'Bajo', color: '#bf0000', orden: 1, key: 'Bajo' };
    }
    // Basico / Minimo (#ffbf00)
    if (d.includes('B / 2') || d === 'B' || d.startsWith('B /') || d.includes('BASICO') || d.includes('MINIMO')) {
      return { nivel: 'Basico', label: 'Básico', color: '#ffbf00', orden: 2, key: 'Basico' };
    }
    // Alto / Satisfactorio (#01b1f0)
    if (d.includes('A / 3') || d === 'A' || d.startsWith('A /') || d.includes('ALTO') || d.includes('SATIS')) {
      return { nivel: 'Alto', label: 'Alto', color: '#01b1f0', orden: 3, key: 'Alto' };
    }
    // Superior / Avanzado (#01af51)
    if (d.includes('S / 4') || d === 'S' || d.startsWith('S /') || d.includes('SUPERIOR') || d.includes('AVANZ')) {
      return { nivel: 'Superior', label: 'Superior', color: '#01af51', orden: 4, key: 'Superior' };
    }

    return { nivel: 'Basico', label: desempenoStr, color: '#ffbf00', orden: 2, key: 'Basico' };
  }

  /**
   * Obtiene el ciclo al que pertenece un grado específico
   */
  function getCicloForGrade(grado) {
    if (!grado) return null;
    const g = String(grado).trim();
    const ciclos = configInstitucion.ciclos || {
      "0": ["0", "Transición", "Transicion"],
      "1": ["1", "2", "3"],
      "2": ["4", "5"],
      "3": ["6", "7"],
      "4": ["8", "9"],
      "5": ["10", "11"]
    };

    for (const [cicloNum, gradosList] of Object.entries(ciclos)) {
      if (gradosList.some(item => String(item).trim() === g)) {
        return cicloNum;
      }
    }
    return null;
  }

  /**
   * Obtiene los grupos disponibles para un grado específico (Observación 3)
   */
  function getGroupsForGrade(grado) {
    let rows = dataset;
    if (grado && grado !== 'todos') {
      rows = rows.filter(r => String(r.GRADO).trim() === String(grado).trim());
    }
    return [...new Set(rows.map(r => String(r.GRUPO).trim()).filter(Boolean))].sort();
  }

  /**
   * Inicialización del módulo
   */
  function init(records, configs, callback) {
    dataset = records || [];
    configInstitucion = configs.institucion || {};
    configPruebas = (configs.pruebas && configs.pruebas.pruebas) ? configs.pruebas.pruebas : [];
    onFilterChange = callback;

    bindUIEvents();
    populateDropdowns();
  }

  /**
   * Enlaza los elementos de formulario del HTML
   */
  function bindUIEvents() {
    const selTipo = document.getElementById('filter-tipo-prueba');
    const selPrueba = document.getElementById('filter-prueba');
    const selCiclo = document.getElementById('filter-ciclo');
    const selGrado = document.getElementById('filter-grado');
    const selGrupo = document.getElementById('filter-grupo');
    const btnApply = document.getElementById('btn-apply-filters');
    const btnReset = document.getElementById('btn-reset-filters');
    const inpGlobalSearch = document.getElementById('input-global-search');

    // Al cambiar tipo de prueba, actualiza las pruebas mostradas en el select
    if (selTipo) {
      selTipo.addEventListener('change', () => {
        populatePruebasDropdown();
      });
    }

    // Al cambiar ciclo, actualiza grados y grupos
    if (selCiclo) {
      selCiclo.addEventListener('change', () => {
        populateGradosDropdown();
        populateGruposDropdown();
      });
    }

    // Al cambiar grado, actualiza grupos
    if (selGrado) {
      selGrado.addEventListener('change', () => {
        populateGruposDropdown();
      });
    }

    // Botón "Consultar" (Observación 1)
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        applyFiltersFromUI();
      });
    }

    // Al presionar Enter en el buscador de estudiante
    if (inpGlobalSearch) {
      inpGlobalSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyFiltersFromUI();
        }
      });
    }

    // Botón Limpiar Filtros
    if (btnReset) {
      btnReset.addEventListener('click', resetFilters);
    }
  }

  /**
   * Aplica los filtros seleccionados en los controles de la interfaz al pulsar "Consultar"
   */
  function applyFiltersFromUI() {
    const selTipo = document.getElementById('filter-tipo-prueba');
    const selPrueba = document.getElementById('filter-prueba');
    const selCiclo = document.getElementById('filter-ciclo');
    const selGrado = document.getElementById('filter-grado');
    const selGrupo = document.getElementById('filter-grupo');
    const selArea = document.getElementById('filter-area');
    const inpSearch = document.getElementById('input-global-search');

    state.tipoPrueba = selTipo ? selTipo.value : 'todos';
    state.prueba = selPrueba ? selPrueba.value : 'todos';
    state.ciclo = selCiclo ? selCiclo.value : 'todos';
    state.grado = selGrado ? selGrado.value : 'todos';
    state.grupo = selGrupo ? selGrupo.value : 'todos';
    state.area = selArea ? selArea.value : 'todos';
    state.search = inpSearch ? inpSearch.value.trim() : '';

    triggerChange();
  }

  /**
   * Llena los dropdowns con opciones dinámicas
   */
  function populateDropdowns() {
    populatePruebasDropdown();
    populateCiclosDropdown();
    populateGradosDropdown();
    populateGruposDropdown();
  }

  function populatePruebasDropdown() {
    const selTipo = document.getElementById('filter-tipo-prueba');
    const sel = document.getElementById('filter-prueba');
    if (!sel) return;

    const currentVal = sel.value;
    const selectedTipo = selTipo ? selTipo.value : state.tipoPrueba;

    sel.innerHTML = '<option value="todos">Todas las Pruebas</option>';

    const rawPruebas = [...new Set(dataset.map(r => r.PRUEBA).filter(Boolean))];

    rawPruebas.forEach(p => {
      let include = true;
      if (selectedTipo !== 'todos') {
        const found = configPruebas.find(cp => 
          normalizarNombre(cp.nombre).includes(normalizarNombre(p)) ||
          normalizarNombre(cp.id || '').includes(normalizarNombre(p)) ||
          normalizarNombre(cp.carpeta || '').includes(normalizarNombre(p))
        );
        if (found && found.tipo !== selectedTipo) {
          include = false;
        }
      }

      if (include) {
        const opt = document.createElement('option');
        opt.value = p;
        const cfgMatch = configPruebas.find(cp => normalizarNombre(cp.nombre).includes(normalizarNombre(p)));
        opt.textContent = cfgMatch ? cfgMatch.nombre : `Misión ${p}`;
        sel.appendChild(opt);
      }
    });

    if (rawPruebas.includes(currentVal)) {
      sel.value = currentVal;
    } else {
      sel.value = 'todos';
    }
  }

  function populateCiclosDropdown() {
    const sel = document.getElementById('filter-ciclo');
    if (!sel) return;

    sel.innerHTML = `
      <option value="todos">Todos los Ciclos</option>
      <option value="1">Ciclo 1 (1°, 2°, 3°)</option>
      <option value="2">Ciclo 2 (4°, 5°)</option>
      <option value="3">Ciclo 3 (6°, 7°)</option>
      <option value="4">Ciclo 4 (8°, 9°)</option>
      <option value="5">Ciclo 5 (10°, 11°)</option>
    `;
    sel.value = state.ciclo;
  }

  function populateGradosDropdown() {
    const selCiclo = document.getElementById('filter-ciclo');
    const sel = document.getElementById('filter-grado');
    if (!sel) return;

    const currentVal = sel.value;
    const selectedCiclo = selCiclo ? selCiclo.value : state.ciclo;

    sel.innerHTML = '<option value="todos">Todos los Grados</option>';

    let uniqueGrados = [...new Set(dataset.map(r => String(r.GRADO).trim()).filter(Boolean))]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (selectedCiclo !== 'todos') {
      const ciclos = configInstitucion.ciclos || {};
      const gradosValidos = ciclos[selectedCiclo] || [];
      uniqueGrados = uniqueGrados.filter(g => gradosValidos.includes(g));
    }

    uniqueGrados.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = `Grado ${g}°`;
      sel.appendChild(opt);
    });

    if (uniqueGrados.includes(currentVal)) {
      sel.value = currentVal;
    } else {
      sel.value = 'todos';
    }
  }

  function populateGruposDropdown() {
    const selCiclo = document.getElementById('filter-ciclo');
    const selGrado = document.getElementById('filter-grado');
    const sel = document.getElementById('filter-grupo');
    if (!sel) return;

    const currentVal = sel.value;
    const selectedGrado = selGrado ? selGrado.value : state.grado;
    const selectedCiclo = selCiclo ? selCiclo.value : state.ciclo;

    sel.innerHTML = '<option value="todos">Todos los Grupos</option>';

    let matchingRows = dataset;
    if (selectedGrado !== 'todos') {
      matchingRows = matchingRows.filter(r => String(r.GRADO).trim() === selectedGrado);
    } else if (selectedCiclo !== 'todos') {
      const ciclos = configInstitucion.ciclos || {};
      const gradosValidos = ciclos[selectedCiclo] || [];
      matchingRows = matchingRows.filter(r => gradosValidos.includes(String(r.GRADO).trim()));
    }

    const uniqueGrupos = [...new Set(matchingRows.map(r => String(r.GRUPO).trim()).filter(Boolean))].sort();

    uniqueGrupos.forEach(grp => {
      const opt = document.createElement('option');
      opt.value = grp;
      opt.textContent = `Grupo ${grp}`;
      sel.appendChild(opt);
    });

    if (uniqueGrupos.includes(currentVal)) {
      sel.value = currentVal;
    } else {
      sel.value = 'todos';
    }
  }

  /**
   * Resetea todos los filtros a sus valores predeterminados y consulta
   */
  function resetFilters() {
    state = {
      tipoPrueba: 'periodica',
      prueba: 'todos',
      ciclo: 'todos',
      grado: 'todos',
      grupo: 'todos',
      area: 'todos',
      search: ''
    };

    const selTipo = document.getElementById('filter-tipo-prueba');
    const selPrueba = document.getElementById('filter-prueba');
    const selCiclo = document.getElementById('filter-ciclo');
    const selGrado = document.getElementById('filter-grado');
    const selGrupo = document.getElementById('filter-grupo');
    const selArea = document.getElementById('filter-area');
    const inpSearch = document.getElementById('input-global-search');

    if (selTipo) selTipo.value = 'periodica';
    if (selPrueba) selPrueba.value = 'todos';
    if (selCiclo) selCiclo.value = 'todos';
    if (selGrado) selGrado.value = 'todos';
    if (selGrupo) selGrupo.value = 'todos';
    if (selArea) selArea.value = 'todos';
    if (inpSearch) inpSearch.value = '';

    populatePruebasDropdown();
    populateGradosDropdown();
    populateGruposDropdown();

    triggerChange();
  }

  /**
   * Filtra los registros según el estado actual
   */
  function getFilteredRecords() {
    return dataset.filter(row => {
      // 1. Filtro Tipo de Prueba
      if (state.tipoPrueba !== 'todos') {
        const found = configPruebas.find(cp => 
          normalizarNombre(cp.nombre).includes(normalizarNombre(row.PRUEBA)) ||
          normalizarNombre(cp.id || '').includes(normalizarNombre(row.PRUEBA))
        );
        if (found && found.tipo !== state.tipoPrueba) {
          return false;
        }
      }

      // 2. Filtro Prueba Específica
      if (state.prueba !== 'todos') {
        if (String(row.PRUEBA).trim().toUpperCase() !== state.prueba.trim().toUpperCase()) {
          return false;
        }
      }

      // 3. Filtro Ciclo
      if (state.ciclo !== 'todos') {
        const rowCiclo = getCicloForGrade(row.GRADO);
        if (rowCiclo !== state.ciclo) {
          return false;
        }
      }

      // 4. Filtro Grado
      if (state.grado !== 'todos') {
        if (String(row.GRADO).trim() !== state.grado) {
          return false;
        }
      }

      // 5. Filtro Grupo
      if (state.grupo !== 'todos') {
        if (String(row.GRUPO).trim() !== state.grupo) {
          return false;
        }
      }

      // 6. Búsqueda por Estudiante / Documento
      if (state.search) {
        const term = normalizarNombre(state.search);
        const stName = normalizarNombre(row.ESTUDIANTE);
        const doc = String(row.DOCUMENTO || '').trim();
        if (!stName.includes(term) && !doc.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Dispara el evento de cambio
   */
  function triggerChange() {
    updateActiveFiltersCount();
    if (typeof onFilterChange === 'function') {
      onFilterChange(getFilteredRecords(), state);
    }
  }

  /**
   * Cuenta cuántos filtros no están en "todos"
   */
  function updateActiveFiltersCount() {
    let count = 0;
    if (state.tipoPrueba !== 'todos') count++;
    if (state.prueba !== 'todos') count++;
    if (state.ciclo !== 'todos') count++;
    if (state.grado !== 'todos') count++;
    if (state.grupo !== 'todos') count++;
    if (state.area !== 'todos') count++;
    if (state.search) count++;

    const badge = document.getElementById('active-filters-count');
    if (badge) {
      badge.textContent = `${count} activo${count === 1 ? '' : 's'}`;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  function setFilter(key, value) {
    if (state[key] !== undefined) {
      state[key] = value;
      const idMap = {
        'tipoPrueba': 'filter-tipo-prueba',
        'prueba': 'filter-prueba',
        'ciclo': 'filter-ciclo',
        'grado': 'filter-grado',
        'grupo': 'filter-grupo',
        'area': 'filter-area'
      };
      const elementId = idMap[key] || `filter-${key}`;
      const el = document.getElementById(elementId);
      if (el) el.value = value;
      if (key === 'tipoPrueba') {
        populatePruebasDropdown();
      } else if (key === 'ciclo') {
        populateGradosDropdown();
        populateGruposDropdown();
      } else if (key === 'grado') {
        populateGruposDropdown();
      }
      triggerChange();
    }
  }

  return {
    init,
    getState: () => ({ ...state }),
    setFilter,
    applyFiltersFromUI,
    resetFilters,
    getFilteredRecords,
    normalizarNombre,
    getDesempenoInfo,
    getCicloForGrade,
    getGroupsForGrade
  };
})();

// Exportar globalmente
window.Filters = Filters;
