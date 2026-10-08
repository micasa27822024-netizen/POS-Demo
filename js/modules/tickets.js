// Diseñador de tickets: configura papel (58/80mm/A4), logo, textos y QR con vista previa en vivo.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Storage } from '../services/storage.service.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { money } from '../utils/format.js';

let USER, BIZ={}, CFG={};
const DEF={paper:'80',showLogo:false,logo:'',headerExtra:'',showCuit:true,showAddress:true,showPhone:true,
  footerMsg:'¡Gracias por su compra!',showQr:false,qrText:'',fontSize:12.5};
const WIDTH={'58':'200px','80':'280px','a4':'440px'};
const MM={'58':'58mm','80':'80mm','a4':'210mm'};

(async()=>{
  USER=await requireAuth('tickets'); if(!USER) return;
  const view=renderShell('tickets','Diseñador de Tickets'); view.innerHTML='<div class="loader">Cargando…</div>';
  await load(); render(view);
})();
async function load(){
  BIZ=(await DB.get('settings','business'))||{name:'Mi Comercio POS'};
  const saved=(await DB.get('settings','ticket'))||{};
  CFG={...DEF,...saved}; delete CFG.id;
}
function sample(){
  return {number:1234,at:Date.now(),clientName:'Consumidor Final',userName:USER.name||'Vendedor',
    items:[{qty:2,unit:'u',name:'Gaseosa 1.5L',price:1800,discount:0},{qty:0.5,unit:'kg',name:'Queso cremoso',price:9200,discount:0}],
    subtotal:8200,discount:200,total:8000,payments:[{method:'efectivo',amount:10000}],change:2000};
}
const PM={efectivo:'Efectivo',debito:'Débito',credito:'Crédito',transferencia:'Transferencia',cuenta_corriente:'Cta. Cte.',otros:'Otros'};

function ticketHtml(s){
  const fs=CFG.fontSize||12.5;
  const qr=CFG.showQr?`<div style="text-align:center;margin-top:10px"><img alt="QR" style="width:88px;height:88px" src="https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=${encodeURIComponent(CFG.qrText||('Ticket '+s.number))}"></div>`:'';
  const logo=CFG.showLogo&&CFG.logo?`<div style="text-align:center;margin-bottom:6px"><img alt="logo" style="max-width:120px;max-height:70px" src="${CFG.logo}"></div>`:'';
  return `<div style="font-family:'Courier New',monospace;font-size:${fs}px;background:#fff;color:#000;padding:14px;line-height:1.45">
    ${logo}
    <div style="text-align:center"><b style="font-size:${+fs+2}px">${esc(BIZ.name||'Comercio')}</b><br>
      ${CFG.headerExtra?esc(CFG.headerExtra).replace(/\n/g,'<br>')+'<br>':''}
      ${CFG.showAddress&&BIZ.address?esc(BIZ.address)+'<br>':''}
      ${CFG.showCuit&&BIZ.cuit?'CUIT: '+esc(BIZ.cuit)+'<br>':''}
      ${CFG.showPhone&&BIZ.phone?'Tel: '+esc(BIZ.phone):''}</div>
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    <div>Comprobante interno N° ${s.number}<br>${new Date(s.at).toLocaleString('es-AR')}<br>
      Cliente: ${esc(s.clientName)}<br>Vendedor: ${esc(s.userName)}</div>
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    ${s.items.map(it=>`<div style="display:flex;justify-content:space-between"><span>${it.qty} ${it.unit} x ${esc(it.name)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>&nbsp;&nbsp;@ ${money(it.price)}</span><b>${money(it.price*it.qty-(it.discount||0))}</b></div>`).join('')}
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
    ${s.discount?`<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>- ${money(s.discount)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;font-size:${+fs+4}px;font-weight:bold"><span>TOTAL</span><span>${money(s.total)}</span></div>
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    ${(s.payments||[]).map(p=>`<div style="display:flex;justify-content:space-between"><span>${PM[p.method]||p.method}</span><span>${money(p.amount)}</span></div>`).join('')}
    ${s.change?`<div style="display:flex;justify-content:space-between"><span>Vuelto</span><span>${money(s.change)}</span></div>`:''}
    ${CFG.footerMsg?`<div style="text-align:center;margin-top:10px">${esc(CFG.footerMsg).replace(/\n/g,'<br>')}</div>`:''}
    ${qr}
  </div>`;
}
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Diseñador de Tickets</h1><p>Personalizá el comprobante interno de venta</p></div>
    <div class="flex gap-8"><button class="btn btn-ghost" id="btnPrint">🖨️ Imprimir prueba</button>
      <button class="btn btn-primary" id="btnSave">💾 Guardar</button></div></div>
    <div class="grid grid-2" style="align-items:start">
      <div class="card card-pad"><h3 style="margin-bottom:14px">⚙️ Configuración</h3>
        <div class="field"><label>Tamaño de papel</label><select class="select" id="paper">
          <option value="58" ${CFG.paper==='58'?'selected':''}>58 mm (térmica chica)</option>
          <option value="80" ${CFG.paper==='80'?'selected':''}>80 mm (térmica estándar)</option>
          <option value="a4" ${CFG.paper==='a4'?'selected':''}>A4 (hoja comercial)</option></select></div>
        <div class="field"><label>Tamaño de fuente (px)</label><input class="input" id="fontSize" type="number" min="9" max="18" step="0.5" value="${CFG.fontSize}"></div>
        <div class="field"><label>Texto extra de encabezado</label><textarea class="input" id="headerExtra" rows="2" placeholder="Una línea por renglón">${esc(CFG.headerExtra)}</textarea></div>
        <div class="field"><label>Mensaje al pie</label><textarea class="input" id="footerMsg" rows="2">${esc(CFG.footerMsg)}</textarea></div>
        <label class="ck"><input type="checkbox" id="showAddress" ${CFG.showAddress?'checked':''}> Mostrar dirección</label>
        <label class="ck"><input type="checkbox" id="showCuit" ${CFG.showCuit?'checked':''}> Mostrar CUIT</label>
        <label class="ck"><input type="checkbox" id="showPhone" ${CFG.showPhone?'checked':''}> Mostrar teléfono</label>
        <label class="ck"><input type="checkbox" id="showLogo" ${CFG.showLogo?'checked':''}> Mostrar logo</label>
        <div class="field" id="logoBox" style="${CFG.showLogo?'':'display:none'}"><label>Logo (se comprime automáticamente)</label>
          <input class="input" id="logo" type="file" accept="image/*">
          ${CFG.logo?`<div class="mt-8"><img src="${CFG.logo}" style="max-height:60px"> <button class="btn btn-sm btn-ghost" id="delLogo">Quitar</button></div>`:''}</div>
        <label class="ck"><input type="checkbox" id="showQr" ${CFG.showQr?'checked':''}> Mostrar código QR</label>
        <div class="field" id="qrBox" style="${CFG.showQr?'':'display:none'}"><label>Contenido del QR (URL o texto)</label><input class="input" id="qrText" value="${esc(CFG.qrText)}" placeholder="https://micomercio.com"></div>
      </div>
      <div><div class="card card-pad" style="text-align:center"><h3 style="margin-bottom:14px">👁 Vista previa</h3>
        <div id="preview" style="display:inline-block;width:${WIDTH[CFG.paper]};box-shadow:var(--shadow-lg);border-radius:6px;overflow:hidden;text-align:left"></div></div></div></div>`;
  const bind=(id,ev,fn)=>{const e=document.getElementById(id);if(e)e[ev]=fn;};
  bind('paper','onchange',e=>{CFG.paper=e.target.value;preview();});
  bind('fontSize','oninput',e=>{CFG.fontSize=+e.target.value||12.5;preview();});
  bind('headerExtra','oninput',e=>{CFG.headerExtra=e.target.value;preview();});
  bind('footerMsg','oninput',e=>{CFG.footerMsg=e.target.value;preview();});
  ['showAddress','showCuit','showPhone'].forEach(k=>bind(k,'onchange',e=>{CFG[k]=e.target.checked;preview();}));
  bind('showLogo','onchange',e=>{CFG.showLogo=e.target.checked;render(view);});
  bind('showQr','onchange',e=>{CFG.showQr=e.target.checked;render(view);});
  bind('qrText','oninput',e=>{CFG.qrText=e.target.value;preview();});
  bind('delLogo','onclick',()=>{CFG.logo='';render(view);});
  bind('logo','onchange',async e=>{ const f=e.target.files[0]; if(!f) return;
    try{ ok('Procesando imagen…'); CFG.logo=await Storage.upload(f); render(view); }catch(ex){ err(ex.message); } });
  bind('btnSave','onclick',save);
  bind('btnPrint','onclick',printTest);
  preview();
}
function preview(){
  const p=document.getElementById('preview');
  if(!p) return; p.style.width=WIDTH[CFG.paper]; p.innerHTML=ticketHtml(sample());
}
async function save(){
  try{ await DB.set('settings','ticket',{...CFG}); await Audit.log('ticket.config','settings',{paper:CFG.paper});
    ok('Diseño de ticket guardado'); }catch(ex){ err(ex.message||'No se pudo guardar'); }
}
function printTest(){
  const w=window.open('','_blank','width=420,height=680'); if(!w) return warn('Habilitá las ventanas emergentes');
  w.document.write(`<html><head><title>Ticket de prueba</title><style>@page{size:${MM[CFG.paper]} auto;margin:4mm}body{margin:0}</style></head><body>${ticketHtml(sample())}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}
