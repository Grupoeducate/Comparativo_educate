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

  const AREA_COLUMNS = {
    'Lenguaje': 'LENGUAJE',
    'Matematicas': 'MATEMÁTICAS',
    'Ciencias Naturales': 'CIENCIAS NATURALES',
    'Sociales': 'SOCIALES Y CIUDADANAS',
    'Ingles': 'INGLÉS'
  };

  /**
   * Rango del eje de puntajes a partir de las series realmente dibujadas.
   * Mantiene el rango institucional habitual (0-5) y solo lo amplía cuando el
   * consolidado usa otra escala (por ejemplo puntajes 0-100), evitando gráficas recortadas.
   */
  function scoreAxisBounds(seriesList, fixedMin, fixedMax) {
    const values = [];
    (seriesList || []).forEach(series => {
      (series || []).forEach(value => {
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
        if (!isNaN(num) && num > 0) values.push(num);
      });
    });

    if (values.length === 0) return { min: fixedMin, max: fixedMax, stepSize: 0.5 };

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    if (dataMin >= fixedMin && dataMax <= fixedMax) {
      return { min: fixedMin, max: fixedMax, stepSize: 0.5 };
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

  function renderExecutiveOverview(canvasId, areaAverages, performanceDistribution) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (!isChartJsAvailable()) {
      renderSvgBarChart(canvas, areaAverages);
      return;
    }

    const ctx = canvas.getContext('2d');
    const labels = Object.keys(areaAverages);
    const data = Object.values(areaAverages);
    const backgroundColors = labels.map(label => AREA_COLORS[label] || COLORS.primary);

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Promedio Institucional (1.0 - 5.0)',
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
              label: (context) => `Promedio: ${context.raw.toFixed(2)} / 5.0`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 1.0,
            max: 5.35,
            suggestedMax: 5.35,
            grid: { color: '#f1f5f9' },
            ticks: {
              stepSize: 0.5,
              font: { weight: '600' },
              callback: (val) => val <= 5.0 ? val : ''
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

  function renderExecutiveDonut(canvasId, distribution) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const data = [
      distribution.Bajo || 0,
      distribution.Basico || 0,
      distribution.Alto || 0,
      distribution.Superior || 0
    ];

    if (!isChartJsAvailable()) {
      renderSvgDonut(canvas, data);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Bajo', 'Básico', 'Alto', 'Superior'],
        datasets: [{
          data: data,
          backgroundColor: [COLORS.bajo, COLORS.basico, COLORS.alto, COLORS.superior],
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

  function renderEvolutionChart(canvasId, evolutionData) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

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
        datasets.push({
          label: areaName,
          data: scores,
          borderColor: AREA_COLORS[areaName] || COLORS.primary,
          backgroundColor: AREA_COLORS[areaName] || COLORS.primary,
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
      2.0,
      5.0
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
   * Comparativo Vertical por Grado y Grupo (Requerimiento 8)
   */
  function renderGradeGroupComparison(canvasId, records, areasList) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const listAreas = areasList || ['Lenguaje', 'Matematicas', 'Ciencias Naturales', 'Sociales', 'Ingles'];

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

    const datasets = listAreas.map(areaName => {
      const col = AREA_COLUMNS[areaName] || areaName.toUpperCase();
      const data = sortedKeys.map(k => {
        const rows = mapGroups[k].rows;
        const vals = rows.map(r => parseFloat(String(r[col] || '').replace(',', '.'))).filter(v => !isNaN(v));
        return vals.length > 0 ? Number((vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(2)) : 0;
      });

      return {
        label: areaName,
        data: data,
        backgroundColor: AREA_COLORS[areaName] || COLORS.primary,
        borderRadius: 4
      };
    });

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, sortedKeys, datasets[0].data, datasets.map(() => COLORS.primary));
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
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} / 5.0`
            }
          }
        },
        scales: {
          y: {
            min: 1.0,
            max: 5.2,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: 0.5, font: { weight: '600' } }
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

  function renderAreaComponentsChart(canvasId, areaName, mainAverage, componentsData) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const labels = [areaName, ...Object.keys(componentsData)];
    const values = [mainAverage, ...Object.values(componentsData)];
    const bgColors = [
      AREA_COLORS[areaName] || COLORS.primary,
      ...Object.keys(componentsData).map(() => '#64748b')
    ];

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, labels, values, bgColors);
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
              label: (ctx) => ` Calificación: ${ctx.raw.toFixed(2)} / 5.0`
            }
          }
        },
        scales: {
          x: {
            min: 1.0,
            max: 5.2,
            ticks: { stepSize: 0.5, font: { weight: '600' } },
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
   * Muestra para un área el promedio de cada grado y de cada grupo cuando 'todos' está seleccionado (Requerimiento 10)
   */
  function renderAreaAllGradesGroupsChart(canvasId, areaName, records) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const col = AREA_COLUMNS[areaName] || areaName.toUpperCase();

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
      renderSvgHorizontalBar(canvas, labels, values, colors);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: `Promedio en ${areaName}`,
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
              label: (ctx) => ` Promedio: ${ctx.raw.toFixed(2)} / 5.0`
            }
          }
        },
        scales: {
          x: {
            min: 1.0,
            max: 5.2,
            ticks: { stepSize: 0.5, font: { weight: '600' } },
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

  function renderStackedPerformance(canvasId, categories, bajoArr, basicoArr, altoArr, superiorArr) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (!isChartJsAvailable()) {
      renderSvgStackedBar(canvas, categories, bajoArr, basicoArr, altoArr, superiorArr);
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          {
            label: 'Bajo',
            data: bajoArr,
            backgroundColor: COLORS.bajo,
            stack: 'desempeno',
            borderRadius: 2
          },
          {
            label: 'Básico',
            data: basicoArr,
            backgroundColor: COLORS.basico,
            stack: 'desempeno',
            borderRadius: 2
          },
          {
            label: 'Alto',
            data: altoArr,
            backgroundColor: COLORS.alto,
            stack: 'desempeno',
            borderRadius: 2
          },
          {
            label: 'Superior',
            data: superiorArr,
            backgroundColor: COLORS.superior,
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

  function renderCyclesComparison(canvasId, cyclesData) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const labels = Object.keys(cyclesData);
    const values = Object.values(cyclesData).map(d => d.promedio || 0);
    const counts = Object.values(cyclesData).map(d => d.totalEstudiantes || 0);

    if (!isChartJsAvailable()) {
      renderSvgBarChart(canvas, Object.fromEntries(labels.map((l, i) => [l, values[i]])));
      return;
    }

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
            min: 2.0,
            max: 5.3,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: 0.5, font: { weight: '600' } }
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
   * Desglose de todos los grupos y grados por ciclo cuando se selecciona 'todos' (Requerimiento 11)
   */
  function renderCyclesDrilldown(canvasId, records, ciclosConfig) {
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

    if (!isChartJsAvailable()) {
      renderSvgHorizontalBar(canvas, labels, values, colors);
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
              label: (ctx) => ` Promedio: ${ctx.raw.toFixed(2)} / 5.0`
            }
          }
        },
        scales: {
          y: {
            min: 1.0,
            max: 5.2,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: 0.5, font: { weight: '600' } }
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

  function renderStudentHistory(canvasId, studentTests) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const labels = studentTests.map(t => `Misión ${t.prueba || t.PRUEBA}`);
    const globalScores = studentTests.map(t => parseFloat(String(t.puntaje || t.PUNTAJE).replace(',', '.')) || 0);

    if (!isChartJsAvailable()) {
      renderSvgLineChart(canvas, labels, [{ label: 'Puntaje Global', data: globalScores, borderColor: '#0284c7' }]);
      return;
    }

    const historyAxis = scoreAxisBounds([globalScores], 1.0, 5.2);

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
   * Comparativo por Área en las 3 pruebas para la Ficha del Estudiante (Requerimiento 9)
   */
  function renderStudentAreasComparison(canvasId, studentTests, areasList) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const listAreas = areasList || ['Lenguaje', 'Matematicas', 'Ciencias Naturales', 'Sociales', 'Ingles'];
    const testColors = {
      'ALFA': '#0284c7',
      'BETA': '#4f46e5',
      'GAMMA': '#059669'
    };
    // Paleta para pruebas que no están en config/pruebas.json (por ejemplo EPSILON)
    const extraColors = ['#0d9488', '#b45309', '#7c3aed', '#be123c', '#0891b2'];

    const datasets = studentTests.map((t, testIndex) => {
      const p = String(t.PRUEBA || t.prueba).toUpperCase();
      const color = testColors[p] || extraColors[testIndex % extraColors.length];
      const data = listAreas.map(a => {
        const col = AREA_COLUMNS[a] || a.toUpperCase();
        const val = parseFloat(String(t[col] || t[a] || '').replace(',', '.'));
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
      renderSvgHorizontalBar(canvas, listAreas, datasets[0] ? datasets[0].data : [], listAreas.map(() => '#0284c7'));
      return;
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: listAreas,
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
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} / 5.0`
            }
          }
        },
        scales: {
          y: {
            min: 1.0,
            max: 5.3,
            grid: { color: '#f1f5f9' },
            ticks: { stepSize: 0.5, font: { weight: '600' } }
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

  function renderSvgBarChart(canvas, dataObj) {
    const container = getFallbackContainer(canvas);
    const entries = Object.entries(dataObj);
    if (entries.length === 0) return;

    let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 0;">`;
    entries.forEach(([label, val]) => {
      const pct = Math.min(Math.max((val / 5.0) * 100, 0), 100);
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

  function renderSvgHorizontalBar(canvas, labels, values, bgColors) {
    const container = getFallbackContainer(canvas);
    let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding:10px 0;">`;
    labels.forEach((label, i) => {
      const val = values[i] || 0;
      const pct = Math.min(Math.max((val / 5.0) * 100, 0), 100);
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

  function renderSvgDonut(canvas, data) {
    const container = getFallbackContainer(canvas);
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const labels = ['Bajo', 'Básico', 'Alto', 'Superior'];
    const colors = [COLORS.bajo, COLORS.basico, COLORS.alto, COLORS.superior];

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

  function renderSvgStackedBar(canvas, categories, bajoArr, basicoArr, altoArr, superiorArr) {
    const container = getFallbackContainer(canvas);
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
            ${pB > 0 ? `<div style="width:${pB}%; background:${COLORS.bajo};" title="Bajo: ${b}"></div>` : ''}
            ${pBs > 0 ? `<div style="width:${pBs}%; background:${COLORS.basico};" title="Básico: ${bs}"></div>` : ''}
            ${pA > 0 ? `<div style="width:${pA}%; background:${COLORS.alto};" title="Alto: ${a}"></div>` : ''}
            ${pS > 0 ? `<div style="width:${pS}%; background:${COLORS.superior};" title="Superior: ${s}"></div>` : ''}
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
