// ============================================================================
//  CONFIGURACIÓN PÚBLICA DE FIREBASE
// ----------------------------------------------------------------------------
//  Estos valores son PÚBLICOS por diseño (identifican tu proyecto en el
//  navegador). La seguridad real NO depende de ocultarlos, sino de las
//  Firestore Security Rules y de Firebase Authentication.
//
//  >>> QUÉ FALTA PARA QUE FUNCIONE EN TU PROYECTO <<<
//  1. Crear un proyecto en https://console.firebase.google.com
//  2. Agregar una app Web y copiar el objeto firebaseConfig aquí abajo.
//  3. Habilitar Authentication > Email/Password.
//  4. Crear Firestore (modo producción). NO hace falta Storage ni plan Blaze:
//     las imágenes de productos se guardan como base64 dentro de Firestore.
//  5. Publicar las reglas incluidas en /firebase/firestore.rules
//  6. (Opcional) Crear el primer usuario admin desde la consola de Firebase
//     y luego su documento en la colección `users` con role:"admin".
//
//  NUNCA pongas aquí claves de Admin SDK ni secretos de servidor.
// ============================================================================

export const firebaseConfig = {
 apiKey: "AIzaSyC3puce9bd4baPA0kf9Kk1j1lnutreg6aU",
  authDomain: "pos-demo-e7d18.firebaseapp.com",
  databaseURL: "https://pos-demo-e7d18-default-rtdb.firebaseio.com",
  projectId: "pos-demo-e7d18",
  storageBucket: "pos-demo-e7d18.firebasestorage.app",
  messagingSenderId: "723358989416",
  appId: "1:723358989416:web:638ec9a2a88bbf10eb8fdd"
};

// Si todavía no cargaste credenciales reales, la app corre en MODO DEMO
// (datos locales en memoria/localStorage) para que puedas ver todo funcionando.
export const DEMO_MODE = firebaseConfig.apiKey === "TU_API_KEY";

// ============================================================================
//  APP CHECK (opcional, recomendado en producción) — C4
// ----------------------------------------------------------------------------
//  App Check protege tu backend (Firestore/Auth) frente a tráfico que no venga
//  de TU app. Es OPT-IN: si no cargás una clave de sitio reCAPTCHA v3, no se
//  activa y la app sigue funcionando igual.
//
//  Para activarlo:
//  1. En la consola de Firebase > App Check, registrá tu app Web con el
//     proveedor "reCAPTCHA v3" y copiá la "clave de sitio" (site key).
//  2. Pegala abajo en `recaptchaV3SiteKey`.
//  3. (Opcional, solo en localhost) poné `debugToken: true` para generar un
//     token de depuración; copiá el token que aparece en consola y cargalo en
//     App Check > Apps > Administrar tokens de depuración.
//  4. En la consola, pasá Firestore/Auth a modo "Obligatorio" (Enforce) cuando
//     verifiques que todo el tráfico legítimo pasa.
//
//  Combinalo con la restricción de la API key (ver docs/SEGURIDAD.md):
//  restringí la clave por referente HTTP a tu dominio de GitHub Pages.
// ============================================================================
export const appCheckConfig = {
  recaptchaV3SiteKey: "",   // ← pegá tu site key reCAPTCHA v3 para activar App Check
  debugToken: false         // ← true SOLO en desarrollo local (localhost)
};
