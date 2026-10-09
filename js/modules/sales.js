// Ventas: historial, detalle de comprobante y anulación (revierte stock, caja y CC).
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Products } from '../services/products.service.js';
import { Sales } from '../services/sales.service.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { can } from '../services/permissions.js';
import { money, num, fdatetime, fdate } from '../utils/format.js';
import { esc } from '../utils/escape.js';

let USER, LIST=[], q='', from='', to='';
const PAGE=50; let cursorAt=null, noMore=false, loading=false;

function defaultRange(){
  const now=new Date();
  const d7=new Date(now.getTime()-7*24*3600*1000);
  const iso=d=>d.toISOString().slice(0,10);
  return {from:iso(d7),to:iso(now)};
}
function rangeTs(){
  const f=from?new Date(from+'T00:00:00').getTime():0;
  const t=to?new Date(to+'T23:59:59').getTime():Date.now();
  return {f,t};
}
(async()=>{
  USER=await requireAuth('sales'); if(!USER) return;
  const dr=defaultRange(); from=dr.from; to=dr.to;
  const view=renderShell('sales','Ventas'); view.innerHTML='<div class="loader">Cargando…</div>';
  await query(true); render(view);
})();

// B1: trae ventas por rango de fechas y de a páginas (50), nunca la colección completa.
async function query(reset){
  if(loading) return; loading=true;
  if(reset){ LIST=[]; cursorAt=null; noMore=false; }
  const {f,t}=rangeTs();
  const opts={where:[['at','>=',f],['at','<=',t]],orderBy:['at','desc'],limit:PAGE};
  if(cursorAt!=null) opts.startAfter=cursorAt;
  const rows=await DB.list('sales',opts);
  if(rows.length<PAGE) noMore=true;
  if(rows.length){ cursorAt=rows[rows.length-1].at; LIST=LIST.concat(rows); }
  else noMore=true;
  loading=false;
}
function filtered(){
  const s=q.toLowerCase().trim();
  return LIST.filter(v=>(!s||String(v.number).includes(s)||(v.clientName||'').toLowerCase().includes(s)));
}

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Ventas</h1><p>Historial de comprobantes</p></div></div>
    <div class="card card-pad flex gap-12" style="flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="margin:0"><label>Buscar</label><input class="input" id="q" placeholder="Nº o cliente" value="${q}"></div>
      <div class="field" style="margin:0"><label>Desde</label><input class="input" id="from" type="date" value="${from}"></div>
      <div class="field" style="margin:0"><label>Hasta</label><input class="input" id="to" type="date" value="${to}"></div>
      <button class="btn btn-ghost" id="clear">Limpiar</button></div>
    <div id="sum" class="grid grid-3 mt-16"></div>
    <div id="host" class="mt-16"></div>`;
  const qi=document.getElementById('q'); qi.oninput=e=>{q=e.target.value;paint();};
  document.getElementById('from').onchange=async e=>{from=e.target.value;await query(true);paint();};
  document.getElementById('to').onchange=async e=>{to=e.target.value;await query(true);paint();};
  document.getElementById('clear').onclick=async()=>{q='';const dr=defaultRange();from=dr.from;to=dr.to;await query(true);render(view);};
  paint();
}
function paint(){
  const rows=filtered();
  const okRows=rows.filter(v=>v.status!=='anulada');
  const tot=okRows.reduce((s,v)=>s+v.total,0);
  const prof=okRows.reduce((s,v)=>s+(v.profit||0),0);
  document.getElementById('sum').innerHTML=`${sc('Comprobantes',num(rows.length,0))}${sc('Facturado',money(tot))}${sc('Ganancia',money(prof))}`;
  document.getElementById('host').innerHTML=`<div class="card"><table class="table">
    <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th class="ta-right">Total</th><th>Estado</th><th></th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td><b>#${v.number}</b></td><td>${fdatetime(v.at)}</td><td>${esc(v.clientName||'Consumidor Final')}</td><td>${esc(v.userName||'—')}</td>
      <td class="ta-right"><b>${money(v.total)}</b></td>
      <td>${v.status==='anulada'?'<span class="badge badge-danger">Anulada</span>':v.status==='devuelta'?'<span class="badge badge-warn">Devuelta</span>':v.status==='parcial_devuelta'?'<span class="badge badge-warn">Dev. parcial</span>':'<span class="badge badge-success">Completada</span>'}</td>
      <td class="ta-right"><button class="btn btn-sm btn-ghost" data-v="${v.id}">👁 Ver</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Sin ventas en el período</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>detail(LIST.find(v=>v.id===b.dataset.v)));
  const host=document.getElementById('host');
  if(!noMore){
    const more=document.createElement('button');
    more.className='btn btn-ghost w-full mt-16'; more.id='loadMore';
    more.textContent=loading?'Cargando…':'Cargar más';
    more.onclick=async()=>{ more.disabled=true; more.textContent='Cargando…'; await query(false); paint(); };
    host.appendChild(more);
  }
}
const sc=(l,v)=>`<div class="card card-pad"><span style="font-size:12px;color:var(--text-3)">${l}</span><h3 style="margin-top:6px">${v}</h3></div>`;
const PM={efectivo:'Efectivo',debito:'T. débito',credito:'T. crédito',transferencia:'Transferencia',cuenta_corriente:'Cuenta corriente',otros:'Otros'};

function detail(v){
  const box=document.createElement('div');
  box.innerHTML=`<div class="flex justify-between" style="margin-bottom:10px">
    <div><b style="font-size:18px">Comprobante #${v.number}</b><br><span style="font-size:12px;color:var(--text-3)">${fdatetime(v.at)} · ${esc(v.userName||'')}</span></div>
    <div class="ta-right"><span style="font-size:12px;color:var(--text-3)">Cliente</span><br><b>${esc(v.clientName||'Consumidor Final')}</b></div></div>
    <table class="table"><thead><tr><th>Producto</th><th class="ta-right">Cant.</th><th class="ta-right">Precio</th><th class="ta-right">Subtotal</th></tr></thead>
    <tbody>${(v.items||[]).map(it=>`<tr><td>${esc(it.name)}</td><td class="ta-right">${num(it.qty)} ${esc(it.unit||'')}</td><td class="ta-right">${money(it.price)}</td><td class="ta-right">${money(it.price*it.qty-(it.discount||0))}</td></tr>`).join('')}</tbody></table>
    <div style="max-width:260px;margin-left:auto;margin-top:12px;font-size:14px">
      <div class="flex justify-between"><span>Subtotal</span><span>${money(v.subtotal)}</span></div>
      ${v.discount?`<div class="flex justify-between" style="color:var(--danger)"><span>Descuentos</span><span>-${money(v.discount)}</span></div>`:''}
      <div class="flex justify-between" style="font-size:18px;font-weight:800;margin-top:6px"><span>TOTAL</span><span>${money(v.total)}</span></div></div>
    <div class="mt-16"><b style="font-size:13px">Pagos</b><div class="mt-8 flex gap-8" style="flex-wrap:wrap">
      ${(v.payments||[]).map(p=>`<span class="chip">${PM[p.method]||p.method}: ${money(p.amount)}</span>`).join('')}
      ${v.change?`<span class="chip">Vuelto: ${money(v.change)}</span>`:''}</div></div>`;
  const footer=[];
  const close=document.createElement('button'); close.className='btn btn-ghost'; close.textContent='Cerrar'; footer.push(close);
  if(v.status!=='anulada' && can(USER.role,'sale.void')){
    const voidBtn=document.createElement('button'); voidBtn.className='btn btn-danger'; voidBtn.textContent='Anular venta';
    voidBtn.onclick=()=>{ m.close(); doVoid(v); }; footer.push(voidBtn);
  }
  if(v.status!=='anulada' && v.status!=='devuelta' && can(USER.role,'sale.return')){
    const retBtn=document.createElement('button'); retBtn.className='btn btn-warning'; retBtn.textContent='Devolver ítems';
    retBtn.onclick=()=>{ m.close(); doReturn(v); }; footer.push(retBtn);
  }
  const m=openModal({title:'Detalle de venta',body:box,footer,width:640}); close.onclick=m.close;
}
// A4: anulación ATÓMICA e idempotente, con motivo obligatorio.
async function doVoid(v){
  const box=document.createElement('div');
  box.innerHTML=`<p style="margin-bottom:10px">Se devolverá el stock, se revertirá el efectivo en caja y la cuenta corriente. Esta acción no se puede deshacer.</p>
    <div class="field"><label>Motivo de anulación *</label><textarea class="input" id="reason" rows="2" placeholder="Ej: error de carga, devolución del cliente…"></textarea><div class="err-msg" style="color:var(--danger);font-size:12px"></div></div>`;
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const confirm=document.createElement('button'); confirm.className='btn btn-danger'; confirm.textContent='Anular venta';
  const m=openModal({title:'Anular venta #'+v.number,body:box,footer:[cancel,confirm],width:480}); cancel.onclick=m.close;
  confirm.onclick=async()=>{
    const reason=box.querySelector('#reason').value.trim();
    if(!reason){ box.querySelector('.err-msg').textContent='Ingresá un motivo de anulación'; return; }
    confirm.disabled=true;
    try{ await revertSale(v,reason); m.close(); await query(true); ok('Venta anulada'); paint(); }
    catch(ex){ err(ex.message||'No se pudo anular'); confirm.disabled=false; }
  };
}
async function revertSale(v,reason){
  const cash=(v.payments||[]).filter(p=>p.method==='efectivo').reduce((s,p)=>s+(+p.amount||0),0);
  const cc=(v.payments||[]).filter(p=>p.method==='cuenta_corriente').reduce((s,p)=>s+(+p.amount||0),0);
  // Caja abierta (consulta fuera de la transacción).
  let openCash=null;
  if(cash>0){ const regs=await DB.list('cashRegisters',{where:[['status','==','abierta']]});
    openCash=regs.find(r=>r.openedBy===USER.id)||regs[0]||null; }
  await DB.transaction(async(tx)=>{
    // LECTURAS
    const sale=await tx.get('sales',v.id);
    if(!sale) throw new Error('La venta ya no existe');
    if(sale.status==='anulada') throw new Error('La venta ya fue anulada');
    const prod={}; for(const it of (sale.items||[])){ prod[it.productId]=await tx.get('products',it.productId); }
    const cli=(cc>0&&sale.clientId)?await tx.get('clients',sale.clientId):null;
    // ESCRITURAS
    tx.update('sales',v.id,{status:'anulada',voidedAt:Date.now(),voidedBy:USER.id,voidedByName:USER.name,voidReason:reason});
    for(const it of (sale.items||[])){ const p=prod[it.productId]; if(!p) continue;
      const newStock=+(((+p.stock)||0)+it.qty).toFixed(3);
      tx.update('products',it.productId,{stock:DB.increment(it.qty),updatedAt:Date.now()});
      tx.add('stockMovements',{productId:it.productId,productName:p.name,type:'ajuste_positivo',qty:it.qty,delta:it.qty,
        stockAfter:newStock,reason:'Anulación venta #'+v.number,userId:USER.id,userName:USER.name,refId:v.id,at:Date.now()});
    }
    if(cash>0){ tx.add('cashMovements',{registerId:openCash?openCash.id:null,sinCaja:!openCash,type:'egreso',amount:cash,
      concept:'Anulación venta #'+v.number,saleId:v.id,userId:USER.id,at:Date.now()}); }
    if(cc>0 && sale.clientId){ const nb=+(((cli&&+cli.balance)||0)-cc).toFixed(2);
      tx.update('clients',sale.clientId,{balance:DB.increment(-cc),updatedAt:Date.now()});
      tx.add('accountsReceivable',{clientId:sale.clientId,type:'credito',amount:cc,balance:nb,
        concept:'Anulación venta #'+v.number,saleId:v.id,userId:USER.id,at:Date.now()}); }
    // B1: revertir el resumen diario del día de la venta y registrar la anulación.
    const dayKey=new Date(sale.at).toISOString().slice(0,10);
    const dsPatch={date:dayKey,salesCount:DB.increment(-1),total:DB.increment(-(sale.total||0)),
      cost:DB.increment(-(sale.cost||0)),profit:DB.increment(-(sale.profit||0)),
      voidedCount:DB.increment(1),voidedTotal:DB.increment(sale.total||0)};
    for(const p of (sale.payments||[])){ dsPatch['pm_'+p.method]=DB.increment(-(+p.amount||0)); }
    tx.set('dailyStats',dayKey,dsPatch);
  });
  Audit.log('sale.void','sale',{id:v.id,number:v.number,reason});
}

// C3: devolución parcial de ítems. Permite elegir cantidades por producto
// (hasta lo disponible = vendido − ya devuelto) y el medio de reintegro.
async function doReturn(v){
  // Cantidades ya devueltas por producto (devoluciones previas de esta venta).
  const prev=await DB.list('returns',{where:[['saleId','==',v.id]]}).catch(()=>[]);
  const done={}; for(const r of prev){ for(const l of (r.lines||[])){ done[l.productId]=(done[l.productId]||0)+(+l.qty||0); } }
  const items=(v.items||[]).map(it=>({...it,avail:+(((+it.qty||0)-(done[it.productId]||0))).toFixed(3)}));
  const anyAvail=items.some(it=>it.avail>0.0001);
  const hasCC=!!v.clientId;
  const box=document.createElement('div');
  if(!anyAvail){
    box.innerHTML='<p>Esta venta ya no tiene ítems disponibles para devolver.</p>';
    const c=document.createElement('button'); c.className='btn btn-ghost'; c.textContent='Cerrar';
    const mm=openModal({title:'Devolver ítems',body:box,footer:[c],width:480}); c.onclick=mm.close; return;
  }
  box.innerHTML=`<p style="margin-bottom:10px;color:var(--text-2)">Indicá cuánto devolver de cada ítem (máx. disponible). Se repone el stock y se reintegra el dinero.</p>
    <table class="table"><thead><tr><th>Producto</th><th class="ta-right">Vendido</th><th class="ta-right">Disp.</th><th class="ta-right">Devolver</th></tr></thead>
    <tbody>${items.map(it=>`<tr><td>${esc(it.name)}</td><td class="ta-right">${num(it.qty)}</td><td class="ta-right">${num(it.avail)}</td>
      <td class="ta-right"><input class="input ta-right" style="max-width:90px;margin-left:auto" type="number" min="0" step="${isDec(it.unit)?'0.001':'1'}" max="${it.avail}" value="0" data-pid="${it.productId}" ${it.avail>0.0001?'':'disabled'}></td></tr>`).join('')}</tbody></table>
    <div class="grid grid-2 mt-16">
      <div class="field" style="margin:0"><label>Medio de reintegro</label><select class="select" id="method">
        <option value="efectivo">Efectivo (caja)</option>${hasCC?'<option value="cuenta_corriente">Cuenta corriente</option>':''}</select></div>
      <div class="field" style="margin:0"><label>Motivo *</label><input class="input" id="reason" placeholder="Ej: producto fallado"></div>
    </div><div class="err-msg" style="color:var(--danger);font-size:12px;margin-top:8px"></div>`;
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const confirm=document.createElement('button'); confirm.className='btn btn-warning'; confirm.textContent='Confirmar devolución';
  const m=openModal({title:'Devolver ítems — venta #'+v.number,body:box,footer:[cancel,confirm],width:620}); cancel.onclick=m.close;
  confirm.onclick=async()=>{
    const errEl=box.querySelector('.err-msg'); errEl.textContent='';
    const lines=[...box.querySelectorAll('input[data-pid]')].map(i=>({productId:i.dataset.pid,qty:+i.value||0})).filter(l=>l.qty>0);
    if(!lines.length){ errEl.textContent='Ingresá al menos una cantidad a devolver'; return; }
    const reason=box.querySelector('#reason').value.trim();
    if(!reason){ errEl.textContent='Ingresá un motivo de devolución'; return; }
    const method=box.querySelector('#method').value;
    confirm.disabled=true;
    try{ await Sales.returnItems({saleId:v.id,lines,method,reason,user:USER}); m.close(); await query(true); ok('Devolución registrada'); paint(); }
    catch(ex){ errEl.textContent=ex.message||'No se pudo procesar'; confirm.disabled=false; }
  };
}
const DEC_UNITS=['kg','g','litro','ml','metro'];
const isDec=u=>DEC_UNITS.includes(u);
