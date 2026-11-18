/**
 * Visor Educate 360° - Módulo de Autenticación
 * Acceso restringido a instituciones que cumplen las tres condiciones:
 *   1. El DANE ingresado tiene una carpeta publicada en data/{dane}/.
 *   2. El DANE está registrado en config/usuarios.json.
 *   3. La clave ingresada coincide con la del usuario registrado (validación final).
 */

const Auth = (function() {
  const SESSION_KEY = 'visor_educate_360_auth';
  // Archivos que identifican una carpeta data/{dane}/ con datos publicados
  const DATASET_FILES = ['consolidado_total.csv', 'dashboard_data.csv'];

  let institucionData = {};
  let usersList = [];
  let authCallbacks = [];

  function init(configInst, configUsers) {
    institucionData = configInst || {};
    usersList = (configUsers && configUsers.usuarios) ? configUsers.usuarios : [];

    const isAuthed = isSessionValid();
    if (!isAuthed) clearSession();
    notify(isAuthed);
    return isAuthed;
  }

  function normalize(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }

  function findUser(dane) {
    const cleanDane = normalize(dane);
    if (!cleanDane) return null;
    return usersList.find(u => normalize(u.dane) === cleanDane) || null;
  }

  /**
   * Verifica que exista la carpeta data/{dane}/ con un consolidado publicado.
   * - Precarga en memoria (data/{dane}/datos.js) cuenta como carpeta existente.
   * - Servido por HTTP: se consulta el consolidado dentro de la carpeta del DANE.
   * - Bajo file:// sin precarga no es posible verificar la carpeta: se rechaza.
   */
  async function hasPublishedData(dane) {
    const cleanDane = normalize(dane);
    if (!cleanDane) return false;

    if (window.EDUCATE360_DATA && window.EDUCATE360_DATA[cleanDane]) return true;

    const protocol = (window.location && window.location.protocol) || '';
    if (protocol === 'file:' || typeof fetch !== 'function') return false;

    for (const file of DATASET_FILES) {
      try {
        const res = await fetch(`data/${cleanDane}/${file}`, { cache: 'no-store' });
        if (!res || !res.ok) continue;
        const contentType = (res.headers && typeof res.headers.get === 'function')
          ? String(res.headers.get('content-type') || '').toLowerCase()
          : '';
        // Un hosting que responde 200 con una página HTML no prueba que la carpeta exista
        if (contentType.includes('html')) continue;
        return true;
      } catch (e) {
        // Continuar con el siguiente archivo de la carpeta del DANE
      }
    }
    return false;
  }

  function isAuthenticated() {
    const session = getSession();
    return !!(session && session.authenticated === true && session.dane);
  }

  /** Sesión restaurada válida solo si el DANE sigue registrado en usuarios.json */
  function isSessionValid() {
    const session = getSession();
    if (!session || session.authenticated !== true || !session.dane) return false;
    return !!findUser(session.dane);
  }

  function getSession() {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function login(daneInput, claveInput) {
    const cleanDane = normalize(daneInput);
    const cleanClave = normalize(claveInput);

    if (!cleanDane || !cleanClave) {
      return {
        success: false,
        reason: 'credenciales_incompletas',
        message: 'Ingrese el código DANE y la clave institucional.'
      };
    }

    // 1. Registro institucional en config/usuarios.json
    const foundUser = findUser(cleanDane);
    if (!foundUser) {
      return {
        success: false,
        reason: 'dane_no_registrado',
        message: `El DANE ${cleanDane} no está registrado como institución usuaria del visor.`
      };
    }

    // 2. Carpeta de datos publicada para ese DANE
    const hasData = await hasPublishedData(cleanDane);
    if (!hasData) {
      return {
        success: false,
        reason: 'sin_datos',
        message: `No hay datos publicados para el DANE ${cleanDane}. Debe existir la carpeta data/${cleanDane}/ con su consolidado de pruebas.`
      };
    }

    // 3. Validación final: la clave coincide con el usuario registrado
    const expectedClave = normalize(foundUser.clave || foundUser.pin);
    if (!expectedClave || expectedClave !== cleanClave) {
      return {
        success: false,
        reason: 'clave_incorrecta',
        message: `La clave no coincide con la registrada para el DANE ${cleanDane}.`
      };
    }

    const sessionData = {
      authenticated: true,
      dane: cleanDane,
      institucion: foundUser.nombre || institucionData.nombre || 'Institución Educativa',
      ciudad: foundUser.ciudad || institucionData.ciudad || '',
      timestamp: new Date().toISOString()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    notify(true);
    return { success: true, user: sessionData };
  }

  function logout() {
    clearSession();
    notify(false);
  }

  function onAuthStateChanged(cb) {
    if (typeof cb === 'function') {
      authCallbacks.push(cb);
    }
  }

  function notify(isAuthed) {
    const session = getSession();
    authCallbacks.forEach(cb => {
      try {
        cb(isAuthed, session);
      } catch (err) {
        console.error('Error en listener de autenticación:', err);
      }
    });
  }

  return {
    init,
    isAuthenticated,
    isSessionValid,
    hasPublishedData,
    getSession,
    login,
    logout,
    onAuthStateChanged
  };
})();

// Exportar globalmente
window.Auth = Auth;
