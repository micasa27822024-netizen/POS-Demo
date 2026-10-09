// Clientes: ABM + cuenta corriente (saldos, abonos y estado de cuenta).
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { validateForm, V } from '../utils/validate.js';
import { Audit } from '../services/audit.service.js';
import { can } from '../services/permissions.js';
import { money, fdatetime } from '../utils/format.js';
import { esc } from '../utils/escape.js';
import { assertUnique } from '../utils/unique.js';

let USER, LIST=[], q='';
(async()=>{
  USER=await requireAuth('clients'); if(!USER) return;
  const view=renderShell('clients','Clientes'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){ LIST=await DB.list('clients',{orderBy:['name','asc']}); }
const full=c=>`${c.name} ${c.lastName||''}`.trim();
const filtered=()=>{ const s=q.toLowerCase().trim();
  return LIST.filter(c=>!s||full(c).toLowerCase().includes(s)||(c.dni||'').includes(s)||(c.phone||'').includes(s)); };

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Clientes</h1><p>Clientes y cuenta corriente</p></div>
    <button class="btn btn-primary" id="btnNew">➕ Nuevo cliente</button></div>
    <div class="card card-pad"><input class="input" id="q" placeholder="🔍 Buscar por nombre, DNI o teléfono…" value="${q}"></div>
    <div id="host" class="mt-16"></div>`;
  const qi=document.getElementById('q'); qi.oninput=e=>{q=e.target.value;paint();};
  document.getElementById('btnNew').onclick=()=>openForm();
  paint();
}
function paint(){
  const rows=filtered();
  document.getElementById('host').innerHTML=`<div class="card"><table class="table">
    <thead><tr><th>Cliente</th><th>DNI</th><th>Teléfono</th><th class="ta-right">Límite</th><th class="ta-right">Saldo</th><th></th></tr></thead>
    <tbody>${rows.map(c=>{const deuda=c.balance||0;
      return `<tr><td><b>${esc(full(c))}</b><br><span style="font-size:11px;color:var(--text-3)">${esc(c.email||c.city||'')}</span></td>
      <td>${esc(c.dni||'—')}</td><td>${esc(c.phone||'—')}</td>
      <td class="ta-right">${c.creditLimit?money(c.creditLimit):'—'}</td>
      <td class="ta-right" style="color:${deuda>0?'var(--danger)':'var(--text-2)'};font-weight:700">${money(deuda)}</td>
      <td class="ta-right"><div class="flex gap-8 justify-end">
        <button class="btn btn-sm btn-ghost" data-cc="${c.id}" title="Cuenta corriente">🧾</button>
        <button class="btn btn-sm btn-ghost" data-ed="${c.id}" title="Editar">✏️</button>
        ${can(USER.role,'*')?`<button class="btn btn-sm btn-ghost" data-dl="${c.id}" title="Eliminar">🗑️</button>`:''}
      </div></td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">Sin clientes</td></tr>'}</tbody></table></div>`;
  const H=document.getElementById('host');
  H.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>openForm(LIST.find(c=>c.id===b.dataset.ed)));
  H.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>openCC(LIST.find(c=>c.id===b.dataset.cc)));
  H.querySelectorAll('[data-dl]').forEach(b=>b.onclick=async()=>{const c=LIST.find(x=>x.id===b.dataset.dl);
    if((c.balance||0)!==0) return warn('No se puede eliminar: el cliente tiene saldo en cuenta corriente');
    if(await confirmDialog({title:'Eliminar cliente',message:`¿Eliminar a "${full(c)}"?`,danger:true})){
      await DB.remove('clients',c.id); await Audit.log('delete','client',{id:c.id}); await reload(); ok('Eliminado'); paint();}});
}
function openForm(c){
  const f=document.createElement('form');
  f.innerHTML=`<div class="grid grid-2">
    <div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(c?.name||'')}"><div class="err-msg"></div></div>
    <div class="field"><label>Apellido</label><input class="input" name="lastName" value="${esc(c?.lastName||'')}"></div>
    <div class="field"><label>DNI / CUIT</label><input class="input" name="dni" value="${esc(c?.dni||'')}"></div>
    <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(c?.phone||'')}"></div>
    <div class="field"><label>Email</label><input class="input" name="email" value="${esc(c?.email||'')}"><div class="err-msg"></div></div>
    <div class="field"><label>Límite de crédito</label><input class="input" name="creditLimit" type="number" step="0.01" value="${c?.creditLimit??0}"></div>
    <div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(c?.city||'')}"></div>
    <div class="field"><label>Provincia</label><input class="input" name="province" value="${esc(c?.province||'')}"></div>
  </div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent=c?'Guardar':'Crear';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:c?'Editar cliente':'Nuevo cliente',body:f,footer:[cancel,save],width:640}); cancel.onclick=m.close;
  save.onclick=async()=>{const data=validateForm(f,{name:[V.required],email:[V.email]}); if(!data) return warn('Revisá los campos');
    const payload={name:data.name,lastName:f.lastName.value.trim(),dni:f.dni.value.trim(),phone:f.phone.value.trim(),
      email:f.email.value.trim(),creditLimit:+f.creditLimit.value||0,city:f.city.value.trim(),province:f.province.value.trim(),
      active:c?c.active!==false:true};
    try{
      // Unicidad: DNI/CUIT y email (email sin distinguir mayús/minús).
      await assertUnique('clients','dni',payload.dni,c?.id,'El DNI/CUIT');
      await assertUnique('clients','email',payload.email,c?.id,'El email',true);
      if(c){ await DB.update('clients',c.id,payload); await Audit.log('update','client',{id:c.id}); }
      else { payload.balance=0; payload.createdAt=Date.now(); const d=await DB.add('clients',payload); await Audit.log('create','client',{id:d.id,name:data.name}); }      await reload(); m.close(); ok('Guardado'); paint();
    }catch(ex){ err(ex.message||'No se pudo guardar'); }};
}
async function openCC(c){
  const movs=(await DB.list('accountsReceivable',{where:[['clientId','==',c.id]]})).sort((a,b)=>b.at-a.at);
  const box=document.createElement('div');
  box.innerHTML=`<div class="flex justify-between items-center" style="margin-bottom:12px">
    <div><b style="font-size:16px">${esc(full(c))}</b><br><span style="font-size:12px;color:var(--text-3)">Límite: ${c.creditLimit?money(c.creditLimit):'sin límite'}</span></div>
    <div class="ta-right"><span style="font-size:12px;color:var(--text-3)">Saldo deudor</span><br>
      <b style="font-size:20px;color:${(c.balance||0)>0?'var(--danger)':'var(--success)'}">${money(c.balance||0)}</b></div></div>
    <button class="btn btn-primary btn-block" id="btnPay" ${(c.balance||0)<=0?'disabled':''}>💵 Registrar pago / abono</button>
    <div class="mt-16"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th class="ta-right">Monto</th><th class="ta-right">Saldo</th></tr></thead>
    <tbody>${movs.map(m=>`<tr><td>${fdatetime(m.at)}</td><td>${esc(m.concept||(m.type==='credito'?'Pago':'Cargo'))}</td>
      <td class="ta-right" style="color:${m.type==='credito'?'var(--success)':'var(--danger)'}">${m.type==='credito'?'-':'+'}${money(m.amount)}</td>
      <td class="ta-right">${money(m.balance)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Sin movimientos</td></tr>'}</tbody></table></div>`;
  const m=openModal({title:'Cuenta corriente',body:box,footer:null,width:680});
  const btn=box.querySelector('#btnPay');
  if(btn) btn.onclick=()=>{ m.close(); openPay(c); };
}
function openPay(c){
  const f=document.createElement('form');
  f.innerHTML=`<p style="color:var(--text-2);margin-bottom:12px">Saldo actual: <b>${money(c.balance||0)}</b></p>
    <div class="field"><label>Monto a abonar *</label><input class="input" name="amount" type="number" step="0.01" max="${c.balance||0}" value="${c.balance||0}"><div class="err-msg"></div></div>
    <div class="field"><label>Medio</label><select class="select" name="method"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="debito">Tarjeta</option></select></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent='Registrar pago';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Registrar pago',body:f,footer:[cancel,save],width:440}); cancel.onclick=m.close;
  save.onclick=async()=>{const amount=+f.amount.value;
    if(!amount||amount<=0) return warn('Ingresá un monto válido');
    if(amount>(c.balance||0)+0.001) return warn('El pago no puede superar el saldo');
    const method=f.method.value;    const newBalance=+((c.balance||0)-amount).toFixed(2);
    try{
      await DB.update('clients',c.id,{balance:newBalance});
      await DB.add('accountsReceivable',{clientId:c.id,type:'credito',amount,balance:newBalance,
        concept:'Pago recibido ('+method+')',method,userId:USER.id,at:Date.now()});
      if(method==='efectivo'){ const open=(await DB.list('cashRegisters',{where:[['status','==','abierta']]}))[0];
        if(open) await DB.add('cashMovements',{registerId:open.id,type:'ingreso',amount,concept:'Cobro CC '+full(c),userId:USER.id,at:Date.now()}); }
      await Audit.log('payment','client',{id:c.id,amount}); await reload(); m.close(); ok('Pago registrado'); paint();
    }catch(ex){ err(ex.message||'No se pudo registrar'); }};
}
