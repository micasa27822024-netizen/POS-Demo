import { openModal } from '../utils/modal.js';
import { money } from '../utils/format.js';
import { PAYMENT_METHODS } from '../services/sales.service.js';
import { warn } from '../utils/toast.js';
import { DB } from '../services/db.service.js';
import { esc } from '../utils/escape.js';

// Abre el modal de cobro. Resuelve con {payments:[{method,amount}], cashReceived}
// o con null si se cancela.
export function openPayment({total,client,canCC}){
  return new Promise(resolve=>{
    let lines=[{method:'efectivo',amount:+total.toFixed(2)}];
    let received=+total.toFixed(2);
    const body=document.createElement('div');

    let methods=PAYMENT_METHODS.filter(m=>m.v!=='cuenta_corriente'||canCC);
    DB.get('settings','business').then(biz=>{ const en=biz&&biz.paymentMethods;
      if(Array.isArray(en)&&en.length){ methods=methods.filter(m=>m.v==='efectivo'||en.includes(m.v)); paint(); }
    }).catch(()=>{});
    function paid(){ return +lines.reduce((s,l)=>s+(+l.amount||0),0).toFixed(2); }
    function remaining(){ return +(total-paid()).toFixed(2); }
    const hasCash=()=>lines.some(l=>l.method==='efectivo');

    function paint(){
      const r=remaining();
      body.innerHTML=`
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:12px;color:var(--text-2)">Total a cobrar</div>
          <div style="font-size:32px;font-weight:800">${money(total)}</div>
          ${client?`<div style="font-size:12px;color:var(--text-3);margin-top:2px">Cliente: ${esc((client.name||'')+' '+(client.lastName||''))}</div>`:''}
        </div>
        <label style="font-size:11px;color:var(--text-2);font-weight:700">Agregar medio de pago</label>
        <div class="pay-methods" style="margin-top:6px">
          ${methods.map(m=>`<div class="pay-m" data-add="${m.v}">${m.ic} ${m.l}</div>`).join('')}
        </div>
        <div id="payLines"></div>
        ${hasCash()?`<div class="pay-line"><span class="pl-label">💵 Efectivo recibido</span>
          <input class="input" id="received" type="number" step="0.01" value="${received}"></div>`:''}
        <div class="pay-summary">
          <div class="row"><span>Pagado</span><b>${money(paid())}</b></div>
          <div class="row"><span>${r>0.001?'Falta':'Vuelto'}</span>
            <b class="${r>0.001?'text-alert':'text-profit'}">${money(r>0.001?r:changeAmount())}</b></div>
        </div>`;
      const pl=body.querySelector('#payLines');
      pl.innerHTML=lines.map((l,i)=>{const m=PAYMENT_METHODS.find(x=>x.v===l.method);
        return `<div class="pay-line"><span class="pl-label">${m.ic} ${m.l}</span>
          <input class="input" type="number" step="0.01" value="${l.amount}" data-amt="${i}">
          <button class="btn btn-sm btn-ghost" data-rm="${i}">✕</button></div>`;}).join('');
      body.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
        const mv=b.dataset.add; const r2=remaining();
        lines.push({method:mv,amount:r2>0?r2:0}); if(mv==='efectivo')received+=Math.max(0,r2); paint(); });
      body.querySelectorAll('[data-amt]').forEach(inp=>inp.onchange=()=>{lines[+inp.dataset.amt].amount=Math.max(0,+inp.value||0);paint();});
      body.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{lines.splice(+b.dataset.rm,1);paint();});
      const rec=body.querySelector('#received'); if(rec) rec.onchange=()=>{received=Math.max(0,+rec.value||0);paint();};
    }
    function cashApplied(){ return lines.filter(l=>l.method==='efectivo').reduce((s,l)=>s+(+l.amount||0),0); }
    function changeAmount(){ return hasCash()?Math.max(0,+(received-cashApplied()).toFixed(2)):0; }

    paint();
    const confirm=document.createElement('button'); confirm.className='btn btn-success'; confirm.textContent='Confirmar cobro';
    const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
    const m=openModal({title:'Cobrar venta',body,footer:[cancel,confirm],width:460,onClose:()=>resolve(null)});
    cancel.onclick=()=>{m.close();};
    confirm.onclick=()=>{
      if(paid()+0.001 < total) return warn('El pago no cubre el total');
      if(lines.some(l=>l.amount<=0)) return warn('Hay un medio de pago en $0');
      m.close(); resolve({payments:lines.map(l=>({method:l.method,amount:+(+l.amount).toFixed(2)})),
        cashReceived:hasCash()?received:0});
    };
  });
}

// Vista previa / impresión del ticket.
export async function showTicket(sale,client){
  const biz=(await DB.list('settings',{where:[['id','==','business']]}))[0]
    || (await DB.get('settings','business')) || {name:'Mi Comercio POS'};
  const PM={efectivo:'Efectivo',debito:'Débito',credito:'Crédito',transferencia:'Transferencia',cuenta_corriente:'Cta. Cte.',otros:'Otros'};
  const body=document.createElement('div');
  body.innerHTML=`<div id="ticket" style="font-family:'Courier New',monospace;font-size:12.5px;background:#fff;color:#000;padding:16px;border-radius:8px;max-width:300px;margin:0 auto;line-height:1.5">
    <div style="text-align:center"><b style="font-size:15px">${esc(biz.name||'Comercio')}</b><br>
      ${biz.address?esc(biz.address)+'<br>':''}${biz.cuit?'CUIT: '+esc(biz.cuit)+'<br>':''}${biz.phone?'Tel: '+esc(biz.phone):''}</div>
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    <div>Comprobante interno N° ${esc(String(sale.number))}<br>${new Date(sale.at).toLocaleString('es-AR')}<br>
      Cliente: ${esc(sale.clientName||'Consumidor Final')}<br>Vendedor: ${esc(sale.userName||'')}</div>
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    ${sale.items.map(it=>`<div style="display:flex;justify-content:space-between"><span>${esc(String(it.qty))} ${esc(it.unit||'')} x ${esc(it.name)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>&nbsp;&nbsp;@ ${money(it.price)}</span><b>${money(it.price*it.qty-(it.discount||0))}</b></div>`).join('')}
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    ${sale.discount?`<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>- ${money(sale.discount)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    <div style="border-top:1px dashed #000;margin:8px 0"></div>
    ${(sale.payments||[]).map(p=>`<div style="display:flex;justify-content:space-between"><span>${esc(PM[p.method]||p.method)}</span><span>${money(p.amount)}</span></div>`).join('')}
    ${sale.change?`<div style="display:flex;justify-content:space-between"><span>Vuelto</span><span>${money(sale.change)}</span></div>`:''}
    <div style="text-align:center;margin-top:10px">¡Gracias por su compra!</div>
  </div>`;
  const print=document.createElement('button'); print.className='btn btn-primary'; print.textContent='🖨️ Imprimir';
  const close=document.createElement('button'); close.className='btn btn-ghost'; close.textContent='Cerrar';
  const mm=openModal({title:'Venta #'+sale.number,body,footer:[close,print],width:380});
  close.onclick=mm.close;
  print.onclick=()=>{ const w=window.open('','_blank','width=380,height=640');
    w.document.write('<html><head><title>Ticket #'+sale.number+'</title></head><body>'+body.querySelector('#ticket').outerHTML+'</body></html>');
    w.document.close(); w.focus(); w.print(); };
}
