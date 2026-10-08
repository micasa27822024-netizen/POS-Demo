// Notificaciones tipo toast.
function host(){ let h=document.getElementById('toasts'); if(!h){h=document.createElement('div');h.id='toasts';document.body.appendChild(h);} return h; }
const ICON={success:'✔',error:'✖',warn:'⚠',info:'ℹ'};
export function toast(msg,type='info',title){
  const el=document.createElement('div'); el.className='toast '+type;
  el.innerHTML=`<div class="t-ic">${ICON[type]||'ℹ'}</div><div><div class="t-title">${title||({success:'Éxito',error:'Error',warn:'Atención',info:'Info'}[type])}</div><div class="t-msg"></div></div>`;
  el.querySelector('.t-msg').textContent=msg;
  host().appendChild(el);
  setTimeout(()=>{el.style.transition='opacity .3s,transform .3s';el.style.opacity='0';el.style.transform='translateX(20px)';setTimeout(()=>el.remove(),300);},3500);
}
export const ok=(m,t)=>toast(m,'success',t);
export const err=(m,t)=>toast(m,'error',t);
export const warn=(m,t)=>toast(m,'warn',t);
