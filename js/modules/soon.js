// Placeholder profesional para módulos planificados en fases siguientes.
// Mantiene la navegación sin enlaces rotos y describe qué incluirá.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';

const INFO={
  pos:{t:'Punto de Venta',ic:'🛒',phase:2,desc:'Pantalla de venta rápida: búsqueda por código/barras/nombre, carrito, cantidades decimales por unidad (kg, g, L...), descuentos, pagos combinados y cálculo de vuelto.'},
  sales:{t:'Ventas',ic:'🧾',phase:2,desc:'Historial de ventas, detalle de comprobantes, devoluciones y anulaciones con reversión de stock y caja.'},
  purchases:{t:'Compras',ic:'📦',phase:2,desc:'Registro de compras a proveedores, actualización de stock y costo, cuenta corriente de proveedores.'},
  cash:{t:'Caja',ic:'💵',phase:2,desc:'Apertura y cierre de caja, ingresos/egresos, arqueo, efectivo esperado vs declarado y resumen por medio de pago.'},
  stock:{t:'Control de Stock',ic:'📈',phase:2,desc:'Movimientos de inventario, ajustes positivos/negativos, historial y alertas de stock mínimo.'},
  clients:{t:'Clientes',ic:'👥',phase:2,desc:'ABM de clientes, cuenta corriente, saldos, pagos y estado de cuenta imprimible.'},
  suppliers:{t:'Proveedores',ic:'🏭',phase:2,desc:'ABM de proveedores, historial de compras, deuda y pagos.'},
  reports:{t:'Reportes',ic:'📉',phase:3,desc:'Reportes de ventas, productos, caja, clientes y proveedores con filtros de fecha, gráficos y exportación PDF/Excel.'},
  audit:{t:'Auditoría',ic:'🔍',phase:3,desc:'Registro de todas las acciones del sistema: logins, altas, cambios, ventas, anulaciones y ajustes.'},
  settings:{t:'Configuración',ic:'⚙️',phase:3,desc:'Datos del negocio, moneda, IVA, numeración, métodos de pago y tema visual.'},
  tickets:{t:'Tickets',ic:'🧧',phase:3,desc:'Diseñador de ticket con vista previa en tiempo real (58mm / 80mm / A4), logo, textos y QR.'},
  invoices:{t:'Facturas',ic:'📄',phase:3,desc:'Plantillas de comprobantes/facturas. Arquitectura preparada para integración futura con AFIP/ARCA.'}
};

export async function renderSoon(key){
  const info=INFO[key]||{t:key,ic:'🛠️',phase:2,desc:'Módulo en desarrollo.'};
  const u=await requireAuth(key); if(!u) return;
  const view=renderShell(key,info.t);
  view.innerHTML=`<div class="page-head"><div><h1>${info.ic} ${info.t}</h1><p>Módulo planificado para la Fase ${info.phase}</p></div></div>
    <div class="card card-pad fade-in" style="max-width:720px">
      <span class="badge badge-info">Fase ${info.phase}</span>
      <h2 style="margin:12px 0 8px;font-size:20px">${info.t}</h2>
      <p style="color:var(--text-2);line-height:1.7">${info.desc}</p>
      <div class="mt-16" style="padding:14px;background:var(--surface-2);border-radius:12px;border:1px dashed var(--border-strong)">
        <b style="font-size:13px">✅ Ya disponible la base</b>
        <p style="color:var(--text-2);font-size:13px;margin-top:6px;line-height:1.6">La arquitectura (capa de datos, auth, roles, auditoría y modelo Firestore) ya está lista, por lo que este módulo se integra sin rehacer el proyecto.</p>
      </div>
    </div>`;
}
