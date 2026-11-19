/**
 * Visor Educate 360° - Módulo de Filtros Globales y Normalización
 * Basado en las secciones 6, 7, 10 y 12 de informe.md
 * Actualizado con Botón Consultar y función de inspección de grupos por grado.
 */

const Filters = (function() {
  // Estado de los filtros activos. El tipo de prueba por defecto NUNCA se asume:
  // init() y resetFilters() lo derivan del consolidado cargado (el único tipo
  // presente, o 'todos' cuando conviven periódicas y Saber).
  let state = {
    tipoPrueba: 'todos',
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
   * Expone DOS escalas:
   * - minimo/maximo: escala del PUNTAJE GLOBAL (Saber 0 a 500, periódica 1 a 5).
   * - areas: escala de cada ÁREA académica (Saber 0 a 100, periódica 1 a 5).
   *   Cuando config no define el bloque "areas", se usa la escala global como respaldo.
   */
  function getEscala(tipo) {
    const clave = tipo === 'saber' ? 'saber' : 'periodica';
    const escala = configEscalas[clave] || {};
    const defectos = clave === 'saber'
      ? { minimo: 0, maximo: 500 }
      : { minimo: 1, maximo: 5 };
    const niveles = Array.isArray(escala.niveles) ? escala.niveles.slice() : [];
    niveles.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

    const minimo = isNaN(Number(escala.puntaje_minimo)) ? defectos.minimo : Number(escala.puntaje_minimo);
    const maximo = isNaN(Number(escala.puntaje_maximo)) ? defectos.maximo : Number(escala.puntaje_maximo);
    const areasCfg = escala.areas || {};

    return {
      tipo: clave,
      etiqueta: clave === 'saber' ? 'Saber' : 'Periódica',
      minimo,
      maximo,
      areas: {
        minimo: isNaN(Number(areasCfg.puntaje_minimo)) ? minimo : Number(areasCfg.puntaje_minimo),
        maximo: isNaN(Number(areasCfg.puntaje_maximo)) ? maximo : Number(areasCfg.puntaje_maximo)
      },
      niveles
    };
  }

  /**
   * Escala de cada ÁREA académica del tipo de prueba (Saber 0 a 100, periódica 1 a 5).
   * Los promedios y gráficas por área deben usar esta escala, no la global.
   */
  function getEscalaArea(tipo) {
    const escala = getEscala(tipo);
    return { tipo: escala.tipo, minimo: escala.areas.minimo, maximo: escala.areas.maximo };
  }

  /**
   * Máximo de la escala de áreas (conveniencia para textos "x / 100" o "x / 5").
   */
  function getAreaMax(tipo) {
    return getEscalaArea(tipo).maximo;
  }

  /**
   * Ponderación oficial del Puntaje Global ICFES (Resolución 268 de 2020) para Saber:
   * IG = (3·LC + 3·MA + 3·CN + 3·SC + 1·IN)/13 y PG = IG × 5.
   * Los pesos están declarados sobre las columnas de área (escala 0 a 100).
   * Las pruebas periódicas no tienen ponderación: devuelve undefined.
   */
  function getPonderacion(tipo) {
    if (tipo !== 'saber') return undefined;
    const pond = (configEscalas.saber && configEscalas.saber.ponderacion) || {};
    if (!pond.pesos || !Number(pond.divisor) || !Number(pond.factor)) return undefined;
    return {
      descripcion: pond.descripcion || '',
      divisor: Number(pond.divisor),
      factor: Number(pond.factor),
      pesos: { ...pond.pesos }
    };
  }

  // Clave interna de área por columna de ponderación, para leer el puntaje
  // con getAreaScore (incluye el respaldo entre LENGUAJE y LECTURA CRÍTICA).
  const AREA_KEY_POR_COLUMNA = {
    'LECTURA CRÍTICA': 'Lenguaje',
    'MATEMÁTICAS': 'Matematicas',
    'CIENCIAS NATURALES': 'Ciencias Naturales',
    'SOCIALES Y CIUDADANAS': 'Sociales',
    'INGLÉS': 'Ingles'
  };

  /**
   * Puntaje Global oficial de un registro.
   * - Saber: IG = (3·LC + 3·MA + 3·CN + 3·SC + 1·IN)/13; PG = IG × 5, aplicando
   *   los pesos sobre las áreas (0 a 100). Si el evaluado no presentó INGLÉS,
   *   el IG es el promedio aritmético de las cuatro pruebas restantes y aún se
   *   aplica el factor. Si falta cualquiera de las otras cuatro áreas, devuelve null.
   * - Periódica: el PUNTAJE de la fila parseado como número (o null).
   */
  function calcularPuntajeGlobal(record) {
    if (!record) return null;
    const tipo = getTipoPrueba(record.PRUEBA);

    if (tipo !== 'saber') {
      const puntaje = parsePuntajeCelda(record.PUNTAJE);
      return isNaN(puntaje) ? null : puntaje;
    }

    const pond = getPonderacion('saber');
    if (!pond) return null;

    // Puntaje numérico de cada área con peso configurado
    const valores = {};
    Object.keys(pond.pesos).forEach(columna => {
      const claveArea = AREA_KEY_POR_COLUMNA[columna] || columna;
      const valor = getAreaScore(record, claveArea, 'saber');
      if (!isNaN(valor)) valores[columna] = valor;
    });

    const columnasPrincipales = Object.keys(pond.pesos).filter(c => c !== 'INGLÉS');

    // Las cuatro pruebas principales son obligatorias
    if (columnasPrincipales.some(c => valores[c] === undefined)) return null;

    let indiceGlobal;
    if (valores['INGLÉS'] === undefined) {
      // Caso oficial "sin Inglés": promedio aritmético de las cuatro pruebas restantes
      const suma = columnasPrincipales.reduce((acc, c) => acc + valores[c], 0);
      indiceGlobal = suma / columnasPrincipales.length;
    } else {
      const sumaPonderada = Object.keys(pond.pesos)
        .reduce((acc, c) => acc + valores[c] * Number(pond.pesos[c]), 0);
      indiceGlobal = sumaPonderada / pond.divisor;
    }

    const puntajeGlobal = indiceGlobal * pond.factor;
    return Math.round(puntajeGlobal * 10) / 10;
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
   * Tipos de prueba realmente presentes en el consolidado, en orden estable.
   * No se asume ningún conjunto: una institución puede publicar solo periódicas,
   * solo Saber o ambas escalas.
   */
  function getTiposEnDatos() {
    const encontrados = [];
    dataset.forEach(r => {
      const tipo = getTipoPrueba(r.PRUEBA);
      if (!encontrados.includes(tipo)) encontrados.push(tipo);
    });
    return ['periodica', 'saber'].filter(t => encontrados.includes(t));
  }

  /**
   * Tipo de prueba por defecto según los datos: el único tipo presente cuando
   * el consolidado solo tiene uno, o 'todos' cuando conviven ambos tipos.
   */
  function getTipoPruebaPorDefecto() {
    const tipos = getTiposEnDatos();
    return tipos.length === 1 ? tipos[0] : 'todos';
  }

  /**
   * Orden natural de grados: numéricos primero y de menor a mayor;
   * los no numéricos (por ejemplo Transición) van después, alfabéticos.
   */
  function compararGrados(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return String(a).localeCompare(String(b));
  }

  /**
   * Valor actual de un select, con respaldo al estado cuando el elemento no existe.
   */
  function leerSelect(id, respaldo) {
    const el = document.getElementById(id);
    return el ? el.value : respaldo;
  }

  /**
   * Registros base para construir las opciones de un filtro: aplica todos los
   * filtros activos excepto el indicado. Así ningún select ofrece un grado,
   * grupo o prueba sin registros en el consolidado filtrado.
   */
  function registrosParaOpciones(excluir) {
    let rows = dataset;
    if (excluir !== 'tipoPrueba') {
      const tipoSeleccionado = leerSelect('filter-tipo-prueba', state.tipoPrueba);
      if (tipoSeleccionado !== 'todos') {
        rows = rows.filter(r => getTipoPrueba(r.PRUEBA) === tipoSeleccionado);
      }
    }
    if (excluir !== 'prueba') {
      const pruebaSeleccionada = leerSelect('filter-prueba', state.prueba);
      if (pruebaSeleccionada !== 'todos') {
        rows = rows.filter(r => String(r.PRUEBA).trim().toUpperCase() === pruebaSeleccionada.trim().toUpperCase());
      }
    }
    if (excluir !== 'ciclo') {
      const cicloSeleccionado = leerSelect('filter-ciclo', state.ciclo);
      if (cicloSeleccionado !== 'todos') {
        rows = rows.filter(r => getCicloForGrade(r.GRADO) === cicloSeleccionado);
      }
    }
    if (excluir !== 'grado') {
      const gradoSeleccionado = leerSelect('filter-grado', state.grado);
      if (gradoSeleccionado !== 'todos') {
        rows = rows.filter(r => String(r.GRADO).trim() === gradoSeleccionado);
      }
    }
    return rows;
  }

  /**
   * Crea un <option> para los selects de filtro.
   */
  function crearOpcion(valor, texto) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = texto;
    return opt;
  }

  /**
   * Valores disponibles en un select ya poblado.
   */
  function valoresDeSelect(sel) {
    return Array.prototype.map.call(sel.options, o => o.value);
  }

  /**
   * Restaura el valor de un select tras repoblarlo: conserva el valor vigente
   * si aún existe como opción; de lo contrario vuelve a 'todos' para que el
   * filtro nunca quede apuntando a un valor sin registros.
   */
  function restaurarSeleccion(sel, currentVal, respaldo) {
    const valores = valoresDeSelect(sel);
    sel.value = (currentVal !== '' && valores.includes(currentVal)) ? currentVal : respaldo;
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

    // Cascada de filtros de izquierda a derecha (Observación de encadenamiento):
    // tipo de prueba -> prueba -> ciclo -> grado -> grupo.
    // Cada cambio repuebla únicamente los filtros que están a su derecha.
    if (selTipo) {
      selTipo.addEventListener('change', () => {
        populatePruebasDropdown();
        populateCiclosDropdown();
        populateGradosDropdown();
        populateGruposDropdown();
      });
    }

    if (selPrueba) {
      selPrueba.addEventListener('change', () => {
        populateCiclosDropdown();
        populateGradosDropdown();
        populateGruposDropdown();
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
    populateTiposDropdown();
    populatePruebasDropdown();
    populateCiclosDropdown();
    populateGradosDropdown();
    populateGruposDropdown();
  }

  /**
   * Tipos de prueba derivados del consolidado: solo se listan los tipos con
   * registros. La opción "Todos los Tipos" aparece únicamente cuando conviven
   * periódicas y Saber; con un solo tipo el select muestra únicamente ese tipo.
   */
  function populateTiposDropdown(usarValorPorDefecto) {
    const sel = document.getElementById('filter-tipo-prueba');
    if (!sel) return;

    const currentVal = sel.value;
    const tipos = getTiposEnDatos();

    sel.innerHTML = '';
    if (tipos.length > 1) {
      sel.appendChild(crearOpcion('todos', 'Todos los Tipos'));
    }
    tipos.forEach(tipo => {
      sel.appendChild(crearOpcion(tipo, getEscala(tipo).etiqueta));
    });

    // Conservar la selección vigente si sigue disponible; de lo contrario se usa
    // el tipo por defecto del consolidado (nunca un tipo supuesto).
    if (usarValorPorDefecto || currentVal === '' || !valoresDeSelect(sel).includes(currentVal)) {
      sel.value = getTipoPruebaPorDefecto();
    }
    state.tipoPrueba = sel.value;
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
        const cfgMatch = configPruebas.find(cp => normalizarNombre(cp.id || '') === normalizarNombre(p));
        sel.appendChild(crearOpcion(p, cfgMatch ? cfgMatch.nombre : `Misión ${p}`));
      }
    });

    restaurarSeleccion(sel, currentVal, 'todos');
  }

  /**
   * Ciclos derivados de los grados presentes en el consolidado: se listan solo
   * los ciclos con al menos un grado con registros y cada etiqueta nombra únicamente
   * los grados que realmente aparecen en los datos. Los grados sin ciclo definido
   * se omiten en lugar de inventarles uno.
   */
  function populateCiclosDropdown() {
    const sel = document.getElementById('filter-ciclo');
    if (!sel) return;

    const currentVal = sel.value;
    // En la cascada (izquierda a derecha), el ciclo se limita por tipo y prueba,
    // no por los filtros que están a su derecha (grado y grupo)
    const rows = registrosParaOpciones('ciclo');

    const gradosPorCiclo = {};
    [...new Set(rows.map(r => String(r.GRADO).trim()).filter(Boolean))]
      .sort(compararGrados)
      .forEach(grado => {
        const ciclo = getCicloForGrade(grado);
        if (ciclo === null) return;
        if (!gradosPorCiclo[ciclo]) gradosPorCiclo[ciclo] = [];
        gradosPorCiclo[ciclo].push(grado);
      });

    sel.innerHTML = '';
    sel.appendChild(crearOpcion('todos', 'Todos los Ciclos'));
    Object.keys(gradosPorCiclo)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .forEach(cicloNum => {
        const grados = gradosPorCiclo[cicloNum].map(g => `${g}°`).join(', ');
        sel.appendChild(crearOpcion(cicloNum, `Ciclo ${cicloNum} (${grados})`));
      });

    restaurarSeleccion(sel, currentVal, 'todos');
  }

  /**
   * Grados derivados del consolidado según los filtros activos (tipo, prueba y
   * ciclo): no se ofrecen grados sin registros.
   */
  function populateGradosDropdown() {
    const sel = document.getElementById('filter-grado');
    if (!sel) return;

    const currentVal = sel.value;
    const rows = registrosParaOpciones('grado');

    sel.innerHTML = '';
    sel.appendChild(crearOpcion('todos', 'Todos los Grados'));

    [...new Set(rows.map(r => String(r.GRADO).trim()).filter(Boolean))]
      .sort(compararGrados)
      .forEach(g => {
        sel.appendChild(crearOpcion(g, `Grado ${g}°`));
      });

    restaurarSeleccion(sel, currentVal, 'todos');
  }

  /**
   * Grupos derivados del consolidado según los filtros activos (tipo, prueba,
   * ciclo y grado): no se ofrecen grupos sin registros.
   */
  function populateGruposDropdown() {
    const sel = document.getElementById('filter-grupo');
    if (!sel) return;

    const currentVal = sel.value;
    const rows = registrosParaOpciones('grupo');

    sel.innerHTML = '';
    sel.appendChild(crearOpcion('todos', 'Todos los Grupos'));

    const uniqueGrupos = [...new Set(rows.map(r => String(r.GRUPO).trim()).filter(Boolean))]
      .sort(compararGrados);
    uniqueGrupos.forEach(grp => {
      sel.appendChild(crearOpcion(grp, `Grupo ${grp}`));
    });

    restaurarSeleccion(sel, currentVal, 'todos');
  }

  /**
   * Resetea todos los filtros a sus valores predeterminados y consulta
   */
  function resetFilters() {
    // Nunca se asume 'periodica': el tipo por defecto se deriva del consolidado
    state = {
      tipoPrueba: getTipoPruebaPorDefecto(),
      prueba: 'todos',
      ciclo: 'todos',
      grado: 'todos',
      grupo: 'todos',
      area: 'todos',
      search: ''
    };

    // Vaciar las selecciones para que cada select recupere su valor por defecto
    ['filter-prueba', 'filter-ciclo', 'filter-grado', 'filter-grupo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    populateTiposDropdown(true);
    populatePruebasDropdown();
    populateCiclosDropdown();
    populateGradosDropdown();
    populateGruposDropdown();

    const selArea = document.getElementById('filter-area');
    const inpSearch = document.getElementById('input-global-search');
    if (selArea) selArea.value = 'todos';
    if (inpSearch) inpSearch.value = '';
    state.area = 'todos';
    state.search = '';

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
      if (el) {
        el.value = value;
        // Un valor sin opción disponible vuelve a 'todos' en lugar de filtrar todo
        if (el.value !== String(value)) {
          el.value = 'todos';
          state[key] = 'todos';
        }
      }
      if (key === 'tipoPrueba') {
        populatePruebasDropdown();
        populateGradosDropdown();
        populateGruposDropdown();
      } else if (key === 'prueba') {
        populateGradosDropdown();
        populateGruposDropdown();
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
    getEscalaArea,
    getAreaMax,
    getPonderacion,
    calcularPuntajeGlobal,
    getNiveles,
    getNivelLabels,
    getNivelColors,
    getNivelPorPuntaje,
    getDesempenoInfo,
    getCicloForGrade,
    getGroupsForGrade,
    getTiposEnDatos,
    compararGrados
  };
})();

// Exportar globalmente
window.Filters = Filters;
