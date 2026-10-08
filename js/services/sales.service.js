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

async function nextNumber(){
  const sales=await DB.list('sales');
  const max=sales.reduce((m,s)=>Math.max(m,s.number||0),1000);
  return max+1;
}

export const Sales={
  list:(opts)=>DB.list('sales',opts),
  get:(id)=>DB.get('sales',id),
  calcTotals,

  // Confirma una venta de forma "transaccional" a nivel de aplicación:
  // 1) crea la venta  2) descuenta stock  3) registra pagos
  // 4) actualiza caja (efectivo)  5) actualiza cuenta corriente del cliente.
  async confirm({items,generalDiscount=0,payments,clientId,client,user,cashReceived=0}){
    if(!items||!items.length) throw new Error('El carrito está vacío');
    const t=calcTotals(items,generalDiscount);
    const paid=payments.reduce((s,p)=>s+(+p.amount||0),0);
    const ccAmount=payments.filter(p=>p.method==='cuenta_corriente').reduce((s,p)=>s+(+p.amount||0),0);
    // Validación: lo pagado (sin contar vuelto) debe cubrir el total.
    if(+paid.toFixed(2) < t.total) throw new Error('El pago no cubre el total de la venta');
    if(ccAmount>0 && !clientId) throw new Error('Para cuenta corriente debés seleccionar un cliente');

    const cashApplied=payments.filter(p=>p.method==='efectivo').reduce((s,p)=>s+(+p.amount||0),0);
    const number=await nextNumber();
    const sale=await DB.add('sales',{
      number, items, ...t, discount:t.itemDiscount+t.generalDiscount,
      payments, clientId:clientId||null, clientName:client?`${client.name} ${client.lastName||''}`.trim():'Consumidor Final',
      userId:user.id, userName:user.name, status:'completada',
      cashReceived:+cashReceived||0, change:Math.max(0,+((cashReceived||0)-cashApplied).toFixed(2)),
      at:Date.now()
    });

    // Stock
    for(const it of items){
      try{ await Products.moveStock({productId:it.productId,type:'venta',qty:it.qty,
        reason:'Venta #'+number,userId:user.id,userName:user.name,refId:sale.id}); }catch(e){ console.warn(e); }
    }
    // Pagos
    for(const p of payments){
      await DB.add('payments',{saleId:sale.id,number,method:p.method,amount:+p.amount,
        clientId:clientId||null,userId:user.id,at:Date.now()});
    }
    // Caja: registra el efectivo en la caja abierta del usuario (si existe)
    const cashPaid=payments.filter(p=>p.method==='efectivo').reduce((s,p)=>s+(+p.amount||0),0);
    if(cashPaid>0){
      const open=(await DB.list('cashRegisters',{where:[['status','==','abierta']]}))[0];
      if(open){ await DB.add('cashMovements',{registerId:open.id,type:'venta',amount:cashPaid,
        concept:'Venta #'+number,saleId:sale.id,userId:user.id,at:Date.now()}); }
    }
    // Cuenta corriente del cliente
    if(ccAmount>0 && clientId){
      const c=await DB.get('clients',clientId);
      const newBalance=+((c?.balance||0)+ccAmount).toFixed(2);
      await DB.update('clients',clientId,{balance:newBalance});
      await DB.add('accountsReceivable',{clientId,type:'debito',amount:ccAmount,balance:newBalance,
        concept:'Venta #'+number,saleId:sale.id,userId:user.id,at:Date.now()});
    }
    await Audit.log('sale','sale',{id:sale.id,number,total:t.total});
    return sale;
  }
};
