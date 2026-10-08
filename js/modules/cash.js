// Caja: apertura/cierre, ingresos/egresos y arqueo (efectivo esperado vs declarado).
import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { openModal, confirmDialog } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { Audit } from '../services/audit.service.js';
import { can } from '../services/permissions.js';
import { money, fdatetime } from '../utils/format.js';

let USER, REG=null, MOVS=[];
(async()=>{
  USER=await requireAuth('cash'); if(!USER) return;
  const view=renderShell('cash','Caja'); view.innerHTML='<div class="loader">Cargando…</div>';
  await reload(); render(view);
})();
async function reload(){
  REG=(await DB.list('cashRegisters',{where:[['status','==','abierta']]}))[0]||null;
  MOVS = REG ? (await DB.list('cashMovements',{where:[['registerId','==',REG.id]]})).sort((a,b)=>b.at-a.at) : [];
}
const signed=m=>m.type==='egreso'?-Math.abs(m.amount):Math.abs(m.amount);
function expected(){ return +((REG?.openingAmount||0)+MOVS.reduce((s,m)=>s+signed(m),0)).toFixed(2); }
function totals(){
  const t={venta:0,ingreso:0,egreso:0};
  MOVS.forEach(m=>{ if(m.type==='venta')t.venta+=m.amount; else if(m.type==='ingreso')t.ingreso+=m.amount; else if(m.type==='egreso')t.egreso+=Math.abs(m.amount); });
  return t;
}

function render(view){
  if(!REG){
    view.innerHTML=`<div class="page-head"><div><h1>Caja</h1><p>No hay una caja abierta</p></div></div>
      <div class="card card-pad" style="max-width:460px;text-align:center">
        <div style="font-size:46px">💵</div><h2 style="margin:8px 0">Caja cerrada</h2>
        <p style="color:var(--text-2)">Abrí la caja para empezar a registrar ventas en efectivo e ingresos/egresos.</p>
        <button class="btn btn-primary btn-block mt-16" id="btnOpen" ${can(USER.role,'cash.open')?'':'disabled'}>🔓 Abrir caja</button>
        ${can(USER.role,'cash.open')?'':'<p style="font-size:12px;color:var(--text-3);margin-top:8px">Tu rol no puede abrir caja</p>'}
      </div>`;
    const b=document.getElementById('btnOpen'); if(b) b.onclick=openCash;
    return;
  }
  const exp=expected(), t=totals();
  view.innerHTML=`<div class="page-head"><div><h1>Caja</h1><p>Abierta por ${REG.openedByName||''} · ${fdatetime(REG.openedAt)}</p></div>
    <div class="flex gap-8"><button class="btn btn-ghost" id="btnIn">➕ Ingreso</button>
      <button class="btn btn-ghost" id="btnOut">➖ Egreso</button>
      <button class="btn btn-danger" id="btnClose" ${can(USER.role,'cash.close')?'':'disabled'}>🔒 Cerrar caja</button></div></div>
    <div class="grid grid-4">
      ${card('Apertura',money(REG.openingAmount||0),'#64748b')}
      ${card('Ventas efectivo',money(t.venta),'#16a34a')}
      ${card('Ingresos',money(t.ingreso),'#2563eb')}
      ${card('Egresos',money(t.egreso),'#dc2626')}</div>
    <div class="card card-pad mt-16 flex justify-between items-center">
      <div><span style="font-size:13px;color:var(--text-3)">Efectivo esperado en caja</span>
      <h2 style="margin-top:4px;font-size:26px">${money(exp)}</h2></div><div style="font-size:40px">🧾</div></div>
    <h3 class="mt-16" style="margin-bottom:8px">Movimientos</h3>
    <div class="card"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th class="ta-right">Monto</th></tr></thead>
    <tbody>${MOVS.map(m=>`<tr><td>${fdatetime(m.at)}</td><td><span class="chip">${m.type}</span></td><td>${m.concept||'—'}</td>
      <td class="ta-right" style="color:${signed(m)<0?'var(--danger)':'var(--success)'};font-weight:600">${signed(m)<0?'-':'+'}${money(Math.abs(m.amount))}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Sin movimientos aún</td></tr>'}</tbody></table></div>`;
  document.getElementById('btnIn').onclick=()=>openMov('ingreso');
  document.getElementById('btnOut').onclick=()=>openMov('egreso');
  const bc=document.getElementById('btnClose'); if(bc) bc.onclick=closeCash;
}
const card=(l,v,c)=>`<div class="card card-pad"><span style="font-size:12px;color:var(--text-3)">${l}</span><h3 style="margin-top:6px;color:${c}">${v}</h3></div>`;

function openCash(){
  const f=document.createElement('form');
  f.innerHTML=`<div class="field"><label>Monto inicial en caja *</label><input class="input" name="amount" type="number" step="0.01" value="0"></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent='Abrir caja';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Abrir caja',body:f,footer:[cancel,save],width:420}); cancel.onclick=m.close;
  save.onclick=async()=>{ const amount=+f.amount.value||0;
    try{ await DB.add('cashRegisters',{status:'abierta',openingAmount:amount,openedBy:USER.id,openedByName:USER.name,openedAt:Date.now()});
      await Audit.log('cash.open','cash',{amount}); await reload(); ok('Caja abierta'); location.reload();
    }catch(ex){ err(ex.message); }};
}
function openMov(type){
  const f=document.createElement('form');
  f.innerHTML=`<div class="field"><label>Monto *</label><input class="input" name="amount" type="number" step="0.01" value=""></div>
    <div class="field"><label>Concepto *</label><input class="input" name="concept" placeholder="${type==='ingreso'?'Ej: aporte de fondos':'Ej: pago a proveedor'}"></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent='Registrar';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:type==='ingreso'?'Registrar ingreso':'Registrar egreso',body:f,footer:[cancel,save],width:440}); cancel.onclick=m.close;
  save.onclick=async()=>{ const amount=+f.amount.value; const concept=f.concept.value.trim();
    if(!amount||amount<=0) return warn('Monto inválido'); if(!concept) return warn('Ingresá un concepto');
    try{ await DB.add('cashMovements',{registerId:REG.id,type,amount,concept,userId:USER.id,at:Date.now()});
      await Audit.log(type,'cash',{amount,concept}); await reload(); m.close(); ok('Registrado'); render(document.getElementById('view')); }
    catch(ex){ err(ex.message); }};
}
function closeCash(){
  const exp=expected();
  const f=document.createElement('form');
  f.innerHTML=`<p style="color:var(--text-2);margin-bottom:12px">Efectivo esperado: <b>${money(exp)}</b></p>
    <div class="field"><label>Efectivo declarado (arqueo) *</label><input class="input" name="declared" type="number" step="0.01" value="${exp}"></div>
    <div class="field" id="diffBox"></div>`;
  const upd=()=>{ const d=+f.declared.value||0; const diff=+(d-exp).toFixed(2);
    f.querySelector('#diffBox').innerHTML=`<label>Diferencia</label><div class="input" style="display:flex;align-items:center;color:${diff===0?'var(--success)':'var(--danger)'};font-weight:700">${diff>0?'+':''}${money(diff)} ${diff===0?'(cuadra)':diff>0?'(sobra)':'(falta)'}</div>`; };
  f.declared.oninput=upd; upd();
  const save=document.createElement('button'); save.className='btn btn-danger'; save.textContent='Cerrar caja';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Cierre de caja / arqueo',body:f,footer:[cancel,save],width:460}); cancel.onclick=m.close;
  save.onclick=async()=>{ const declared=+f.declared.value||0; const difference=+(declared-exp).toFixed(2);
    if(!await confirmDialog({title:'Confirmar cierre',message:'Una vez cerrada, la caja no admite más movimientos. ¿Continuar?',danger:true,confirmText:'Cerrar caja'})) return;
    try{ await DB.update('cashRegisters',REG.id,{status:'cerrada',closedAt:Date.now(),closedBy:USER.id,closedByName:USER.name,
      expectedAmount:exp,declaredAmount:declared,difference});
      await Audit.log('cash.close','cash',{expected:exp,declared,difference}); m.close(); ok('Caja cerrada'); location.reload();
    }catch(ex){ err(ex.message); }};
}
