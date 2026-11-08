/**
 * Visor Educate 360° - Módulo de Exportaciones
 * Cumple con Principio 2 y Módulo 8 de informe.md: Toda consulta debe poder exportarse a Excel
 * aplicando estrictamente los filtros activos.
 */

const Exports = (function() {

  /**
   * Exporta a Excel (.xlsx o CSV compatible con Excel BOM UTF-8)
   */
  function exportFilteredData(records, institucionConfig, filterState) {
    if (!records || records.length === 0) {
      alert('No hay registros disponibles para exportar con los filtros seleccionados.');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const instName = (institucionConfig && institucionConfig.nombre) ? institucionConfig.nombre.replace(/\s+/g, '_') : 'Colegio';
    const filename = `VisorEducate360_${instName}_${timestamp}.xlsx`;

    // Mapear registros con encabezados claros y profesionales
    const cleanRows = records.map(r => ({
      'Prueba': r.PRUEBA || '',
      'Grado': r.GRADO || '',
      'Grupo': r.GRUPO || '',
      'Puesto': r.PUESTO || '',
      'Documento': r.DOCUMENTO || '',
      'Estudiante': r.ESTUDIANTE || '',
      'Puntaje Global': r.PUNTAJE !== '' ? parseFloat(String(r.PUNTAJE).replace(',', '.')) : '',
      'Desempeño': r.DESEMPEÑO || '',
      'Lenguaje': r.LENGUAJE !== '' ? parseFloat(String(r.LENGUAJE).replace(',', '.')) : '',
      'Ciencias Naturales': r['CIENCIAS NATURALES'] !== '' ? parseFloat(String(r['CIENCIAS NATURALES']).replace(',', '.')) : '',
      'Biología': r['BIOLOGÍA'] !== '' ? parseFloat(String(r['BIOLOGÍA']).replace(',', '.')) : '',
      'Física': r['FÍSICA'] !== '' ? parseFloat(String(r['FÍSICA']).replace(',', '.')) : '',
      'Química': r['QUÍMICA'] !== '' ? parseFloat(String(r['QUÍMICA']).replace(',', '.')) : '',
      'CTS': r['CIENCIA TECNOLOGÍA Y SOCIEDAD.'] !== '' ? parseFloat(String(r['CIENCIA TECNOLOGÍA Y SOCIEDAD.']).replace(',', '.')) : '',
      'Matemáticas': r['MATEMÁTICAS'] !== '' ? parseFloat(String(r['MATEMÁTICAS']).replace(',', '.')) : '',
      'Estadística': r['ESTADÍSTICA'] !== '' ? parseFloat(String(r['ESTADÍSTICA']).replace(',', '.')) : '',
      'Geometría': r['GEOMETRÍA'] !== '' ? parseFloat(String(r['GEOMETRÍA']).replace(',', '.')) : '',
      'Aritmética': r['ARITMÉTICA'] !== '' ? parseFloat(String(r['ARITMÉTICA']).replace(',', '.')) : '',
      'Sociales y Ciudadanas': r['SOCIALES Y CIUDADANAS'] !== '' ? parseFloat(String(r['SOCIALES Y CIUDADANAS']).replace(',', '.')) : '',
      'Ciencias Sociales': r['CIENCIAS SOCIALES'] !== '' ? parseFloat(String(r['CIENCIAS SOCIALES']).replace(',', '.')) : '',
      'Competencias Ciudadanas': r['COMPETENCIAS CIUDADANAS'] !== '' ? parseFloat(String(r['COMPETENCIAS CIUDADANAS']).replace(',', '.')) : '',
      'Inglés': r['INGLÉS'] !== '' ? parseFloat(String(r['INGLÉS']).replace(',', '.')) : ''
    }));

    // Si SheetJS (XLSX) está presente en la ventana
    if (typeof window.XLSX !== 'undefined') {
      const wb = window.XLSX.utils.book_new();

      // Hoja 1: Datos Filtrados
      const wsData = window.XLSX.utils.json_to_sheet(cleanRows);
      window.XLSX.utils.book_append_sheet(wb, wsData, 'Resultados_Filtrados');

      // Hoja 2: Resumen de Filtros y Métricas
      const summaryData = [
        ['VISOR EDUCATE 360° - REPORTE EJECUTIVO'],
        ['Institución', (institucionConfig && institucionConfig.nombre) || 'Colegio Cambridge'],
        ['DANE', (institucionConfig && institucionConfig.dane) || ''],
        ['Fecha de Generación', new Date().toLocaleString()],
        ['Total Registros Exportados', records.length],
        [],
        ['FILTROS ACTIVOS APLICADOS:'],
        ['Tipo de Prueba', filterState.tipoPrueba || 'Todos'],
        ['Prueba Específica', filterState.prueba || 'Todas'],
        ['Ciclo', filterState.ciclo || 'Todos'],
        ['Grado', filterState.grado || 'Todos'],
        ['Grupo', filterState.grupo || 'Todos'],
        ['Área', filterState.area || 'Todas']
      ];
      const wsSummary = window.XLSX.utils.aoa_to_sheet(summaryData);
      window.XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Filtros');

      window.XLSX.writeFile(wb, filename);
    } else {
      // Respaldo en CSV formateado con BOM UTF-8 y delimitador ';' para Excel en español
      downloadCsvFallback(cleanRows, filename.replace('.xlsx', '.csv'));
    }
  }

  /**
   * Respaldo CSV con BOM UTF-8 (\uFEFF) para compatibilidad total con Excel
   */
  function downloadCsvFallback(rows, filename) {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    let csvContent = '\uFEFF'; // Byte Order Mark para UTF-8 en Excel
    csvContent += headers.join(';') + '\r\n';

    rows.forEach(row => {
      const line = headers.map(h => {
        let val = row[h];
        if (val === null || val === undefined) val = '';
        val = String(val).replace(/"/g, '""');
        if (val.includes(';') || val.includes('\n') || val.includes('"')) {
          val = `"${val}"`;
        }
        return val;
      }).join(';');
      csvContent += line + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Dispara el diálogo de impresión con vista ejecutiva limpia
   */
  function printExecutiveReport() {
    window.print();
  }

  return {
    exportFilteredData,
    printExecutiveReport
  };
})();

// Exportar globalmente
window.Exports = Exports;

