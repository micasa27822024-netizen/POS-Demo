// Proveedores: ABM + resumen de compras y deuda (cuenta corriente de proveedor).
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { validateForm, V } from '../utils/validate.js';
import { Audit } from '../services/audit.service.js';
import { can } from '../services/permissions.js';
import { money, fdatetime } from '../utils/format.js';
import { esc } from '../utils/escape.js';
import { assertUnique } from '../utils/unique.js';

let USER, LIST=[], PURCH=[], q='';
(async()=>{
  USER=await requireAuth('suppliers'); if(!USER) return;
  const view=renderShell('suppliers','Proveedores'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){ [LIST,PURCH]=await Promise.all([DB.list('suppliers',{orderBy:['tradeName','asc']}),DB.list('purchases')]); }
const name=s=>s.tradeName||s.legalName||'—';
const deuda=sid=>PURCH.filter(p=>p.supplierId===sid&&p.status!=='anulada').reduce((t,p)=>t+(p.debt||0),0);

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Proveedores</h1><p>Proveedores y compras</p></div>
    <button class="btn btn-primary" id="btnNew">➕ Nuevo proveedor</button></div>
    <div class="card card-pad"><input class="input" id="q" placeholder="🔍 Buscar por nombre o CUIT…" value="${q}"></div>
    <div id="host" class="mt-16"></div>`;
  document.getElementById('q').oninput=e=>{q=e.target.value;paint();};
  document.getElementById('btnNew').onclick=()=>openForm();
  paint();
}
function paint(){
  const s=q.toLowerCase().trim();
  const rows=LIST.filter(x=>!s||name(x).toLowerCase().includes(s)||(x.cuit||'').includes(s));
  document.getElementById('host').innerHTML=`<div class="card"><table class="table">
    <thead><tr><th>Proveedor</th><th>CUIT</th><th>Teléfono</th><th class="ta-right">Compras</th><th class="ta-right">Deuda</th><th></th></tr></thead>
    <tbody>${rows.map(x=>{const d=deuda(x.id); const n=PURCH.filter(p=>p.supplierId===x.id).length;
      return `<tr><td><b>${esc(name(x))}</b><br><span style="font-size:11px;color:var(--text-3)">${esc(x.legalName||'')}</span></td>
      <td>${esc(x.cuit||'—')}</td><td>${esc(x.phone||'—')}</td><td class="ta-right">${n}</td>
      <td class="ta-right" style="color:${d>0?'var(--danger)':'var(--text-2)'};font-weight:700">${money(d)}</td>
      <td class="ta-right"><div class="flex gap-8 justify-end">
        <button class="btn btn-sm btn-ghost" data-ed="${x.id}" title="Editar">✏️</button>
        ${can(USER.role,'*')?`<button class="btn btn-sm btn-ghost" data-dl="${x.id}" title="Eliminar">🗑️</button>`:''}
      </div></td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">Sin proveedores</td></tr>'}</tbody></table></div>`;
  const H=document.getElementById('host');
  H.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>openForm(LIST.find(x=>x.id===b.dataset.ed)));
  H.querySelectorAll('[data-dl]').forEach(b=>b.onclick=async()=>{const x=LIST.find(y=>y.id===b.dataset.dl);
    if(PURCH.some(p=>p.supplierId===x.id)) return warn('No se puede eliminar: tiene compras registradas');
    if(await confirmDialog({title:'Eliminar proveedor',message:`¿Eliminar "${name(x)}"?`,danger:true})){
      await DB.remove('suppliers',x.id); await Audit.log('delete','supplier',{id:x.id}); await reload(); ok('Eliminado'); paint();}});
}
function openForm(x){
  const f=document.createElement('form');
  f.innerHTML=`<div class="grid grid-2">
    <div class="field"><label>Nombre comercial *</label><input class="input" name="tradeName" value="${esc(x?.tradeName||'')}"><div class="err-msg"></div></div>
    <div class="field"><label>Razón social</label><input class="input" name="legalName" value="${esc(x?.legalName||'')}"></div>
    <div class="field"><label>CUIT</label><input class="input" name="cuit" value="${esc(x?.cuit||'')}"></div>
    <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(x?.phone||'')}"></div>
    <div class="field"><label>Email</label><input class="input" name="email" value="${esc(x?.email||'')}"><div class="err-msg"></div></div>
    <div class="field"><label>Dirección</label><input class="input" name="address" value="${esc(x?.address||'')}"></div>
    <div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(x?.city||'')}"></div>
    <div class="field"><label>Provincia</label><input class="input" name="province" value="${esc(x?.province||'')}"></div>
  </div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent=x?'Guardar':'Crear';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:x?'Editar proveedor':'Nuevo proveedor',body:f,footer:[cancel,save],width:640}); cancel.onclick=m.close;
  save.onclick=async()=>{const data=validateForm(f,{tradeName:[V.required],email:[V.email]}); if(!data) return warn('Revisá los campos');
    const payload={tradeName:data.tradeName,legalName:f.legalName.value.trim(),cuit:f.cuit.value.trim(),phone:f.phone.value.trim(),
      email:f.email.value.trim(),address:f.address.value.trim(),city:f.city.value.trim(),province:f.province.value.trim(),
      active:x?x.active!==false:true};
    try{
      // Unicidad: CUIT y email (email sin distinguir mayús/minús).
      await assertUnique('suppliers','cuit',payload.cuit,x?.id,'El CUIT');
      await assertUnique('suppliers','email',payload.email,x?.id,'El email',true);
      if(x){ await DB.update('suppliers',x.id,payload); await Audit.log('update','supplier',{id:x.id}); }
      else { payload.createdAt=Date.now(); const d=await DB.add('suppliers',payload); await Audit.log('create','supplier',{id:d.id}); }
      await reload(); m.close(); ok('Guardado'); paint();
    }catch(ex){ err(ex.message||'No se pudo guardar'); }};
}
