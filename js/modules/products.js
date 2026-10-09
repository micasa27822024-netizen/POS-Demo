import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Products, UNITS, margin } from '../services/products.service.js';
import { Storage } from '../services/storage.service.js';
import { money, num, pct } from '../utils/format.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { validateForm, V } from '../utils/validate.js';
import { can } from '../services/permissions.js';
import { exportCSV, parseCSV } from '../utils/csv.js';
import { esc } from '../utils/escape.js';

let USER,PRODUCTS=[],CATS=[],SUBS=[],SUPS=[];
let filter={q:'',cat:'',status:'all'};

(async()=>{
  USER=await requireAuth('products'); if(!USER) return;
  const view=renderShell('products','Productos');
  view.innerHTML='<div class="loader">Cargando…</div>';
  await reload();
  render(view);
  const gs=document.getElementById('globalSearch');
  if(gs) gs.addEventListener('input',e=>{filter.q=e.target.value.toLowerCase();paint();});
})();

async function reload(){
  [PRODUCTS,CATS,SUBS,SUPS]=await Promise.all([
    DB.list('products'),DB.list('categories'),DB.list('subcategories'),DB.list('suppliers')]);
}
const catName=id=>CATS.find(c=>c.id===id)?.name||'—';

function render(view){
  const editable=can(USER.role,'product.edit');
  view.innerHTML=`
   <div class="page-head"><div><h1>Productos</h1><p>Gestión de artículos, precios y stock</p></div>
     <div class="flex gap-8">
       <button class="btn btn-ghost" id="btnImport">⬆️ Importar</button>
       <button class="btn btn-ghost" id="btnExport">⬇️ Exportar</button>
       ${can(USER.role,'*')?'<button class="btn btn-ghost" id="btnRecalc" title="Recalcula las alertas de reposición para todo el catálogo">🔄 Recalcular reposición</button>':''}
       ${editable?'<button class="btn btn-primary" id="btnNew">➕ Nuevo producto</button>':''}
     </div></div>
   <div class="toolbar">
     <input class="input" id="fq" placeholder="🔍 Buscar por nombre, código o barras" style="min-width:260px">
     <select class="select" id="fcat"><option value="">Todas las categorías</option>
       ${CATS.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
     <select class="select" id="fstatus"><option value="all">Todos</option><option value="active">Activos</option>
       <option value="inactive">Inactivos</option><option value="low">Stock bajo</option><option value="out">Sin stock</option></select>
   </div>
   <div id="tblHost"></div>`;
  if(editable) document.getElementById('btnNew').onclick=()=>openForm();
  document.getElementById('btnExport').onclick=doExport;
  document.getElementById('btnImport').onclick=doImport;
  const btnRecalc=document.getElementById('btnRecalc');
  if(btnRecalc) btnRecalc.onclick=doRecalc;
  const fq=document.getElementById('fq');
  fq.oninput=e=>{filter.q=e.target.value.toLowerCase();paint();};
  document.getElementById('fcat').onchange=e=>{filter.cat=e.target.value;paint();};
  document.getElementById('fstatus').onchange=e=>{filter.status=e.target.value;paint();};
  paint();
}

function applyFilter(){
  return PRODUCTS.filter(p=>{
    if(filter.q){const q=filter.q;if(!((p.name||'').toLowerCase().includes(q)||(p.code||'').toLowerCase().includes(q)||(p.barcode||'').includes(q)))return false;}
    if(filter.cat&&p.categoryId!==filter.cat)return false;
    if(filter.status==='active'&&p.active===false)return false;
    if(filter.status==='inactive'&&p.active!==false)return false;
    if(filter.status==='low'&&!(p.stock>0&&p.stock<=p.stockMin))return false;
    if(filter.status==='out'&&(p.stock||0)>0)return false;
    return true;
  }).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
}

function stockBadge(p){
  if((p.stock||0)<=0)return '<span class="badge badge-danger">Sin stock</span>';
  if(p.stock<=p.stockMin)return `<span class="badge badge-warn">Bajo (${num(p.stock)})</span>`;
  return `<span class="badge badge-success">${num(p.stock)}</span>`;
}

function paint(){
  const host=document.getElementById('tblHost'); if(!host) return;
  const rows=applyFilter();
  const editable=can(USER.role,'product.edit');
  const canDel=can(USER.role,'product.delete');
  if(!rows.length){ host.innerHTML='<div class="card"><div class="empty"><div class="big">📦</div>No se encontraron productos</div></div>'; return; }
  host.innerHTML=`<div class="table-wrap"><table class="tbl"><thead><tr>
    <th>Producto</th><th>Código</th><th>Categoría</th><th>Stock</th>
    <th class="text-right">Costo</th><th class="text-right">Venta</th><th class="text-right">Margen</th>
    <th>Estado</th><th></th></tr></thead><tbody>
    ${rows.map(p=>{const m=margin(p.cost,p.price);
      const img=p.image?`<img src="${esc(p.image)}" style="width:38px;height:38px;border-radius:8px;object-fit:cover">`
        :`<div style="width:38px;height:38px;border-radius:8px;background:var(--surface-3);display:grid;place-items:center">📦</div>`;
      return `<tr>
      <td><div class="flex items-center gap-12">${img}<div><b>${esc(p.name)}</b><br><span style="font-size:11px;color:var(--text-3)">${esc(p.brand||'')} · ${esc(p.unit)}</span></div></div></td>
      <td><span class="text-muted" style="font-size:12px">${esc(p.code||'—')}</span><br><span style="font-size:11px;color:var(--text-3)">${esc(p.barcode||'')}</span></td>
      <td>${esc(catName(p.categoryId))}</td>
      <td>${stockBadge(p)}</td>
      <td class="text-right">${money(p.cost)}</td>
      <td class="text-right"><b>${money(p.price)}</b></td>
      <td class="text-right text-profit">${pct(m.marginPct)}</td>
      <td>${p.active===false?'<span class="badge badge-neutral">Inactivo</span>':'<span class="badge badge-success">Activo</span>'}</td>
      <td><div class="flex gap-8">
        ${editable?`<button class="btn btn-sm btn-ghost" data-edit="${p.id}" title="Editar">✏️</button>`:''}
        ${editable?`<button class="btn btn-sm btn-ghost" data-dup="${p.id}" title="Duplicar">⎘</button>`:''}
        ${editable?`<button class="btn btn-sm btn-ghost" data-tog="${p.id}" title="Activar/Desactivar">${p.active===false?'✔':'⏸'}</button>`:''}
      </div></td></tr>`;}).join('')}
    </tbody></table></div>
    <p class="text-muted mt-8" style="font-size:12px">${rows.length} producto(s)</p>`;
  host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openForm(PRODUCTS.find(p=>p.id===b.dataset.edit)));
  host.querySelectorAll('[data-dup]').forEach(b=>b.onclick=async()=>{await Products.duplicate(b.dataset.dup);await reload();ok('Producto duplicado');paint();});
  host.querySelectorAll('[data-tog]').forEach(b=>b.onclick=async()=>{const p=PRODUCTS.find(x=>x.id===b.dataset.tog);await Products.setActive(p.id,p.active===false);await reload();ok('Estado actualizado');paint();});
}

function openForm(p){
  const isEdit=!!p; const canPrice=can(USER.role,'price.edit');
  const f=document.createElement('form');
  const subOpts=sid=>SUBS.map(s=>`<option value="${esc(s.id)}" ${p&&p.subcategoryId===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
  f.innerHTML=`
   <div class="flex gap-16" style="align-items:flex-start">
     <div style="flex:none;text-align:center">
       <div id="imgPrev" style="width:110px;height:110px;border-radius:12px;background:var(--surface-3);display:grid;place-items:center;overflow:hidden;font-size:30px">${p?.image?`<img src="${esc(p.image)}" style="width:100%;height:100%;object-fit:cover">`:'📦'}</div>
       <label class="btn btn-sm btn-ghost mt-8" style="display:inline-flex">Imagen<input type="file" name="image" accept="image/*" hidden></label>
     </div>
     <div style="flex:1">
       <div class="grid grid-2">
         <div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(p?.name||'')}"><div class="err-msg"></div></div>
         <div class="field"><label>Marca</label><input class="input" name="brand" value="${esc(p?.brand||'')}"></div>
       </div>
       <div class="grid grid-2">
         <div class="field"><label>Código interno</label><input class="input" name="code" value="${esc(p?.code||'')}"></div>
         <div class="field"><label>Código de barras</label><input class="input" name="barcode" value="${esc(p?.barcode||'')}"></div>
       </div>
     </div>
   </div>
   <div class="field"><label>Descripción</label><input class="input" name="description" value="${esc(p?.description||'')}"></div>
   <div class="grid grid-3">
     <div class="field"><label>Categoría</label><select class="select" name="categoryId">
       <option value="">—</option>${CATS.map(c=>`<option value="${esc(c.id)}" ${p&&p.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
     <div class="field"><label>Subcategoría</label><select class="select" name="subcategoryId"><option value="">—</option>${subOpts()}</select></div>
     <div class="field"><label>Unidad</label><select class="select" name="unit">${UNITS.map(u=>`<option value="${u.v}" ${p&&p.unit===u.v?'selected':''}>${u.l}</option>`).join('')}</select></div>
   </div>
   <div class="grid grid-3">
     <div class="field"><label>Precio costo *</label><input class="input" name="cost" type="number" step="0.01" value="${p?.cost??''}" ${canPrice?'':'disabled'}><div class="err-msg"></div></div>
     <div class="field"><label>Precio venta *</label><input class="input" name="price" type="number" step="0.01" value="${p?.price??''}" ${canPrice?'':'disabled'}><div class="err-msg"></div></div>
     <div class="field"><label>Margen</label><input class="input" id="marginView" disabled></div>
   </div>
   <div class="grid grid-3">
     <div class="field"><label>IVA %</label><input class="input" name="iva" type="number" value="${p?.iva??21}"></div>
     <div class="field"><label>Stock actual</label><input class="input" name="stock" type="number" step="0.001" value="${p?.stock??0}"></div>
     <div class="field"><label>Proveedor</label><select class="select" name="supplierId"><option value="">—</option>${SUPS.map(s=>`<option value="${esc(s.id)}" ${p&&p.supplierId===s.id?'selected':''}>${esc(s.tradeName||s.legalName)}</option>`).join('')}</select></div>
   </div>
   <div class="grid grid-2">
     <div class="field"><label>Stock mínimo</label><input class="input" name="stockMin" type="number" step="0.001" value="${p?.stockMin??0}"></div>
     <div class="field"><label>Stock máximo</label><input class="input" name="stockMax" type="number" step="0.001" value="${p?.stockMax??0}"></div>
   </div>`;

  const upd=()=>{const m=margin(f.cost.value,f.price.value);f.querySelector('#marginView').value=pct(m.marginPct)+' / '+money(m.profit);};
  f.cost.oninput=upd; f.price.oninput=upd; upd();
  let imageData=p?.image||'';
  f.image.onchange=async e=>{const file=e.target.files[0];if(!file)return;
    try{imageData=await Storage.upload(file,`products/${Date.now()}_${file.name}`);
      f.querySelector('#imgPrev').innerHTML=`<img src="${imageData}" style="width:100%;height:100%;object-fit:cover">`;}catch(ex){err('No se pudo subir la imagen');}};

  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent=isEdit?'Guardar cambios':'Crear producto';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:isEdit?'Editar producto':'Nuevo producto',body:f,footer:[cancel,save],width:720});
  cancel.onclick=m.close;
  save.onclick=async()=>{
    const data=validateForm(f,{name:[V.required],cost:[V.required,V.numberGte(0)],price:[V.required,V.numberGte(0)]});
    if(!data) return warn('Revisá los campos marcados');
    const payload={name:data.name,brand:f.brand.value.trim(),code:f.code.value.trim(),barcode:f.barcode.value.trim(),
      description:f.description.value.trim(),categoryId:f.categoryId.value,subcategoryId:f.subcategoryId.value,
      unit:f.unit.value,cost:+f.cost.value,price:+f.price.value,iva:+f.iva.value||0,
      stock:+f.stock.value||0,stockMin:+f.stockMin.value||0,stockMax:+f.stockMax.value||0,
      supplierId:f.supplierId.value,image:imageData,active:p?p.active!==false:true,demo:p?.demo||false};
    try{ if(isEdit) await Products.update(p.id,payload); else await Products.create(payload);
      await reload(); m.close(); ok(isEdit?'Producto actualizado':'Producto creado'); paint();
    }catch(ex){ err(ex.message||'No se pudo guardar'); }
  };
}

// Punto C: recálculo único de las alertas de reposición (solo admin). Corrige la
// bandera `needsRestock` de los productos que estaban desactualizados — típico de
// artículos que ya estaban bajo el mínimo pero nunca se movieron.
async function doRecalc(){
  const btn=document.getElementById('btnRecalc');
  if(btn) btn.disabled=true;
  try{
    const n=await Products.recalcRestockFlags();
    await reload(); paint();
    ok(n?('Alertas de reposición actualizadas: '+n+' producto(s) corregido(s)')
        :'Las alertas de reposición ya estaban al día');
  }catch(ex){ err(ex.message||'No se pudo recalcular'); }
  finally{ if(btn) btn.disabled=false; }
}

function doExport(){
  const rows=applyFilter().map(p=>({code:p.code,barcode:p.barcode,name:p.name,brand:p.brand,
    category:catName(p.categoryId),unit:p.unit,cost:p.cost,price:p.price,iva:p.iva,
    stock:p.stock,stockMin:p.stockMin,stockMax:p.stockMax,active:p.active!==false}));
  exportCSV('productos.csv',rows); ok('Exportado a CSV');
}

function doImport(){
  if(!can(USER.role,'product.edit')) return warn('Sin permiso para importar');
  const body=document.createElement('div');
  body.innerHTML=`<p class="text-muted" style="margin-bottom:12px">Seleccioná un CSV con columnas: name, code, barcode, cost, price, stock, unit. Se mostrará una vista previa antes de confirmar.</p>
    <input type="file" accept=".csv" id="impFile" class="input"><div id="impPrev" class="mt-16"></div>`;
  const confirm=document.createElement('button'); confirm.className='btn btn-primary'; confirm.textContent='Importar'; confirm.disabled=true;
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Importar productos',body,footer:[cancel,confirm],width:640}); cancel.onclick=m.close;
  let parsed=[];
  body.querySelector('#impFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;
    const text=await file.text(); parsed=parseCSV(text);
    body.querySelector('#impPrev').innerHTML=`<div class="table-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Código</th><th>Costo</th><th>Venta</th><th>Stock</th></tr></thead><tbody>
      ${parsed.slice(0,8).map(r=>`<tr><td>${esc(r.name||'')}</td><td>${esc(r.code||'')}</td><td>${esc(String(r.cost||0))}</td><td>${esc(String(r.price||0))}</td><td>${esc(String(r.stock||0))}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-muted mt-8" style="font-size:12px">${parsed.length} registro(s) a importar</p>`;
    confirm.disabled=!parsed.length;};
  confirm.onclick=async()=>{let n=0;for(const r of parsed){if(!r.name)continue;
    // Punto 3: la unidad importada se valida contra la lista permitida (UNITS);
    // si no es válida, se usa 'unidad' por defecto (evita datos basura en facturas/tickets).
    const unit=UNITS.some(u=>u.v===r.unit)?r.unit:'unidad';
    await Products.create({name:r.name,code:r.code||'',barcode:r.barcode||'',unit,
      cost:+r.cost||0,price:+r.price||0,iva:21,stock:+r.stock||0,stockMin:0,stockMax:0,active:true});n++;}
    await reload(); m.close(); ok(n+' productos importados'); paint();};
}
