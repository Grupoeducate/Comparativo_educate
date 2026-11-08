window.EDUCATE360_CONFIG = {
  institucion: {
  "nombre": "Colegio Cambridge",
  "dane": "425377076576",
  "pin": "4587",
  "ciudad": "Bogotá",
  "anio_lectivo": 2026,
  "ciclos": {
    "0": ["0", "Transición", "Transicion"],
    "1": ["1", "2", "3"],
    "2": ["4", "5"],
    "3": ["6", "7"],
    "4": ["8", "9"],
    "5": ["10", "11"]
  }
}
,
  usuarios: {
  "usuarios": [
    {
      "dane": "425377076576",
      "clave": "4587",
      "nombre": "Colegio Cambridge",
      "ciudad": "Bogotá"
    },
    {
      "dane": "080001000001",
      "clave": "1234",
      "nombre": "Colegio Departamental San José",
      "ciudad": "Barranquilla"
    }
  ]
}
,
  pruebas: {
  "pruebas": [
    {
      "id": "ALFA",
      "nombre": "Misión Alfa",
      "carpeta": "mision_alfa",
      "tipo": "periodica",
      "orden": 1
    },
    {
      "id": "BETA",
      "nombre": "Misión Beta",
      "carpeta": "mision_beta",
      "tipo": "periodica",
      "orden": 2
    },
    {
      "id": "GAMMA",
      "nombre": "Misión Gamma",
      "carpeta": "mision_gamma",
      "tipo": "periodica",
      "orden": 3
    }
  ]
}
,
  escalas: {
  "periodica": {
    "puntaje_minimo": 1,
    "puntaje_maximo": 5,

    "niveles": [
      {
        "orden": 1,
        "nombre": "Bajo",
        "minimo": 1,
        "maximo": 3.59
      },
      {
        "orden": 2,
        "nombre": "Basico",
        "minimo": 3.6,
        "maximo": 3.99
      },
      {
        "orden": 3,
        "nombre": "Alto",
        "minimo": 4,
        "maximo": 4.79
      },
      {
        "orden": 4,
        "nombre": "Superior",
        "minimo": 4.8,
        "maximo": 5
      }
    ]
  },

  "saber": {
    "puntaje_minimo": 0,
    "puntaje_maximo": 500,

    "niveles": [
      {
        "orden": 1,
        "nombre": "Insuficiente",
        "minimo": 0,
        "maximo": 180.9
      },
      {
        "orden": 2,
        "nombre": "Minimo",
        "minimo": 181,
        "maximo": 269.9
      },
      {
        "orden": 3,
        "nombre": "Satisfactorio",
        "minimo": 270,
        "maximo": 349.9
      },
      {
        "orden": 4,
        "nombre": "Avanzado",
        "minimo": 350,
        "maximo": 500
      }
    ]
  }
}
,
  desempenos: {
  "periodica": {
    "Bajo": {
      "color": "#bf0000",
      "orden": 1
    },
    "Basico": {
      "color": "#ffbf00",
      "orden": 2
    },
    "Alto": {
      "color": "#01b1f0",
      "orden": 3
    },
    "Superior": {
      "color": "#01af51",
      "orden": 4
    }
  },

  "saber": {
    "Insuficiente": {
      "color": "#bf0000",
      "orden": 1
    },
    "Minimo": {
      "color": "#ffbf00",
      "orden": 2
    },
    "Satisfactorio": {
      "color": "#01b1f0",
      "orden": 3
    },
    "Avanzado": {
      "color": "#01af51",
      "orden": 4
    }
  }
},
  areas: {
  "areas": [
    {
      "nombre": "Lenguaje",
      "orden": 1,
      "componentes": []
    },
    {
      "nombre": "Matematicas",
      "orden": 2,
      "componentes": [
        "Estadistica",
        "Geometria",
        "Aritmetica"
      ]
    },
    {
      "nombre": "Ciencias Naturales",
      "orden": 3,
      "componentes": [
        "Biologia",
        "Fisica",
        "Quimica",
        "CTS"
      ]
    },
    {
      "nombre": "Sociales",
      "orden": 4,
      "componentes": [
        "Ciencias Sociales",
        "Competencias Ciudadanas"
      ]
    },
    {
      "nombre": "Ingles",
      "orden": 5,
      "componentes": []
    }
  ]
}
};