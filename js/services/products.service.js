// Lógica de productos: CRUD, cálculo de margen y movimientos de stock.
import { DB } from './db.service.js';
import { Audit } from './audit.service.js';
import { assertUnique, isUnique } from '../utils/unique.js';
// B1: bandera de reposición (el Dashboard consulta solo lo que falta reponer).
import { needsRestock } from './stock-flags.js';
// B3: el cálculo de margen vive en un módulo PURO testeable con node --test.
import { margin } from './product-calc.js';
export { margin };

export const UNITS=[
  {v:'unidad',l:'Unidad'},{v:'kg',l:'Kilogramo (kg)'},{v:'g',l:'Gramo (g)'},
  {v:'litro',l:'Litro (L)'},{v:'ml',l:'Mililitro (ml)'},{v:'metro',l:'Metro (m)'},
  {v:'caja',l:'Caja'},{v:'pack',l:'Pack'},{v:'docena',l:'Docena'},{v:'otro',l:'Otra'}
];

export const Products={
  list:(opts)=>DB.list('products',opts),
  get:(id)=>DB.get('products',id),
  async create(data){
    // Unicidad de código interno y código de barras (si vienen cargados).
    await assertUnique('products','code',data.code,null,'El código interno');
    await assertUnique('products','barcode',data.barcode,null,'El código de barras');
    const doc=await DB.add('products',{...data,needsRestock:needsRestock(data),createdAt:Date.now(),updatedAt:Date.now()});
    await Audit.log('create','product',{id:doc.id,name:doc.name});
    return doc;
  },
  async update(id,patch){
    if('code' in patch)    await assertUnique('products','code',patch.code,id,'El código interno');
    if('barcode' in patch) await assertUnique('products','barcode',patch.barcode,id,'El código de barras');
    // B1: si cambian stock+mínimo (formulario de edición) o se desactiva, recalcula la bandera.
    if(('stock' in patch) && ('stockMin' in patch)) patch={...patch,needsRestock:needsRestock(patch)};
    else if(patch.active===false)                   patch={...patch,needsRestock:false};
    const doc=await DB.update('products',id,{...patch,updatedAt:Date.now()});
    await Audit.log('update','product',{id,fields:Object.keys(patch)});
    return doc;
  },
  async setActive(id,active){
    // B1: al desactivar no necesita reposición; al reactivar se recalcula según su stock.
    let extra={needsRestock:false};
    if(active){ const p=await DB.get('products',id); if(p) extra={needsRestock:needsRestock({...p,active:true})}; }
    await DB.update('products',id,{active,...extra,updatedAt:Date.now()});
    await Audit.log(active?'activate':'deactivate','product',{id});
  },
  async duplicate(id){
    const p=await DB.get('products',id); if(!p) return;
    const {id:_,...rest}=p;
    // Genera un código único: base-C, base-C2, base-C3… (evita choques).
    const base=(rest.code||'')+'-C';
    let code=base, n=1;
    while(code && !(await isUnique('products','code',code))){ n++; code=base+n; }
    return this.create({...rest,name:rest.name+' (copia)',code,barcode:''});
  },
  // Registra un movimiento de stock y actualiza el stock del producto.
  // A3: atómico con increment. Si recibe `tx`, opera dentro de esa transacción;
  // si no, abre su propia transacción para que stock y movimiento nunca diverjan.
  async moveStock({productId,type,qty,reason,userId,userName,refId},tx){
    const run=async(t)=>{
      const p=await t.get('products',productId); if(!p) throw new Error('Producto inexistente');
      const delta=['venta','ajuste_negativo','anulacion_compra'].includes(type)?-Math.abs(qty):Math.abs(qty);
      const newStock=+( (p.stock||0)+delta ).toFixed(3);
      t.update('products',productId,{stock:DB.increment(delta),
        needsRestock:needsRestock({active:p.active,stock:newStock,stockMin:p.stockMin}),updatedAt:Date.now()});
      t.add('stockMovements',{productId,productName:p.name,type,qty:Math.abs(qty),delta,
        stockAfter:newStock,reason:reason||'',userId,userName,refId:refId||null,at:Date.now()});
      return newStock;
    };
    return tx ? run(tx) : DB.transaction(run);
  }
};
