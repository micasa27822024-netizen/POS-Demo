// Lógica de productos: CRUD, cálculo de margen y movimientos de stock.
import { DB } from './db.service.js';
import { Audit } from './audit.service.js';

export const UNITS=[
  {v:'unidad',l:'Unidad'},{v:'kg',l:'Kilogramo (kg)'},{v:'g',l:'Gramo (g)'},
  {v:'litro',l:'Litro (L)'},{v:'ml',l:'Mililitro (ml)'},{v:'metro',l:'Metro (m)'},
  {v:'caja',l:'Caja'},{v:'pack',l:'Pack'},{v:'docena',l:'Docena'},{v:'otro',l:'Otra'}
];

export function margin(cost,price){
  cost=Number(cost)||0; price=Number(price)||0;
  const profit=price-cost;
  const marginPct=price>0?(profit/price)*100:0;   // margen sobre venta
  const markupPct=cost>0?(profit/cost)*100:0;      // ganancia sobre costo
  return {profit,marginPct,markupPct};
}

export const Products={
  list:(opts)=>DB.list('products',opts),
  get:(id)=>DB.get('products',id),
  async create(data){
    const doc=await DB.add('products',{...data,createdAt:Date.now(),updatedAt:Date.now()});
    await Audit.log('create','product',{id:doc.id,name:doc.name});
    return doc;
  },
  async update(id,patch){
    const doc=await DB.update('products',id,{...patch,updatedAt:Date.now()});
    await Audit.log('update','product',{id,fields:Object.keys(patch)});
    return doc;
  },
  async setActive(id,active){
    await DB.update('products',id,{active,updatedAt:Date.now()});
    await Audit.log(active?'activate':'deactivate','product',{id});
  },
  async duplicate(id){
    const p=await DB.get('products',id); if(!p) return;
    const {id:_,...rest}=p;
    return this.create({...rest,name:rest.name+' (copia)',code:(rest.code||'')+'-C',barcode:''});
  },
  // Registra un movimiento de stock y actualiza el stock del producto.
  // A3: atómico con increment. Si recibe `tx`, opera dentro de esa transacción;
  // si no, abre su propia transacción para que stock y movimiento nunca diverjan.
  async moveStock({productId,type,qty,reason,userId,userName,refId},tx){
    const run=async(t)=>{
      const p=await t.get('products',productId); if(!p) throw new Error('Producto inexistente');
      const delta=['venta','ajuste_negativo','anulacion_compra'].includes(type)?-Math.abs(qty):Math.abs(qty);
      const newStock=+( (p.stock||0)+delta ).toFixed(3);
      t.update('products',productId,{stock:DB.increment(delta),updatedAt:Date.now()});
      t.add('stockMovements',{productId,productName:p.name,type,qty:Math.abs(qty),delta,
        stockAfter:newStock,reason:reason||'',userId,userName,refId:refId||null,at:Date.now()});
      return newStock;
    };
    return tx ? run(tx) : DB.transaction(run);
  }
};
