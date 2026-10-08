// Guard de ruta: inicializa Firebase/Auth, exige sesión y valida acceso al módulo.
import { initFirebase } from '../services/firebase.js';
import { Auth } from '../services/auth.service.js';
import { ensureSeed } from '../seed/demo-data.js';
import { canAccess } from '../services/permissions.js';

export async function requireAuth(moduleKey){
  await initFirebase();
  await ensureSeed();        // carga datos demo la primera vez (solo en MODO DEMO)
  await Auth.init();
  const u=Auth.profile;
  if(!u){ location.href='login.html'; return null; }
  if(moduleKey && !canAccess(u.role,moduleKey)){
    alert('No ten\u00e9s permiso para acceder a este m\u00f3dulo.');
    location.href='dashboard.html'; return null;
  }
  return u;
}
