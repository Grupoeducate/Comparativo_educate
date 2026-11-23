# Visor Educate 360° — Guía de Estudio

Documento de referencia para el estudio de las funciones y secciones del proyecto.
Complementa los comentarios inline del código fuente.

## 1. Arquitectura general

- **Frontend estático** (HTML + CSS + JS vanilla), sin bundler ni framework.
- **Carga de datos**: configuración desde `config/*.json` y datasets desde `data/{dane}/consolidado_total.csv` (o bundle `window.EDUCATE360_DATA`).
- **Módulos JS globales** expuestos en `window`: `Auth`, `Filters`, `Charts`, `Exports`, `App`.
- **Entrada**: `index.html` carga los scripts y monta la SPA; `App.init()` arranca la aplicación.
- **Persistencia de sesión**: `localStorage` vía `Auth`.

## 2. Secciones del HTML (`index.html`)

| View ID | Módulo App | Descripción |
|---|---|---|
| `view-dashboard` | `renderDashboardModule` | KPIs generales, promedios por área, distribución de desempeño, tabla por grado. |
| `view-evolucion` | `renderEvolucionModule` | Curva de evolución temporal por área y comparativo por grado/grupo. |
| `view-ranking` | `renderRankingModule` | Ranking de estudiantes. |
| `view-areas` | `renderAreasModule` | Seguimiento por área y distribución de desempeños. |
| `view-desempenos` | `renderDesempenosModule` | Desglose de desempeños. |
| `view-ciclos` | `renderCiclosModule` | Consulta por ciclo. |
| `view-trazabilidad` | `renderTrazabilidadModule` | Ficha del estudiante y trazabilidad. |
| `view-exportacion` | `renderExportacionModule` | Centro de exportación. |

Navegación manejada por `App.switchModule()` y `renderActiveModule()`.

## 3. Módulos JavaScript

### 3.1 `js/auth.js` — Autenticación (`window.Auth`)
- `init(configInst, configUsers)`: inicializa configuración institucional y de usuarios.
- `normalize(value)`: normaliza texto para comparación.
- `findUser(dane)`: busca un usuario por código DANE.
- `hasPublishedData(dane)`: verifica si existe dataset publicado para el DANE.
- `isAuthenticated()` / `isSessionValid()`: estado de sesión.
- `getSession()` / `clearSession()`: obtención/limpieza de sesión.
- `login(daneInput, claveInput)`: valida credenciales.
- `logout()`: cierra sesión.
- `onAuthStateChanged(cb)`: suscripción a cambios de autenticación.

### 3.2 `js/filters.js` — Filtros y escala (`window.Filters`)
- Normalización/escala: `normalizarNombre`, `getTipoPrueba`, `getAreaColumn`, `getAreaLabel`, `parsePuntajeCelda`, `getAreaScore`.
- Escalas: `getEscala`, `getEscalaArea`, `getAreaMax`, `getPonderacion`, `calcularPuntajeGlobal`.
- Niveles/desempeño: `getNiveles`, `etiquetaNivel`, `getNivelLabels`, `getNivelColors`, `getNivelPorPuntaje`, `getDesempenoInfo`.
- Ciclos/grados: `getCicloForGrade`, `compararGrados`, `getGroupsForGrade`.
- Tipos: `getTiposEnDatos`, `getTipoPruebaPorDefecto`.
- UI: `leerSelect`, `registrosParaOpciones`, `crearOpcion`, `valoresDeSelect`, `restaurarSeleccion`, `init`, `bindUIEvents`, `applyFiltersFromUI`, `populateDropdowns`, `populateTiposDropdown`, `populatePruebasDropdown`, `populateCiclosDropdown`, `populateGradosDropdown`, `populateGruposDropdown`, `resetFilters`, `getFilteredRecords`, `triggerChange`, `updateActiveFiltersCount`.

### 3.3 `js/charts.js` — Gráficos (`window.Charts`)
- Utilidades: `niceStepSize`, `resolveEscala`, `scoreAxisBounds`, `destroyChart`, `getFallbackContainer`, `clearFallbackContainer`, `isChartJsAvailable`.
- Renderizado Chart.js: `renderExecutiveOverview`, `renderExecutiveDonut`, `renderEvolutionChart`, `renderGradeGroupComparison`, `renderAreaComponentsChart`, `renderAreaAllGradesGroupsChart`, `renderStackedPerformance`, `renderCyclesComparison`, `renderCyclesDrilldown`, `renderStudentHistory`, `renderStudentAreasComparison`.
- Renderizado SVG fallback: `renderSvgBarChart`, `renderSvgHorizontalBar`, `renderSvgDonut`, `renderSvgLineChart`, `renderSvgStackedBar`.

### 3.4 `js/exports.js` — Exportación (`window.Exports`)
- `exportFilteredData(records, institucionConfig, filterState)`: exporta resultados filtrados a Excel/CSV.
- `downloadCsvFallback(rows, filename)`: descarga CSV de respaldo.
- `printExecutiveReport()`: imprime reporte ejecutivo.

### 3.5 `js/app.js` — Orquestador (`App`)
- Inicialización: `init`, `loadConfigurations`, `loadDataset`, `detectDelimiter`, `splitDelimitedLine`, `parseCsvText`, `setupAuth`, `showLoginOverlay`, `updateUserUI`, `derivarPuntajesGlobales`, `bootApplication`, `setupNavigation`, `switchModule`, `renderActiveModule`, `setupEventListeners`.
- Renderizado de módulos: `renderDashboardModule`, `renderDashboardGradesTable`, `renderEvolucionModule`, `renderRankingModule`, `renderAreasModule`, `renderDesempenosModule`, `renderCiclosModule`, `renderTrazabilidadModule`, `renderExportacionModule`.
- Contexto pedagógico: `renderPedagogicalContextBar`, `quickSelectGrupo`.
- Utilidades: `getTiposPresentes`, `renderSplitCharts`, `getAreasList`, `getEtiquetasAreas`, `getAreasResueltas`, `computeAreaAverages`, `computeDistribution`, `getPruebaCatalog`, `pruebaLabel`, `pruebaCode`, `pruebaOrder`, `getAvailablePruebas`, `computeEvolucionData`.

## 4. Flujo principal

1. `App.init()` → carga configs → `setupAuth` → si sesión válida, `loadDataset` + `bootApplication`.
2. `bootApplication()` → `Filters.init(...)` → `renderActiveModule()`.
3. Cambio de filtros → `Filters.applyFiltersFromUI()` → callback → `renderActiveModule()`.
4. Cambio de módulo → `App.switchModule()` → `renderActiveModule()`.

## 5. Configuración (`config/`)

- `institucion.json`, `usuarios.json`, `pruebas.json`, `escalas.json`, `desempenos.json`, `areas.json`, `config_data.js` (bundle opcional).

## 6. Datos (`data/`)

- `data/{dane}/consolidado_total.csv`: dataset por institución.
- `data/consolidado_total.csv`: dataset consolidado.
- `data/{dane}/datos.js`: bundle JS opcional.

## 7. Estilos

- `css/styles.css`: estilos globales.
