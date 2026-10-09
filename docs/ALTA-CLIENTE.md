# Alta de un cliente nuevo (puesta en producción)

Guía para dejar POS Pro funcionando con Firebase real para **un cliente**.
Criterio adoptado: **un proyecto de Firebase por cliente** (datos aislados,
facturación/cuotas independientes, más simple de administrar).

## 1. Crear el proyecto

1. Entrá a https://console.firebase.google.com y creá un proyecto nuevo
   (ej.: `pos-nombredelcliente`).
2. No hace falta Google Analytics.

## 2. Authentication

1. **Build → Authentication → Comenzar.**
2. Habilitá el proveedor **Email/Password**.

## 3. Firestore

1. **Build → Firestore Database → Crear base** en **modo producción**.
2. Elegí la región (para Argentina, `southamerica-east1` es una buena opción).
3. **No** hace falta Storage ni plan Blaze: las imágenes se guardan como base64
   dentro de Firestore (plan Spark gratuito).

## 4. Registrar la app Web y cargar credenciales

1. En **Configuración del proyecto → Tus apps → Web (</>)**, registrá una app.
2. Copiá el objeto `firebaseConfig`.
3. Pegá los valores en `js/config/firebase-config.js`, reemplazando los
   placeholders:

   ```js
   export const firebaseConfig = {
     apiKey: "TU_API_KEY",
     authDomain: "TU_PROYECTO.firebaseapp.com",
     projectId: "TU_PROYECTO",
     messagingSenderId: "TU_SENDER_ID",
     appId: "TU_APP_ID"
   };
   ```

   Al poner credenciales reales, `DEMO_MODE` pasa automáticamente a `false`
   (deja de usar el almacén local y habla con Firestore).

   > La config es **pública por diseño**; la seguridad vive en las reglas.
   > Nunca pongas aquí claves del Admin SDK.

## 5. Publicar reglas e índices

Con Firebase CLI instalado (`npm i -g firebase-tools`) y `firebase login`:

```bash
firebase use --add            # elegí el proyecto del cliente
firebase deploy --only firestore:rules,firestore:indexes
```

Las reglas están en `firebase/firestore.rules` y los índices en
`firebase/firestore.indexes.json` (ya referenciados por `firebase.json`).

## 6. Crear el primer administrador

1. En **Authentication → Users**, creá el usuario admin (email + contraseña).
2. Copiá su **UID**.
3. En **Firestore**, creá el documento `users/{UID}` con:

   ```json
   {
     "name": "Nombre Apellido",
     "email": "admin@cliente.com",
     "role": "admin",
     "active": true
   }
   ```

   Sin este documento (o con `active:false`) el usuario queda sin permisos.

## 7. Publicar el front (opcional)

- **Firebase Hosting:**
  ```bash
  firebase deploy --only hosting
  ```
- **GitHub Pages:** el proyecto usa rutas relativas, así que se puede servir
  tal cual desde la raíz del repo. Verificá que `firebase-config.js` tenga las
  credenciales del cliente antes de publicar.

## 8. Primeros pasos dentro del sistema

1. Entrá como admin y andá a **Configuración**:
   - Cargá datos del negocio, logo, CUIT.
   - Revisá moneda (ARS `$ 1.250,00`), IVA y número base de comprobantes.
   - En **Operación**, definí si se exige caja abierta y si se permite stock
     negativo (por defecto: sí exigir caja, no permitir stock negativo).
2. Creá el resto de los usuarios (encargado/cajero).
3. Cargá categorías, productos, clientes y proveedores.
4. Hacé un primer **respaldo** desde Configuración → Operación.

## Checklist rápido

- [ ] Proyecto creado
- [ ] Email/Password habilitado
- [ ] Firestore en producción
- [ ] `firebase-config.js` con credenciales reales
- [ ] Reglas e índices publicados
- [ ] `users/{uid}` admin con `active:true`
- [ ] Datos del negocio cargados en Configuración
