// Configuración general: datos del negocio, moneda, IVA, numeración, medios de pago y apariencia.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Storage } from '../services/storage.service.js';
import { ok, err } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { money, setCurrency } from '../utils/format.js';
import { PAYMENT_METHODS } from '../services/sales.service.js';
import { toggleTheme, currentTheme } from '../utils/theme.js';
import { esc } from '../utils/escape.js';
import { can } from '../services/permissions.js';
import { fdatetime } from '../utils/format.js';
import { buildBackup, download } from '../utils/csv.js';

let USER, BIZ={}, maxNumber=1000, tab='negocio';
const DEFCUR={symbol:'$',code:'ARS',locale:'es-AR',decimals:2};

(async()=>{
  USER=await requireAuth('settings'); if(!USER) return;
  const view=renderShell('settings','Configuración'); view.innerHTML='<div class="loader">Cargando…</div>';
  await load(); render(view);
})();
async function load(){
  BIZ=(await DB.get('settings','business'))||{};
  if(!BIZ.currency) BIZ.currency={...DEFCUR};
  if(!Array.isArray(BIZ.paymentMethods)) BIZ.paymentMethods=PAYMENT_METHODS.map(m=>m.v);
  // B1: no leemos todas las ventas; tomamos el último número del contador.
  const counter=await DB.get('counters','sales').catch(()=>null);
  maxNumber=(counter&&counter.last)||0;
  setCurrency(BIZ.currency);
}

function render(view){
  const tabs=[['negocio','🏪 Negocio'],['moneda','💱 Moneda e impuestos'],['numeracion','🔢 Numeración'],['pagos','💳 Medios de pago'],['operacion','⚙️ Operación'],['apariencia','🎨 Apariencia']];
  view.innerHTML=`<div class="page-head"><div><h1>Configuración</h1><p>Parámetros generales del sistema</p></div>
    <button class="btn btn-primary" id="btnSave">💾 Guardar cambios</button></div>
    <div class="tabs">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'active':''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="host" class="mt-16" style="max-width:720px"></div>`;
  view.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render(view);});
  document.getElementById('btnSave').onclick=save;
  paint();
}
const field=(id,label,val,type='text',extra='')=>`<div class="field"><label>${label}</label><input class="input" id="${id}" type="${type}" value="${esc(val)}" ${extra}></div>`;

function paint(){
  const host=document.getElementById('host'); if(!host) return;
  if(tab==='negocio') host.innerHTML=negocio();
  else if(tab==='moneda') host.innerHTML=moneda();
  else if(tab==='numeracion') host.innerHTML=numeracion();
  else if(tab==='pagos') host.innerHTML=pagos();
  else if(tab==='operacion') host.innerHTML=operacion();
  else host.innerHTML=apariencia();
  bindTab();
}
function negocio(){
  return `<div class="card card-pad">
    ${field('name','Nombre de fantasía *',BIZ.name||'')}
    ${field('legalName','Razón social',BIZ.legalName||'')}
    ${field('cuit','CUIT',BIZ.cuit||'')}
    ${field('address','Dirección',BIZ.address||'')}
    <div class="flex gap-12"><div style="flex:1">${field('phone','Teléfono',BIZ.phone||'')}</div>
      <div style="flex:1">${field('email','Email',BIZ.email||'','email')}</div></div>
    <div class="field"><label>Logo del negocio</label><input class="input" id="logo" type="file" accept="image/*">
      ${BIZ.logo?`<div class="mt-8"><img src="${esc(BIZ.logo)}" style="max-height:64px"> <button class="btn btn-sm btn-ghost" id="delLogo">Quitar</button></div>`:''}</div></div>`;
}
function moneda(){
  const c=BIZ.currency||DEFCUR;
  return `<div class="card card-pad"><h3 style="margin-bottom:12px">Moneda</h3>
    <div class="flex gap-12" style="flex-wrap:wrap">
      <div style="flex:1;min-width:120px">${field('symbol','Símbolo',c.symbol||'$')}</div>
      <div style="flex:1;min-width:120px">${field('code','Código',c.code||'ARS')}</div></div>
    <div class="flex gap-12" style="flex-wrap:wrap">
      <div style="flex:1;min-width:120px">${field('locale','Locale',c.locale||'es-AR')}</div>
      <div style="flex:1;min-width:120px">${field('decimals','Decimales',c.decimals??2,'number','min="0" max="4"')}</div></div>
    <div class="mt-8" style="padding:12px;background:var(--surface-2);border-radius:10px">Vista previa: <b id="curPrev">${money(1250.5)}</b></div>
    <h3 style="margin:18px 0 12px">Impuestos</h3>
    ${field('iva','IVA por defecto (%)',BIZ.iva??21,'number','min="0" max="27" step="0.5"')}</div>`;
}
function numeracion(){
  return `<div class="card card-pad"><h3 style="margin-bottom:12px">Numeración de comprobantes</h3>
    <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">Último número emitido: <b>#${maxNumber||'—'}</b>. El próximo comprobante tomará el mayor entre este valor y la base configurada.</p>
    ${field('numberStart','Número base (desde)',BIZ.numberStart??1000,'number','min="0" step="1"')}
    <p style="color:var(--text-3);font-size:12px;margin-top:4px">Ej: si ponés 5000 y no hay ventas con número mayor, la próxima venta será la #5001.</p></div>`;
}
function pagos(){
  return `<div class="card card-pad"><h3 style="margin-bottom:12px">Medios de pago habilitados</h3>
    <p style="color:var(--text-2);font-size:13px;margin-bottom:10px">Los medios desactivados no aparecerán en el cobro del punto de venta. El efectivo siempre está disponible.</p>
    ${PAYMENT_METHODS.map(m=>{const on=BIZ.paymentMethods.includes(m.v);const lock=m.v==='efectivo';
      return `<label class="ck"><input type="checkbox" data-pm="${m.v}" ${on?'checked':''} ${lock?'disabled':''}> ${m.ic} ${m.l}${lock?' <span style="color:var(--text-3);font-size:12px">(obligatorio)</span>':''}</label>`;}).join('')}</div>`;
}
function operacion(){
  const roc=BIZ.requireOpenCash!==false; // default true
  const ans=BIZ.allowNegativeStock===true; // default false
  const isAdmin=USER.role==='admin';
  const last=BIZ.lastBackupAt?fdatetime(BIZ.lastBackupAt):'nunca';
  return `<div class="card card-pad"><h3 style="margin-bottom:12px">Reglas de operación</h3>
    <label class="ck"><input type="checkbox" id="requireOpenCash" ${roc?'checked':''}> Exigir caja abierta para cobrar en efectivo</label>
    <p style="color:var(--text-3);font-size:12px;margin:4px 0 12px">Si está activo, no se puede cobrar en efectivo sin una caja abierta.</p>
    <label class="ck"><input type="checkbox" id="allowNegativeStock" ${ans?'checked':''}> Permitir stock negativo</label>
    <p style="color:var(--text-3);font-size:12px;margin:4px 0 0">Si está activo, se pueden vender productos aunque el stock quede por debajo de cero.</p></div>
    <div class="card card-pad mt-16"><h3 style="margin-bottom:12px">💾 Respaldo de datos</h3>
    <p style="color:var(--text-2);font-size:13px;margin-bottom:4px">Descarga una copia completa de los datos del sistema en formato JSON.</p>
    <p style="color:var(--text-3);font-size:12px;margin-bottom:12px">Último respaldo: <b>${last}</b></p>
    ${isAdmin?`<button class="btn btn-ghost" id="btnBackup">⬇️ Exportar respaldo</button>`
      :`<p style="color:var(--text-3);font-size:12px">Solo un administrador puede exportar el respaldo.</p>`}</div>`;
}

function apariencia(){
  const t=currentTheme();
  return `<div class="card card-pad"><h3 style="margin-bottom:12px">Tema visual</h3>
    <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">La preferencia se guarda en este dispositivo.</p>
    <div class="flex gap-12">
      <button class="btn ${t==='light'?'btn-primary':'btn-ghost'}" id="thLight">☀ Claro</button>
      <button class="btn ${t==='dark'?'btn-primary':'btn-ghost'}" id="thDark">☾ Oscuro</button></div></div>`;
}

function bindTab(){
  const set=(id,field,ev='oninput',map=v=>v)=>{const e=document.getElementById(id);if(e)e[ev]=()=>{BIZ[field]=map(e.value);};};
  if(tab==='negocio'){
    ['name','legalName','cuit','address','phone','email'].forEach(k=>set(k,k));
    const lg=document.getElementById('logo'); if(lg) lg.onchange=async()=>{const f=lg.files[0];if(!f)return;
      try{ ok('Procesando imagen…'); BIZ.logo=await Storage.upload(f); paint(); }catch(ex){ err(ex.message); }};
    const dl=document.getElementById('delLogo'); if(dl) dl.onclick=()=>{BIZ.logo='';paint();};
  } else if(tab==='moneda'){
    const cur=()=>BIZ.currency||(BIZ.currency={...DEFCUR});
    const upd=()=>{ setCurrency(BIZ.currency); const p=document.getElementById('curPrev'); if(p)p.textContent=money(1250.5); };
    ['symbol','code','locale'].forEach(k=>{const e=document.getElementById(k);if(e)e.oninput=()=>{cur()[k]=e.value;upd();};});
    const d=document.getElementById('decimals'); if(d)d.oninput=()=>{cur().decimals=Math.max(0,Math.min(4,+d.value||0));upd();};
    const iv=document.getElementById('iva'); if(iv)iv.oninput=()=>{BIZ.iva=+iv.value||0;};
  } else if(tab==='numeracion'){
    const n=document.getElementById('numberStart'); if(n)n.oninput=()=>{BIZ.numberStart=Math.max(0,parseInt(n.value||'0',10));};
  } else if(tab==='pagos'){
    document.querySelectorAll('[data-pm]').forEach(c=>c.onchange=()=>{
      const v=c.dataset.pm; const set2=new Set(BIZ.paymentMethods);
      if(c.checked) set2.add(v); else set2.delete(v); set2.add('efectivo');
      BIZ.paymentMethods=PAYMENT_METHODS.map(m=>m.v).filter(x=>set2.has(x)); });
  } else if(tab==='operacion'){
    const roc=document.getElementById('requireOpenCash'); if(roc)roc.onchange=()=>{BIZ.requireOpenCash=roc.checked;};
    const ans=document.getElementById('allowNegativeStock'); if(ans)ans.onchange=()=>{BIZ.allowNegativeStock=ans.checked;};
    const bk=document.getElementById('btnBackup'); if(bk)bk.onclick=exportBackup;
  } else {
    const l=document.getElementById('thLight'), d=document.getElementById('thDark');
    if(l)l.onclick=()=>{ if(currentTheme()!=='light')toggleTheme(); paint(); };
    if(d)d.onclick=()=>{ if(currentTheme()!=='dark')toggleTheme(); paint(); };
  }
}

async function save(){
  if(!BIZ.name||!BIZ.name.trim()) return err('El nombre del negocio es obligatorio');
  try{
    const {id,...data}=BIZ;
    await DB.set('settings','business',data);
    setCurrency(BIZ.currency||DEFCUR);
    await Audit.log('settings.save','settings',{name:BIZ.name});
    ok('Configuración guardada');
  }catch(ex){ err(ex.message||'No se pudo guardar'); }
}

// B5: exporta un respaldo JSON completo (solo admin) y guarda la fecha.
async function exportBackup(){
  if(USER.role!=='admin') return err('Solo un administrador puede exportar el respaldo');
  const btn=document.getElementById('btnBackup');
  if(btn){ btn.disabled=true; btn.textContent='Generando…'; }
  try{
    const backup=await buildBackup(DB);
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    download(`respaldo_pos_${stamp}.json`, JSON.stringify(backup,null,2), 'application/json');
    const at=Date.now(); BIZ.lastBackupAt=at;
    await DB.set('settings','business',{lastBackupAt:at});
    await Audit.log('settings.backup','settings',{at});
    ok('Respaldo exportado');
    paint();
  }catch(ex){ err(ex.message||'No se pudo exportar el respaldo'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='⬇️ Exportar respaldo'; } }
}
