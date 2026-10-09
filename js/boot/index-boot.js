// Arranque de la app (pantalla inicial). Archivo EXTERNO para permitir una
// Content-Security-Policy estricta sin 'unsafe-inline' en script-src (C4).
import { initTheme } from '../utils/theme.js';
import { initFirebase } from '../services/firebase.js';
import { Auth } from '../services/auth.service.js';
import { ensureSeed } from '../seed/demo-data.js';

initTheme();
(async()=>{
  await initFirebase();
  await ensureSeed();
  await Auth.init();
  location.replace(Auth.profile ? 'dashboard.html' : 'login.html');
})();
