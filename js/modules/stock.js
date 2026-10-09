// Control de stock: existencias, alertas de mínimo, ajustes e historial de movimientos.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Products } from '../services/products.service.js';
import { openModal } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { can } from '../services/permissions.js';
import { money, num, fdatetime } from '../utils/format.js';
import { esc } from '../utils/escape.js';

let USER, PRODS=[], MOVS=[], tab='stock', q='';
(async()=>{
  USER=await requireAuth('stock'); if(!USER) return;
  const view=renderShell('stock','Control de Stock'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){
  // B1: historial acotado a los últimos 500 movimientos (orden desc por fecha).
  [PRODS,MOVS]=await Promise.all([DB.list('products',{orderBy:['name','asc']}),DB.list('stockMovements',{orderBy:['at','desc'],limit:500})]);
  MOVS=MOVS.sort((a,b)=>b.at-a.at);
}
const low=p=>(p.stock||0)<=(p.stockMin||0);
const MTYPE={venta:'Venta',ajuste_positivo:'Ajuste +',ajuste_negativo:'Ajuste -',compra:'Compra',anulacion_compra:'Anul. compra'};

function render(view){
  const alerts=PRODS.filter(low).length;
  view.innerHTML=`<div class="page-head"><div><h1>Control de Stock</h1><p>Existencias, alertas y movimientos</p></div></div>
    <div class="tabs"><button class="tab ${tab==='stock'?'active':''}" data-t="stock">📦 Existencias</button>
      <button class="tab ${tab==='alerts'?'active':''}" data-t="alerts">⚠️ Alertas ${alerts?`(${alerts})`:''}</button>
      <button class="tab ${tab==='movs'?'active':''}" data-t="movs">🔄 Movimientos</button></div>
    <div class="card card-pad mt-16"><input class="input" id="q" placeholder="🔍 Buscar producto…" value="${esc(q)}"></div>
    <div id="host" class="mt-16"></div>`;
  view.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render(view);});
  document.getElementById('q').oninput=e=>{q=e.target.value;paint();};
  paint();
}
function paint(){
  const s=q.toLowerCase().trim();
  const host=document.getElementById('host');
  if(tab==='movs'){
    const rows=MOVS.filter(m=>!s||(m.productName||'').toLowerCase().includes(s));
    host.innerHTML=`<div class="card"><table class="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="ta-right">Cant.</th><th class="ta-right">Stock resultante</th><th>Motivo</th></tr></thead>
      <tbody>${rows.slice(0,300).map(m=>`<tr><td>${fdatetime(m.at)}</td><td>${esc(m.productName||'—')}</td>
        <td><span class="chip">${esc(MTYPE[m.type]||m.type)}</span></td>
        <td class="ta-right" style="color:${m.delta<0?'var(--danger)':'var(--success)'}">${m.delta<0?'':'+'}${num(m.delta)}</td>
        <td class="ta-right">${num(m.stockAfter)}</td><td>${esc(m.reason||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Sin movimientos</td></tr>'}</tbody></table></div>`;
    return;
  }
  let list=PRODS.filter(p=>!s||p.name.toLowerCase().includes(s)||(p.code||'').toLowerCase().includes(s));
  if(tab==='alerts') list=list.filter(low);
  host.innerHTML=`<div class="card"><table class="table"><thead><tr><th>Producto</th><th>Código</th><th class="ta-right">Stock</th><th class="ta-right">Mín.</th><th>Estado</th><th></th></tr></thead>
    <tbody>${list.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.code||'—')}</td>
      <td class="ta-right"><b>${num(p.stock||0)}</b> ${esc(p.unit||'')}</td><td class="ta-right">${num(p.stockMin||0)}</td>
      <td>${low(p)?'<span class="badge badge-danger">Bajo mínimo</span>':'<span class="badge badge-success">OK</span>'}</td>
      <td class="ta-right">${can(USER.role,'stock.adjust')?`<button class="btn btn-sm btn-ghost" data-adj="${p.id}">⚙️ Ajustar</button>`:''}</td></tr>`).join('')||`<tr><td colspan="6" class="empty">${tab==='alerts'?'No hay productos bajo el mínimo 🎉':'Sin productos'}</td></tr>`}</tbody></table></div>`;
  host.querySelectorAll('[data-adj]').forEach(b=>b.onclick=()=>openAdjust(PRODS.find(p=>p.id===b.dataset.adj)));
}
function openAdjust(p){
  const f=document.createElement('form');
  f.innerHTML=`<p style="color:var(--text-2);margin-bottom:12px">Stock actual de <b>${esc(p.name)}</b>: <b>${num(p.stock||0)} ${esc(p.unit||'')}</b></p>
    <div class="field"><label>Tipo de ajuste</label><select class="select" name="type">
      <option value="ajuste_positivo">Ingreso (+) — sumar stock</option>
      <option value="ajuste_negativo">Egreso (−) — restar stock</option></select></div>
    <div class="field"><label>Cantidad *</label><input class="input" name="qty" type="number" step="0.001" value=""></div>
    <div class="field"><label>Motivo *</label><input class="input" name="reason" placeholder="Ej: rotura, recuento, merma…"></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent='Aplicar ajuste';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Ajuste de stock',body:f,footer:[cancel,save],width:460}); cancel.onclick=m.close;
  save.onclick=async()=>{ const qty=+f.qty.value; const reason=f.reason.value.trim(); const type=f.type.value;
    if(!qty||qty<=0) return warn('Cantidad inválida'); if(!reason) return warn('Ingresá un motivo');
    if(type==='ajuste_negativo'&&qty>(p.stock||0)) return warn('No podés restar más stock del disponible');
    try{ await Products.moveStock({productId:p.id,type,qty,reason,userId:USER.id,userName:USER.name});
      await Audit.log('stock.adjust','product',{id:p.id,type,qty}); await reload(); m.close(); ok('Stock ajustado'); paint();
    }catch(ex){ err(ex.message); }};
}
