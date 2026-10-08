// Modo claro/oscuro con persistencia de preferencia del usuario.
const KEY='pos_theme';
export function initTheme(){
  const saved=localStorage.getItem(KEY)|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
  document.documentElement.setAttribute('data-theme',saved);
  return saved;
}
export function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',cur);
  localStorage.setItem(KEY,cur); return cur;
}
export function currentTheme(){ return document.documentElement.getAttribute('data-theme')||'light'; }
// Boton reutilizable
export function themeButton(){
  const b=document.createElement('button'); b.className='btn btn-icon btn-ghost'; b.title='Cambiar tema';
  const paint=()=>b.textContent=currentTheme()==='dark'?'\u2600':'\u263E';
  paint(); b.onclick=()=>{toggleTheme();paint();}; return b;
}
