import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { validateForm, V } from '../utils/validate.js';
import { Audit } from '../services/audit.service.js';

let USER,CATS=[],SUBS=[],PRODUCTS=[];
(async()=>{
  USER=await requireAuth('categories'); if(!USER) return;
  const view=renderShell('categories','Categor\u00edas'); view.innerHTML='<div class="loader">Cargando\u2026</div>';
  await reload(); render(view);
})();
async function reload(){ [CATS,SUBS,PRODUCTS]=await Promise.all([DB.list('categories'),DB.list('subcategories'),DB.list('products')]); }
const countProd=cid=>PRODUCTS.filter(p=>p.categoryId===cid).length;

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Categor\u00edas</h1><p>Organiz\u00e1 tus productos por rubro</p></div>
    <div class="flex gap-8"><button class="btn btn-ghost" id="btnSub">\u2795 Subcategor\u00eda</button>
    <button class="btn btn-primary" id="btnCat">\u2795 Categor\u00eda</button></div></div><div id="host" class="grid grid-3"></div>`;
  document.getElementById('btnCat').onclick=()=>openCat();
  document.getElementById('btnSub').onclick=()=>openSub();
  paint();
}
function paint(){
  const host=document.getElementById('host');
  host.innerHTML=CATS.map(c=>{const subs=SUBS.filter(s=>s.categoryId===c.id);
    return `<div class="card card-pad"><div class="flex justify-between items-center">
      <div class="flex items-center gap-12"><span style="width:34px;height:34px;border-radius:9px;background:${c.color||'#64748b'}"></span>
        <div><b>${c.name}</b><br><span style="font-size:11px;color:var(--text-3)">${countProd(c.id)} productos</span></div></div>
      <div class="flex gap-8"><button class="btn btn-sm btn-ghost" data-ec="${c.id}">\u270f\ufe0f</button>
        <button class="btn btn-sm btn-ghost" data-dc="${c.id}">\ud83d\uddd1\ufe0f</button></div></div>
      ${subs.length?`<div class="mt-8 flex gap-8" style="flex-wrap:wrap">${subs.map(s=>`<span class="chip" data-ds="${s.id}" title="Clic para eliminar">${s.name} \u2715</span>`).join('')}</div>`:''}
    </div>`;}).join('')||'<div class="empty">Sin categor\u00edas</div>';
  host.querySelectorAll('[data-ec]').forEach(b=>b.onclick=()=>openCat(CATS.find(c=>c.id===b.dataset.ec)));
  host.querySelectorAll('[data-dc]').forEach(b=>b.onclick=async()=>{const c=CATS.find(x=>x.id===b.dataset.dc);
    if(countProd(c.id))return warn('La categor\u00eda tiene productos asociados');
    if(await confirmDialog({title:'Eliminar',message:`\u00bfEliminar "${c.name}"?`,danger:true})){
      await DB.remove('categories',c.id); await Audit.log('delete','category',{id:c.id}); await reload(); ok('Eliminada'); paint();}});
  host.querySelectorAll('[data-ds]').forEach(b=>b.onclick=async()=>{
    if(await confirmDialog({title:'Eliminar subcategor\u00eda',message:'\u00bfEliminar esta subcategor\u00eda?',danger:true})){
      await DB.remove('subcategories',b.dataset.ds); await reload(); ok('Eliminada'); paint();}});
}
function openCat(c){
  const f=document.createElement('form');
  f.innerHTML=`<div class="field"><label>Nombre *</label><input class="input" name="name" value="${c?.name||''}"><div class="err-msg"></div></div>
    <div class="field"><label>Color</label><input class="input" name="color" type="color" value="${c?.color||'#4f46e5'}" style="height:44px;padding:4px"></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent=c?'Guardar':'Crear';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:c?'Editar categor\u00eda':'Nueva categor\u00eda',body:f,footer:[cancel,save],width:420}); cancel.onclick=m.close;
  save.onclick=async()=>{const data=validateForm(f,{name:[V.required]}); if(!data)return;
    try{ if(c) await DB.update('categories',c.id,{name:data.name,color:f.color.value});
      else await DB.add('categories',{name:data.name,color:f.color.value}); 
      await Audit.log(c?'update':'create','category',{name:data.name}); await reload(); m.close(); ok('Guardado'); paint();
    }catch(ex){err(ex.message);}};
}
function openSub(){
  if(!CATS.length) return warn('Primero cre\u00e1 una categor\u00eda');
  const f=document.createElement('form');
  f.innerHTML=`<div class="field"><label>Categor\u00eda</label><select class="select" name="categoryId">${CATS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
    <div class="field"><label>Nombre subcategor\u00eda *</label><input class="input" name="name"><div class="err-msg"></div></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent='Crear';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Nueva subcategor\u00eda',body:f,footer:[cancel,save],width:420}); cancel.onclick=m.close;
  save.onclick=async()=>{const data=validateForm(f,{name:[V.required]}); if(!data)return;
    await DB.add('subcategories',{name:data.name,categoryId:f.categoryId.value}); await reload(); m.close(); ok('Creada'); paint();};
}
