// Lógica de ventas: numeración, confirmación (stock + caja + cuenta corriente),
// y cálculo de totales. Usada por el POS y, más adelante, por el historial.
import { DB } from './db.service.js';
import { Products } from './products.service.js';
import { Audit } from './audit.service.js';
// B3: la lógica de cálculo vive en un módulo PURO testeable con node --test.
import { calcTotals, DECIMAL_UNITS, isDecimalUnit } from './sales-calc.js';
export { calcTotals, DECIMAL_UNITS, isDecimalUnit };
import { calcReturn } from './sales-calc.js';

export const PAYMENT_METHODS=[
  {v:'efectivo',l:'Efectivo',ic:'💵'},
  {v:'debito',l:'Tarjeta débito',ic:'💳'},
  {v:'credito',l:'Tarjeta crédito',ic:'💳'},
  {v:'transferencia',l:'Transferencia',ic:'🏦'},
  {v:'cuenta_corriente',l:'Cuenta corriente',ic:'🧧'},
  {v:'otros',l:'Otros',ic:'•'}
];

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
    const requireOpenCash = biz ? biz.requireOpenCash!==false : true; // B2: por defecto true
    const numberStart=(biz&&parseInt(biz.numberStart,10))||1000;
    const cashApplied=payments.filter(p=>p.method==='efectivo').reduce((s,p)=>s+(+p.amount||0),0);

    // B2: la venta en efectivo se asocia a la caja abierta DEL usuario (openedBy),
    // sin caer en la caja de otro. Consulta FUERA de la transacción (Firestore no
    // admite queries dentro de runTransaction).
    let openCash=null;
    if(cashApplied>0){
      const regs=await DB.list('cashRegisters',{where:[['status','==','abierta']]});
      openCash=regs.find(r=>r.openedBy===user.id)||null;
      if(requireOpenCash && !openCash)
        throw new Error('No tenés una caja abierta. Abrí la caja para cobrar en efectivo.');
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
      // B1: resumen diario incremental (dashboard/reportes leen esto, no la colección completa).
      const dayKey=new Date().toISOString().slice(0,10);
      const dsPatch={date:dayKey,salesCount:DB.increment(1),total:DB.increment(t.total),
        cost:DB.increment(t.cost),profit:DB.increment(t.profit)};
      for(const p of payments){ dsPatch['pm_'+p.method]=DB.increment(+p.amount||0); }
      tx.set('dailyStats',dayKey,dsPatch);
      const sale={id:saleId,number,items,...t,discount:t.itemDiscount+t.generalDiscount,
        clientId:clientId||null,userId:user.id,userName:user.name,status:'completada',at:Date.now()};
      // Auditoría: mejor esfuerzo, fuera del camino crítico de la transacción.
      Audit.log('sale','sale',{id:saleId,number,total:t.total});
      return sale;
    });
  },

  // C3: DEVOLUCIONES PARCIALES. Permite devolver una parte de los ítems de una
  // venta ya realizada. Es ATÓMICA e idempotente respecto de lo ya devuelto:
  // lee las devoluciones previas (colección `returns`), valida que la cantidad
  // a devolver no supere lo vendido menos lo ya devuelto, repone stock, reintegra
  // el dinero (efectivo en caja o crédito en cuenta corriente) y descuenta del
  // resumen diario (dailyStats) de HOY.
  // params: { saleId, lines:[{productId, qty}], method:'efectivo'|'cuenta_corriente',
  //           reason, user }
  async returnItems({saleId,lines,method='efectivo',reason='',user}){
    if(!saleId) throw new Error('Venta no indicada');
    if(!lines||!lines.length) throw new Error('No seleccionaste ítems para devolver');
    if(!reason||!reason.trim()) throw new Error('Ingresá un motivo de devolución');

    const sale=await DB.get('sales',saleId);
    if(!sale) throw new Error('La venta no existe');
    if(sale.status==='anulada') throw new Error('La venta está anulada: no admite devoluciones');

    // Lo ya devuelto por producto (suma de devoluciones previas).
    const prevReturns=await DB.list('returns',{where:[['saleId','==',saleId]]}).catch(()=>[]);
    const returnedSoFar={};
    for(const r of prevReturns){ for(const l of (r.lines||[])){
      returnedSoFar[l.productId]=(returnedSoFar[l.productId]||0)+(+l.qty||0); } }

    // Validación contra lo vendido y cálculo de importes (lógica PURA, testeable).
    const { detail, refundTotal, cost: costTotal, profit: profitTotal } =
      calcReturn(sale, lines, returnedSoFar);

    if(method==='cuenta_corriente' && !sale.clientId)
      throw new Error('La venta no tiene cliente: no se puede acreditar en cuenta corriente');

    // Caja abierta del usuario (consulta fuera de la transacción) para reintegro en efectivo.
    let openCash=null;
    if(method==='efectivo'){
      const regs=await DB.list('cashRegisters',{where:[['status','==','abierta']]});
      openCash=regs.find(r=>r.openedBy===user.id)||regs[0]||null;
    }

    return DB.transaction(async(tx)=>{
      // LECTURAS
      const s=await tx.get('sales',saleId);
      if(!s) throw new Error('La venta ya no existe');
      if(s.status==='anulada') throw new Error('La venta está anulada');
      const prod={}; for(const d of detail){ prod[d.productId]=await tx.get('products',d.productId); }
      const cli=(method==='cuenta_corriente'&&s.clientId)?await tx.get('clients',s.clientId):null;
      // ESCRITURAS
      const retId=tx.add('returns',{saleId,number:s.number,clientId:s.clientId||null,
        lines:detail,refundTotal,cost:costTotal,profit:profitTotal,method,reason:reason.trim(),
        userId:user.id,userName:user.name,at:Date.now()});
      for(const d of detail){ const p=prod[d.productId];
        const newStock=+(((p&&+p.stock)||0)+d.qty).toFixed(3);
        tx.update('products',d.productId,{stock:DB.increment(d.qty),updatedAt:Date.now()});
        tx.add('stockMovements',{productId:d.productId,productName:(p&&p.name)||d.name,type:'devolucion',
          qty:d.qty,delta:d.qty,stockAfter:newStock,reason:'Devolución venta #'+s.number,
          userId:user.id,userName:user.name,refId:saleId,at:Date.now()});
      }
      // Reintegro del dinero.
      if(method==='efectivo'){
        tx.add('cashMovements',{registerId:openCash?openCash.id:null,sinCaja:!openCash,type:'egreso',
          amount:refundTotal,concept:'Devolución venta #'+s.number,saleId,userId:user.id,at:Date.now()});
      }else if(method==='cuenta_corriente' && s.clientId){
        const nb=+(((cli&&+cli.balance)||0)-refundTotal).toFixed(2);
        tx.update('clients',s.clientId,{balance:DB.increment(-refundTotal),updatedAt:Date.now()});
        tx.add('accountsReceivable',{clientId:s.clientId,type:'credito',amount:refundTotal,balance:nb,
          concept:'Devolución venta #'+s.number,saleId,userId:user.id,at:Date.now()});
      }
      // Marca en la venta cuánto se devolvió (acumulado) y su estado.
      const retMap={...(s.returnedQty||{})};
      for(const d of detail){ retMap[d.productId]=(+retMap[d.productId]||0)+d.qty; }
      const fullyReturned=(s.items||[]).every(it=>(+retMap[it.productId]||0)+0.0001>=(+it.qty||0));
      tx.update('sales',saleId,{returnedQty:retMap,
        returnedTotal:+(((+s.returnedTotal)||0)+refundTotal).toFixed(2),
        status:fullyReturned?'devuelta':'parcial_devuelta',updatedAt:Date.now()});
      // dailyStats de HOY: suma devoluciones y resta de los netos del día.
      const dayKey=new Date().toISOString().slice(0,10);
      const dsPatch={date:dayKey,returnsCount:DB.increment(1),returnsTotal:DB.increment(refundTotal),
        total:DB.increment(-refundTotal),cost:DB.increment(-costTotal),profit:DB.increment(-profitTotal)};
      dsPatch['pm_'+method]=DB.increment(-refundTotal);
      tx.set('dailyStats',dayKey,dsPatch);
      Audit.log('sale.return','sale',{id:saleId,number:s.number,refund:refundTotal,reason:reason.trim()});
      return {id:retId,saleId,number:s.number,refundTotal,lines:detail};
    });
  }
};
