// Reportes: ventas, productos, medios de pago, vendedores, compras y caja con filtros de fecha.
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { ok, err } from '../utils/toast.js';
import { money, num, pct, fdate, dayStart, dayEnd, monthStart, dayKeyAR } from '../utils/format.js';
import { esc as escapeHtml } from '../utils/escape.js';

let USER, SALES=[], PURCH=[], REGS=[], from='', to='', preset='30';
const DAY=86400000;
(async()=>{
  USER=await requireAuth('reports'); if(!USER) return;
  const view=renderShell('reports','Reportes'); view.innerHTML='<div class="loader">Cargando…</div>';
  applyPreset('30'); await reload(); render(view);
})();
async function reload(){
  // B1: se consulta solo el rango seleccionado, nunca las colecciones completas.
  const [f,t]=range();
  const tt=isFinite(t)?t:Date.now();
  [SALES,PURCH,REGS]=await Promise.all([
    DB.list('sales',{where:[['at','>=',f],['at','<=',tt]],orderBy:['at','desc']}),
    DB.list('purchases',{where:[['at','>=',f],['at','<=',tt]]}),
    DB.list('cashRegisters',{where:[['status','==','cerrada']]})
  ]);
}
const iso=ts=>dayKeyAR(ts);
function applyPreset(p){
  preset=p; const now=Date.now();
  if(p==='today'){ from=iso(dayStart()); to=iso(dayEnd()); }
  else if(p==='7'){ from=iso(now-6*DAY); to=iso(dayEnd()); }
  else if(p==='30'){ from=iso(now-29*DAY); to=iso(dayEnd()); }
  else if(p==='month'){ from=iso(monthStart()); to=iso(dayEnd()); }
}
function range(){ const f=from?new Date(from+'T00:00:00').getTime():0; const t=to?new Date(to+'T23:59:59').getTime():Infinity; return [f,t]; }
function inRange(at){ const [f,t]=range(); return at>=f&&at<=t; }

function render(view){
  const chips=[['today','Hoy'],['7','7 días'],['30','30 días'],['month','Este mes']];
  view.innerHTML=`<div class="page-head"><div><h1>Reportes</h1><p>Análisis de ventas, productos y caja</p></div>
    <button class="btn btn-ghost" id="btnCsv">⬇️ Exportar ventas (CSV)</button></div>
    <div class="card card-pad">
      <div class="flex gap-8" style="flex-wrap:wrap;margin-bottom:12px">${chips.map(([k,l])=>`<span class="chip ${preset===k?'active':''}" data-p="${k}">${l}</span>`).join('')}</div>
      <div class="flex gap-12" style="flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="margin:0"><label>Desde</label><input class="input" id="from" type="date" value="${from}"></div>
        <div class="field" style="margin:0"><label>Hasta</label><input class="input" id="to" type="date" value="${to}"></div></div></div>
    <div id="host" class="mt-16"></div>`;
  view.querySelectorAll('[data-p]').forEach(c=>c.onclick=async()=>{applyPreset(c.dataset.p);await reload();render(view);});
  document.getElementById('from').onchange=async e=>{from=e.target.value;preset='';await reload();paint();};
  document.getElementById('to').onchange=async e=>{to=e.target.value;preset='';await reload();paint();};
  document.getElementById('btnCsv').onclick=exportCsv;
  paint();
}
const sc=(l,v,c='')=>`<div class="card card-pad"><span style="font-size:12px;color:var(--text-3)">${l}</span><h3 style="margin-top:6px;${c?`color:${c}`:''}">${v}</h3></div>`;
const PM={efectivo:'Efectivo',debito:'T. débito',credito:'T. crédito',transferencia:'Transferencia',cuenta_corriente:'Cuenta corriente',otros:'Otros'};

function barChart(data,fmt){
  const max=Math.max(1,...data.map(d=>d.value));
  return `<div class="bars">${data.map(d=>`<div class="bar-row"><span class="bar-lbl">${escapeHtml(d.label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${(d.value/max*100).toFixed(1)}%"></div></div>
    <span class="bar-val">${fmt(d.value)}</span></div>`).join('')||'<p class="empty">Sin datos</p>'}</div>`;
}

function compute(){
  const sales=SALES.filter(v=>inRange(v.at)&&v.status!=='anulada');
  // Netos de devoluciones: a cada venta se le resta lo efectivamente devuelto
  // (returnedTotal) y la ganancia devuelta (returnedProfit).
  const fact=sales.reduce((s,v)=>s+((+v.total||0)-(+v.returnedTotal||0)),0);
  const prof=sales.reduce((s,v)=>s+((+v.profit||0)-(+v.returnedProfit||0)),0);
  const tickets=sales.length;
  const items=sales.reduce((s,v)=>s+(v.items||[]).reduce((a,it)=>a+(+it.qty||0),0),0);
  // Medios de pago
  const pay={};
  sales.forEach(v=>(v.payments||[]).forEach(p=>{pay[p.method]=(pay[p.method]||0)+(+p.amount||0);}));
  // Top productos
  const prodMap={};
  sales.forEach(v=>(v.items||[]).forEach(it=>{
    const k=it.productId||it.name; const e=prodMap[k]||(prodMap[k]={name:it.name,qty:0,rev:0});
    e.qty+=(+it.qty||0); e.rev+=((+it.price||0)*(+it.qty||0))-(+it.discount||0);
  }));
  const topRev=Object.values(prodMap).sort((a,b)=>b.rev-a.rev).slice(0,8);
  // Por vendedor
  const sellMap={};
  sales.forEach(v=>{const k=v.userName||'—';sellMap[k]=(sellMap[k]||0)+((+v.total||0)-(+v.returnedTotal||0));});
  const sellers=Object.entries(sellMap).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  // Por día
  const dayMap={};
  sales.forEach(v=>{const d=iso(v.at);dayMap[d]=(dayMap[d]||0)+((+v.total||0)-(+v.returnedTotal||0));});
  const [f,t]=range(); const days=[];
  if(isFinite(f)&&isFinite(t)){
    for(let d=new Date(from+'T00:00:00').getTime(); d<=t && days.length<60; d+=DAY){
      const k=iso(d); days.push({label:fdate(d).slice(0,5),value:dayMap[k]||0});
    }
  }
  // Compras y caja
  const compras=PURCH.filter(p=>inRange(p.at)).reduce((s,p)=>s+(+p.total||0),0);
  const closed=REGS.filter(r=>r.status==='cerrada'&&inRange(r.closedAt||r.openedAt));
  const diff=closed.reduce((s,r)=>s+(+r.difference||0),0);
  return {sales,fact,prof,tickets,items,pay,topRev,sellers,days,compras,closed,diff};
}

function paint(){
  const r=compute();
  const avg=r.tickets?r.fact/r.tickets:0;
  const marginPct=r.fact?r.prof/r.fact*100:0;
  const payRows=Object.entries(r.pay).map(([k,v])=>({label:PM[k]||k,value:v})).sort((a,b)=>b.value-a.value);
  document.getElementById('host').innerHTML=`
    <div class="grid grid-4">
      ${sc('Facturación',money(r.fact),'#16a34a')}
      ${sc('Ganancia',money(r.prof),'#2563eb')}
      ${sc('Comprobantes',num(r.tickets,0))}
      ${sc('Ticket promedio',money(avg))}</div>
    <div class="grid grid-4 mt-16">
      ${sc('Unidades vendidas',num(r.items))}
      ${sc('Margen',pct(marginPct))}
      ${sc('Compras',money(r.compras),'#dc2626')}
      ${sc('Dif. de caja',money(r.diff),r.diff<0?'#dc2626':'#16a34a')}</div>
    <div class="card card-pad mt-16"><h3 style="margin-bottom:12px">📈 Ventas por día</h3>${barChart(r.days,money)}</div>
    <div class="grid grid-2 mt-16">
      <div class="card card-pad"><h3 style="margin-bottom:12px">🏆 Productos más vendidos</h3>
        <table class="table"><thead><tr><th>Producto</th><th class="ta-right">Cant.</th><th class="ta-right">Facturado</th></tr></thead>
        <tbody>${r.topRev.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td class="ta-right">${num(p.qty)}</td><td class="ta-right"><b>${money(p.rev)}</b></td></tr>`).join('')||'<tr><td colspan="3" class="empty">Sin datos</td></tr>'}</tbody></table></div>
      <div class="card card-pad"><h3 style="margin-bottom:12px">💳 Medios de pago</h3>${barChart(payRows,money)}
        <h3 style="margin:16px 0 12px">👤 Por vendedor</h3>${barChart(r.sellers,money)}</div></div>`;
}

function exportCsv(){
  const r=compute();
  if(!r.sales.length) return err('No hay ventas en el período');
  const esc=s=>`"${String(s==null?'':s).replace(/"/g,'""')}"`;
  const head=['Numero','Fecha','Cliente','Vendedor','Subtotal','Descuento','Total','Ganancia','Estado'];
  const lines=[head.join(',')];
  r.sales.forEach(v=>lines.push([v.number,new Date(v.at).toLocaleString('es-AR'),v.clientName||'Consumidor Final',v.userName||'',v.subtotal||0,v.discount||0,v.total||0,v.profit||0,v.status||'completada'].map(esc).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`ventas_${from}_a_${to}.csv`; a.click(); URL.revokeObjectURL(a.href);
  ok('CSV exportado');
}
