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
  let configEscalas = {};
  let configDesempenos = {};
  let onFilterChange = null;

  // Pruebas que pertenecen a la escala periódica (1 a 5). El resto se evalúa como Saber (0 a 500).
  const MARCAS_PERIODICAS = ['ALFA', 'BETA', 'GAMMA', 'DELTA'];

  // Claves internas de los cuatro niveles. Se mantienen estables para tablas y gráficas;
  // el nombre y el color visibles se toman de config/escalas.json y config/desempenos.json.
  const NIVELES_BASE = [
    { key: 'Bajo', color: '#bf0000' },
    { key: 'Basico', color: '#ffbf00' },
    { key: 'Alto', color: '#01b1f0' },
    { key: 'Superior', color: '#01af51' }
  ];

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
   * Tipo de escala de una prueba.
   * Las pruebas con ALFA, BETA, GAMMA o DELTA en el nombre son periódicas (escala 1 a 5);
   * cualquier otra prueba (por ejemplo EPSILON) se evalúa como Saber (escala 0 a 500).
   */
  function getTipoPrueba(prueba) {
    const clave = normalizarNombre(prueba);
    if (!clave) return 'periodica';
    return MARCAS_PERIODICAS.some(marca => clave.includes(marca)) ? 'periodica' : 'saber';
  }

  // ==========================================================================
  // Fuente única de columnas y etiquetas por área académica
  // ==========================================================================

  // Columnas del CSV por área (claves internas de config/areas.json).
  // 'Lenguaje' se resuelve según la escala: las pruebas Saber reportan
  // LECTURA CRÍTICA y las periódicas reportan LENGUAJE.
  const AREA_COLUMN_BASE = {
    'Lenguaje': 'LENGUAJE',
    'Matematicas': 'MATEMÁTICAS',
    'Ciencias Naturales': 'CIENCIAS NATURALES',
    'Sociales': 'SOCIALES Y CIUDADANAS',
    'Ingles': 'INGLÉS'
  };

  // Etiquetas visibles de cada área (claves internas -> texto de interfaz).
  const AREA_LABEL_BASE = {
    'Lenguaje': 'Lenguaje',
    'Matematicas': 'Matemáticas',
    'Ciencias Naturales': 'Ciencias Naturales',
    'Sociales': 'Sociales',
    'Ingles': 'Inglés'
  };

  /**
   * Columna del CSV que contiene el puntaje de un área para la escala indicada.
   * En pruebas Saber el área de Lenguaje corresponde a LECTURA CRÍTICA;
   * en pruebas periódicas corresponde a LENGUAJE. Las demás áreas no cambian.
   */
  function getAreaColumn(areaNombre, tipo) {
    const clave = String(areaNombre || '').trim();
    if (clave === 'Lenguaje') {
      return tipo === 'saber' ? 'LECTURA CRÍTICA' : 'LENGUAJE';
    }
    return AREA_COLUMN_BASE[clave] || clave.toUpperCase();
  }

  /**
   * Etiqueta visible de un área según la escala: en pruebas Saber el área de
   * Lenguaje se muestra como "Lectura Crítica"; en periódicas, "Lenguaje".
   */
  function getAreaLabel(areaNombre, tipo) {
    const clave = String(areaNombre || '').trim();
    if (clave === 'Lenguaje' && tipo === 'saber') return 'Lectura Crítica';
    return AREA_LABEL_BASE[clave] || clave;
  }

  /**
   * Convierte el texto de una celda del consolidado en número.
   * Acepta decimales con coma, recorta espacios y devuelve NaN cuando está vacío.
   */
  function parsePuntajeCelda(valor) {
    if (valor === undefined || valor === null) return NaN;
    const texto = String(valor).trim();
    if (texto === '') return NaN;
    const numero = parseFloat(texto.replace(',', '.'));
    return isNaN(numero) ? NaN : numero;
  }

  /**
   * Puntaje numérico de un área en un registro según la escala indicada.
   * Lee primero la columna propia de la escala y, solo si está vacía,
   * recurre a la columna alternativa (un consolidado que mezcle ambas
   * columnas de Lenguaje sigue siendo legible).
   */
  function getAreaScore(record, areaNombre, tipo) {
    if (!record) return NaN;
    const clave = String(areaNombre || '').trim();
    let valor = parsePuntajeCelda(record[getAreaColumn(clave, tipo)]);
    if (isNaN(valor) && clave === 'Lenguaje') {
      const colAlterna = tipo === 'saber' ? 'LENGUAJE' : 'LECTURA CRÍTICA';
      valor = parsePuntajeCelda(record[colAlterna]);
    }
    return valor;
  }

  /**
   * Escala oficial del tipo de prueba según config/escalas.json.
   */
  function getEscala(tipo) {
    const clave = tipo === 'saber' ? 'saber' : 'periodica';
    const escala = configEscalas[clave] || {};
    const defectos = clave === 'saber'
      ? { minimo: 0, maximo: 500 }
      : { minimo: 1, maximo: 5 };
    const niveles = Array.isArray(escala.niveles) ? escala.niveles.slice() : [];
    niveles.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

    return {
      tipo: clave,
      etiqueta: clave === 'saber' ? 'Saber' : 'Periódica',
      minimo: isNaN(Number(escala.puntaje_minimo)) ? defectos.minimo : Number(escala.puntaje_minimo),
      maximo: isNaN(Number(escala.puntaje_maximo)) ? defectos.maximo : Number(escala.puntaje_maximo),
      niveles
    };
  }

  /**
   * Niveles de la escala con su clave interna, nombre oficial y color configurado.
   */
  function getNiveles(tipo) {
    const escala = getEscala(tipo);
    const colores = configDesempenos[escala.tipo] || {};

    return NIVELES_BASE.map((base, idx) => {
      const nivel = escala.niveles[idx] || null;
      const nombreOficial = nivel && nivel.nombre ? String(nivel.nombre) : base.key;
      const colorCfg = colores[nombreOficial] || colores[base.key] || {};
      return {
        key: base.key,
        label: etiquetaNivel(nombreOficial),
        color: colorCfg.color || base.color,
        orden: idx + 1,
        minimo: nivel && nivel.minimo !== undefined ? Number(nivel.minimo) : null,
        maximo: nivel && nivel.maximo !== undefined ? Number(nivel.maximo) : null
      };
    });
  }

  /**
   * Nombre visible del nivel con su acentuación correcta.
   * config/escalas.json y config/desempenos.json escriben los nombres sin tilde
   * porque se usan como claves de configuración.
   */
  function etiquetaNivel(nombre) {
    const etiquetas = {
      'Basico': 'Básico',
      'Minimo': 'Mínimo',
      'Insuficiente': 'Insuficiente',
      'Satisfactorio': 'Satisfactorio',
      'Avanzado': 'Avanzado',
      'Bajo': 'Bajo',
      'Alto': 'Alto',
      'Superior': 'Superior'
    };
    return etiquetas[nombre] || nombre;
  }

  /**
   * Etiquetas de los cuatro niveles según la escala del tipo de prueba.
   */
  function getNivelLabels(tipo) {
    return getNiveles(tipo).map(nivel => nivel.label);
  }

  /**
   * Colores oficiales de los cuatro niveles según la escala del tipo de prueba.
   */
  function getNivelColors(tipo) {
    return getNiveles(tipo).map(nivel => nivel.color);
  }

  /**
   * Nivel al que pertenece un puntaje, usando los rangos de config/escalas.json.
   */
  function getNivelPorPuntaje(tipo, puntaje) {
    const niveles = getNiveles(tipo);
    const valor = parseFloat(String(puntaje === undefined || puntaje === null ? '' : puntaje).replace(',', '.'));
    if (isNaN(valor)) return { ...niveles[1], tipo: getEscala(tipo).tipo };

    const encontrado = niveles.find(nivel => nivel.minimo !== null && nivel.maximo !== null
      && valor >= nivel.minimo && valor <= nivel.maximo);
    if (encontrado) return { ...encontrado, tipo: getEscala(tipo).tipo };

    const primero = niveles[0];
    const ultimo = niveles[niveles.length - 1];
    const fueraDeRango = (primero.minimo !== null && valor < primero.minimo) ? primero : ultimo;
    return { ...fueraDeRango, tipo: getEscala(tipo).tipo };
  }

  /**
   * Homologación de desempeño oficial (Sección 9 y 10.4) según la escala del tipo de prueba.
   * NO recalcula desempeño: conserva el dato oficial del CSV.
   * Los códigos del consolidado terminan en el número de nivel (BJ/1, B/2, A/3, S/4 en periódicas;
   * I/1, M/2, S/3, A/4 en Saber), por lo que ese número determina el nivel en ambas escalas.
   */
  function getDesempenoInfo(desempenoStr, tipo) {
    const tipoEscala = tipo === 'saber' ? 'saber' : (tipo === 'periodica' ? 'periodica' : 'periodica');
    const niveles = getNiveles(tipoEscala);
    const porSlot = (indice) => ({ ...(niveles[indice] || niveles[1]), tipo: tipoEscala });

    if (!desempenoStr) {
      return { ...porSlot(1), label: 'Sin Datos', color: '#94a3b8' };
    }

    const texto = normalizarNombre(desempenoStr);

    // Códigos oficiales del consolidado: letras y número de nivel
    const codigo = texto.match(/^([A-Z]{1,2})\s*\/\s*([1-4])$/);
    if (codigo) {
      return porSlot(Number(codigo[2]) - 1);
    }

    // Nombres completos de nivel
    const nombresPorSlot = [
      ['BAJO', 'INSUFICIENTE', 'INSUF', 'BJ'],
      ['BASICO', 'MINIMO', 'B'],
      ['ALTO', 'SATISFACTORIO', 'SATIS', 'A'],
      ['SUPERIOR', 'AVANZADO', 'AVANZ', 'S']
    ];
    for (let idx = 0; idx < nombresPorSlot.length; idx++) {
      if (nombresPorSlot[idx].some(nombre => texto === nombre || texto.includes(nombre))) {
        return porSlot(idx);
      }
    }

    return { ...porSlot(1), label: desempenoStr };
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
    configEscalas = configs.escalas || {};
    configDesempenos = configs.desempenos || {};
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
        include = getTipoPrueba(p) === selectedTipo;
      }

      if (include) {
        const opt = document.createElement('option');
        opt.value = p;
        const cfgMatch = configPruebas.find(cp => normalizarNombre(cp.id || '') === normalizarNombre(p));
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
        if (getTipoPrueba(row.PRUEBA) !== state.tipoPrueba) {
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
    getTipoPrueba,
    getAreaColumn,
    getAreaLabel,
    getAreaScore,
    getEscala,
    getNiveles,
    getNivelLabels,
    getNivelColors,
    getNivelPorPuntaje,
    getDesempenoInfo,
    getCicloForGrade,
    getGroupsForGrade
  };
})();

// Exportar globalmente
window.Filters = Filters;
