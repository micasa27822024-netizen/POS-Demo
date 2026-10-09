// Lógica de ventas: numeración, confirmación (stock + caja + cuenta corriente),
// y cálculo de totales. Usada por el POS y, más adelante, por el historial.
import { DB } from './db.service.js';
import { Products } from './products.service.js';
import { Audit } from './audit.service.js';
// B3: la lógica de cálculo vive en un módulo PURO testeable con node --test.
import { calcTotals, DECIMAL_UNITS, isDecimalUnit } from './sales-calc.js';
export { calcTotals, DECIMAL_UNITS, isDecimalUnit };
import { calcReturn } from './sales-calc.js';
import { dayKeyAR } from '../utils/format.js';
// B1: bandera de reposición (para que el Dashboard consulte solo lo que falta reponer).
import { needsRestock } from './stock-flags.js';
// C1: interfaz de facturación electrónica (preparación sin backend).
import { Fiscal, fiscalDefault } from './fiscal.service.js';
export { Fiscal };

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
    // C1: configuración del comprobante (punto de venta y tipo) para el estado
    // fiscal por defecto de la venta. La numeración fiscal es SEPARADA de la interna.
    const invCfg=await DB.get('settings','invoice').catch(()=>null);
    const fiscal0=fiscalDefault({puntoVenta:(invCfg&&invCfg.puntoVenta)||'0001',
      tipoComprobante:(invCfg&&invCfg.tipo)||'X'});
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
        fiscal:fiscal0, // C1: comprobante interno X por defecto, listo para pedir CAE
        at:Date.now()
      });
      for(const it of items){ const p=prod[it.productId];
        const newStock=+((+p.stock||0)-it.qty).toFixed(3);
        tx.update('products',it.productId,{stock:DB.increment(-it.qty),
          needsRestock:needsRestock({active:p.active,stock:newStock,stockMin:p.stockMin}),updatedAt:Date.now()});
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
      const dayKey=dayKeyAR();
      const dsPatch={date:dayKey,salesCount:DB.increment(1),total:DB.increment(t.total),
        cost:DB.increment(t.cost),profit:DB.increment(t.profit)};
      for(const p of payments){ dsPatch['pm_'+p.method]=DB.increment(+p.amount||0); }
      // B1: agregados por producto y categoría para los rankings del Dashboard
      // (evita leer todas las ventas del mes para armarlos).
      for(const it of items){ const pr=prod[it.productId];
        dsPatch['tp_'+it.productId]=DB.increment(+it.qty||0);
        const cid=(pr&&pr.categoryId)||'none';
        const lineAmt=+(((+it.price||0)*(+it.qty||0))-(+it.discount||0)).toFixed(2);
        dsPatch['tc_'+cid]=DB.increment(lineAmt);
      }
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
      openCash=regs.find(r=>r.openedBy===user.id)||null;
    }

    return DB.transaction(async(tx)=>{
      // LECTURAS
      const s=await tx.get('sales',saleId);
      if(!s) throw new Error('La venta ya no existe');
      if(s.status==='anulada') throw new Error('La venta está anulada');
      // C3: validación ATÓMICA. Lo ya devuelto se toma de la PROPIA venta
      // (s.returnedQty) leída DENTRO de la transacción, no de una consulta previa a
      // `returns` hecha afuera (eso permitía devoluciones duplicadas por concurrencia).
      const returnedInTx={...(s.returnedQty||{})};
      const calcTx=calcReturn(s,lines,returnedInTx);
      const detail=calcTx.detail, refundTotal=calcTx.refundTotal, costTotal=calcTx.cost, profitTotal=calcTx.profit;
      if(method==='cuenta_corriente' && !s.clientId)
        throw new Error('La venta no tiene cliente: no se puede acreditar en cuenta corriente');
      const prod={}; for(const d of detail){ prod[d.productId]=await tx.get('products',d.productId); }
      const cli=(method==='cuenta_corriente'&&s.clientId)?await tx.get('clients',s.clientId):null;
      // ESCRITURAS
      const retId=tx.add('returns',{saleId,number:s.number,clientId:s.clientId||null,
        lines:detail,refundTotal,cost:costTotal,profit:profitTotal,method,reason:reason.trim(),
        userId:user.id,userName:user.name,at:Date.now()});
      for(const d of detail){ const p=prod[d.productId];
        const newStock=+(((p&&+p.stock)||0)+d.qty).toFixed(3);
        tx.update('products',d.productId,{stock:DB.increment(d.qty),
          needsRestock:needsRestock({active:p&&p.active,stock:newStock,stockMin:p&&p.stockMin}),updatedAt:Date.now()});
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
        returnedProfit:+(((+s.returnedProfit)||0)+profitTotal).toFixed(2),
        returnedCost:+(((+s.returnedCost)||0)+costTotal).toFixed(2),
        status:fullyReturned?'devuelta':'parcial_devuelta',updatedAt:Date.now()});
      // dailyStats de HOY: suma devoluciones y resta de los netos del día.
      const dayKey=dayKeyAR();
      const dsPatch={date:dayKey,returnsCount:DB.increment(1),returnsTotal:DB.increment(refundTotal),
        total:DB.increment(-refundTotal),cost:DB.increment(-costTotal),profit:DB.increment(-profitTotal)};
      dsPatch['pm_'+method]=DB.increment(-refundTotal);
      // B1: descuenta de los agregados por producto/categoría lo devuelto
      // (mantiene los rankings del Dashboard netos de devoluciones).
      for(const d of detail){ const p=prod[d.productId];
        dsPatch['tp_'+d.productId]=DB.increment(-(+d.qty||0));
        const cid=(p&&p.categoryId)||'none';
        dsPatch['tc_'+cid]=DB.increment(-(+d.refund||0));
      }
      tx.set('dailyStats',dayKey,dsPatch);
      Audit.log('sale.return','sale',{id:saleId,number:s.number,refund:refundTotal,reason:reason.trim()});
      return {id:retId,saleId,number:s.number,refundTotal,lines:detail};
    });
  },

  // C1: solicita el CAE a AFIP/ARCA a través de la interfaz fiscal conectable y
  // guarda el resultado en sale.fiscal. Con el proveedor NULO por defecto deja el
  // comprobante como interno X (estado 'no_fiscal'); al conectar un backend real
  // (Fiscal.setProvider) completará tipo, numeración fiscal, CAE y vencimiento.
  // No se hace dentro de una transacción de Firestore: el pedido de CAE requiere
  // red/backend y la venta ya quedó registrada de forma atómica (A3).
  async requestFiscal(saleId){
    const sale=await DB.get('sales',saleId);
    if(!sale) throw new Error('La venta no existe');
    if(sale.status==='anulada') throw new Error('La venta está anulada: no se emite comprobante fiscal');
    const f0=sale.fiscal||{};
    // C1 idempotencia: si ya tiene CAE emitido, se devuelve sin volver a solicitar.
    if(f0.cae && f0.estado!=='no_fiscal' && f0.estado!=='error') return f0;
    // Candado ATÓMICO: marca 'solicitando' solo si no hay otra solicitud en curso
    // (evita pedir dos CAE para la misma venta por doble clic o concurrencia).
    await DB.transaction(async(tx)=>{
      const s=await tx.get('sales',saleId);
      if(!s) throw new Error('La venta ya no existe');
      if(s.status==='anulada') throw new Error('La venta está anulada');
      const f=s.fiscal||{};
      if(f.cae && f.estado!=='no_fiscal' && f.estado!=='error') return; // ya emitido
      if(f.estado==='solicitando') throw new Error('Ya hay una solicitud de CAE en curso para esta venta');
      tx.update('sales',saleId,{fiscal:{...f,estado:'solicitando'},updatedAt:Date.now()});
    });
    // Relee por si otra solicitud concurrente ya completó el CAE.
    const cur=await DB.get('sales',saleId);
    const fc=(cur&&cur.fiscal)||{};
    if(fc.cae && fc.estado!=='no_fiscal' && fc.estado!=='error' && fc.estado!=='solicitando') return fc;
    const invCfg=await DB.get('settings','invoice').catch(()=>null);
    const cfg={puntoVenta:(invCfg&&invCfg.puntoVenta)||'0001',
      tipoComprobante:(invCfg&&invCfg.tipo)||'X'};
    let fiscal;
    try{
      fiscal=await Fiscal.requestCAE(sale,cfg);
    }catch(ex){
      // Si falla la red/backend, se libera el candado dejando estado 'error'.
      await DB.update('sales',saleId,{fiscal:{...f0,estado:'error',error:(ex&&ex.message)||'Error de facturación'},updatedAt:Date.now()});
      throw ex;
    }
    // Guarda el resultado (emitido, no_fiscal o error): en todos los casos libera el candado.
    await DB.update('sales',saleId,{fiscal,updatedAt:Date.now()});
    Audit.log('sale.fiscal','sale',{id:saleId,number:sale.number,estado:fiscal.estado,cae:fiscal.cae||''});
    return fiscal;
  }
};
