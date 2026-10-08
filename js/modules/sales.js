// Ventas: historial, detalle de comprobante y anulación (revierte stock, caja y CC).
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Products } from '../services/products.service.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { can } from '../services/permissions.js';
import { money, num, fdatetime, fdate } from '../utils/format.js';

let USER, LIST=[], q='', from='', to='';
(async()=>{
  USER=await requireAuth('sales'); if(!USER) return;
  const view=renderShell('sales','Ventas'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){ LIST=(await DB.list('sales')).sort((a,b)=>b.at-a.at); }
function filtered(){
  const s=q.toLowerCase().trim();
  const f=from?new Date(from+'T00:00:00').getTime():0;
  const t=to?new Date(to+'T23:59:59').getTime():Infinity;
  return LIST.filter(v=>v.at>=f&&v.at<=t&&(!s||String(v.number).includes(s)||(v.clientName||'').toLowerCase().includes(s)));
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
  document.getElementById('from').onchange=e=>{from=e.target.value;paint();};
  document.getElementById('to').onchange=e=>{to=e.target.value;paint();};
  document.getElementById('clear').onclick=()=>{q='';from='';to='';render(view);};
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
      <td><b>#${v.number}</b></td><td>${fdatetime(v.at)}</td><td>${v.clientName||'Consumidor Final'}</td><td>${v.userName||'—'}</td>
      <td class="ta-right"><b>${money(v.total)}</b></td>
      <td>${v.status==='anulada'?'<span class="badge badge-danger">Anulada</span>':'<span class="badge badge-success">Completada</span>'}</td>
      <td class="ta-right"><button class="btn btn-sm btn-ghost" data-v="${v.id}">👁 Ver</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Sin ventas en el período</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>detail(LIST.find(v=>v.id===b.dataset.v)));
}
const sc=(l,v)=>`<div class="card card-pad"><span style="font-size:12px;color:var(--text-3)">${l}</span><h3 style="margin-top:6px">${v}</h3></div>`;
const PM={efectivo:'Efectivo',debito:'T. débito',credito:'T. crédito',transferencia:'Transferencia',cuenta_corriente:'Cuenta corriente',otros:'Otros'};

function detail(v){
  const box=document.createElement('div');
  box.innerHTML=`<div class="flex justify-between" style="margin-bottom:10px">
    <div><b style="font-size:18px">Comprobante #${v.number}</b><br><span style="font-size:12px;color:var(--text-3)">${fdatetime(v.at)} · ${v.userName||''}</span></div>
    <div class="ta-right"><span style="font-size:12px;color:var(--text-3)">Cliente</span><br><b>${v.clientName||'Consumidor Final'}</b></div></div>
    <table class="table"><thead><tr><th>Producto</th><th class="ta-right">Cant.</th><th class="ta-right">Precio</th><th class="ta-right">Subtotal</th></tr></thead>
    <tbody>${(v.items||[]).map(it=>`<tr><td>${it.name}</td><td class="ta-right">${num(it.qty)} ${it.unit||''}</td><td class="ta-right">${money(it.price)}</td><td class="ta-right">${money(it.price*it.qty-(it.discount||0))}</td></tr>`).join('')}</tbody></table>
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
  const m=openModal({title:'Detalle de venta',body:box,footer,width:640}); close.onclick=m.close;
}
async function doVoid(v){
  if(!await confirmDialog({title:'Anular venta #'+v.number,message:'Se devolverá el stock, se revertirá el efectivo en caja y la cuenta corriente. Esta acción no se puede deshacer.',danger:true,confirmText:'Anular'})) return;
  try{
    await DB.update('sales',v.id,{status:'anulada',voidedAt:Date.now(),voidedBy:USER.id,voidedByName:USER.name});
    for(const it of (v.items||[])){
      try{ await Products.moveStock({productId:it.productId,type:'ajuste_positivo',qty:it.qty,reason:'Anulación venta #'+v.number,userId:USER.id,userName:USER.name,refId:v.id}); }catch(e){ console.warn(e); }
    }
    const cash=(v.payments||[]).filter(p=>p.method==='efectivo').reduce((s,p)=>s+(+p.amount||0),0);
    if(cash>0){ const open=(await DB.list('cashRegisters',{where:[['status','==','abierta']]}))[0];
      if(open) await DB.add('cashMovements',{registerId:open.id,type:'egreso',amount:cash,concept:'Anulación venta #'+v.number,saleId:v.id,userId:USER.id,at:Date.now()}); }
    const cc=(v.payments||[]).filter(p=>p.method==='cuenta_corriente').reduce((s,p)=>s+(+p.amount||0),0);
    if(cc>0 && v.clientId){ const c=await DB.get('clients',v.clientId);
      const nb=+(((c?.balance||0)-cc)).toFixed(2); await DB.update('clients',v.clientId,{balance:nb});
      await DB.add('accountsReceivable',{clientId:v.clientId,type:'credito',amount:cc,balance:nb,concept:'Anulación venta #'+v.number,saleId:v.id,userId:USER.id,at:Date.now()}); }
    await Audit.log('sale.void','sale',{id:v.id,number:v.number}); await reload(); ok('Venta anulada'); paint();
  }catch(ex){ err(ex.message||'No se pudo anular'); }
}
