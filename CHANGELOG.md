# Changelog — POS Pro

Formato basado en *Keep a Changelog*. Fechas en formato ISO.

## [1.1.0] — Auditoría técnica aplicada (Fases C + “Otros”)

Completa los puntos pendientes del informe de auditoría sobre la base ya
corregida en 1.0.0.

### Integridad de datos — “Otros”

- **Unicidad de datos clave** (nuevo `js/utils/unique.js` con `isUnique` /
  `assertUnique`, verificación contra la capa DB; funciona en demo y en
  producción):
  - Productos: **código interno** y **código de barras** únicos al crear/editar;
    la **duplicación** genera un código único automático (`-C`, `-C2`…).
  - Clientes: **DNI/CUIT** y **email** (email sin distinguir mayús/minús).
  - Proveedores: **CUIT** y **email**.
  - Usuarios: ya validaban email único (sin cambios).
- Las reglas de Firestore e **índices compuestos** correspondientes quedaron
  desplegados en la consola.

### C3 — Devoluciones parciales

- Nuevo `Sales.returnItems()` (en `sales.service.js`): devolución **parcial** de
  ítems de una venta, **atómica** e **idempotente** respecto de lo ya devuelto
  (lee la colección `returns` y valida que no se supere lo vendido).
  - Repone stock (movimiento tipo `devolucion`), reintegra el dinero en
    **efectivo** (egreso de caja) o **cuenta corriente** (crédito al cliente),
    y descuenta de `dailyStats` del día (`returnsCount`, `returnsTotal`, y resta
    de `total`/`cost`/`profit` y `pm_<medio>`).
  - Prorratea el descuento general al calcular el importe a reintegrar.
  - Marca la venta como `parcial_devuelta` o `devuelta` según corresponda.
- UI en **Ventas** (detalle de comprobante): botón **“Devolver ítems”** con
  selección de cantidades por producto (hasta lo disponible), medio de
  reintegro y motivo obligatorio. Nueva capacidad **`sale.return`**
  (admin y encargado). Badges de estado “Devuelta” / “Dev. parcial”.

### C4 — Endurecimiento web (CSP, App Check, API key)

- **CSP** declarada como `<meta http-equiv>` en las 18 páginas (GitHub Pages no
  permite cabeceras HTTP). `script-src` **sin `'unsafe-inline'`**: se
  externalizó todo el JS inline a `js/boot/theme-init.js` e
  `js/boot/index-boot.js`. `style-src` admite inline (atributos `style`);
  `img-src` admite `data:` para las imágenes base64.
- **App Check** opt-in (reCAPTCHA v3) en `firebase.js` + `firebase-config.js`
  (`appCheckConfig`): se activa solo si se carga una *site key*; tolerante a
  fallos.
- Nueva **`docs/SEGURIDAD.md`**: CSP, App Check, restricción de la API key por
  referente HTTP, roles y checklist de producción.

### C2 — Modo offline (versión mínima)

- El POS escucha `online`/`offline`: muestra un **aviso de “sin conexión”** y
  **bloquea el cobro** mientras no haya internet (solo con backend real; en
  MODO DEMO sigue operando con datos locales).

### Otros ajustes

- Cliente por defecto del POS: ahora por `settings.defaultClientId` o
  `isDefault` (el seed de “Consumidor Final” queda marcado `isDefault:true`),
  en lugar de detectar por el texto del apellido.

## [1.0.0] — Auditoría técnica aplicada (Fases A + B)

Incorpora las correcciones y mejoras del informe de auditoría sobre la base
funcional ya existente (todos los módulos operativos).

### Seguridad e integridad (Fase A)

- **A1** — Alta de usuarios sin cerrar la sesión del admin (instancia secundaria
  de Firebase Auth).
- **A2** — El rol solo es válido si el usuario está **activo**; sin perfil o
  inactivo = rol `none` (sin permisos), aplicado también en las reglas.
- **A3** — Confirmación de venta **atómica**: numeración, stock, pagos, caja y
  cuenta corriente en una única transacción (lecturas antes de escrituras).
- **A4** — Anulación de venta **atómica e idempotente**, con motivo obligatorio;
  revierte stock, caja y cuenta corriente.
- **A5** — Escape de HTML (`esc()`) en **todos** los módulos para prevenir XSS;
  los `esc` locales se unificaron en `js/utils/escape.js`.

### Rendimiento y operación (Fase B)

- **B1** — Escalabilidad de lecturas:
  - Ventas/Reportes/Dashboard consultan **por rango** y **paginado**
    (`limit` + `startAfter`; botón “Cargar más” en Ventas).
  - Nuevos agregados diarios **`dailyStats`** (incrementales con `increment`):
    `salesCount`, `total`, `cost`, `profit`, `pm_*` por medio de pago,
    `voidedCount`, `voidedTotal`. El Dashboard los usa en vez de recorrer
    todas las ventas.
  - Conteos del lado servidor (`getCountFromServer`).
  - Imágenes reducidas a miniatura (~200×200, objetivo <30 KB); se rechazan
    las demasiado grandes.
  - **Caché local persistente** de Firestore (IndexedDB, multi-pestaña).
- **B2** — Caja más robusta:
  - La caja se asocia a su dueño (`openedBy == user.id`); no se cae en la caja
    de otro cajero.
  - `requireOpenCash` (por defecto **true**): sin caja abierta no se cobra en
    efectivo.
  - Un mismo usuario no puede tener **dos cajas abiertas**.
  - El POS muestra el **estado de la caja**.
  - El efectivo esperado del arqueo incluye las **anulaciones** (egresos).
- **B3** — Pruebas:
  - Unitarias con `node --test` para `calcTotals`, `isDecimalUnit` y `margin`
    (lógica aislada en `*-calc.js`).
  - Scaffold de tests de **reglas** (matriz de permisos de la sección 7) para
    el emulador de Firestore. Ver `tests/README.md`.
- **B4** — Documentación y configuración:
  - `firebase-config.js` con placeholders `TU_API_KEY` y guía de puesta en
    marcha; `docs/ALTA-CLIENTE.md` (alta de un cliente nuevo) y
    `docs/MANUAL.md` (manual por rol). README actualizado. Se eliminó el
    módulo placeholder `soon.js`.
- **B5** — **Exportar respaldo** (JSON completo) desde Configuración →
  Operación, **solo administrador**, con registro de la fecha del último
  respaldo.

### Decisiones por defecto (sección 8 del informe)

- `allowNegativeStock = false` · `requireOpenCash = true` · costo = último
  costo · 1 proyecto Firebase por cliente · anular sin caja = permitido con
  marca · “Consumidor Final” como cliente por defecto.
