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
