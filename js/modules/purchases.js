// Compras a proveedores: registra la compra, actualiza stock/costo y la deuda.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Products } from '../services/products.service.js';
import { openModal } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { money, num, fdatetime } from '../utils/format.js';

let USER, LIST=[], SUPS=[], PRODS=[];
(async()=>{
  USER=await requireAuth('purchases'); if(!USER) return;
  const view=renderShell('purchases','Compras'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){
  [LIST,SUPS,PRODS]=await Promise.all([DB.list('purchases'),DB.list('suppliers',{orderBy:['tradeName','asc']}),DB.list('products',{orderBy:['name','asc']})]);
  LIST=LIST.sort((a,b)=>b.at-a.at);
}

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Compras</h1><p>Compras a proveedores e ingreso de mercadería</p></div>
    <button class="btn btn-primary" id="btnNew">➕ Nueva compra</button></div>
    <div id="host" class="mt-16"></div>`;
  document.getElementById('btnNew').onclick=newPurchase;
  paint();
}
function paint(){
  document.getElementById('host').innerHTML=`<div class="card"><table class="table">
    <thead><tr><th>Nº</th><th>Fecha</th><th>Proveedor</th><th class="ta-right">Total</th><th class="ta-right">Deuda</th><th></th></tr></thead>
    <tbody>${LIST.map(p=>`<tr><td><b>#${p.number}</b></td><td>${fdatetime(p.at)}</td><td>${p.supplierName||'—'}</td>
      <td class="ta-right"><b>${money(p.total)}</b></td>
      <td class="ta-right" style="color:${(p.debt||0)>0?'var(--danger)':'var(--success)'}">${money(p.debt||0)}</td>
      <td class="ta-right"><button class="btn btn-sm btn-ghost" data-v="${p.id}">👁 Ver</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Sin compras registradas</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>detail(LIST.find(p=>p.id===b.dataset.v)));
}

let cart=[];
function newPurchase(){
  if(!SUPS.length) return warn('Primero creá un proveedor');
  if(!PRODS.length) return warn('Primero creá productos');
  cart=[];
  const box=document.createElement('div');
  box.innerHTML=`<div class="grid grid-2">
    <div class="field"><label>Proveedor *</label><select class="select" id="sup">${SUPS.map(s=>`<option value="${s.id}">${s.tradeName||s.legalName}</option>`).join('')}</select></div>
    <div class="field"><label>Nro. factura/remito</label><input class="input" id="inv" placeholder="opcional"></div></div>
    <div class="field"><label>Agregar producto</label><div class="flex gap-8">
      <select class="select" id="prod" style="flex:1">${PRODS.map(p=>`<option value="${p.id}">${p.name} (stock ${num(p.stock||0)})</option>`).join('')}</select>
      <button type="button" class="btn btn-ghost" id="add">➕</button></div></div>
    <div id="lines" class="mt-8"></div>
    <div style="max-width:280px;margin-left:auto;margin-top:10px">
      <div class="flex justify-between" style="font-size:18px;font-weight:800"><span>TOTAL</span><span id="tot">${money(0)}</span></div>
      <div class="field mt-8"><label>Pagado ahora</label><input class="input" id="paid" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Medio de pago</label><select class="select" id="method"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="cuenta_corriente">Queda a cuenta (deuda)</option></select></div>
    </div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent='Registrar compra';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Nueva compra',body:box,footer:[cancel,save],width:720}); cancel.onclick=m.close;
  const paintLines=()=>{
    const total=cart.reduce((s,l)=>s+l.qty*l.cost,0);
    box.querySelector('#lines').innerHTML=cart.length?`<table class="table"><thead><tr><th>Producto</th><th>Cant.</th><th>Costo unit.</th><th class="ta-right">Subtotal</th><th></th></tr></thead>
      <tbody>${cart.map((l,i)=>`<tr><td>${l.name}</td>
        <td><input class="input input-sm" data-q="${i}" type="number" step="0.001" value="${l.qty}" style="width:80px"></td>
        <td><input class="input input-sm" data-c="${i}" type="number" step="0.01" value="${l.cost}" style="width:100px"></td>
        <td class="ta-right">${money(l.qty*l.cost)}</td>
        <td class="ta-right"><button type="button" class="btn btn-sm btn-ghost" data-rm="${i}">🗑️</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Agregá productos a la compra</p>';
    box.querySelector('#tot').textContent=money(total);
    const paidEl=box.querySelector('#paid'); if(box.querySelector('#method').value!=='cuenta_corriente' && +paidEl.value===0) paidEl.value=total.toFixed(2);
    box.querySelectorAll('[data-q]').forEach(inp=>inp.oninput=e=>{cart[+e.target.dataset.q].qty=+e.target.value||0;paintLines();});
    box.querySelectorAll('[data-c]').forEach(inp=>inp.oninput=e=>{cart[+e.target.dataset.c].cost=+e.target.value||0;paintLines();});
    box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{cart.splice(+b.dataset.rm,1);paintLines();});
  };
  box.querySelector('#add').onclick=()=>{ const p=PRODS.find(x=>x.id===box.querySelector('#prod').value); if(!p) return;
    const ex=cart.find(l=>l.productId===p.id); if(ex) ex.qty++; else cart.push({productId:p.id,name:p.name,qty:1,cost:p.cost||0}); paintLines(); };
  box.querySelector('#method').onchange=paintLines;
  paintLines();
  save.onclick=async()=>{
    if(!cart.length) return warn('La compra no tiene productos');
    if(cart.some(l=>l.qty<=0||l.cost<0)) return warn('Revisá cantidades y costos');
    save.disabled=true;
    try{ await confirmPurchase({supplierId:box.querySelector('#sup').value,invoice:box.querySelector('#inv').value.trim(),
      paid:+box.querySelector('#paid').value||0,method:box.querySelector('#method').value});
      m.close(); await reload(); ok('Compra registrada'); paint();
    }catch(ex){ err(ex.message||'No se pudo registrar'); save.disabled=false; }
  };
}
async function nextNumber(){ return LIST.reduce((m,p)=>Math.max(m,p.number||0),100)+1; }
async function confirmPurchase({supplierId,invoice,paid,method}){
  const sup=SUPS.find(s=>s.id===supplierId);
  const items=cart.map(l=>({productId:l.productId,name:l.name,qty:l.qty,cost:l.cost,subtotal:+(l.qty*l.cost).toFixed(2)}));
  const total=+items.reduce((s,i)=>s+i.subtotal,0).toFixed(2);
  const paidReal=method==='cuenta_corriente'?Math.min(paid,total):Math.min(paid,total);
  const debt=+(total-paidReal).toFixed(2);
  const number=await nextNumber();
  const purchase=await DB.add('purchases',{number,supplierId,supplierName:sup?.tradeName||sup?.legalName||'—',invoice,
    items,total,paid:paidReal,debt,method,status:'completada',userId:USER.id,userName:USER.name,at:Date.now()});
  for(const it of items){
    try{ await Products.moveStock({productId:it.productId,type:'compra',qty:it.qty,reason:'Compra #'+number,userId:USER.id,userName:USER.name,refId:purchase.id});
      await DB.update('products',it.productId,{cost:it.cost}); }catch(e){ console.warn(e); }
  }
  if(method!=='cuenta_corriente' && paidReal>0){
    const open=(await DB.list('cashRegisters',{where:[['status','==','abierta']]}))[0];
    if(open) await DB.add('cashMovements',{registerId:open.id,type:'egreso',amount:paidReal,concept:'Compra #'+number+' '+(sup?.tradeName||''),userId:USER.id,at:Date.now()});
  }
  if(debt>0) await DB.add('accountsPayable',{supplierId,type:'debito',amount:debt,concept:'Compra #'+number,purchaseId:purchase.id,userId:USER.id,at:Date.now()});
  await Audit.log('purchase','purchase',{id:purchase.id,number,total});
  return purchase;
}
const PM={efectivo:'Efectivo',transferencia:'Transferencia',cuenta_corriente:'Cuenta corriente'};
function detail(p){
  const box=document.createElement('div');
  box.innerHTML=`<div class="flex justify-between" style="margin-bottom:10px">
    <div><b style="font-size:18px">Compra #${p.number}</b><br><span style="font-size:12px;color:var(--text-3)">${fdatetime(p.at)} · ${p.userName||''}</span></div>
    <div class="ta-right"><span style="font-size:12px;color:var(--text-3)">Proveedor</span><br><b>${p.supplierName||'—'}</b></div></div>
    ${p.invoice?`<p style="font-size:12px;color:var(--text-3)">Factura/remito: ${p.invoice}</p>`:''}
    <table class="table"><thead><tr><th>Producto</th><th class="ta-right">Cant.</th><th class="ta-right">Costo</th><th class="ta-right">Subtotal</th></tr></thead>
    <tbody>${(p.items||[]).map(it=>`<tr><td>${it.name}</td><td class="ta-right">${num(it.qty)}</td><td class="ta-right">${money(it.cost)}</td><td class="ta-right">${money(it.subtotal)}</td></tr>`).join('')}</tbody></table>
    <div style="max-width:260px;margin-left:auto;margin-top:12px;font-size:14px">
      <div class="flex justify-between" style="font-size:18px;font-weight:800"><span>TOTAL</span><span>${money(p.total)}</span></div>
      <div class="flex justify-between"><span>Pagado (${PM[p.method]||p.method})</span><span>${money(p.paid||0)}</span></div>
      <div class="flex justify-between" style="color:${(p.debt||0)>0?'var(--danger)':'var(--success)'}"><span>Deuda</span><span>${money(p.debt||0)}</span></div></div>`;
  const close=document.createElement('button'); close.className='btn btn-ghost'; close.textContent='Cerrar';
  const m=openModal({title:'Detalle de compra',body:box,footer:[close],width:640}); close.onclick=m.close;
}
