/**
 * Visor Educate 360° - Módulo de Visualizaciones y Gráficos
 * Integra Chart.js con soporte de valores numéricos directos en barras,
 * interactividad para ocultar/mostrar líneas de áreas, comparativa por grado y grupo,
 * y comparativa de áreas en las tres pruebas para la ficha del estudiante.
 */

const Charts = (function() {
  const chartInstances = {};

  // Paleta Oficial de Colores (informe.md sección 10.4 y 14)
  const COLORS = {
    bajo: '#bf0000',
    basico: '#ffbf00',
    alto: '#01b1f0',
    superior: '#01af51',
    primary: '#0284c7',
    secondary: '#4f46e5',
    emerald: '#059669',
    amber: '#d97706',
    rose: '#db2777',
    slate: '#475569'
  };

  const AREA_COLORS = {
    'Lenguaje': '#0284c7',
    'Matematicas': '#4f46e5',
    'Ciencias Naturales': '#059669',
    'Sociales': '#d97706',
    'Ingles': '#db2777'
  };

  /**
   * Paso "redondeado" apropiado para un rango del eje. Conserva 0.5 para las
   * escalas periódicas (1 a 5) y produce pasos legibles para escalas amplias
   * como Saber (0 a 500).
   */
  function niceStepSize(rango) {
    if (rango <= 4) return 0.5;
    if (rango <= 10) return 1;
    const bruto = rango / 8;
    const magnitud = Math.pow(10, Math.floor(Math.log10(bruto)));
    const candidatos = [1, 2, 2.5, 5, 10].map(m => m * magnitud);
    return candidatos.find(c => c >= bruto) || 10 * magnitud;
  }

  /**
   * Resuelve la escala desde las opciones recibidas por cada gráfica.
   * Cuando no se reciben opciones (instituciones con una sola escala periódica)
   * se conservan los valores históricos 1.0 a 5.0, de modo que nada se ve peor que antes.
   */
  function resolveEscala(options) {
    const esc = (options && options.escala) || {};
    const minimo = (esc.minimo !== undefined && !isNaN(Number(esc.minimo))) ? Number(esc.minimo) : 1;
    const maximo = (esc.maximo !== undefined && !isNaN(Number(esc.maximo))) ? Number(esc.maximo) : 5;
    const rango = maximo - minimo;
    return {
      minimo,
      maximo,
      // Techo del eje: pequeño margen sobre el máximo oficial en escalas cortas
      // para que las etiquetas numéricas no queden recortadas.
      techo: rango <= 10 ? Number((maximo + rango * 0.075).toFixed(2)) : maximo,
      stepSize: niceStepSize(rango)
    };
  }

  /**
   * Rango del eje de puntajes a partir de las series realmente dibujadas.
   * Mantiene el rango institucional habitual (0-5) y solo lo amplía cuando el
   * consolidado usa otra escala (por ejemplo puntajes 0-500), evitando gráficas recortadas.
   */
  function scoreAxisBounds(seriesList, fixedMin, fixedMax) {
    const values = [];
    (seriesList || []).forEach(series => {
      (series || []).forEach(value => {
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
        if (!isNaN(num) && num > 0) values.push(num);
      });
    });

    const paso = niceStepSize(fixedMax - fixedMin);
    if (values.length === 0) return { min: fixedMin, max: fixedMax, stepSize: paso };

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    if (dataMin >= fixedMin && dataMax <= fixedMax) {
      return { min: fixedMin, max: fixedMax, stepSize: paso };
    }

    const min = Math.max(0, Math.floor(dataMin));
    let max = Math.ceil(dataMax);
    if (max - min < 1) max = min + 1;
    return { min, max, stepSize: Math.max(0.5, Math.round((max - min) / 8)) };
  }

  /**
   * Destruye una instancia previa si existe para evitar superposiciones
   */
  function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
    const canvas = document.getElementById(canvasId);
    if (canvas) {
      clearFallbackContainer(canvas);
    }
  }

  function getFallbackContainer(canvas) {
    canvas.style.display = 'none';
    const parent = canvas.parentElement;
    let fallback = parent.querySelector('.svg-fallback-container');
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.className = 'svg-fallback-container';
      fallback.style.width = '100%';
      parent.appendChild(fallback);
    }
    return fallback;
  }

  function clearFallbackContainer(canvas) {
    canvas.style.display = 'block';
    const parent = canvas.parentElement;
    if (parent) {
      const fallback = parent.querySelector('.svg-fallback-container');
      if (fallback) fallback.remove();
    }
  }

  /**
   * Verifica si Chart.js está disponible globalmente
   */
  function isChartJsAvailable() {
    return typeof window.Chart !== 'undefined';
  }

  // ==========================================================================
  // 1. Dashboard Ejecutivo: Gráficos de Resumen
  // ==========================================================================

  function renderExecutiveOverview(canvasId, areaAverages, performanceDistribution, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);

    if (!isChartJsAvailable()) {
      renderSvgBarChart(canvas, areaAverages, escala.maximo);
      return;
    }

    const ctx = canvas.getContext('2d');
    // Etiquetas visibles resueltas por el llamador (por ejemplo "Lectura Crítica" en Saber)
    const etiquetas = (options && options.etiquetas) || null;
    const claves = Object.keys(areaAverages);
    const labels = claves.map(clave => (etiquetas && etiquetas[clave]) || clave);
    const data = Object.values(areaAverages);
    const backgroundColors = claves.map(clave => AREA_COLORS[clave] || COLORS.primary);

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: `Promedio Institucional (${escala.minimo} - ${escala.maximo})`,
          data: data,
          backgroundColor: backgroundColors,
          borderRadius: 6,
          barPercentage: 0.65
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Promedio: ${context.raw.toFixed(2)} / ${escala.maximo}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: escala.minimo,
            max: escala.techo,
            suggestedMax: escala.techo,
            grid: { color: '#f1f5f9' },
            ticks: {
              stepSize: escala.stepSize,
              font: { weight: '600' },
              callback: (val) => val <= escala.maximo ? val : ''
            }
          },
          x: {
            grid: { display: false },
            ticks: { font: { weight: '700' } }
          }
        }
      },
      plugins: [{
        id: 'barValueLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.getDatasetMeta(0).data.forEach((bar, index) => {
            const val = chart.data.datasets[0].data[index];
            if (val !== undefined && val !== null && !isNaN(val) && val > 0) {
              ctx.save();
              ctx.font = 'bold 12px sans-serif';
              ctx.fillStyle = '#0f172a';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(Number(val).toFixed(2), bar.x, bar.y - 4);
              ctx.restore();
            }
          });
        }
      }]
    });
  }

  function renderExecutiveDonut(canvasId, distribution, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Etiquetas y colores oficiales según la escala del tipo de prueba
    const niveles = (options && Array.isArray(options.niveles) && options.niveles.length === 4)
      ? options.niveles
      : null;
    const nivelLabels = niveles ? niveles.map(n => n.label) : ['Bajo', 'Básico', 'Alto', 'Superior'];
    const nivelColors = niveles ? niveles.map(n => n.color) : [COLORS.bajo, COLORS.basico, COLORS.alto, COLORS.superior];

    const data = [
      distribution.Bajo || 0,
      distribution.Basico || 0,
      distribution.Alto || 0,
      distribution.Superior || 0
    ];

    if (!isChartJsAvailable()) {
      renderSvgDonut(canvas, data, nivelLabels, nivelColors);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: nivelLabels,
        datasets: [{
          data: data,
          backgroundColor: nivelColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { weight: '600', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${context.raw} estudiantes (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // ==========================================================================
  // 2. Evolución Institucional (Alpha -> Beta -> Gamma)
  // ==========================================================================

  function renderEvolutionChart(canvasId, evolutionData, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);

    // Solo se grafican las pruebas presentes en el consolidado de la institución
    const pruebas = evolutionData.pruebas || [];
    if (pruebas.length === 0) return;
    const datasets = [
      {
        label: 'Promedio General',
        data: evolutionData.promedioGeneral || [],
        borderColor: '#0f172a',
        backgroundColor: '#0f172a',
        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.2
      }
    ];

    if (evolutionData.areas) {
      Object.entries(evolutionData.areas).forEach(([areaName, scores]) => {
        // Color resuelto por el llamador (la etiqueta puede diferir de la clave interna)
        const color = (evolutionData.colores && evolutionData.colores[areaName])
          || AREA_COLORS[areaName]
          || COLORS.primary;
        datasets.push({
          label: areaName,
          data: scores,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 5,
          tension: 0.2,
          borderDash: [4, 4]
        });
      });
    }

    if (!isChartJsAvailable()) {
      renderSvgLineChart(canvas, pruebas, datasets);
      return;
    }

    const generalAxis = scoreAxisBounds(
      datasets.map(ds => ds.data),
      escala.minimo,
      escala.maximo
    );

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: pruebas.map(p => `Misión ${p}`),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 14,
              font: { weight: '700', size: 12 },
              padding: 12,
              usePointStyle: true
            },
            // Permite al usuario ocultar/mostrar líneas tocando el nombre del área (Requerimiento 7)
            onClick: (e, legendItem, legend) => {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              if (ci.isDatasetVisible(index)) {
                ci.hide(index);
                legendItem.hidden = true;
              } else {
                ci.show(index);
                legendItem.hidden = false;
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw ? ctx.raw.toFixed(2) : 'N/A'}`
            }
          }
        },
        scales: {
          y: {
            min: generalAxis.min,
            max: generalAxis.max,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: generalAxis.stepSize, font: { weight: '600' } }
          },
          x: {
            grid: { color: '#f1f5f9' },
            ticks: { font: { weight: '700' } }
          }
        }
      }
    });
  }

  /**
   * Comparativo Vertical por Grado y Grupo (Requerimiento 8).
   * Las áreas llegan resueltas por el llamador: [{ key, label, col }],
   * con la columna y la etiqueta propias de la escala de los registros.
   */
  function renderGradeGroupComparison(canvasId, records, areas, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);
    const listAreas = areas || [];

    // Agrupar registros por Grado y Grupo
    const mapGroups = {};
    records.forEach(r => {
      const g = String(r.GRADO || '').trim();
      const grp = String(r.GRUPO || '').trim();
      if (!g || !grp) return;
      const key = `${g}° - G${grp}`;
      if (!mapGroups[key]) {
        mapGroups[key] = { grado: parseInt(g, 10), grupo: grp, rows: [] };
      }
      mapGroups[key].rows.push(r);
    });

    const sortedKeys = Object.keys(mapGroups).sort((a, b) => {
      const gA = mapGroups[a].grado;
      const gB = mapGroups[b].grado;
      if (gA !== gB) return gA - gB;
      return mapGroups[a].grupo.localeCompare(mapGroups[b].grupo);
    });

    if (sortedKeys.length === 0) return;

    const datasets = listAreas.map(item => {
      const col = item.col || item.key.toUpperCase();
      const data = sortedKeys.map(k => {
        const rows = mapGroups[k].rows;
        const vals = rows.map(r => parseFloat(String(r[col] || '').replace(',', '.'))).filter(v => !isNaN(v));
        return vals.length > 0 ? Number((vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(2)) : 0;
      });

      return {
        label: item.label || item.key,
        data: data,
        backgroundColor: AREA_COLORS[item.key] || COLORS.primary,
        borderRadius: 4
      };
    });

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, sortedKeys, datasets[0].data, datasets.map(() => COLORS.primary), escala.maximo);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedKeys,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 12, font: { weight: '700', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} / ${escala.maximo}`
            }
          }
        },
        scales: {
          y: {
            min: escala.minimo,
            max: escala.techo,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: escala.stepSize, font: { weight: '600' } }
          },
          x: {
            grid: { display: false },
            ticks: { font: { weight: '700' } }
          }
        }
      }
    });
  }

  // ==========================================================================
  // 4. Seguimiento por Área y Componentes
  // ==========================================================================

  /**
   * Comparativa de componentes de un área. La etiqueta del área, el promedio
   * y los componentes llegan ya resueltos desde el llamador; la escala define
   * el rango del eje (1-5 en periódicas, 0-500 en Saber).
   */
  function renderAreaComponentsChart(canvasId, areaName, mainAverage, componentsData, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);
    const labels = [areaName, ...Object.keys(componentsData)];
    const values = [mainAverage, ...Object.values(componentsData)];
    const bgColors = [
      AREA_COLORS[areaName] || COLORS.primary,
      ...Object.keys(componentsData).map(() => '#64748b')
    ];

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, labels, values, bgColors, escala.maximo);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Promedio',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 6,
          barPercentage: 0.6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Calificación: ${ctx.raw.toFixed(2)} / ${escala.maximo}`
            }
          }
        },
        scales: {
          x: {
            min: escala.minimo,
            max: escala.techo,
            ticks: { stepSize: escala.stepSize, font: { weight: '600' } },
            grid: { color: '#f1f5f9' }
          },
          y: {
            ticks: { font: { weight: '600' } },
            grid: { display: false }
          }
        }
      },
      plugins: [{
        id: 'horizontalBarLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.getDatasetMeta(0).data.forEach((bar, index) => {
            const val = chart.data.datasets[0].data[index];
            if (val !== undefined && val !== null && !isNaN(val) && val > 0) {
              ctx.save();
              ctx.font = 'bold 11px sans-serif';
              ctx.fillStyle = '#0f172a';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(Number(val).toFixed(2), bar.x + 5, bar.y);
              ctx.restore();
            }
          });
        }
      }]
    });
  }

  /**
   * Muestra para un área el promedio de cada grado y de cada grupo cuando 'todos' está
   * seleccionado (Requerimiento 10). La columna del CSV, la etiqueta visible y la escala
   * llegan resueltas desde el llamador en options ({ escala, areaLabel, col }).
   */
  function renderAreaAllGradesGroupsChart(canvasId, areaName, records, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);
    const col = (options && options.col) || areaName.toUpperCase();
    const areaLabel = (options && options.areaLabel) || areaName;

    // 1. Promedio por Grado
    const gradesMap = {};
    // 2. Promedio por Grupo
    const groupsMap = {};

    records.forEach(r => {
      const g = String(r.GRADO || '').trim();
      const grp = String(r.GRUPO || '').trim();
      const val = parseFloat(String(r[col] || '').replace(',', '.'));
      if (isNaN(val)) return;

      if (g) {
        if (!gradesMap[g]) gradesMap[g] = [];
        gradesMap[g].push(val);
      }
      if (g && grp) {
        const k = `${g}°-${grp}`;
        if (!groupsMap[k]) groupsMap[k] = { grado: parseInt(g, 10), grp, scores: [] };
        groupsMap[k].scores.push(val);
      }
    });

    const sortedGrades = Object.keys(gradesMap).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const sortedGroups = Object.keys(groupsMap).sort((a, b) => {
      const gA = groupsMap[a].grado;
      const gB = groupsMap[b].grado;
      if (gA !== gB) return gA - gB;
      return groupsMap[a].grp.localeCompare(groupsMap[b].grp);
    });

    const labels = [
      ...sortedGrades.map(g => `Grado ${g}°`),
      ...sortedGroups.map(k => `G ${k}`)
    ];

    const values = [
      ...sortedGrades.map(g => Number((gradesMap[g].reduce((x, y) => x + y, 0) / gradesMap[g].length).toFixed(2))),
      ...sortedGroups.map(k => Number((groupsMap[k].scores.reduce((x, y) => x + y, 0) / groupsMap[k].scores.length).toFixed(2)))
    ];

    const colors = [
      ...sortedGrades.map(() => AREA_COLORS[areaName] || COLORS.primary),
      ...sortedGroups.map(() => '#64748b')
    ];

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, labels, values, colors, escala.maximo);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: `Promedio en ${areaLabel}`,
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Promedio: ${ctx.raw.toFixed(2)} / ${escala.maximo}`
            }
          }
        },
        scales: {
          x: {
            min: escala.minimo,
            max: escala.techo,
            ticks: { stepSize: escala.stepSize, font: { weight: '600' } },
            grid: { color: '#f1f5f9' }
          },
          y: {
            ticks: { font: { weight: '600', size: 11 } },
            grid: { display: false }
          }
        }
      },
      plugins: [{
        id: 'horizontalBarLabelsAll',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.getDatasetMeta(0).data.forEach((bar, index) => {
            const val = chart.data.datasets[0].data[index];
            if (val !== undefined && val !== null && !isNaN(val) && val > 0) {
              ctx.save();
              ctx.font = 'bold 11px sans-serif';
              ctx.fillStyle = '#0f172a';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(Number(val).toFixed(2), bar.x + 5, bar.y);
              ctx.restore();
            }
          });
        }
      }]
    });
  }

  // ==========================================================================
  // 5. Distribución de Desempeños: Barras Apiladas (100% Stacked Bar)
  // ==========================================================================

  function renderStackedPerformance(canvasId, categories, bajoArr, basicoArr, altoArr, superiorArr, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Etiquetas y colores oficiales según la escala del tipo de prueba
    const niveles = (options && Array.isArray(options.niveles) && options.niveles.length === 4)
      ? options.niveles
      : null;
    const nivelLabels = niveles ? niveles.map(n => n.label) : ['Bajo', 'Básico', 'Alto', 'Superior'];
    const nivelColors = niveles ? niveles.map(n => n.color) : [COLORS.bajo, COLORS.basico, COLORS.alto, COLORS.superior];

    if (!isChartJsAvailable()) {
      renderSvgStackedBar(canvas, categories, bajoArr, basicoArr, altoArr, superiorArr, nivelLabels, nivelColors);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          {
            label: nivelLabels[0],
            data: bajoArr,
            backgroundColor: nivelColors[0],
            stack: 'desempeno',
            borderRadius: 2
          },
          {
            label: nivelLabels[1],
            data: basicoArr,
            backgroundColor: nivelColors[1],
            stack: 'desempeno',
            borderRadius: 2
          },
          {
            label: nivelLabels[2],
            data: altoArr,
            backgroundColor: nivelColors[2],
            stack: 'desempeno',
            borderRadius: 2
          },
          {
            label: nivelLabels[3],
            data: superiorArr,
            backgroundColor: nivelColors[3],
            stack: 'desempeno',
            borderRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 12, font: { weight: '700', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = bajoArr[ctx.dataIndex] + basicoArr[ctx.dataIndex] + altoArr[ctx.dataIndex] + superiorArr[ctx.dataIndex];
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return ` ${ctx.dataset.label}: ${ctx.raw} est. (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { weight: '600' } }
          },
          y: {
            stacked: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { weight: '600' } },
            title: { display: true, text: 'Cantidad de Estudiantes', font: { weight: 'bold' } }
          }
        }
      }
    });
  }

  // ==========================================================================
  // 6. Consulta por Ciclo: Comparativo Inter-ciclos
  // ==========================================================================

  /**
   * Comparativo Inter-ciclos. La escala llega en options ({ escala }) desde el
   * llamador: define el rango del eje (1-5 en periódicas, 0-500 en Saber).
   * Sin options se conservan los valores históricos 2.0 a 5.3.
   */
  function renderCyclesComparison(canvasId, cyclesData, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);
    const labels = Object.keys(cyclesData);
    const values = Object.values(cyclesData).map(d => d.promedio || 0);
    const counts = Object.values(cyclesData).map(d => d.totalEstudiantes || 0);

    if (!isChartJsAvailable()) {
      renderSvgBarChart(canvas, Object.fromEntries(labels.map((l, i) => [l, values[i]])), escala.maximo);
      return;
    }

    const tieneEscala = options && options.escala && !isNaN(Number(options.escala.maximo));
    const cyclesAxis = tieneEscala
      ? scoreAxisBounds([values], escala.minimo, escala.techo)
      : { min: 2.0, max: 5.3, stepSize: 0.5 };
    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Promedio del Ciclo',
          data: values,
          backgroundColor: '#0284c7',
          borderRadius: 6,
          barPercentage: 0.55
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Promedio: ${ctx.raw.toFixed(2)} | Estudiantes: ${counts[ctx.dataIndex]}`
            }
          }
        },
        scales: {
          y: {
            min: cyclesAxis.min,
            max: cyclesAxis.max,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: cyclesAxis.stepSize, font: { weight: '600' } }
          },
          x: {
            grid: { display: false },
            ticks: { font: { weight: '700' } }
          }
        }
      },
      plugins: [{
        id: 'cyclesBarLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.getDatasetMeta(0).data.forEach((bar, index) => {
            const val = chart.data.datasets[0].data[index];
            if (val > 0) {
              ctx.save();
              ctx.font = 'bold 12px sans-serif';
              ctx.fillStyle = '#0f172a';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(Number(val).toFixed(2), bar.x, bar.y - 4);
              ctx.restore();
            }
          });
        }
      }]
    });
  }

  /**
   * Desglose de todos los grupos y grados por ciclo cuando se selecciona 'todos' (Requerimiento 11).
   * La escala llega en options ({ escala }) desde el llamador y define el eje y el
   * máximo mostrado en el tooltip; sin options se conservan los valores históricos 1.0 a 5.2.
   */
  function renderCyclesDrilldown(canvasId, records, ciclosConfig, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const cycles = ciclosConfig || {
      "1": ["1", "2", "3"],
      "2": ["4", "5"],
      "3": ["6", "7"],
      "4": ["8", "9"],
      "5": ["10", "11"]
    };

    const labels = [];
    const values = [];
    const colors = [];

    const cyclePalette = ['#0284c7', '#4f46e5', '#059669', '#d97706', '#db2777'];

    Object.entries(cycles).forEach(([cNum, gList], cIdx) => {
      const color = cyclePalette[cIdx % cyclePalette.length];
      gList.forEach(g => {
        const gradeRecords = records.filter(r => String(r.GRADO).trim() === String(g));
        if (gradeRecords.length === 0) return;

        const groups = [...new Set(gradeRecords.map(r => String(r.GRUPO).trim()))].sort();
        groups.forEach(grp => {
          const grpRecords = gradeRecords.filter(r => String(r.GRUPO).trim() === grp);
          const scores = grpRecords.map(r => parseFloat(String(r.PUNTAJE).replace(',', '.'))).filter(s => !isNaN(s));
          const avg = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
          if (avg > 0) {
            labels.push(`C${cNum}: ${g}°-${grp}`);
            values.push(avg);
            colors.push(color);
          }
        });
      });
    });

    if (labels.length === 0) return;

    const escala = resolveEscala(options);
    const tieneEscala = options && options.escala && !isNaN(Number(options.escala.maximo));
    const drilldownAxis = tieneEscala
      ? scoreAxisBounds([values], escala.minimo, escala.techo)
      : { min: 1.0, max: 5.2, stepSize: 0.5 };
    // Máximo oficial de la escala para el tooltip: 5.0 en periódicas, 500 en Saber
    const maximoTooltip = tieneEscala ? escala.maximo : 5.0;
    const textoMaximo = Number.isInteger(maximoTooltip) ? String(maximoTooltip) : maximoTooltip.toFixed(1);

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, labels, values, colors, escala.maximo);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Promedio del Grupo',
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Promedio: ${ctx.raw.toFixed(2)} / ${textoMaximo}`
            }
          }
        },
        scales: {
          y: {
            min: drilldownAxis.min,
            max: drilldownAxis.max,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: drilldownAxis.stepSize, font: { weight: '600' } }
          },
          x: {
            grid: { display: false },
            ticks: { font: { weight: '600', size: 11 }, maxRotation: 45, minRotation: 45 }
          }
        }
      }
    });
  }

  // ==========================================================================
  // 7. Trazabilidad de Estudiantes: Trayectoria Individual y Comparativo por Área
  // ==========================================================================

  function renderStudentHistory(canvasId, studentTests, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Escala del tipo de prueba de esta trayectoria; conserva 1.0/5.2 como respaldo
    const escala = (options && options.escala && !isNaN(Number(options.escala.maximo)))
      ? { minimo: Number(options.escala.minimo), maximo: Number(options.escala.maximo) }
      : { minimo: 1.0, maximo: 5.2 };

    const labels = studentTests.map(t => `Misión ${t.prueba || t.PRUEBA}`);
    const globalScores = studentTests.map(t => parseFloat(String(t.puntaje || t.PUNTAJE).replace(',', '.')) || 0);

    if (!isChartJsAvailable()) {
      renderSvgLineChart(canvas, labels, [{ label: 'Puntaje Global', data: globalScores, borderColor: '#0284c7' }]);
      return;
    }

    const historyAxis = scoreAxisBounds([globalScores], escala.minimo, escala.maximo);

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Puntaje Global',
          data: globalScores,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.1)',
          fill: true,
          borderWidth: 3,
          pointRadius: 6,
          pointBackgroundColor: '#0284c7',
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Puntaje Global: ${ctx.raw.toFixed(2)}`
            }
          }
        },
        scales: {
          y: {
            min: historyAxis.min,
            max: historyAxis.max,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: historyAxis.stepSize, font: { weight: '600' } }
          },
          x: {
            grid: { color: '#f1f5f9' },
            ticks: { font: { weight: '700' } }
          }
        }
      }
    });
  }

  /**
   * Comparativo por Área en las 3 pruebas para la Ficha del Estudiante (Requerimiento 9).
   * Las áreas llegan resueltas por el llamador: [{ key, label, col }], con la columna
   * y la etiqueta propias de la escala de las pruebas incluidas.
   */
  function renderStudentAreasComparison(canvasId, studentTests, areas, options) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const escala = resolveEscala(options);

    const listAreas = areas || [];
    const testColors = {
      'ALFA': '#0284c7',
      'BETA': '#4f46e5',
      'GAMMA': '#059669'
    };
    // Paleta para pruebas que no están en config/pruebas.json (por ejemplo EPSILON)
    const extraColors = ['#0d9488', '#b45309', '#7c3aed', '#be123c', '#0891b2'];

    const labelsAreas = listAreas.map(item => item.label || item.key);

    const datasets = studentTests.map((t, testIndex) => {
      const p = String(t.PRUEBA || t.prueba).toUpperCase();
      const color = testColors[p] || extraColors[testIndex % extraColors.length];
      const data = listAreas.map(item => {
        const col = item.col || item.key.toUpperCase();
        const val = parseFloat(String(t[col] || t[item.key] || '').replace(',', '.'));
        return !isNaN(val) ? val : 0;
      });

      return {
        label: `Misión ${p}`,
        data: data,
        backgroundColor: color,
        borderRadius: 4
      };
    });

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, labelsAreas, datasets[0] ? datasets[0].data : [], listAreas.map(() => '#0284c7'), escala.maximo);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labelsAreas,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 12, font: { weight: '700', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} / ${escala.maximo}`
            }
          }
        },
        scales: {
          y: {
            min: escala.minimo,
            max: escala.techo,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: escala.stepSize, font: { weight: '600' } }
          },
          x: {
            grid: { display: false },
            ticks: { font: { weight: '700' } }
          }
        }
      },
      plugins: [{
        id: 'studentBarLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets.forEach((ds, dsIdx) => {
            const meta = chart.getDatasetMeta(dsIdx);
            meta.data.forEach((bar, bIdx) => {
              const val = ds.data[bIdx];
              if (val > 0) {
                ctx.save();
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(Number(val).toFixed(1), bar.x, bar.y - 2);
                ctx.restore();
              }
            });
          });
        }
      }]
    });
  }

  // ==========================================================================
  // Gráficos de Respaldo Puros en SVG (Garantizan visualización sin red / offline)
  // ==========================================================================

  function renderSvgBarChart(canvas, dataObj, maximoReferencia) {
    const maximo = (maximoReferencia && maximoReferencia > 0) ? maximoReferencia : 5.0;
    const container = getFallbackContainer(canvas);
    const entries = Object.entries(dataObj);
    if (entries.length === 0) return;

    let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 0;">`;
    entries.forEach(([label, val]) => {
      const pct = Math.min(Math.max((val / maximo) * 100, 0), 100);
      const color = AREA_COLORS[label] || COLORS.primary;
      html += `
        <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
          <span style="width:110px; font-weight:600; text-align:right;">${label}</span>
          <div style="flex-grow:1; background:#f1f5f9; height:18px; border-radius:4px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px;"></div>
          </div>
          <span style="width:40px; font-weight:700;">${val.toFixed(2)}</span>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderSvgHorizontalBar(canvas, labels, values, bgColors, maximoReferencia) {
    const maximo = (maximoReferencia && maximoReferencia > 0) ? maximoReferencia : 5.0;
    const container = getFallbackContainer(canvas);
    let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 0;">`;
    labels.forEach((label, i) => {
      const val = values[i] || 0;
      const pct = Math.min(Math.max((val / maximo) * 100, 0), 100);
      const color = bgColors[i] || '#64748b';
      html += `
        <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
          <span style="width:140px; font-weight:600; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${label}</span>
          <div style="flex-grow:1; background:#f1f5f9; height:18px; border-radius:4px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px;"></div>
          </div>
          <span style="width:40px; font-weight:700;">${val.toFixed(2)}</span>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderSvgDonut(canvas, data, nivelLabels, nivelColors) {
    const container = getFallbackContainer(canvas);
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const labels = Array.isArray(nivelLabels) ? nivelLabels : ['Bajo', 'Básico', 'Alto', 'Superior'];
    const colors = Array.isArray(nivelColors) ? nivelColors : [COLORS.bajo, COLORS.basico, COLORS.alto, COLORS.superior];

    let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 0;">`;
    labels.forEach((lbl, i) => {
      const count = data[i];
      const pct = ((count / total) * 100).toFixed(1);
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; padding:4px 0; border-bottom:1px solid #f1f5f9;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:10px; height:10px; border-radius:2px; background:${colors[i]}; display:inline-block;"></span>
            <span style="font-weight:600;">${lbl}</span>
          </div>
          <span style="font-weight:700;">${count} est. (${pct}%)</span>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderSvgLineChart(canvas, labels, datasets) {
    const container = getFallbackContainer(canvas);
    let html = `<div style="display:flex; flex-direction:column; gap:10px; width:100%; padding:10px 0;">`;
    datasets.forEach(ds => {
      html += `<div style="font-size:12px; font-weight:700; color:${ds.borderColor}; margin-bottom:4px;">${ds.label}:</div><div style="display:flex; gap:8px;">`;
      labels.forEach((lbl, idx) => {
        const val = ds.data[idx];
        html += `
          <div style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px; text-align:center;">
            <div style="font-size:11px; color:#64748b;">${lbl}</div>
            <div style="font-size:14px; font-weight:800; color:${ds.borderColor};">${val ? val.toFixed(2) : '-'}</div>
          </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderSvgStackedBar(canvas, categories, bajoArr, basicoArr, altoArr, superiorArr, nivelLabels, nivelColors) {
    const container = getFallbackContainer(canvas);
    const labels = Array.isArray(nivelLabels) ? nivelLabels : ['Bajo', 'Básico', 'Alto', 'Superior'];
    const colors = Array.isArray(nivelColors) ? nivelColors : [COLORS.bajo, COLORS.basico, COLORS.alto, COLORS.superior];
    let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 0;">`;
    categories.forEach((cat, i) => {
      const b = bajoArr[i] || 0;
      const bs = basicoArr[i] || 0;
      const a = altoArr[i] || 0;
      const s = superiorArr[i] || 0;
      const total = b + bs + a + s || 1;

      const pB = (b / total) * 100;
      const pBs = (bs / total) * 100;
      const pA = (a / total) * 100;
      const pS = (s / total) * 100;

      html += `
        <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
          <span style="width:70px; font-weight:600; text-align:right;">${cat}</span>
          <div style="flex-grow:1; display:flex; height:20px; border-radius:4px; overflow:hidden;">
            ${pB > 0 ? `<div style="width:${pB}%; background:${colors[0]};" title="${labels[0]}: ${b}"></div>` : ''}
            ${pBs > 0 ? `<div style="width:${pBs}%; background:${colors[1]};" title="${labels[1]}: ${bs}"></div>` : ''}
            ${pA > 0 ? `<div style="width:${pA}%; background:${colors[2]};" title="${labels[2]}: ${a}"></div>` : ''}
            ${pS > 0 ? `<div style="width:${pS}%; background:${colors[3]};" title="${labels[3]}: ${s}"></div>` : ''}
          </div>
          <span style="width:50px; font-weight:700; font-size:11px;">${total} est.</span>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  return {
    COLORS,
    AREA_COLORS,
    renderExecutiveOverview,
    renderExecutiveDonut,
    renderEvolutionChart,
    renderGradeGroupComparison,
    renderAreaComponentsChart,
    renderAreaAllGradesGroupsChart,
    renderStackedPerformance,
    renderCyclesComparison,
    renderCyclesDrilldown,
    renderStudentHistory,
    renderStudentAreasComparison,
    destroyChart
  };
})();

// Exportar globalmente
window.Charts = Charts;
