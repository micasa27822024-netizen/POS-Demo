// Placeholder profesional para módulos planificados en fases siguientes.
// Mantiene la navegación sin enlaces rotos y describe qué incluirá.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';

const INFO={
  pos:{t:'Punto de Venta',ic:'\ud83d\uded2',phase:2,desc:'Pantalla de venta r\u00e1pida: b\u00fasqueda por c\u00f3digo/barras/nombre, carrito, cantidades decimales por unidad (kg, g, L...), descuentos, pagos combinados y c\u00e1lculo de vuelto.'},
  sales:{t:'Ventas',ic:'\ud83e\uddfe',phase:2,desc:'Historial de ventas, detalle de comprobantes, devoluciones y anulaciones con reversi\u00f3n de stock y caja.'},
  purchases:{t:'Compras',ic:'\ud83d\udce6',phase:2,desc:'Registro de compras a proveedores, actualizaci\u00f3n de stock y costo, cuenta corriente de proveedores.'},
  cash:{t:'Caja',ic:'\ud83d\udcb5',phase:2,desc:'Apertura y cierre de caja, ingresos/egresos, arqueo, efectivo esperado vs declarado y resumen por medio de pago.'},
  stock:{t:'Control de Stock',ic:'\ud83d\udcc8',phase:2,desc:'Movimientos de inventario, ajustes positivos/negativos, historial y alertas de stock m\u00ednimo.'},
  clients:{t:'Clientes',ic:'\ud83d\udc65',phase:2,desc:'ABM de clientes, cuenta corriente, saldos, pagos y estado de cuenta imprimible.'},
  suppliers:{t:'Proveedores',ic:'\ud83c\udfed',phase:2,desc:'ABM de proveedores, historial de compras, deuda y pagos.'},
  reports:{t:'Reportes',ic:'\ud83d\udcc9',phase:3,desc:'Reportes de ventas, productos, caja, clientes y proveedores con filtros de fecha, gr\u00e1ficos y exportaci\u00f3n PDF/Excel.'},
  audit:{t:'Auditor\u00eda',ic:'\ud83d\udd0d',phase:3,desc:'Registro de todas las acciones del sistema: logins, altas, cambios, ventas, anulaciones y ajustes.'},
  settings:{t:'Configuraci\u00f3n',ic:'\u2699\ufe0f',phase:3,desc:'Datos del negocio, moneda, IVA, numeraci\u00f3n, m\u00e9todos de pago y tema visual.'},
  tickets:{t:'Tickets',ic:'\ud83e\udde7',phase:3,desc:'Dise\u00f1ador de ticket con vista previa en tiempo real (58mm / 80mm / A4), logo, textos y QR.'},
  invoices:{t:'Facturas',ic:'\ud83d\udcc4',phase:3,desc:'Plantillas de comprobantes/facturas. Arquitectura preparada para integraci\u00f3n futura con AFIP/ARCA.'}
};

export async function renderSoon(key){
  const info=INFO[key]||{t:key,ic:'\ud83d\udee0\ufe0f',phase:2,desc:'M\u00f3dulo en desarrollo.'};
  const u=await requireAuth(key); if(!u) return;
  const view=renderShell(key,info.t);
  view.innerHTML=`<div class="page-head"><div><h1>${info.ic} ${info.t}</h1><p>M\u00f3dulo planificado para la Fase ${info.phase}</p></div></div>
    <div class="card card-pad fade-in" style="max-width:720px">
      <span class="badge badge-info">Fase ${info.phase}</span>
      <h2 style="margin:12px 0 8px;font-size:20px">${info.t}</h2>
      <p style="color:var(--text-2);line-height:1.7">${info.desc}</p>
      <div class="mt-16" style="padding:14px;background:var(--surface-2);border-radius:12px;border:1px dashed var(--border-strong)">
        <b style="font-size:13px">\u2705 Ya disponible la base</b>
        <p style="color:var(--text-2);font-size:13px;margin-top:6px;line-height:1.6">La arquitectura (capa de datos, auth, roles, auditor\u00eda y modelo Firestore) ya est\u00e1 lista, por lo que este m\u00f3dulo se integra sin rehacer el proyecto.</p>
      </div>
    </div>`;
}
