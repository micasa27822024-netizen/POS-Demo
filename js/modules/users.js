import { requireAuth } from './guard.js';
import { renderShell } from '../components/shell.js';
import { DB } from '../services/db.service.js';
import { Auth } from '../services/auth.service.js';
import { ROLES } from '../services/permissions.js';
import { fdatetime } from '../utils/format.js';
import { openModal } from '../utils/modal.js';
import { ok, err, warn } from '../utils/toast.js';
import { validateForm, V } from '../utils/validate.js';
import { Audit } from '../services/audit.service.js';

let USER,USERS=[];
(async()=>{
  USER=await requireAuth('users'); if(!USER) return;
  const view=renderShell('users','Usuarios'); view.innerHTML='<div class="loader">Cargando\u2026</div>';
  await reload(); render(view);
})();
async function reload(){ USERS=await DB.list('users'); }

function render(view){
  view.innerHTML=`<div class="page-head"><div><h1>Usuarios y roles</h1><p>Gesti\u00f3n de accesos del sistema</p></div>
    <button class="btn btn-primary" id="btnNew">\u2795 Nuevo usuario</button></div><div id="host"></div>`;
  document.getElementById('btnNew').onclick=()=>openForm();
  paint();
}
function paint(){
  const host=document.getElementById('host');
  host.innerHTML=`<div class="table-wrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Creado</th><th>\u00daltimo acceso</th><th>Estado</th><th></th></tr></thead><tbody>
    ${USERS.map(u=>`<tr>
      <td><b>${u.name}</b></td><td class="text-muted">${u.email}</td>
      <td><span class="badge badge-info">${ROLES[u.role]?.label||u.role}</span></td>
      <td style="font-size:12px">${fdatetime(u.createdAt)}</td>
      <td style="font-size:12px">${fdatetime(u.lastLogin)}</td>
      <td>${u.active===false?'<span class="badge badge-neutral">Inactivo</span>':'<span class="badge badge-success">Activo</span>'}</td>
      <td><div class="flex gap-8">
        <button class="btn btn-sm btn-ghost" data-edit="${u.id}">\u270f\ufe0f</button>
        <button class="btn btn-sm btn-ghost" data-tog="${u.id}">${u.active===false?'\u2714':'\u23f8'}</button>
      </div></td></tr>`).join('')}</tbody></table></div>`;
  host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openForm(USERS.find(u=>u.id===b.dataset.edit)));
  host.querySelectorAll('[data-tog]').forEach(b=>b.onclick=async()=>{const u=USERS.find(x=>x.id===b.dataset.tog);
    if(u.id===USER.id)return warn('No pod\u00e9s desactivar tu propio usuario');
    await DB.update('users',u.id,{active:u.active===false}); await Audit.log('update','user',{id:u.id,active:u.active===false});
    await reload(); ok('Estado actualizado'); paint();});
}
function openForm(u){
  const isEdit=!!u; const f=document.createElement('form');
  f.innerHTML=`<div class="field"><label>Nombre *</label><input class="input" name="name" value="${u?.name||''}"><div class="err-msg"></div></div>
    <div class="field"><label>Email *</label><input class="input" name="email" value="${u?.email||''}" ${isEdit?'disabled':''}><div class="err-msg"></div></div>
    ${isEdit?'':'<div class="field"><label>Contrase\u00f1a *</label><input class="input" name="password" type="password"><div class="err-msg"></div></div>'}
    <div class="field"><label>Rol</label><select class="select" name="role">
      ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${u&&u.role===k?'selected':''}>${v.label}</option>`).join('')}</select></div>`;
  const save=document.createElement('button'); save.className='btn btn-primary'; save.textContent=isEdit?'Guardar':'Crear';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:isEdit?'Editar usuario':'Nuevo usuario',body:f,footer:[cancel,save],width:460}); cancel.onclick=m.close;
  save.onclick=async()=>{
    const schema=isEdit?{name:[V.required]}:{name:[V.required],email:[V.required,V.email],password:[V.required,V.minLen(6)]};
    const data=validateForm(f,schema); if(!data) return;
    try{
      if(isEdit){ await DB.update('users',u.id,{name:data.name,role:f.role.value}); await Audit.log('update','user',{id:u.id}); }
      else{ await Auth.createUser({name:data.name,email:data.email,password:data.password,role:f.role.value}); await Audit.log('create','user',{email:data.email}); }
      await reload(); m.close(); ok(isEdit?'Usuario actualizado':'Usuario creado'); paint();
    }catch(ex){ err(ex.message||'No se pudo guardar'); }
  };
}
