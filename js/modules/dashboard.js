import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { money, num, fdatetime, dayStart, monthStart } from '../utils/format.js';
import { currentTheme } from '../utils/theme.js';

const PM_LABEL={efectivo:'Efectivo',debito:'Débito',credito:'Crédito',transferencia:'Transferencia',cuenta_corriente:'Cta. Corriente',otros:'Otros'};

(async()=>{
  const user=await requireAuth('dashboard'); if(!user) return;
  const view=renderShell('dashboard','Dashboard');
  view.innerHTML='<div class="loader">Cargando panel…</div>';

  const [sales,products,clients,suppliers,categories]=await Promise.all([
    DB.list('sales'),DB.list('products'),DB.list('clients'),DB.list('suppliers'),DB.list('categories')]);

  const today=dayStart(), mStart=monthStart();
  const valid=sales.filter(s=>s.status!=='anulada');
  const todaySales=valid.filter(s=>s.at>=today);
  const monthSales=valid.filter(s=>s.at>=mStart);
  const sum=(a,f)=>a.reduce((t,x)=>t+(f(x)||0),0);

  const totToday=sum(todaySales,s=>s.total);
  const totMonth=sum(monthSales,s=>s.total);
  const profitMonth=sum(monthSales,s=>s.profit);
  const payTotals={}; valid.forEach(s=>(s.payments||[]).forEach(p=>payTotals[p.method]=(payTotals[p.method]||0)+p.amount));
  const cash=payTotals.efectivo||0, card=(payTotals.debito||0)+(payTotals.credito||0), cc=payTotals.cuenta_corriente||0;

  const lowStock=products.filter(p=>p.active!==false && p.stock>0 && p.stock<=p.stockMin);
  const noStock=products.filter(p=>p.active!==false && (p.stock||0)<=0);
  const debtors=clients.filter(c=>(c.balance||0)>0);

  // Productos más vendidos
  const prodQty={}; valid.forEach(s=>(s.items||[]).forEach(it=>prodQty[it.productId]=(prodQty[it.productId]||0)+it.qty));
  const topProducts=Object.entries(prodQty).map(([id,q])=>({p:products.find(x=>x.id===id),q}))
    .filter(x=>x.p).sort((a,b)=>b.q-a.q).slice(0,5);

  const stat=(ic,color,label,value,sub)=>`<div class="stat fade-in"><div class="ic" style="background:${color}">${ic}</div>
    <div class="label">${label}</div><div class="value">${value}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;

  view.innerHTML=`
   <div class="page-head"><div><h1>Hola, ${user.name.split(' ')[0]} 👋</h1><p>Resumen general de tu negocio</p></div></div>
   <div class="grid grid-4">
     ${stat('💰','var(--sales)','Ventas de hoy',money(totToday),todaySales.length+' operaciones')}
     ${stat('📅','var(--primary)','Ventas del mes',money(totMonth),monthSales.length+' operaciones')}
     ${stat('📈','var(--profit)','Ganancia del mes',money(profitMonth),'estimada')}
     ${stat('🧾','var(--purchases)','Ticket promedio',money(monthSales.length?totMonth/monthSales.length:0),'del mes')}
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
      <span>${p.name}</span><span class="badge ${p.stock<=0?'badge-danger':'badge-warn'}">${num(p.stock)} / min ${p.stockMin}</span></div>`).join('')
    : '<div class="empty">✅ Todo el stock está OK</div>';

  const recent=[...valid].sort((a,b)=>b.at-a.at).slice(0,6);
  document.getElementById('recentSales').innerHTML = recent.length? recent.map(s=>{
    const cl=clients.find(c=>c.id===s.clientId);
    return `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div><b>#${s.number}</b> <span class="text-muted" style="font-size:12px">${cl?cl.name+' '+(cl.lastName||''):''}</span><br>
      <span style="font-size:11px;color:var(--text-3)">${fdatetime(s.at)}</span></div>
      <b class="text-sales">${money(s.total)}</b></div>`; }).join('') : '<div class="empty">Sin ventas aún</div>';

  document.getElementById('debtorsList').innerHTML = debtors.length? debtors.slice(0,6).map(c=>
    `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${c.name} ${c.lastName||''}</span><b class="text-alert">${money(c.balance)}</b></div>`).join('')
    : '<div class="empty">Sin deudores</div>';

  document.getElementById('supList').innerHTML = suppliers.length? suppliers.slice(0,6).map(s=>
    `<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${s.tradeName||s.legalName}</span><span class="badge badge-neutral">${s.city||''}</span></div>`).join('')
    : '<div class="empty">Sin proveedores</div>';

  // ===== Charts =====
  const grid=currentTheme()==='dark'?'#243049':'#e2e8f0';
  const tx=currentTheme()==='dark'?'#cbd5e1':'#475569';
  Chart.defaults.color=tx; Chart.defaults.borderColor=grid; Chart.defaults.font.family="'Inter',sans-serif";

  // Daily last 14 days
  const days=[],dayTot=[];
  for(let i=13;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const ds=dayStart(d);
    const de=ds+864e5; days.push(d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}));
    dayTot.push(sum(valid.filter(s=>s.at>=ds&&s.at<de),s=>s.total)); }
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
