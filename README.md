# POS Pro — Sistema de Punto de Venta web

Sistema POS profesional construido con **HTML5 + CSS3 + JavaScript modular (ESM)** y **Firebase** (Auth, Firestore, Hosting). Funciona 100% en el **plan Spark GRATUITO**: no usa Firebase Storage ni Cloud Functions (no requiere plan Blaze ni tarjeta).

> **Esta es la ENTREGA FASE 1**: arquitectura general, diseño visual, Firebase, autenticación, roles/permisos, dashboard, productos, categorías y usuarios. Los módulos restantes (POS, ventas, compras, caja, stock, clientes, proveedores, reportes, tickets, facturas, configuración) ya tienen su página y navegación, y se integran sobre la misma arquitectura sin rehacer nada.

---

## ⚡ Cómo probarlo YA (MODO DEMO)

No necesitás Firebase para verlo funcionar. El sistema arranca en **MODO DEMO**:
guarda los datos en `localStorage` del navegador usando la **misma API** que Firestore.

```bash
# Serví la carpeta con cualquier servidor estático (hace falta por los ES modules):
python3 -m http.server 8080
# luego abrí http://localhost:8080
```

**Cuentas de prueba:**

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Administrador | admin@pos.com | admin123 |
| Encargado | encargado@pos.com | enc123 |
| Cajero | cajero@pos.com | caj123 |

Los datos demo (categorías, productos, clientes, proveedores y ventas) se cargan
automáticamente la primera vez y quedan claramente marcados con `demo:true`.

---

## 🔧 Cómo pasar a PRODUCCIÓN (Firebase real)

1. Creá un proyecto en https://console.firebase.google.com
2. **Authentication** → habilitá *Email/Password*.
3. **Firestore** → creá la base en modo producción.
4. **Storage** → NO hace falta. Las imágenes de productos se comprimen en el navegador y se guardan como base64 dentro de Firestore (sin plan Blaze).
5. Agregá una **app Web** y pegá el `firebaseConfig` en `js/config/firebase-config.js`.
   - Al poner credenciales reales, `DEMO_MODE` pasa a `false` automáticamente.
6. Publicá las reglas e índices:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
7. Creá el primer usuario admin en Authentication y su documento en
   `users/{uid}` con `{ role: "admin", active: true, name, email }`.
8. (Opcional) Deploy del front: `firebase deploy --only hosting`.

> La config de Firebase es **pública por diseño**. La seguridad real vive en las
> *Security Rules* (incluidas en `/firebase`). Nunca pongas aquí claves del Admin SDK.

---

## 📁 Estructura del proyecto

```
/ (raíz)
  index.html            Redirección según sesión
  login.html            Login + recuperar contraseña
  dashboard.html        Panel con métricas y gráficos
  products.html         ABM de productos
  categories.html       Categorías y subcategorías
  users.html            Usuarios y roles (solo admin)
  pos/sales/.../*.html  Módulos de fases 2-3 (navegación lista)
  firebase.json         Config de Hosting/Firestore

  /css   variables (tema+dark) · base · components · layout · login
  /js
    /config    firebase-config.js   (credenciales públicas)
    /services  firebase, db.service, demo-store, auth.service,
               storage.service, products.service, audit.service, permissions
    /utils     format, toast, modal, validate, theme, csv
    /components shell (sidebar+topbar)
    /modules   guard, login, dashboard, products, categories, users, soon
    /seed      demo-data.js
  /firebase  firestore.rules · firestore.indexes.json
```

**Principio clave:** las pantallas nunca hablan con Firestore directo. Usan la
capa `DB` (`js/services/db.service.js`), que enruta a Firestore o al almacén demo.
Así el código de UI es idéntico en demo y en producción.

---

## 🗄️ Modelo de datos (Firestore)

| Colección | Campos principales | Relaciones | Permisos |
|-----------|--------------------|-----------|----------|
| `users` | name, email, role, active, createdAt, lastLogin | — | lee propio/admin; escribe admin |
| `products` | code, barcode, name, categoryId, subcategoryId, brand, unit, cost, price, iva, stock, stockMin/Max, supplierId, image, active | → categories, subcategories, suppliers | lee staff; escribe staff |
| `categories` | name, color | ← products | lee todos; escribe staff |
| `subcategories` | name, categoryId | → categories | lee todos; escribe staff |
| `clients` | name, lastName, dni, cuit, phone, email, creditLimit, balance, active | ← sales, accountsReceivable | lee/escribe roles operativos |
| `suppliers` | legalName, tradeName, cuit, phone, email, city, province, active | ← purchases | lee todos; escribe staff |
| `sales` | number, items[], subtotal, discount, total, cost, profit, payments[], clientId, userId, status, at | → clients, users | crea cualquiera; anula staff |
| `purchases` | number, supplierId, items[], total, status, at | → suppliers | escribe staff |
| `payments` | saleId/clientId, method, amount, at | → sales | crea cualquiera |
| `stockMovements` | productId, type, qty, delta, stockAfter, reason, userId, at | → products | crea cualquiera; edita admin |
| `cashRegisters` | openedBy, openingAmount, closingAmount, status, openedAt, closedAt | → users | roles operativos |
| `cashMovements` | registerId, type, amount, concept, at | → cashRegisters | roles operativos |
| `accountsReceivable` | clientId, type(debit/credit), amount, balance, dueDate, at | → clients | roles operativos |
| `accountsPayable` | supplierId, type, amount, balance, at | → suppliers | staff |
| `auditLogs` | action, entity, userId, userName, detail, at | → users | lee admin; solo crea |
| `settings` | business data, currency, iva, numbering | — | lee todos; escribe admin |
| `ticketTemplates` / `invoiceTemplates` | layout config | — | lee todos; escribe admin |

**Denormalización intencional:** en `sales.items[]` se guardan `name`, `price`,
`cost` y `unit` del producto al momento de la venta (fotografía histórica), para
no depender de lecturas extra ni verse afectado por cambios de precio futuros.

**Índices** necesarios: ver `firebase/firestore.indexes.json`.

---

## 🔐 Roles y permisos

Definidos en `js/services/permissions.js` y replicados en `firestore.rules`:

- **Administrador:** acceso total.
- **Encargado:** ventas, productos, compras, stock, clientes, proveedores, caja, reportes.
- **Cajero:** POS, clientes, consulta de productos, cobros, apertura/cierre de caja. Sin configuraciones críticas ni borrados.

El control se aplica en **dos capas**: la UI (menú + guard de ruta + capacidades
finas con `can()`) y las **Security Rules** del backend.

---

## 🎨 Diseño

- Modo claro / oscuro con botón y preferencia recordada (`localStorage`).
- Paleta semántica: primario (acciones), ventas, compras, ganancia, alerta, stock, clientes, caja.
- Sidebar, topbar con buscador global, tarjetas de estadísticas, tablas, modales, toasts, badges.
- Responsive (PC / notebook / tablet / celular), sidebar colapsable en pantallas chicas.
- Gráficos con Chart.js (CDN) que respetan el tema activo.

---

## 🗺️ Roadmap de integración

- **Fase 2:** POS (carrito, pagos combinados, vuelto, cantidades decimales), ventas e historial, compras, caja, stock, clientes, proveedores.
- **Fase 3:** reportes con exportación PDF/Excel, auditoría, configuración del negocio, diseñador de tickets (58/80mm/A4) y plantillas de factura.

### Qué falta / requiere datos externos

- **Facturación electrónica AFIP/ARCA:** la arquitectura separa *comprobante interno*
  de *factura fiscal*, pero la integración real necesita certificado, CUIT,
  punto de venta y el servicio WSFE de AFIP (requiere backend con Admin SDK /
  Cloud Functions, no puede hacerse de forma segura solo en el navegador).
- **Lector de código de barras por cámara:** previsto para el POS con una librería JS;
  el lector USB funciona como teclado sin configuración extra.
- **Backups automatizados:** desde el frontend solo se puede exportar; un backup
  completo requiere Cloud Functions + Admin SDK (previsto en la arquitectura).

---

## ⚠️ Nota de seguridad

- No se almacenan contraseñas manualmente (las gestiona Firebase Auth).
- No se incluyen secretos del servidor en el frontend.
- Reglas de Firestore con *deny by default*.
- Toda operación crítica se valida en UI **y** en reglas.
