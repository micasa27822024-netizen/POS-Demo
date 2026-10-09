// Inicializa Firebase SDK modular (v10) solo si hay credenciales reales.
// En DEMO_MODE no se carga nada remoto: todo funciona con un almacén local.
import { firebaseConfig, DEMO_MODE } from '../config/firebase-config.js';

export let app=null, auth=null, db=null, fb=null;
let _authMod=null, _appMod=null;

export async function initFirebase(){
  if(DEMO_MODE){ console.info('%c[POS] Ejecutando en MODO DEMO (sin backend remoto).','color:#f59e0b;font-weight:bold'); return {demo:true}; }
  const appMod   = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const authMod  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const fsMod    = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  _appMod=appMod; _authMod=authMod;
  app = appMod.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  db = fsMod.getFirestore(app);
  // Sin Firebase Storage: las imágenes se guardan como base64 en Firestore
  // (plan Spark gratuito, no requiere Blaze).
  fb = { ...authMod, ...fsMod }; // helpers reexportados
  return {demo:false};
}

// A1: alta de usuarios sin cerrar la sesión del admin.
// Crea una instancia secundaria aislada de Firebase para registrar la
// credencial del usuario nuevo; la sesión principal (admin) no se altera.
export async function createSecondaryAuth(){
  if(DEMO_MODE) return null;
  if(!_appMod||!_authMod) throw new Error('Firebase no inicializado');
  // reutiliza una app secundaria con nombre fijo si ya existe
  let secApp;
  const name='secondary';
  try{ secApp=_appMod.getApp(name); }
  catch{ secApp=_appMod.initializeApp(firebaseConfig,name); }
  const secAuth=_authMod.getAuth(secApp);
  return { secAuth, authMod:_authMod };
}

export { DEMO_MODE };
