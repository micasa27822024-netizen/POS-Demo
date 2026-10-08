// Matriz de roles y permisos. Se aplica en la UI y debe reflejarse
// también en las Firestore Security Rules (ver /firebase/firestore.rules).
export const ROLES={
  admin:   { label:'Administrador', color:'#4f46e5' },
  encargado:{ label:'Encargado',    color:'#0891b2' },
  cajero:  { label:'Cajero',        color:'#16a34a' }
};

// Módulos accesibles por rol (para el menú y el guard de ruta).
export const ACCESS={
  admin:['dashboard','pos','sales','purchases','products','categories','stock','clients','suppliers','cash','reports','users','audit','tickets','invoices','settings'],
  encargado:['dashboard','pos','sales','purchases','products','categories','stock','clients','suppliers','cash','reports'],
  cajero:['dashboard','pos','clients','products','cash']
};

// Capacidades finas para operaciones críticas.
export const CAPS={
  admin:['*'],
  encargado:['product.edit','product.delete','price.edit','sale.void','purchase.create','stock.adjust','cash.open','cash.close','discount.apply'],
  cajero:['sale.create','cash.open','cash.close','client.create','discount.apply']
};

export function can(role,cap){
  const list=CAPS[role]||[]; return list.includes('*')||list.includes(cap);
}
export function canAccess(role,module){ return (ACCESS[role]||[]).includes(module); }
