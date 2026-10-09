// A5: utilidades para evitar XSS almacenado.
// `esc` escapa texto para interpolar de forma segura dentro de HTML, incluidos
// atributos (comillas simples y dobles). Toda interpolación de datos de usuario
// o de base de datos (nombres, emails, conceptos, notas, etc.) DEBE pasar por aquí.
export function esc(v){
  if(v==null) return '';
  return String(v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
// Plantilla etiquetada que escapa por defecto cada valor interpolado.
// Uso: html`<div>${nombreUsuario}</div>`
export function html(strings,...values){
  return strings.reduce((out,s,i)=>out+s+(i<values.length?esc(values[i]):''),'');
}
