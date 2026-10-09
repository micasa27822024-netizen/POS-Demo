import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { money, num, fdatetime, dayStart, monthStart, dayKeyAR } from '../utils/format.js';
import { currentTheme } from '../utils/theme.js';
import { esc } from '../utils/escape.js';
import { aggregateDaily, topProductIds } from '../services/dashboard-agg.js';

const PM_LABEL={efectivo:'Efectivo',debito:'Débito',credito:'Crédito',transferencia:'Transferencia',cuenta_corriente:'Cta. Corriente',otros:'Otros'};

(async()=>{
  const user=await requireAuth('dashboard'); if(!user) return;
  const view=renderShell('dashboard','Dashboard');
  view.innerHTML='<div class="loader">Cargando panel…</div>';

  // B1: lecturas acotadas. Antes el Dashboard bajaba hasta 3.000 ventas + 2.000
  // productos (~5.000 lecturas por apertura). Ahora los agregados (rankings y
  // medios de pago) salen de `dailyStats`, las últimas ventas son 12 documentos y
  // las alertas de stock consultan SOLO los productos a reponer (needsRestock==true).
  const iso=d=>dayKeyAR(d);
  const now=Date.now();
  const cutoffStr=iso(now-30*864e5);
  const [dstats,recent,lowProducts,debtors,suppliers,categories]=await Promise.all([
    DB.list('dailyStats',{where:[['date','>=',cutoffStr]],orderBy:['date','asc']}),
    DB.list('sales',{orderBy:['at','desc'],limit:12}),
    DB.list('products',{where:[['needsRestock','==',true]],limit:500}),
    DB.list('clients',{where:[['balance','>',0]],limit:500}),
    DB.list('suppliers',{limit:6}),
    DB.list('categories',{limit:300})
  ]);
  const {prodQty,catAmt,payTotals}=aggregateDaily(dstats);
  // Nombres de los 5 más vendidos: 5 lecturas puntuales, no toda la tabla de productos.
  const topIds=topProductIds(prodQty,5);
  const topDocs=await Promise.all(topIds.map(id=>DB.get('products',id).catch(()=>null)));

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

  // Métodos de pago: ya consolidados por aggregateDaily (campos pm_* de 30 días).
  const cash=payTotals.efectivo||0, card=(payTotals.debito||0)+(payTotals.credito||0), cc=payTotals.cuenta_corriente||0;

  // Alertas de stock: la consulta ya trajo SOLO los productos que necesitan reposición.
  const lowAll=lowProducts.filter(p=>p.active!==false);
  const noStock=lowAll.filter(p=>(p.stock||0)<=0);
  const lowStock=lowAll.filter(p=>(p.stock||0)>0);

  // Productos más vendidos (30 días) desde los agregados de dailyStats.
  const topProducts=topIds.map((id,i)=>({p:topDocs[i]||{id,name:'(sin nombre)'},q:prodQty[id]})).filter(x=>x.q>0);

  // Últimas ventas no anuladas (de los 12 documentos más recientes).
  const recentValid=recent.filter(s=>s.status!=='anulada');

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

  const recentList=recentValid.slice(0,6);
  document.getElementById('recentSales').innerHTML = recentList.length? recentList.map(s=>{
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

  const catTot={}; for(const cid in catAmt){ const c=categories.find(x=>x.id===cid); const nm=c?c.name:'Otros'; catTot[nm]=(catTot[nm]||0)+catAmt[cid]; }
  new Chart(document.getElementById('chCat'),{type:'bar',data:{labels:Object.keys(catTot),
    datasets:[{label:'$',data:Object.values(catTot),backgroundColor:'#0891b2',borderRadius:6}]},
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});

  new Chart(document.getElementById('chTop'),{type:'bar',data:{labels:topProducts.map(t=>t.p.name),
    datasets:[{label:'Unidades',data:topProducts.map(t=>t.q),backgroundColor:'#16a34a',borderRadius:6}]},
    options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});
})();
