import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Sales, calcTotals, isDecimalUnit } from '../services/sales.service.js';
import { money, num } from '../utils/format.js';
import { ok, err, warn } from '../utils/toast.js';
import { can } from '../services/permissions.js';
import { openPayment, showTicket } from './pos-pay.js';

export let STATE={cart:[],generalDiscount:0,clientId:'',user:null};
let PRODUCTS=[],CATS=[],CLIENTS=[],activeCat='';

(async()=>{
  const user=await requireAuth('pos'); if(!user) return;
  STATE.user=user;
  const view=renderShell('pos','Punto de Venta');
  view.innerHTML='<div class="loader">Cargando\u2026</div>';
  [PRODUCTS,CATS,CLIENTS]=await Promise.all([DB.list('products'),DB.list('categories'),DB.list('clients')]);
  PRODUCTS=PRODUCTS.filter(p=>p.active!==false);
  render(view);
  const gs=document.getElementById('globalSearch'); if(gs) gs.style.display='none';
})();

function render(view){
  const cf=CLIENTS.find(c=>/final/i.test(c.lastName||'')); if(cf) STATE.clientId=cf.id;
  view.innerHTML=`<div class="pos">
    <div class="pos-left">
      <div class="pos-search">
        <input class="input" id="posSearch" placeholder="\ud83d\udd0d Buscar por nombre o c\u00f3digo" autofocus>
        <input class="input" id="posBarcode" placeholder="\ud83d\udcf7 C\u00f3digo de barras (Enter)" style="max-width:220px">
      </div>
      <div class="pos-cats" id="posCats"></div>
      <div class="pos-grid" id="posGrid"></div>
    </div>
    <div class="cart">
      <div class="cart-head"><b>\ud83d\uded2 Carrito</b><button class="btn btn-sm btn-ghost" id="clearCart">Vaciar</button></div>
      <div class="cart-client">
        <label style="font-size:11px;color:var(--text-2);font-weight:600">Cliente</label>
        <select class="select" id="cartClient" style="margin-top:4px">
          ${CLIENTS.map(c=>`<option value="${c.id}" ${c.id===STATE.clientId?'selected':''}>${c.name} ${c.lastName||''}${c.balance>0?' \u2014 debe '+money(c.balance):''}</option>`).join('')}
        </select>
      </div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-foot" id="cartFoot"></div>
    </div></div>`;

  renderCats(); renderGrid('');
  const s=document.getElementById('posSearch');
  s.oninput=()=>renderGrid(s.value.toLowerCase());
  const bc=document.getElementById('posBarcode');
  bc.onkeydown=e=>{ if(e.key==='Enter'){ addByCode(bc.value.trim()); bc.value=''; } };
  document.getElementById('cartClient').onchange=e=>STATE.clientId=e.target.value;
  document.getElementById('clearCart').onclick=()=>{ if(STATE.cart.length){STATE.cart=[];STATE.generalDiscount=0;paintCart();} };
  document.addEventListener('keydown',e=>{ if(e.key==='F2'){e.preventDefault();doCheckout();} });
  paintCart();
}

function renderCats(){
  const host=document.getElementById('posCats');
  host.innerHTML=`<span class="chip ${activeCat===''?'active':''}" data-c="">Todos</span>`+
    CATS.map(c=>`<span class="chip ${activeCat===c.id?'active':''}" data-c="${c.id}">${c.name}</span>`).join('');
  host.querySelectorAll('[data-c]').forEach(ch=>ch.onclick=()=>{activeCat=ch.dataset.c;renderCats();
    renderGrid(document.getElementById('posSearch').value.toLowerCase());});
}

function renderGrid(q){
  const grid=document.getElementById('posGrid');
  let list=PRODUCTS;
  if(activeCat) list=list.filter(p=>p.categoryId===activeCat);
  if(q) list=list.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.code||'').toLowerCase().includes(q)||(p.barcode||'').includes(q));
  if(!list.length){ grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="big">\ud83d\udd0d</div>Sin resultados</div>'; return; }
  grid.innerHTML=list.slice(0,120).map(p=>{
    const out=(p.stock||0)<=0;
    const thumb=p.image?`<img src="${p.image}">`:'\ud83d\udce6';
    return `<div class="pcard ${out?'out':''}" data-id="${p.id}"><div class="thumb">${thumb}</div>
      <div class="pinfo"><div class="pname">${p.name}</div><div class="pprice">${money(p.price)}</div>
      <div class="pstock">${out?'Sin stock':'Stock: '+num(p.stock)+' '+p.unit}</div></div></div>`;}).join('');
  grid.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>addToCart(PRODUCTS.find(p=>p.id===el.dataset.id)));
}

function addByCode(code){
  if(!code) return;
  const p=PRODUCTS.find(x=>x.barcode===code||x.code===code);
  if(!p) return warn('No se encontr\u00f3 el producto con c\u00f3digo '+code);
  addToCart(p);
}

function addToCart(p){
  if(!p) return;
  if((p.stock||0)<=0 && !isDecimalUnit(p.unit)) return warn(p.name+' sin stock');
  const ex=STATE.cart.find(i=>i.productId===p.id);
  if(ex){ ex.qty=+(ex.qty+1).toFixed(3); }
  else STATE.cart.push({productId:p.id,name:p.name,unit:p.unit,price:p.price,cost:p.cost||0,
    iva:p.iva||0,qty:1,discount:0,stock:p.stock});
  paintCart(); ok(p.name+' agregado',' ');
}

function paintCart(){
  const host=document.getElementById('cartItems'); const foot=document.getElementById('cartFoot');
  const canPrice=can(STATE.user.role,'price.edit');
  const canDisc=can(STATE.user.role,'discount.apply');
  if(!STATE.cart.length){
    host.innerHTML='<div class="cart-empty"><div><div style="font-size:40px">\ud83d\uded2</div>Carrito vac\u00edo<br><span style="font-size:12px">Toc\u00e1 un producto para agregarlo</span></div></div>';
    foot.innerHTML=`<button class="btn btn-primary w-full" disabled>Cobrar</button>`; return;
  }
  host.innerHTML=STATE.cart.map((it,i)=>{
    const step=isDecimalUnit(it.unit)?'0.001':'1';
    const line=+(it.price*it.qty - (it.discount||0)).toFixed(2);
    return `<div class="citem">
      <div style="flex:1"><div class="ci-name">${it.name}</div>
        <div class="ci-sub">${money(it.price)} / ${it.unit}${it.discount?` \u00b7 desc ${money(it.discount)}`:''}</div>
        <div class="flex gap-8 mt-8">
          ${canPrice?`<input class="input" style="width:90px;padding:4px 6px" type="number" step="0.01" value="${it.price}" data-price="${i}" title="Precio">`:''}
          ${canDisc?`<input class="input" style="width:80px;padding:4px 6px" type="number" step="0.01" value="${it.discount||0}" data-disc="${i}" title="Descuento $">`:''}
        </div>
      </div>
      <div class="qty"><div class="qbtn" data-dec="${i}">\u2212</div>
        <input type="number" step="${step}" min="0" value="${it.qty}" data-qty="${i}">
        <div class="qbtn" data-inc="${i}">+</div></div>
      <div class="ci-total">${money(line)}</div>
      <div class="ci-del" data-del="${i}">\ud83d\uddd1\ufe0f</div></div>`;}).join('');

  const t=calcTotals(STATE.cart,STATE.generalDiscount);
  foot.innerHTML=`
    <div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    <div class="row"><span>Descuentos</span><span class="text-alert">- ${money(t.itemDiscount+t.generalDiscount)}</span></div>
    ${canDisc?`<div class="row"><span>Desc. general $</span><input class="input" id="genDisc" type="number" step="0.01" value="${STATE.generalDiscount}" style="width:110px;padding:5px 8px;text-align:right"></div>`:''}
    <div class="row"><span>Costo</span><span class="text-muted">${money(t.cost)}</span></div>
    <div class="row"><span>Ganancia est.</span><span class="text-profit">${money(t.profit)}</span></div>
    <div class="row total"><span>TOTAL</span><span>${money(t.total)}</span></div>
    <button class="btn btn-primary w-full" id="btnCheckout" style="padding:14px;font-size:16px">\ud83d\udcb3 Cobrar (F2)</button>`;

  host.querySelectorAll('[data-qty]').forEach(inp=>inp.onchange=()=>setQty(+inp.dataset.qty,+inp.value));
  host.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>setQty(+b.dataset.inc,STATE.cart[+b.dataset.inc].qty+1));
  host.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>setQty(+b.dataset.dec,STATE.cart[+b.dataset.dec].qty-1));
  host.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{STATE.cart.splice(+b.dataset.del,1);paintCart();});
  host.querySelectorAll('[data-price]').forEach(inp=>inp.onchange=()=>{STATE.cart[+inp.dataset.price].price=Math.max(0,+inp.value||0);paintCart();});
  host.querySelectorAll('[data-disc]').forEach(inp=>inp.onchange=()=>{STATE.cart[+inp.dataset.disc].discount=Math.max(0,+inp.value||0);paintCart();});
  const gd=document.getElementById('genDisc'); if(gd) gd.onchange=()=>{STATE.generalDiscount=Math.max(0,+gd.value||0);paintCart();};
  document.getElementById('btnCheckout').onclick=doCheckout;
}

function setQty(i,v){
  const it=STATE.cart[i]; if(!it) return;
  v=isDecimalUnit(it.unit)?+(+v).toFixed(3):Math.round(v);
  if(v<=0){ STATE.cart.splice(i,1); } else it.qty=v;
  paintCart();
}

async function doCheckout(){
  if(!STATE.cart.length) return;
  const t=calcTotals(STATE.cart,STATE.generalDiscount);
  const client=CLIENTS.find(c=>c.id===STATE.clientId);
  const sale=await openPayment({total:t.total,client,canCC:!!client});
  if(!sale) return; // cancelado
  try{
    const done=await Sales.confirm({items:STATE.cart.map(({stock,...r})=>r),generalDiscount:STATE.generalDiscount,
      payments:sale.payments,clientId:STATE.clientId,client,user:STATE.user,cashReceived:sale.cashReceived});
    ok('Venta #'+done.number+' registrada por '+money(done.total));
    // refrescar stock local
    for(const it of STATE.cart){ const p=PRODUCTS.find(x=>x.id===it.productId); if(p) p.stock=+(p.stock-it.qty).toFixed(3); }
    STATE.cart=[]; STATE.generalDiscount=0; paintCart();
    renderGrid(document.getElementById('posSearch').value.toLowerCase());
    showTicket(done,client);
  }catch(ex){ err(ex.message||'No se pudo registrar la venta'); }
}

