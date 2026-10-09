import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { money, num, fdatetime, dayStart, monthStart, dayKeyAR } from '../utils/format.js';
import { currentTheme } from '../utils/theme.js';
import { esc } from '../utils/escape.js';

const PM_LABEL={efectivo:'Efectivo',debito:'Débito',credito:'Crédito',transferencia:'Transferencia',cuenta_corriente:'Cta. Corriente',otros:'Otros'};

(async()=>{
  const user=await requireAuth('dashboard'); if(!user) return;
  const view=renderShell('dashboard','Dashboard');
  view.innerHTML='<div class="loader">Cargando panel…</div>';

  // B1: lecturas acotadas. Los agregados diarios salen de `dailyStats`
  // (ya netos de anulaciones). El detalle de ítems se consulta solo para los
  // últimos 30 días; los deudores por filtro de saldo; stock por productos.
  const iso=d=>dayKeyAR(d);
  const now=Date.now();
  const cutoff30=now-30*864e5;
  const cutoffStr=iso(cutoff30);
  const [dstats,recentDetail,products,debtors,suppliers,categories]=await Promise.all([
    DB.list('dailyStats',{where:[['date','>=',cutoffStr]],orderBy:['date','asc']}),
    DB.list('sales',{where:[['at','>=',cutoff30]],orderBy:['at','desc'],limit:3000}),
    DB.list('products',{limit:2000}),
    DB.list('clients',{where:[['balance','>',0]],limit:500}),
    DB.list('suppliers',{limit:6}),
    DB.list('categories',{limit:300})
  ]);

  const todayStr=iso(now);
  const monthPrefix=todayStr.slice(0,7); // YYYY-MM
  const dayMap={}; dstats.forEach(d=>dayMap[d.date]=d);
  const td=dayMap[todayStr]||{};
  const monthRows=dstats.filter(d=>(d.date||'').startsWith(monthPrefix));
  const msum=(f)=>monthRows.reduce((t,x)=>t+(x[f]||0),0);

  const totToday=td.total||0;
  const totMonth=msum('total');
  const profitMonth=msum('profit');
  const todayCount=td.salesCount||0;
  const monthCount=msum('salesCount');

  // Métodos de pago: suma de los campos pm_* de los últimos 30 días.
  const payTotals={};
  dstats.forEach(d=>{ for(const k in d){ if(k.startsWith('pm_')){ const m=k.slice(3); payTotals[m]=(payTotals[m]||0)+(d[k]||0); } } });
  const cash=payTotals.efectivo||0, card=(payTotals.debito||0)+(payTotals.credito||0), cc=payTotals.cuenta_corriente||0;

  const valid=recentDetail.filter(s=>s.status!=='anulada'); // detalle 30d para rankings
  const lowStock=products.filter(p=>p.active!==false && p.stock>0 && p.stock<=p.stockMin);
  const noStock=products.filter(p=>p.active!==false && (p.stock||0)<=0);

  // Productos más vendidos (últimos 30 días)
  const prodQty={}; valid.forEach(s=>(s.items||[]).forEach(it=>prodQty[it.productId]=(prodQty[it.productId]||0)+it.qty));
  const topProducts=Object.entries(prodQty).map(([id,q])=>({p:products.find(x=>x.id===id),q}))
    .filter(x=>x.p).sort((a,b)=>b.q-a.q).slice(0,5);

  const stat=(ic,color,label,value,sub)=>`<div class="stat fade-in"><div class="ic" style="background:${color}">${ic}</div>
    <div class="label">${label}</div><div class="value">${value}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;

  view.innerHTML=`
   <div class="page-head"><div><h1>Hola, ${esc(user.name.split(' ')[0])} 👋</h1><p>Resumen general de tu negocio</p></div></div>
   <div class="grid grid-4">
     ${stat('💰','var(--sales)','Ventas de hoy',money(totToday),todayCount+' operaciones')}
     ${stat('📅','var(--primary)','Ventas del mes',money(totMonth),monthCount+' operaciones')}
     ${stat('📈','var(--profit)','Ganancia del mes',money(profitMonth),'estimada')}
     ${stat('🧾','var(--purchases)','Ticket promedio',money(monthCount?totMonth/monthCount:0),'del mes')}
   </div>
   <div class="grid grid-4 mt-16">
     ${stat('💵','var(--cash)','Cobrado efectivo',money(cash))}
     ${stat('💳','var(--sales)','Cobrado tarjeta',money(card))}
     ${stat('🧧','var(--clients)','Cuenta corriente',money(cc))}
     ${stat('⚠️','var(--alert)','Alertas de stock',num(lowStock.length+noStock.length,0),noStock.length+' sin stock')}
   </div>
   <div class="grid grid-2 mt-24">
     <div class="card card-pad"><div class="flex justify-between items-center" style="margin-bottom:10px">
       <b>Ventas de los últimos 14 días</b></div><canvas id="chDaily" height="120"></canvas></div>
     <div class="card card-pad"><b>Métodos de pago</b><div style="max-width:260px;margin:10px auto"><canvas id="chPay"></canvas></div></div>
   </div>
   <div class="grid grid-2 mt-16">
     <div class="card card-pad"><b>Ventas por categoría</b><canvas id="chCat" height="120"></canvas></div>
     <div class="card card-pad"><b>Productos más vendidos</b><canvas id="chTop" height="120"></canvas></div>
   </div>
   <div class="grid grid-2 mt-16">
     <div class="card card-pad"><b>⚠️ Stock bajo / sin stock</b><div id="lowStockList" class="mt-8"></div></div>
     <div class="card card-pad"><b>🕒 Últimas ventas</b><div id="recentSales" class="mt-8"></div></div>
   </div>
   <div class="grid grid-2 mt-16">
     <div class="card card-pad"><b>🧧 Clientes con deuda</b><div id="debtorsList" class="mt-8"></div></div>
     <div class="card card-pad"><b>🏭 Proveedores</b><div id="supList" class="mt-8"></div></div>
   </div>`;

  // Listas
  const low=[...noStock,...lowStock];
  document.getElementById('lowStockList').innerHTML = low.length? low.slice(0,6).map(p=>
    `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${esc(p.name)}</span><span class="badge ${p.stock<=0?'badge-danger':'badge-warn'}">${num(p.stock)} / min ${p.stockMin}</span></div>`).join('')
    : '<div class="empty">✅ Todo el stock está OK</div>';

  const recent=[...valid].sort((a,b)=>b.at-a.at).slice(0,6);
  document.getElementById('recentSales').innerHTML = recent.length? recent.map(s=>{
    return `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div><b>#${esc(String(s.number))}</b> <span class="text-muted" style="font-size:12px">${esc(s.clientName||'Consumidor Final')}</span><br>
      <span style="font-size:11px;color:var(--text-3)">${fdatetime(s.at)}</span></div>
      <b class="text-sales">${money(s.total)}</b></div>`; }).join('') : '<div class="empty">Sin ventas aún</div>';

  document.getElementById('debtorsList').innerHTML = debtors.length? debtors.slice(0,6).map(c=>
    `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${esc((c.name||'')+' '+(c.lastName||''))}</span><b class="text-alert">${money(c.balance)}</b></div>`).join('')
    : '<div class="empty">Sin deudores</div>';

  document.getElementById('supList').innerHTML = suppliers.length? suppliers.slice(0,6).map(s=>
    `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${esc(s.tradeName||s.legalName||'')}</span><span class="badge badge-neutral">${esc(s.city||'')}</span></div>`).join('')
    : '<div class="empty">Sin proveedores</div>';

  // ===== Charts =====
  const grid=currentTheme()==='dark'?'#243049':'#e2e8f0';
  const tx=currentTheme()==='dark'?'#cbd5e1':'#475569';
  Chart.defaults.color=tx; Chart.defaults.borderColor=grid; Chart.defaults.font.family="'Inter',sans-serif";

  // Daily last 14 days (desde dailyStats)
  const days=[],dayTot=[];
  for(let i=13;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i);
    const key=iso(d);
    days.push(d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}));
    dayTot.push((dayMap[key]&&dayMap[key].total)||0); }
  new Chart(document.getElementById('chDaily'),{type:'line',data:{labels:days,datasets:[{label:'Ventas',data:dayTot,
    borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.12)',fill:true,tension:.35,pointRadius:3}]},
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});

  const pmKeys=Object.keys(payTotals);
  new Chart(document.getElementById('chPay'),{type:'doughnut',data:{labels:pmKeys.map(k=>PM_LABEL[k]||k),
    datasets:[{data:pmKeys.map(k=>payTotals[k]),backgroundColor:['#059669','#2563eb','#9333ea','#f59e0b','#db2777','#64748b']}]},
    options:{plugins:{legend:{position:'bottom'}}}});

  const catTot={}; valid.forEach(s=>(s.items||[]).forEach(it=>{const p=products.find(x=>x.id===it.productId);
    const cid=p?.categoryId; const c=categories.find(x=>x.id===cid); const nm=c?c.name:'Otros';
    catTot[nm]=(catTot[nm]||0)+it.total;}));
  new Chart(document.getElementById('chCat'),{type:'bar',data:{labels:Object.keys(catTot),
    datasets:[{label:'$',data:Object.values(catTot),backgroundColor:'#0891b2',borderRadius:6}]},
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});

  new Chart(document.getElementById('chTop'),{type:'bar',data:{labels:topProducts.map(t=>t.p.name),
    datasets:[{label:'Unidades',data:topProducts.map(t=>t.q),backgroundColor:'#16a34a',borderRadius:6}]},
    options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});
})();
