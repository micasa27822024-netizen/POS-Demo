// Lógica de ventas: numeración, confirmación (stock + caja + cuenta corriente),
// y cálculo de totales. Usada por el POS y, más adelante, por el historial.
import { DB } from './db.service.js';
import { Products } from './products.service.js';
import { Audit } from './audit.service.js';

export const PAYMENT_METHODS=[
  {v:'efectivo',l:'Efectivo',ic:'💵'},
  {v:'debito',l:'Tarjeta débito',ic:'💳'},
  {v:'credito',l:'Tarjeta crédito',ic:'💳'},
  {v:'transferencia',l:'Transferencia',ic:'🏦'},
  {v:'cuenta_corriente',l:'Cuenta corriente',ic:'🧧'},
  {v:'otros',l:'Otros',ic:'•'}
];

// Unidades que admiten cantidades decimales.
export const DECIMAL_UNITS=['kg','g','litro','ml','metro'];
export const isDecimalUnit=u=>DECIMAL_UNITS.includes(u);

// Calcula totales de un carrito. items:[{qty,price,cost,discount}]
export function calcTotals(items,generalDiscount=0){
  let subtotal=0, cost=0, itemDisc=0;
  for(const it of items){
    const gross=it.price*it.qty;
    const d=it.discount||0;
    subtotal+=gross; itemDisc+=d; cost+=(it.cost||0)*it.qty;
  }
  const afterItem=subtotal-itemDisc;
  const gDisc=Math.min(generalDiscount||0,afterItem);
  const total=+(afterItem-gDisc).toFixed(2);
  const totalCost=+cost.toFixed(2);
  return {
    subtotal:+subtotal.toFixed(2), itemDiscount:+itemDisc.toFixed(2),
    generalDiscount:+gDisc.toFixed(2), total, cost:totalCost,
    profit:+(total-totalCost).toFixed(2)
  };
}

export const Sales={
  list:(opts)=>DB.list('sales',opts),
  get:(id)=>DB.get('sales',id),
  calcTotals,

  // Confirma una venta de forma ATÓMICA (A3): una sola transacción agrupa
  // numeración, validación de stock/crédito, creación de venta, descuento de
  // stock, pagos, caja y cuenta corriente. Si algo falla, no queda nada a medias.
  async confirm({items,generalDiscount=0,payments,clientId,client,user,cashReceived=0}){
    if(!items||!items.length) throw new Error('El carrito está vacío');
    const t=calcTotals(items,generalDiscount);
    const paid=payments.reduce((s,p)=>s+(+p.amount||0),0);
    const ccAmount=payments.filter(p=>p.method==='cuenta_corriente').reduce((s,p)=>s+(+p.amount||0),0);
    if(+paid.toFixed(2) < t.total) throw new Error('El pago no cubre el total de la venta');
    if(ccAmount>0 && !clientId) throw new Error('Para cuenta corriente debés seleccionar un cliente');
    // Validación de montos no negativos.
    for(const it of items){
      if(!(it.qty>0)) throw new Error('Cantidad inválida en «'+(it.name||'ítem')+'»');
      if((+it.price||0)<0 || (+it.discount||0)<0) throw new Error('Precio o descuento inválido');
    }
    if(t.generalDiscount>t.subtotal) throw new Error('El descuento supera el subtotal');

    const biz=await DB.get('settings','business').catch(()=>null);
    const allowNeg=!!(biz&&biz.allowNegativeStock);
    const numberStart=(biz&&parseInt(biz.numberStart,10))||1000;
    const cashApplied=payments.filter(p=>p.method==='efectivo').reduce((s,p)=>s+(+p.amount||0),0);

    // Caja abierta del usuario (consulta FUERA de la transacción: Firestore no
    // admite queries dentro de runTransaction). B2 refina la obligatoriedad.
    let openCash=null;
    if(cashApplied>0){
      const regs=await DB.list('cashRegisters',{where:[['status','==','abierta']]});
      openCash=regs.find(r=>r.openedBy===user.id)||regs[0]||null;
    }

    return DB.transaction(async(tx)=>{
      // 1) LECTURAS
      const prod={};
      for(const it of items){ prod[it.productId]=await tx.get('products',it.productId); }
      const cli=(ccAmount>0&&clientId)?await tx.get('clients',clientId):null;
      const counter=await tx.get('counters','sales');
      // 2) VALIDACIONES
      for(const it of items){ const p=prod[it.productId];
        if(!p) throw new Error('Producto inexistente en la venta');
        if(!allowNeg && (+p.stock||0) < it.qty) throw new Error('Stock insuficiente de «'+p.name+'»');
      }
      if(ccAmount>0 && cli){ const lim=+cli.creditLimit||0;
        if(lim>0 && (+cli.balance||0)+ccAmount>lim) throw new Error('La venta supera el límite de crédito del cliente'); }
      // 3) NUMERACIÓN ATÓMICA
      const number = counter ? (counter.last||numberStart)+1 : numberStart+1;
      tx.set('counters','sales',{last:number});
      // 4) ESCRITURAS
      const saleId=tx.add('sales',{
        number, items, ...t, discount:t.itemDiscount+t.generalDiscount,
        payments, clientId:clientId||null,
        clientName:client?`${client.name} ${client.lastName||''}`.trim():'Consumidor Final',
        userId:user.id, userName:user.name, status:'completada',
        cashReceived:+cashReceived||0, change:Math.max(0,+((cashReceived||0)-cashApplied).toFixed(2)),
        at:Date.now()
      });
      for(const it of items){ const p=prod[it.productId];
        const newStock=+((+p.stock||0)-it.qty).toFixed(3);
        tx.update('products',it.productId,{stock:DB.increment(-it.qty),updatedAt:Date.now()});
        tx.add('stockMovements',{productId:it.productId,productName:p.name,type:'venta',qty:it.qty,delta:-it.qty,
          stockAfter:newStock,reason:'Venta #'+number,userId:user.id,userName:user.name,refId:saleId,at:Date.now()});
      }
      for(const p of payments){ tx.add('payments',{saleId,number,method:p.method,amount:+p.amount,
        clientId:clientId||null,userId:user.id,at:Date.now()}); }
      if(cashApplied>0 && openCash){ tx.add('cashMovements',{registerId:openCash.id,type:'venta',amount:cashApplied,
        concept:'Venta #'+number,saleId,userId:user.id,at:Date.now()}); }
      if(ccAmount>0 && clientId){ const newBalance=+(((cli&&+cli.balance)||0)+ccAmount).toFixed(2);
        tx.update('clients',clientId,{balance:DB.increment(ccAmount),updatedAt:Date.now()});
        tx.add('accountsReceivable',{clientId,type:'debito',amount:ccAmount,balance:newBalance,
          concept:'Venta #'+number,saleId,userId:user.id,at:Date.now()}); }
      const sale={id:saleId,number,items,...t,discount:t.itemDiscount+t.generalDiscount,
        clientId:clientId||null,userId:user.id,userName:user.name,status:'completada',at:Date.now()};
      // Auditoría: mejor esfuerzo, fuera del camino crítico de la transacción.
      Audit.log('sale','sale',{id:saleId,number,total:t.total});
      return sale;
    });
  }
};
