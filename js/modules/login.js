import { initTheme, themeButton } from '../utils/theme.js';
import { initFirebase } from '../services/firebase.js';
import { Auth } from '../services/auth.service.js';
import { ensureSeed } from '../seed/demo-data.js';
import { validateForm, V } from '../utils/validate.js';
import { toast, ok, err } from '../utils/toast.js';
import { openModal } from '../utils/modal.js';
import { Audit } from '../services/audit.service.js';

initTheme();
document.getElementById('themeSlot').appendChild(themeButton());

(async()=>{ await initFirebase(); await ensureSeed(); await Auth.init();
  if(Auth.profile) location.replace('dashboard.html'); })();

const form=document.getElementById('loginForm');
document.getElementById('togglePw').onclick=()=>{
  const i=form.password; i.type=i.type==='password'?'text':'password';
};

form.addEventListener('submit',async e=>{
  e.preventDefault();
  const data=validateForm(form,{email:[V.required,V.email],password:[V.required]});
  if(!data) return;
  const btn=document.getElementById('btnLogin'); btn.disabled=true; btn.textContent='Ingresando…';
  try{
    await Auth.login(data.email,data.password);
    await Audit.log('login','auth',{email:data.email});
    ok('Sesión iniciada'); setTimeout(()=>location.href='dashboard.html',400);
  }catch(ex){ err(ex.message||'No se pudo iniciar sesión'); btn.disabled=false; btn.textContent='Ingresar'; }
});

document.getElementById('forgot').onclick=()=>{
  const body=document.createElement('div');
  body.innerHTML=`<p style="color:var(--text-2);margin-bottom:14px">Ingresá tu email y te enviaremos instrucciones para restablecer la contraseña.</p>
    <div class="field"><label>Email</label><input class="input" id="rpEmail" type="email" placeholder="tu@email.com"><div class="err-msg"></div></div>`;
  const send=document.createElement('button'); send.className='btn btn-primary'; send.textContent='Enviar';
  const cancel=document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancelar';
  const m=openModal({title:'Recuperar contraseña',body,footer:[cancel,send],width:440});
  cancel.onclick=m.close;
  send.onclick=async()=>{ const email=body.querySelector('#rpEmail').value.trim();
    if(!email) return; try{ await Auth.resetPassword(email); m.close();
      ok('Si el email existe, recibirás instrucciones.'); }catch(ex){ err(ex.message); } };
};
