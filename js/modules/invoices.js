// Facturas/comprobantes: plantilla A4 configurable, generación desde ventas reales y base para AFIP/ARCA.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { money, num } from '../utils/format.js';

let USER, BIZ={}, CFG={}, SALES=[], selId='';
const DEF={tipo:'X',puntoVenta:'0001',nextNumber:1,condicionIva:'Monotributo',discriminaIva:false,ivaPct:21,
  legend:'Documento no válido como factura. Comprobante interno de venta.'};
const COND=['Responsable Inscripto','Monotributo','Exento','Consumidor Final'];
const TIPO={X:'X — Comprobante interno',A:'A — Resp. Inscripto',B:'B — Consumidor Final',C:'C — Monotributo'};

(async()=>{
  USER=await requireAuth('invoices'); if(!USER) return;
  const view=renderShell('invoices','Facturas y Comprobantes'); view.innerHTML='<div class="loader">Cargando…</div>';
  await load(); render(view);
})();
async function load(){
  BIZ=(await DB.get('settings','business'))||{name:'Mi Comercio POS'};
  const saved=(await DB.get('settings','invoice'))||{};
  CFG={...DEF,...saved}; delete CFG.id;
  SALES=(await DB.list('sales')).filter(s=>s.status!=='anulada').sort((a,b)=>b.at-a.at).slice(0,50);
  selId=SALES[0]?.id||'';
}
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function current(){
  const s=SALES.find(x=>x.id===selId);
  if(s) return s;
  return {number:1234,at:Date.now(),clientName:'Consumidor Final',clientCuit:'',userName:USER.name||'Vendedor',
    items:[{qty:2,unit:'u',name:'Gaseosa 1.5L',price:1800,discount:0},{qty:0.5,unit:'kg',name:'Queso cremoso',price:9200,discount:0}],
    subtotal:8200,discount:200,total:8000};
}
function compNumber(s){ return `${CFG.puntoVenta}-${String(s.number||0).padStart(8,'0')}`; }

function invoiceHtml(s){
  const neto=CFG.discriminaIva?+(s.total/(1+(CFG.ivaPct||0)/100)).toFixed(2):s.total;
  const iva=+(s.total-neto).toFixed(2);
  const rows=(s.items||[]).map(it=>{ const sub=it.price*it.qty-(it.discount||0);
    const td='padding:7px;border:1px solid #eee';
    return `<tr><td style="${td}">${num(it.qty)} ${it.unit||''}</td><td style="${td}">${esc(it.name)}</td><td style="${td};text-align:right">${money(it.price)}</td><td style="${td};text-align:right">${money(sub)}</td></tr>`; }).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;padding:26px;font-size:12.5px;width:100%;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;border:1px solid #333;border-radius:4px">
      <div style="flex:1;padding:14px"><b style="font-size:17px">${esc(BIZ.name||'Comercio')}</b><br>
        ${BIZ.legalName?esc(BIZ.legalName)+'<br>':''}${BIZ.address?esc(BIZ.address)+'<br>':''}
        ${BIZ.cuit?'CUIT: '+esc(BIZ.cuit)+'<br>':''}${BIZ.phone?'Tel: '+esc(BIZ.phone):''}<br>
        <span style="font-size:11px;color:#555">${esc(CFG.condicionIva)}</span></div>
      <div style="width:60px;border-left:1px solid #333;border-right:1px solid #333;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:30px;font-weight:800;line-height:1">${esc(CFG.tipo)}</div><div style="font-size:9px">COD. ${CFG.tipo==='X'?'99':CFG.tipo==='A'?'01':CFG.tipo==='B'?'06':'11'}</div></div>
      <div style="flex:1;padding:14px"><b style="font-size:15px">${CFG.tipo==='X'?'COMPROBANTE':'FACTURA'}</b><br>
        N° ${compNumber(s)}<br>Fecha: ${new Date(s.at).toLocaleDateString('es-AR')}<br>
        <span style="font-size:11px;color:#555">Original</span></div></div>
    <div style="border:1px solid #333;border-top:0;padding:10px 14px;font-size:12px">
      <b>Cliente:</b> ${esc(s.clientName||'Consumidor Final')} &nbsp; <b>CUIT/DNI:</b> ${esc(s.clientCuit||'—')} &nbsp; <b>Vendedor:</b> ${esc(s.userName||'')}</div>
    <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px">
      <thead><tr style="background:#f0f0f0"><th style="text-align:left;padding:7px;border:1px solid #ccc">Cant.</th><th style="text-align:left;padding:7px;border:1px solid #ccc">Descripción</th><th style="text-align:right;padding:7px;border:1px solid #ccc">P. Unit.</th><th style="text-align:right;padding:7px;border:1px solid #ccc">Importe</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div style="max-width:280px;margin-left:auto;margin-top:12px">
      ${s.discount?`<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>- ${money(s.discount)}</span></div>`:''}
      ${CFG.discriminaIva?`<div style="display:flex;justify-content:space-between"><span>Neto gravado</span><span>${money(neto)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>IVA ${CFG.ivaPct}%</span><span>${money(iva)}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;border-top:2px solid #333;margin-top:6px;padding-top:6px"><span>TOTAL</span><span>${money(s.total)}</span></div></div>
    <div style="margin-top:18px;font-size:10.5px;color:#666;border-top:1px dashed #999;padding-top:8px">${esc(CFG.legend)}</div>
    ${CFG.tipo!=='X'?`<div style="margin-top:10px;font-size:10.5px;color:#666">CAE: __________________  Vto. CAE: __________  <i>(pendiente de integración AFIP/ARCA)</i></div>`:''}
  </div>`;
}

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Facturas y Comprobantes</h1><p>Plantilla A4 configurable y generación desde ventas</p></div>
    <div class="flex gap-8"><button class="btn btn-ghost" id="btnPrint">🖨️ Imprimir / PDF</button>
      <button class="btn btn-primary" id="btnSave">💾 Guardar config.</button></div></div>
    <div class="grid grid-2" style="align-items:start">
      <div><div class="card card-pad"><h3 style="margin-bottom:14px">⚙️ Configuración del comprobante</h3>
        <div class="field"><label>Tipo de comprobante</label><select class="select" id="tipo">${Object.entries(TIPO).map(([k,v])=>`<option value="${k}" ${CFG.tipo===k?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Condición frente al IVA</label><select class="select" id="condicionIva">${COND.map(c=>`<option ${CFG.condicionIva===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="flex gap-12"><div class="field" style="flex:1"><label>Punto de venta</label><input class="input" id="puntoVenta" value="${esc(CFG.puntoVenta)}"></div>
          <div class="field" style="flex:1"><label>IVA (%)</label><input class="input" id="ivaPct" type="number" min="0" max="27" step="0.5" value="${CFG.ivaPct}"></div></div>
        <label class="ck"><input type="checkbox" id="discriminaIva" ${CFG.discriminaIva?'checked':''}> Discriminar IVA en el total</label>
        <div class="field"><label>Leyenda al pie</label><textarea class="input" id="legend" rows="2">${esc(CFG.legend)}</textarea></div>
      </div>
      <div class="card card-pad mt-16" style="border-left:3px solid var(--info)"><b style="font-size:13px">🔌 Integración fiscal (AFIP/ARCA)</b>
        <p style="color:var(--text-2);font-size:12.5px;margin-top:6px;line-height:1.6">La plantilla ya contempla CUIT, condición de IVA, punto de venta, numeración y espacio para CAE/vto. Cuando se habilite la facturación electrónica, el número y el CAE se completarán automáticamente desde el webservice, sin rehacer esta vista.</p></div></div>
      <div><div class="card card-pad"><div class="field"><label>Vista previa desde venta</label><select class="select" id="sel">
        ${SALES.length?SALES.map(s=>`<option value="${s.id}" ${selId===s.id?'selected':''}>#${s.number} · ${esc(s.clientName||'Consumidor Final')} · ${money(s.total)}</option>`).join(''):'<option value="">(sin ventas — datos de ejemplo)</option>'}</select></div>
        <div style="background:#e5e7eb;padding:16px;border-radius:8px;max-height:620px;overflow:auto"><div id="preview" style="background:#fff;box-shadow:var(--shadow-lg)"></div></div></div></div></div>`;
  const bind=(id,ev,fn)=>{const e=document.getElementById(id);if(e)e[ev]=fn;};
  bind('tipo','onchange',e=>{CFG.tipo=e.target.value;preview();});
  bind('condicionIva','onchange',e=>{CFG.condicionIva=e.target.value;preview();});
  bind('puntoVenta','oninput',e=>{CFG.puntoVenta=e.target.value;preview();});
  bind('ivaPct','oninput',e=>{CFG.ivaPct=+e.target.value||0;preview();});
  bind('discriminaIva','onchange',e=>{CFG.discriminaIva=e.target.checked;preview();});
  bind('legend','oninput',e=>{CFG.legend=e.target.value;preview();});
  bind('sel','onchange',e=>{selId=e.target.value;preview();});
  bind('btnSave','onclick',save);
  bind('btnPrint','onclick',printInv);
  preview();
}
function preview(){ const p=document.getElementById('preview'); if(p) p.innerHTML=invoiceHtml(current()); }
async function save(){
  try{ await DB.set('settings','invoice',{...CFG}); await Audit.log('invoice.config','settings',{tipo:CFG.tipo,puntoVenta:CFG.puntoVenta});
    ok('Configuración guardada'); }catch(ex){ err(ex.message||'No se pudo guardar'); }
}
function printInv(){
  const s=current();
  const w=window.open('','_blank','width=840,height=980'); if(!w) return warn('Habilitá las ventanas emergentes');
  w.document.write(`<html><head><title>${CFG.tipo==='X'?'Comprobante':'Factura'} ${compNumber(s)}</title><style>@page{size:A4;margin:10mm}body{margin:0}</style></head><body>${invoiceHtml(s)}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}
