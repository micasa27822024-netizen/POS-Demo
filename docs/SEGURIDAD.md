# Guía de seguridad — POS Pro

Esta guía resume las capas de seguridad del sistema y cómo endurecerlo para
producción. Pensada para despliegue en **GitHub Pages** (hosting estático, sin
servidor propio) con backend **Firebase (plan Spark gratuito)**.

## 1. Modelo de confianza

- El código del front corre en el navegador del usuario: **todo lo que llega al
  cliente es público** (incluida la `firebaseConfig`). La seguridad real NO
  depende de ocultar esos valores.
- La protección efectiva vive en tres capas del lado de Firebase:
  1. **Firebase Authentication** (identidad: quién sos).
  2. **Firestore Security Rules** (autorización: qué podés leer/escribir).
  3. **App Check** (procedencia: que el tráfico venga de TU app).

## 2. Content Security Policy (CSP)

GitHub Pages no permite configurar cabeceras HTTP, así que la CSP se declara en
cada página con `<meta http-equiv="Content-Security-Policy" ...>`.

Directivas aplicadas:

- `default-src 'self'` — por defecto, solo recursos del propio origen.
- `script-src 'self' https://www.gstatic.com https://cdn.jsdelivr.net https://www.google.com`
  — SDK de Firebase (gstatic), Chart.js (jsDelivr) y reCAPTCHA (App Check).
  **No se permite `'unsafe-inline'`**: por eso TODO el JavaScript está en
  archivos externos (ver `js/boot/`), sin `<script>` embebido ni manejadores
  `on*` en el HTML.
- `style-src 'self' 'unsafe-inline'` — se permite estilo inline porque la UI
  usa atributos `style="…"` para render dinámico. No habilita ejecución de JS.
- `img-src 'self' data: blob:` — las imágenes de productos se guardan como
  base64 (`data:`) dentro de Firestore (sin Firebase Storage / plan Blaze).
- `connect-src` — limita las conexiones XHR/WebSocket a los dominios de Firebase.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` — reducen la
  superficie de ataque (sin plugins, sin reescritura de `<base>`, formularios
  solo al propio origen).

> Si agregás un nuevo origen externo (CDN, fuente, API), tenés que sumarlo a la
> directiva correspondiente en **todas** las páginas HTML.

## 3. App Check (opt-in)

App Check exige que cada petición a Firestore/Auth venga acompañada de un token
que prueba que proviene de tu app. Está **desactivado por defecto** y se activa
sin tocar código:

1. Consola de Firebase → **App Check** → registrá la app Web con **reCAPTCHA v3**
   y copiá la *site key*.
2. Pegá la clave en `js/config/firebase-config.js` → `appCheckConfig.recaptchaV3SiteKey`.
3. En desarrollo local (`localhost`), poné `debugToken: true`, abrí la consola
   del navegador, copiá el token generado y cargálo en App Check → *tokens de
   depuración*.
4. Cuando confirmes que el tráfico legítimo pasa, cambiá Firestore/Auth a modo
   **Obligatorio (Enforce)** en la consola.

Si `recaptchaV3SiteKey` queda vacío, App Check no se inicializa y la app funciona
normalmente (útil para demo y desarrollo).

## 4. Restricción de la API key

La `apiKey` de Firebase es pública, pero conviene **restringirla por dominio**
para que no pueda reutilizarse desde otros sitios:

1. Google Cloud Console → **APIs y servicios** → **Credenciales**.
2. Editá la *API key* del proyecto.
3. En **Restricciones de aplicación** elegí **Sitios web (referentes HTTP)** y
   agregá tu dominio de GitHub Pages, por ejemplo:
   - `https://TU_USUARIO.github.io/*`
   - `http://localhost/*` (solo si lo necesitás en desarrollo)
4. En **Restricciones de API** limitá la clave a las APIs que usás
   (Identity Toolkit, Token Service, Cloud Firestore).

## 5. Autorización por roles

- Roles: **admin / encargado / cajero**. La matriz vive en
  `js/services/permissions.js` y se refleja en `firebase/firestore.rules`.
- Capacidades finas (ej.: `sale.void`, `sale.return`, `stock.adjust`,
  `cash.open/close`) se validan en la UI **y** deben reflejarse en las reglas.
- La UI es solo la primera barrera: **las Firestore Rules son la autoridad final**.

## 6. Datos sensibles

- No se almacenan secretos de servidor en el front (nunca pongas claves del
  Admin SDK en el navegador).
- Las contraseñas las gestiona Firebase Authentication; la app nunca las guarda
  en Firestore.
- Las imágenes base64 se comprimen antes de guardarse por los límites de
  tamaño de documento de Firestore (~1 MB).

## 7. Checklist de puesta en producción

- [ ] Cargar `firebaseConfig` real en `js/config/firebase-config.js`.
- [ ] Publicar las reglas de `firebase/firestore.rules`.
- [ ] Crear los índices compuestos que pida la consola.
- [ ] Activar App Check (reCAPTCHA v3) y pasar a modo Obligatorio.
- [ ] Restringir la API key por referente HTTP.
- [ ] Verificar la CSP en la consola del navegador (sin violaciones).
- [ ] Revisar que Authentication tenga habilitado Email/Password.
