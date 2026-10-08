// Validaciones reutilizables para formularios.
export const V={
  required:v=>v!==undefined&&v!==null&&String(v).trim()!=='' || 'Campo obligatorio',
  email:v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||'Email inv\u00e1lido',
  minLen:(n)=>v=>(v&&v.length>=n)||`M\u00ednimo ${n} caracteres`,
  numberGte:(n)=>v=>(v!==''&&Number(v)>=n)||`Debe ser \u2265 ${n}`,
  cuit:v=>!v||/^\d{2}-?\d{8}-?\d{1}$/.test(v)||'CUIT inv\u00e1lido (XX-XXXXXXXX-X)',
  dni:v=>!v||/^\d{7,8}$/.test(v)||'DNI inv\u00e1lido'
};
// Valida un form segun un esquema {campo:[validadores]}. Pinta errores.
export function validateForm(formEl,schema){
  let okAll=true; const data={};
  for(const name in schema){
    const input=formEl.querySelector(`[name="${name}"]`); if(!input) continue;
    const val=input.type==='checkbox'?input.checked:input.value.trim();
    data[name]=val;
    let msg='';
    for(const rule of schema[name]){ const r=rule(val); if(r!==true){msg=r;break;} }
    const errEl=input.parentElement.querySelector('.err-msg');
    if(msg){okAll=false;input.classList.add('err');if(errEl)errEl.textContent=msg;}
    else{input.classList.remove('err');if(errEl)errEl.textContent='';}
  }
  return okAll?data:null;
}
