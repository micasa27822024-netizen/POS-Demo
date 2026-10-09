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
  // C4: App Check (opt-in). Solo se activa si hay una site key reCAPTCHA v3.
  await initAppCheck(app);
  auth = authMod.getAuth(app);
  // B1: caché local persistente (IndexedDB) con soporte multi-pestaña para
  // reducir lecturas repetidas y permitir trabajo offline. Si el navegador no
  // lo soporta, se cae al Firestore estándar en memoria.
  try{
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache(
        { tabManager: fsMod.persistentMultipleTabManager() }
      )
    });
  }catch(e){
    console.warn('[POS] Caché persistente no disponible, uso Firestore estándar.', e);
    db = fsMod.getFirestore(app);
  }
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

// C4: inicializa App Check solo si el usuario cargó una site key reCAPTCHA v3.
// Es tolerante a fallos: si algo sale mal, no bloquea el arranque de la app.
async function initAppCheck(app){
  let cfg=null;
  try{ ({ appCheckConfig: cfg } = await import('../config/firebase-config.js')); }catch{ return; }
  if(!cfg || !cfg.recaptchaV3SiteKey) return; // opt-in: sin key, no se activa
  try{
    if(cfg.debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    const ac = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
    ac.initializeAppCheck(app, {
      provider: new ac.ReCaptchaV3Provider(cfg.recaptchaV3SiteKey),
      isTokenAutoRefreshEnabled: true
    });
    console.info('[POS] App Check activado (reCAPTCHA v3).');
  }catch(e){ console.warn('[POS] No se pudo activar App Check:', e); }
}

export { DEMO_MODE };
