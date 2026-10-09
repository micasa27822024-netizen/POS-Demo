# Decisiones de diseño (sección 8 del informe de auditoría)

El informe dejó varios puntos abiertos a definición. Estas son las decisiones
adoptadas y su justificación. Todas las que afectan la operación son
**configurables** desde Configuración → Operación, salvo que se indique.

| # | Tema | Decisión | Por qué | Configurable |
|---|------|----------|---------|--------------|
| 1 | **Stock negativo** | `allowNegativeStock = false` | Evita vender lo que no hay y descuadres de inventario; el caso real (venta urgente sin carga previa) se cubre con un ajuste de stock. | Sí |
| 2 | **Caja para efectivo** | `requireOpenCash = true` | Garantiza arqueo correcto: todo cobro en efectivo queda dentro de una caja. | Sí |
| 3 | **Costeo** | Último costo | Simple y predecible para un comercio chico/mediano; refleja el precio de reposición más reciente. (No se implementa CPP/FIFO por ahora.) | No |
| 4 | **Multi-cliente** | 1 proyecto Firebase por cliente | Aislamiento total de datos, cuotas y costos independientes; más simple que multi-tenant con un solo proyecto. Ver `docs/ALTA-CLIENTE.md`. | No |
| 5 | **Anular sin caja abierta** | Permitido, con marca `sinCaja` | No bloquea una corrección legítima; el movimiento de efectivo queda marcado para regularizar en el próximo arqueo. | No |
| 6 | **Cliente por defecto** | “Consumidor Final” (`isDefault = true`) | Agiliza la venta mostrador típica sin elegir cliente en cada ticket. | No |
| 7 | **Imágenes de producto** | Miniatura ~200×200, objetivo <30 KB, base64 en Firestore | Permite seguir en plan Spark (sin Storage) sin inflar los documentos ni el ancho de banda. | No |
| 8 | **Rol inválido** | Sin perfil / inactivo = rol `none` | Falla segura: ante la duda, sin permisos. | No |

## Notas de implementación

- Los defaults de Operación se aplican aunque el documento de configuración no
  tenga el campo (se asume el valor seguro).
- Cambiar `requireOpenCash` o `allowNegativeStock` tiene efecto inmediato en el
  POS sin recargar la base.
- La marca `sinCaja` en anulaciones permite, a futuro, un reporte de
  “movimientos a regularizar”.
