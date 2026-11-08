/**
 * Visor Educate 360° - Módulo de Autenticación
 * Autenticación mediante DANE + PIN/Clave de 4 dígitos basado en config/usuarios.json
 */

const Auth = (function() {
  const SESSION_KEY = 'visor_educate_360_auth';
  let institucionData = {};
  let usersList = [];
  let authCallbacks = [];

  function init(configInst, configUsers) {
    institucionData = configInst || {};
    usersList = (configUsers && configUsers.usuarios) ? configUsers.usuarios : [];

    // Fallback si no hay lista de usuarios cargada
    if (usersList.length === 0 && institucionData.dane) {
      usersList.push({
        dane: String(institucionData.dane).trim(),
        clave: String(institucionData.pin || institucionData.clave || '4587').trim(),
        nombre: institucionData.nombre || 'Colegio Cambridge',
        ciudad: institucionData.ciudad || 'Bogotá'
      });
    }

    const isAuthed = isAuthenticated();
    notify(isAuthed);
    return isAuthed;
  }

  function isAuthenticated() {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      return parsed && parsed.authenticated === true && !!parsed.dane;
    } catch (e) {
      return false;
    }
  }

  function getSession() {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  function login(daneInput, pinInput) {
    const cleanDane = String(daneInput || '').trim();
    const cleanPin = String(pinInput || '').trim();

    // 1. Buscar en la lista de usuarios (config/usuarios.json)
    let foundUser = usersList.find(u => {
      const uDane = String(u.dane || '').trim();
      const uKey = String(u.clave || u.pin || '').trim();
      return uDane === cleanDane && uKey === cleanPin;
    });

    // 2. Respaldo contra institucion.json
    if (!foundUser && institucionData.dane) {
      const instDane = String(institucionData.dane).trim();
      const instPin = String(institucionData.pin || institucionData.clave || '4587').trim();
      if (cleanDane === instDane && cleanPin === instPin) {
        foundUser = {
          dane: instDane,
          clave: instPin,
          nombre: institucionData.nombre || 'Colegio Cambridge',
          ciudad: institucionData.ciudad || 'Bogotá'
        };
      }
    }

    if (foundUser) {
      const sessionData = {
        authenticated: true,
        dane: cleanDane,
        institucion: foundUser.nombre || institucionData.nombre || 'Colegio Cambridge',
        ciudad: foundUser.ciudad || institucionData.ciudad || '',
        timestamp: new Date().toISOString()
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      notify(true);
      return { success: true, user: sessionData };
    } else {
      return { 
        success: false, 
        message: 'Código DANE o clave de 4 dígitos incorrecta. Verifique sus credenciales.' 
      };
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
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
    getSession,
    login,
    logout,
    onAuthStateChanged
  };
})();

// Exportar globalmente
window.Auth = Auth;
