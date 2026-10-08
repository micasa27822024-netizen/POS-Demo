// Inicializa Firebase SDK modular (v10) solo si hay credenciales reales.
// En DEMO_MODE no se carga nada remoto: todo funciona con un almacén local.
import { firebaseConfig, DEMO_MODE } from '../config/firebase-config.js';

export let app=null, auth=null, db=null, fb=null;

export async function initFirebase(){
  if(DEMO_MODE){ console.info('%c[POS] Ejecutando en MODO DEMO (sin backend remoto).','color:#f59e0b;font-weight:bold'); return {demo:true}; }
  const appMod   = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const authMod  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const fsMod    = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  app = appMod.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  db = fsMod.getFirestore(app);
  // Sin Firebase Storage: las imágenes se guardan como base64 en Firestore
  // (plan Spark gratuito, no requiere Blaze).
  fb = { ...authMod, ...fsMod }; // helpers reexportados
  return {demo:false};
}
export { DEMO_MODE };
