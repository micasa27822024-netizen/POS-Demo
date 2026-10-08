// Shell de la aplicación: sidebar + topbar, filtrado por permisos de rol.
import { Auth } from '../services/auth.service.js';
import { canAccess, ROLES } from '../services/permissions.js';
import { themeButton } from '../utils/theme.js';

const NAV=[
  {g:'Principal',items:[
    {k:'dashboard',ic:'📊',label:'Dashboard',href:'dashboard.html'},
    {k:'pos',ic:'🛒',label:'Punto de Venta',href:'pos.html'}
  ]},
  {g:'Operaciones',items:[
    {k:'sales',ic:'🧾',label:'Ventas',href:'sales.html'},
    {k:'purchases',ic:'📦',label:'Compras',href:'purchases.html'},
    {k:'cash',ic:'💵',label:'Caja',href:'cash.html'}
  ]},
  {g:'Catálogo',items:[
    {k:'products',ic:'🏷️',label:'Productos',href:'products.html'},
    {k:'categories',ic:'🗂️',label:'Categorías',href:'categories.html'},
    {k:'stock',ic:'📈',label:'Stock',href:'stock.html'}
  ]},
  {g:'Contactos',items:[
    {k:'clients',ic:'👥',label:'Clientes',href:'clients.html'},
    {k:'suppliers',ic:'🏭',label:'Proveedores',href:'suppliers.html'}
  ]},
  {g:'Gestión',items:[
    {k:'reports',ic:'📉',label:'Reportes',href:'reports.html'},
    {k:'users',ic:'🔑',label:'Usuarios',href:'users.html'},
    {k:'audit',ic:'🔍',label:'Auditoría',href:'audit.html'},
    {k:'settings',ic:'⚙️',label:'Configuración',href:'settings.html'}
  ]}
];

export function renderShell(active,title){
  const u=Auth.profile; const role=u?.role||'cajero';
  const initials=(u?.name||'U').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const navHtml=NAV.map(gr=>{
    const items=gr.items.filter(it=>canAccess(role,it.k));
    if(!items.length) return '';
    return `<div class="group">${gr.g}</div>`+items.map(it=>
      `<a href="${it.href}" class="${it.k===active?'active':''}"><i>${it.ic}</i>${it.label}</a>`).join('');
  }).join('');

  document.body.insertAdjacentHTML('afterbegin',`
  <div class="sb-overlay" id="sbOverlay"></div>
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="logo">P</div><div class="name">POS Pro<small>Sistema de ventas</small></div></div>
      <nav class="nav">${navHtml}</nav>
      <div class="foot">
        <div class="user-card"><div class="av">${initials}</div>
          <div style="flex:1"><div class="nm">${u?.name||'Usuario'}</div><div class="rl">${ROLES[role]?.label||role}</div></div>
          <button class="btn btn-icon btn-ghost" id="btnLogout" title="Cerrar sesión">⏻</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-icon btn-ghost menu-btn" id="btnMenu">☰</button>
        <div class="page-title">${title||''}</div>
        <div class="search"><i>🔍</i><input id="globalSearch" placeholder="Buscar productos, clientes, ventas..."></div>
        <div id="themeSlot"></div>
        <div class="avatar" title="${u?.email||''}">${initials}</div>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`);

  document.getElementById('themeSlot').appendChild(themeButton());
  const sb=document.getElementById('sidebar'), ov=document.getElementById('sbOverlay');
  document.getElementById('btnMenu').onclick=()=>{sb.classList.toggle('open');ov.classList.toggle('show');};
  ov.onclick=()=>{sb.classList.remove('open');ov.classList.remove('show');};
  document.getElementById('btnLogout').onclick=async()=>{ await Auth.logout(); location.href='login.html'; };
  return document.getElementById('view');
}
