# Changelog — POS Pro

Formato basado en *Keep a Changelog*. Fechas en formato ISO.

## [1.1.6] — Reportes que cuadran con el Dashboard

Se corrige el cálculo de Reportes para que los números cierren entre sí y
coincidan con el Dashboard. El problema era cómo se contaban las devoluciones.

- **Las devoluciones ahora restan en el día en que se hacen** (no en el día de
  la venta original). Antes, si vendías un día y la devolución caía en otro
  período, Reportes y Dashboard mostraban cifras distintas. Ahora usan el mismo
  criterio, así que **siempre coinciden**.
- **Los medios de pago cuadran con la facturación**: antes, el detalle por medio
  de pago mostraba el monto bruto (sin descontar devoluciones), por eso su suma
  no daba igual que la «Facturación». Ahora cada reintegro se descuenta del
  medio de pago correspondiente y **la suma de los medios de pago es igual a la
  facturación**.
- **Productos y columna «Facturado» netos**: el ranking de productos descuenta
  lo devuelto (cantidad e importe) y reparte el descuento general igual que en
  las devoluciones, de modo que la suma de la columna «Facturado» también
  coincide con la facturación total.
- **«Por vendedor» más justo**: la devolución se descuenta del vendedor que hizo
  la venta original (cuando está en el período), no del cajero que procesa la
  devolución.
- **CSV de ventas con más detalle**: se agregaron las columnas «Devuelto» y
  «Total neto» para que cada comprobante muestre cuánto se devolvió y su neto.
- **Pruebas**: nuevas pruebas automatizadas (`tests/report-calc.test.mjs`) que
  verifican el invariante «medios de pago = facturación», el prorrateo del
  descuento general y el conteo de devoluciones por su fecha.

## [1.1.5] — El respaldo ahora incluye las cuentas por pagar

Se completa el respaldo total del sistema para que no quede nada afuera.

- **Cuentas por pagar en el respaldo**: la deuda con proveedores
  (`accountsPayable`) **faltaba** en el archivo de respaldo. Ahora se incluye,
  junto con las cuentas por cobrar que ya estaban. Al exportar el respaldo
  (Configuración → Respaldo de datos) ya quedan guardadas todas las deudas.
- **Gastos y plantillas — ya estaban cubiertos**: los gastos son egresos de
  caja y viajan dentro de los movimientos de caja (`cashMovements`); las
  plantillas de factura y ticket se guardan dentro de la configuración
  (`settings`). Ambos ya se incluían en el respaldo; se dejó aclarado en el
  código para que no haya dudas a futuro.
- **Pruebas**: nuevas pruebas automatizadas (`tests/backup.test.mjs`) que
  verifican que el respaldo incluya cuentas por pagar/cobrar, que no pierda
  documentos al paginar y que los acentos/comas sobrevivan la ida y vuelta a CSV.

## [1.1.4] — Optimización de lecturas en Dashboard y POS

Menos consumo de Firestore al abrir el Dashboard y al entrar al POS. No cambia
lo que ve el usuario; cambia cómo se traen los datos por detrás.

- **Dashboard — de ~5.000 lecturas a un puñado**: antes, cada vez que se abría
  el panel, se leían todas las ventas (hasta 3.000) y todos los productos
  (hasta 2.000) para calcular los números. Ahora los totales diarios se guardan
  ya sumados día por día (`dailyStats`) y el Dashboard lee solo esos resúmenes,
  el Top 5 de productos puntuales y las últimas 12 ventas. El aviso de "stock
  por reponer" usa una consulta directa a los productos marcados, en lugar de
  recorrerlos todos.
- **POS — no vuelve a bajar todo cada vez**: al entrar al punto de venta, antes
  se descargaban de nuevo todos los productos y clientes. Ahora se guardan en el
  equipo y en cada apertura solo se sincroniza **lo que cambió** desde la última
  vez (caché incremental por fecha de modificación).
- **Bandera de reposición (`needsRestock`)**: cada producto queda marcado automá-
  ticamente cuando su stock cae en o por debajo del mínimo. Se recalcula en
  altas, ediciones, ajustes de stock, ventas, devoluciones y compras.
- **Nota sobre datos ya existentes**: los productos cargados antes de esta
  versión toman la bandera de reposición en su próxima modificación (venta,
  ajuste o edición). Es automático y no requiere ninguna acción.
- **Pruebas**: se agregaron pruebas automatizadas de la nueva lógica
  (`tests/reads.test.mjs`): marcado de reposición, mezcla incremental de caché
  y agregados del Dashboard.

## [1.1.3] — Tres correcciones menores de la revisión

Ajustes puntuales sobre hallazgos menores. No cambia el alcance funcional.

- **Caja de otro usuario**: devoluciones, anulaciones y compras ya **no** caen
  por error en la caja de otro cajero cuando el usuario no tiene caja propia
  abierta. En ese caso el movimiento se registra marcado como "sin caja"
  (`sinCaja`), nunca sobre la caja ajena.
- **Unidad de medida**: la unidad del producto ahora se escapa al mostrarse en
  facturas, tickets y stock (evita que un valor con caracteres raros rompa el
  formato). Al importar productos por CSV, la unidad se valida contra la lista
  permitida; si no es válida se usa `unidad` por defecto.
- **Cuenta de acceso huérfana**: al dar de alta un usuario, si falla el guardado
  del perfil, se elimina la credencial recién creada para no dejar una cuenta
  sin perfil (que no podría iniciar sesión ni volver a crearse por email
  duplicado).

## [1.1.2] — Correcciones de la nueva auditoría (previo al piloto)

Seis fallas detectadas en la revisión y corregidas antes del piloto. No cambia
el alcance funcional; endurece integridad de datos y consistencia de reportes.

### Integridad de datos

- **Anulación de ventas con devoluciones**: ahora **solo** se puede anular una
  venta en estado `completada`. Las ventas `devuelta` / `parcial_devuelta`
  dejan de poder anularse (antes la anulación reponía stock YA repuesto por la
  devolución, duplicando el ajuste). Validado tanto en el botón como **dentro
  de la transacción**.
- **Devoluciones 100% atómicas**: la validación de “lo ya devuelto” se hace
  **dentro de la transacción** usando `sale.returnedQty` (no una lectura previa
  de `returns` hecha afuera), evitando devoluciones duplicadas por doble clic o
  concurrencia. La venta guarda además `returnedProfit` y `returnedCost`.
- **Día contable en horario de Argentina**: nueva `dayKeyAR()` en `format.js`.
  Las claves de `dailyStats`, el dashboard y los reportes dejan de calcular el
  día en **UTC** (`toISOString`), que mandaba las ventas de la noche al día
  siguiente. Ahora usan el día real local (America/Argentina/Buenos_Aires).
- **Respaldo completo sin exclusiones**: `buildBackup` se pagina por **ID de
  documento** (`documentId()`), no por el campo `at`; así no se omiten
  documentos sin ese campo. Se agregaron al respaldo las colecciones faltantes:
  `returns`, `users`, `subcategories`.

### Reportes y rendimiento

- **Reportes netos de devoluciones**: facturación, ganancia, ventas por día y
  por vendedor restan `returnedTotal` / `returnedProfit` de cada venta.
- **Lecturas acotadas**: Stock (movimientos, `limit` 500 orden desc),
  Auditoría (`limit` 1000 orden desc) y Dashboard (ventas/productos/clientes/
  categorías con `limit`) dejan de leer colecciones sin tope.

### Menores

- `Sales.requestFiscal()` **idempotente**: si la venta ya tiene CAE emitido no
  vuelve a solicitarlo, y un candado atómico (`estado:'solicitando'`) evita
  pedidos duplicados concurrentes.
- `package.json` pasa a **1.1.2** (estaba en 1.0.0, desalineado con el
  changelog).

## [1.1.1] — C1 (preparación fiscal) + corrección de Productos

### C1 — Facturación electrónica AFIP/ARCA (preparación sin backend)

Se deja lista la **interfaz fiscal** para que, cuando se decida el backend, la
facturación electrónica se conecte **sin rehacer** pantallas. La integración
real (certificado digital, punto de venta por webservice, credenciales del lado
servidor) queda **fuera de alcance** hasta decidir backend (sección 8).

- Nuevo `js/services/fiscal.service.js`:
  - `Fiscal.requestCAE(sale, cfg)`: contrato único que **nunca lanza** y siempre
    devuelve un objeto fiscal válido; ante error del backend devuelve
    `estado:'error'` sin perder la venta ya registrada.
  - **Proveedor conectable** (`Fiscal.setProvider`): por defecto es **nulo**
    (comprobante interno **X**, sin CAE). Un backend real lo reemplaza sin tocar
    el frontend. `Fiscal.isEnabled()` indica si hay integración conectada.
  - `fiscalDefault()`, `tipoPorCondicion()` (condición de IVA → tipo A/B/C/X) y
    `CODIGO_AFIP`.
- Cada venta guarda ahora un campo **`fiscal`** `{ tipoComprobante, puntoVenta,
  numero, cae, caeVto, estado, error }`. La **numeración fiscal** (`numero`) es
  **separada** de la numeración interna de la venta (`number`): arranca en 0
  (“sin asignar”) y la completa el backend al aprobar el CAE.
- Nuevo `Sales.requestFiscal(saleId)`: pide el CAE por la interfaz y guarda el
  resultado en `sale.fiscal` (fuera de transacción; la venta ya es atómica por A3).
- **Facturas**: la plantilla A4 ahora muestra el CAE/vencimiento reales cuando
  existen, usa la numeración fiscal si está asignada, informa el estado de la
  integración y suma el botón **“Solicitar CAE”** para la venta seleccionada.
- Pruebas: nuevo `tests/fiscal.test.mjs` (proveedor nulo, backend real,
  manejo de errores, mapeos). `node --test` sigue en verde.

### Corrección — Productos quedaba en pantalla en blanco

- `js/utils/csv.js` no exportaba `exportCSV` ni `parseCSV`, que `products.js`
  importaba → el módulo no cargaba y la pantalla quedaba vacía. Se agregaron
  ambas funciones (export/import CSV con comillas, CRLF y BOM). Verificado con
  un ida y vuelta de datos (comas, comillas y acentos).

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
