// Auditoría: registro de todas las acciones del sistema con filtros y detalle.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { openModal } from '../utils/modal.js';
import { ok, err } from '../utils/toast.js';
import { fdatetime } from '../utils/format.js';

let USER, LOGS=[], q='', from='', to='', act='';
(async()=>{
  USER=await requireAuth('audit'); if(!USER) return;
  const view=renderShell('audit','Auditoría'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){ LOGS=(await DB.list('auditLogs')).sort((a,b)=>b.at-a.at); }

const ACT={
  login:'Inicio de sesión',logout:'Cierre de sesión',
  'sale.create':'Venta','sale.void':'Anulación venta',
  'purchase.create':'Compra','stock.adjust':'Ajuste de stock',
  'cash.open':'Apertura de caja','cash.close':'Cierre de caja','ingreso':'Ingreso de caja','egreso':'Egreso de caja',
  'product.create':'Alta de producto','product.edit':'Edición de producto','product.delete':'Baja de producto',
  'client.create':'Alta de cliente','client.edit':'Edición de cliente','client.delete':'Baja de cliente',
  'supplier.create':'Alta de proveedor','supplier.edit':'Edición de proveedor','supplier.delete':'Baja de proveedor',
  'user.create':'Alta de usuario','user.edit':'Edición de usuario'
};
const labelAct=a=>ACT[a]||a;

function filtered(){
  const s=q.toLowerCase().trim();
  const f=from?new Date(from+'T00:00:00').getTime():0;
  const t=to?new Date(to+'T23:59:59').getTime():Infinity;
  return LOGS.filter(l=>l.at>=f&&l.at<=t&&(!act||l.action===act)&&
    (!s||(l.userName||'').toLowerCase().includes(s)||(l.action||'').toLowerCase().includes(s)||(l.entity||'').toLowerCase().includes(s)));
}

function render(view){
  const acts=[...new Set(LOGS.map(l=>l.action))].sort();
  view.innerHTML=`<div class="page-head"><div><h1>Auditoría</h1><p>Registro de acciones del sistema</p></div>
    <button class="btn btn-ghost" id="btnCsv">⬇️ Exportar (CSV)</button></div>
    <div class="card card-pad flex gap-12" style="flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="margin:0"><label>Buscar</label><input class="input" id="q" placeholder="Usuario, acción o entidad" value="${q}"></div>
      <div class="field" style="margin:0"><label>Acción</label><select class="select" id="act"><option value="">Todas</option>${acts.map(a=>`<option value="${a}" ${act===a?'selected':''}>${labelAct(a)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label>Desde</label><input class="input" id="from" type="date" value="${from}"></div>
      <div class="field" style="margin:0"><label>Hasta</label><input class="input" id="to" type="date" value="${to}"></div>
      <button class="btn btn-ghost" id="clear">Limpiar</button></div>
    <div id="sum" class="mt-16"></div>
    <div id="host" class="mt-16"></div>`;
  document.getElementById('q').oninput=e=>{q=e.target.value;paint();};
  document.getElementById('act').onchange=e=>{act=e.target.value;paint();};
  document.getElementById('from').onchange=e=>{from=e.target.value;paint();};
  document.getElementById('to').onchange=e=>{to=e.target.value;paint();};
  document.getElementById('clear').onclick=()=>{q='';from='';to='';act='';render(view);};
  document.getElementById('btnCsv').onclick=exportCsv;
  paint();
}

function paint(){
  const rows=filtered();
  document.getElementById('sum').innerHTML=`<span class="chip">${rows.length} registro${rows.length===1?'':'s'}</span>`;
  document.getElementById('host').innerHTML=`<div class="card"><table class="table">
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th></th></tr></thead>
    <tbody>${rows.slice(0,500).map((l,i)=>`<tr><td>${fdatetime(l.at)}</td><td>${l.userName||'sistema'}${l.userEmail?`<br><span style="font-size:11px;color:var(--text-3)">${l.userEmail}</span>`:''}</td>
      <td><span class="chip">${labelAct(l.action)}</span></td><td>${l.entity||'—'}</td>
      <td class="ta-right"><button class="btn btn-sm btn-ghost" data-i="${i}">👁 Detalle</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Sin registros en el período</td></tr>'}</tbody></table></div>`;
  const shown=rows.slice(0,500);
  document.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>detail(shown[+b.dataset.i]));
}

function detail(l){
  const box=document.createElement('div');
  box.innerHTML=`<div style="font-size:14px;line-height:2">
    <div class="flex justify-between"><span style="color:var(--text-3)">Fecha</span><b>${fdatetime(l.at)}</b></div>
    <div class="flex justify-between"><span style="color:var(--text-3)">Usuario</span><b>${l.userName||'sistema'}</b></div>
    <div class="flex justify-between"><span style="color:var(--text-3)">Email</span><b>${l.userEmail||'—'}</b></div>
    <div class="flex justify-between"><span style="color:var(--text-3)">Acción</span><b>${labelAct(l.action)}</b></div>
    <div class="flex justify-between"><span style="color:var(--text-3)">Entidad</span><b>${l.entity||'—'}</b></div></div>
    <div class="mt-16"><b style="font-size:13px">Detalle</b>
    <pre style="background:var(--surface-2);border-radius:10px;padding:12px;margin-top:6px;font-size:12px;overflow:auto;max-height:260px;white-space:pre-wrap">${escapeHtml(JSON.stringify(l.detail||{},null,2))}</pre></div>`;
  const close=document.createElement('button'); close.className='btn btn-ghost'; close.textContent='Cerrar';
  const m=openModal({title:'Detalle de auditoría',body:box,footer:[close],width:520}); close.onclick=m.close;
}
function escapeHtml(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function exportCsv(){
  const rows=filtered();
  if(!rows.length) return err('No hay registros en el período');
  const esc=s=>`"${String(s==null?'':s).replace(/"/g,'""')}"`;
  const head=['Fecha','Usuario','Email','Accion','Entidad','Detalle'];
  const lines=[head.join(',')];
  rows.forEach(l=>lines.push([new Date(l.at).toLocaleString('es-AR'),l.userName||'sistema',l.userEmail||'',labelAct(l.action),l.entity||'',JSON.stringify(l.detail||{})].map(esc).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`auditoria_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  ok('CSV exportado');
}
