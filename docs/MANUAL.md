# Manual de uso — POS Pro (por rol)

Guía breve y práctica para el uso diario. El menú y las acciones disponibles
cambian según el rol del usuario.

## Ingreso

1. Abrí la app y entrá con tu email y contraseña.
2. Si no recordás la clave, usá “¿Olvidaste tu contraseña?” en el login.
3. Un usuario **inactivo** no puede operar aunque tenga clave: avisale al admin.

---

## 👑 Administrador

Acceso total. Además de operar, administra el sistema.

- **Usuarios:** alta/baja, asignar rol (admin / encargado / cajero) y activar o
  desactivar. El alta no cierra tu sesión.
- **Configuración:**
  - *Negocio:* nombre, razón social, CUIT, dirección, logo.
  - *Moneda e impuestos:* símbolo/código/locale/decimales (vista previa en vivo) e IVA.
  - *Numeración:* número base de comprobantes.
  - *Medios de pago:* activar/desactivar (efectivo siempre disponible).
  - *Operación:* exigir caja abierta para efectivo, permitir stock negativo.
  - *Respaldo:* **Exportar respaldo** (JSON completo) y fecha del último.
  - *Apariencia:* tema claro/oscuro.
- **Auditoría:** registro de acciones (logins, altas, cambios, ventas,
  anulaciones, ajustes).
- **Tickets / Facturas:** diseño de comprobantes (58/80 mm / A4).

---

## 🧑‍💼 Encargado

Operación completa del día a día (sin administración crítica).

- **Productos / Categorías:** alta y edición, costos, precios, stock mínimo.
- **Compras:** registrar compras a proveedores (actualiza stock y costo).
- **Stock:** ajustes positivos/negativos con motivo e historial.
- **Clientes / Proveedores:** alta, edición, cuenta corriente.
- **Caja:** abrir, registrar ingresos/egresos y cerrar con arqueo.
- **Reportes:** ventas, productos, medios de pago, vendedores, compras y caja.
- **Ventas:** historial y **anulación** (con motivo).

---

## 🧾 Cajero

Enfocado en vender y cobrar.

- **Punto de Venta (POS):**
  1. Verificá arriba el **estado de la caja**. Si dice “Sin caja abierta” y el
     cobro en efectivo está exigido, abrí la caja primero (menú Caja).
  2. Buscá productos por nombre/código o escaneá el código de barras (Enter).
  3. Ajustá cantidades (admite decimales en kg, g, L, ml, metro).
  4. Elegí el cliente (por defecto *Consumidor Final*).
  5. **Cobrar (F2):** pagos combinados (efectivo, tarjeta, transferencia,
     cuenta corriente) y cálculo de vuelto.
- **Caja:** abrir/cerrar su propia caja; ingresos/egresos.
- **Clientes:** consulta y alta básica; consulta de productos.
- No puede: crear/editar productos ni proveedores, configurar el sistema,
  ver auditoría ni borrar.

---

## Consejos

- **Anular una venta** devuelve stock, revierte el efectivo en caja y la cuenta
  corriente. Siempre pide un **motivo**.
- **Cierre de caja (arqueo):** el sistema muestra el efectivo **esperado**
  (apertura + ventas en efectivo − egresos, incluidas anulaciones). Cargá lo
  **declarado** y verás la diferencia (sobra/falta/cuadra).
- **Moneda:** formato argentino, por ejemplo `$ 1.250,00`.
