// Shell de la aplicación: sidebar + topbar, filtrado por permisos de rol.
import { Auth } from '../services/auth.service.js';
import { canAccess, ROLES } from '../services/permissions.js';
import { themeButton } from '../utils/theme.js';

const NAV=[
  {g:'Principal',items:[
    {k:'dashboard',ic:'\ud83d\udcca',label:'Dashboard',href:'dashboard.html'},
    {k:'pos',ic:'\ud83d\uded2',label:'Punto de Venta',href:'pos.html'}
  ]},
  {g:'Operaciones',items:[
    {k:'sales',ic:'\ud83e\uddfe',label:'Ventas',href:'sales.html'},
    {k:'purchases',ic:'\ud83d\udce6',label:'Compras',href:'purchases.html'},
    {k:'cash',ic:'\ud83d\udcb5',label:'Caja',href:'cash.html'}
  ]},
  {g:'Cat\u00e1logo',items:[
    {k:'products',ic:'\ud83c\udff7\ufe0f',label:'Productos',href:'products.html'},
    {k:'categories',ic:'\ud83d\uddc2\ufe0f',label:'Categor\u00edas',href:'categories.html'},
    {k:'stock',ic:'\ud83d\udcc8',label:'Stock',href:'stock.html'}
  ]},
  {g:'Contactos',items:[
    {k:'clients',ic:'\ud83d\udc65',label:'Clientes',href:'clients.html'},
    {k:'suppliers',ic:'\ud83c\udfed',label:'Proveedores',href:'suppliers.html'}
  ]},
  {g:'Gesti\u00f3n',items:[
    {k:'reports',ic:'\ud83d\udcc9',label:'Reportes',href:'reports.html'},
    {k:'users',ic:'\ud83d\udd11',label:'Usuarios',href:'users.html'},
    {k:'audit',ic:'\ud83d\udd0d',label:'Auditor\u00eda',href:'audit.html'},
    {k:'settings',ic:'\u2699\ufe0f',label:'Configuraci\u00f3n',href:'settings.html'}
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
          <button class="btn btn-icon btn-ghost" id="btnLogout" title="Cerrar sesi\u00f3n">\u23fb</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-icon btn-ghost menu-btn" id="btnMenu">\u2630</button>
        <div class="page-title">${title||''}</div>
        <div class="search"><i>\ud83d\udd0d</i><input id="globalSearch" placeholder="Buscar productos, clientes, ventas..."></div>
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
