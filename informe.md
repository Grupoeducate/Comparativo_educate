# Visor Educate 360°
## Documento de Decisiones Arquitectónicas y Funcionales
### Versión 1.0

---

# 1. Propósito del Proyecto

Visor Educate 360° es una plataforma web de analítica educativa diseñada para que directivos, coordinadores académicos y líderes de área consulten los resultados de pruebas institucionales de manera visual, intuitiva y autónoma.

El sistema debe funcionar sin Power BI, sin bases de datos complejas y sin dependencia permanente del desarrollador.

---

# 2. Principios del Proyecto

## Principio 1

La información debe ser comprensible para usuarios no expertos en análisis de datos.

## Principio 2

Toda consulta debe poder exportarse a Excel.

## Principio 3

El sistema debe ser configurable mediante archivos JSON.

## Principio 4

La solución debe ser reutilizable por diferentes colegios.

## Principio 5

El visor debe poder operar desde GitHub Pages u otro hosting estático.

---

# 3. Arquitectura General

```text
VisorEducate360/

├── index.html

├── config/
│   ├── institucion.json
│   ├── pruebas.json
│   ├── escalas.json
│   ├── desempenos.json
│   └── areas.json

├── data/
│   └── consolidado_total.csv

├── css/
│   └── styles.css

├── js/
│   ├── app.js
│   ├── filters.js
│   ├── charts.js
│   ├── exports.js
│   └── auth.js

└── assets/
```

---

# 4. Archivo Fuente Oficial

## Archivo seleccionado

```text
consolidado_total.csv
```

Este archivo sustituye definitivamente cualquier versión previa de:

```text
dashboard_data.csv
```

---

# 5. Gestión de Usuarios

## Modelo Adoptado

Un único nivel de acceso.

No existirán:

- Roles
- Permisos
- Perfiles

## Acceso

Mediante:

```text
DANE
+
PIN de 4 dígitos
```

Los datos se almacenarán en:

```json
institucion.json
```

Ejemplo:

```json
{
  "nombre": "Colegio Cambridge",
  "dane": "080001000001",
  "pin": "4587"
}
```

---

# 6. Identificación de Estudiantes

## Decisión Final

La columna:

```text
DOCUMENTO
```

NO es confiable.

Motivo:

Los operadores cambiaron documentos entre aplicaciones.

## Estrategia Adoptada

La búsqueda utilizará:

```text
ESTUDIANTE
```

normalizado dinámicamente.

---

# 7. Normalización

No se modificará el CSV.

La normalización se realizará mediante JavaScript.

Ejemplo:

```javascript
function normalizarNombre(texto){
   return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .trim()
      .toUpperCase();
}
```

Procesos:

- eliminar tildes
- eliminar espacios dobles
- convertir a mayúsculas
- trim()

---

# 8. Tratamiento de PUESTO

## Decisión

La columna:

```text
PUESTO
```

se conserva.

## Motivo

Permitirá:

- Ranking institucional
- Variación entre aplicaciones
- Comparación histórica

No participa en cálculos de promedio.

---

# 9. Tratamiento de DESEMPEÑO

## Decisión

La columna:

```text
DESEMPEÑO
```

se conserva.

## Motivo

Los informes oficiales ya fueron entregados a estudiantes y padres.

Por consistencia institucional:

```text
NO recalcular.
```

---

# 10. Configuración del Sistema

## 10.1 institucion.json

Contiene:

- nombre
- ciudad
- año
- dane
- pin
- ciclos

---

## 10.2 pruebas.json

Define:

- nombre de la prueba
- carpeta
- orden de aplicación
- tipo

Ejemplo:

```json
{
  "nombre": "Misión Alpha",
  "tipo": "periodica",
  "orden": 1
}
```

---

## 10.3 escalas.json

Contiene todas las escalas.

### Periodicas

```text
Bajo
Basico
Alto
Superior
```

### Saber

```text
Insuficiente
Minimo
Satisfactorio
Avanzado
```

---

## 10.4 desempenos.json

Contiene los colores.

### Periodicas

| Nivel | Color |
|---------|---------|
| Bajo | #bf0000 |
| Basico | #ffbf00 |
| Alto | #01b1f0 |
| Superior | #01af51 |

### Saber

| Nivel | Color |
|---------|---------|
| Insuficiente | #bf0000 |
| Minimo | #ffbf00 |
| Satisfactorio | #01b1f0 |
| Avanzado | #01af51 |

---

## 10.5 areas.json

Define:

- áreas
- componentes
- orden de visualización

---

# 11. Tipos de Prueba

## Tipo 1

```text
periodica
```

Ejemplos:

- Alpha
- Beta
- Gamma

---

## Tipo 2

```text
saber
```

Ejemplos:

- Diagnóstico Saber
- Simulacros Saber
- Saber Final

---

# 12. Filtros Globales

El visor debe permitir:

## Tipo de prueba

```text
Periodica
Saber
```

---

## Prueba

```text
Alpha
Beta
Gamma
```

---

## Ciclo

```text
0 = Transición

1 = 1°,2°,3°

2 = 4°,5°

3 = 6°,7°

4 = 8°,9°

5 = 10°,11°
```

---

## Grado

---

## Grupo

---

## Área

---

# 13. Módulos del Visor

## Módulo 1

### Dashboard Ejecutivo

Indicadores:

- Promedio institucional
- Mejor área
- Área crítica
- Estudiantes evaluados
- Grados evaluados
- Grupos evaluados

---

## Módulo 2

### Evolución Institucional

Comparar:

```text
Alpha → Beta → Gamma
```

---

## Módulo 3

### Ranking Institucional

Mostrar:

- Top 10
- Ranking completo

---

## Módulo 4

### Seguimiento por Área

Ejemplo:

Matemáticas

Mostrar:

- Estadística
- Geometría
- Aritmética

---

## Módulo 5

### Distribución de Desempeños

Gráficos de barras apiladas.

---

## Módulo 6

### Consulta por Ciclo

Comparativos por:

- ciclo
- grado
- grupo

---

## Módulo 7

### Trazabilidad de Estudiantes

Consulta:

- por nombre
- por documento

Mostrar:

```text
Alpha
Beta
Gamma
```

---

## Módulo 8

### Exportación

Debe permitir:

```text
Exportar Excel
```

aplicando los filtros activos.

---

# 14. Diseño Visual

## Filosofía

No parecer:

- Excel
- Power BI
- Software técnico

Debe parecer:

```text
Panel ejecutivo
```

---

## Colores Corporativos

### Bajo

```text
#bf0000
```

### Básico

```text
#ffbf00
```

### Alto

```text
#01b1f0
```

### Superior

```text
#01af51
```

---

# 15. Estado Actual del Proyecto

## Completado

✅ Definición funcional

✅ Modelo de datos

✅ Configuración JSON

✅ Consolidación de pruebas

✅ Definición de módulos

✅ Especificación del visor

---

## Siguiente Paso

Construcción del MVP:

```text
index.html
styles.css
app.js
```

usando:

```text
consolidado_total.csv
```

como fuente oficial del sistema.