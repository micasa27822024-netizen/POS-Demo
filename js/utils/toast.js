// Notificaciones tipo toast.
function host(){ let h=document.getElementById('toasts'); if(!h){h=document.createElement('div');h.id='toasts';document.body.appendChild(h);} return h; }
const ICON={success:'\u2714',error:'\u2716',warn:'\u26a0',info:'\u2139'};
export function toast(msg,type='info',title){
  const el=document.createElement('div'); el.className='toast '+type;
  el.innerHTML=`<div class="t-ic">${ICON[type]||'\u2139'}</div><div><div class="t-title">${title||({success:'\u00c9xito',error:'Error',warn:'Atenci\u00f3n',info:'Info'}[type])}</div><div class="t-msg"></div></div>`;
  el.querySelector('.t-msg').textContent=msg;
  host().appendChild(el);
  setTimeout(()=>{el.style.transition='opacity .3s,transform .3s';el.style.opacity='0';el.style.transform='translateX(20px)';setTimeout(()=>el.remove(),300);},3500);
}
export const ok=(m,t)=>toast(m,'success',t);
export const err=(m,t)=>toast(m,'error',t);
export const warn=(m,t)=>toast(m,'warn',t);
