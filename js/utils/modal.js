// Modales y confirmaciones reutilizables.
export function openModal({title,body,footer,width=560,onClose}){
  const ov=document.createElement('div'); ov.className='modal-ov';
  ov.innerHTML=`<div class="modal" style="max-width:${width}px">
    <div class="modal-head"><h3></h3><button class="btn btn-icon btn-ghost" data-x>✕</button></div>
    <div class="modal-body"></div>
    ${footer!==null?'<div class="modal-foot"></div>':''}</div>`;
  ov.querySelector('h3').textContent=title||'';
  const b=ov.querySelector('.modal-body');
  if(typeof body==='string') b.innerHTML=body; else if(body) b.appendChild(body);
  const f=ov.querySelector('.modal-foot');
  if(f&&footer) footer.forEach(btn=>f.appendChild(btn));
  const close=()=>{ov.remove();onClose&&onClose();};
  ov.querySelector('[data-x]').onclick=close;
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);}});
  document.body.appendChild(ov);
  return {el:ov,body:b,footer:f,close};
}

export function confirmDialog({title='Confirmar',message,confirmText='Confirmar',danger=false}){
  return new Promise(res=>{
    const yes=document.createElement('button'); yes.className='btn '+(danger?'btn-danger':'btn-primary'); yes.textContent=confirmText;
    const no=document.createElement('button'); no.className='btn btn-ghost'; no.textContent='Cancelar';
    const m=openModal({title,body:`<p style="color:var(--text-2);line-height:1.6">${message}</p>`,footer:[no,yes],width:440,onClose:()=>res(false)});
    yes.onclick=()=>{m.close();res(true);}; no.onclick=()=>{m.close();res(false);};
  });
}
