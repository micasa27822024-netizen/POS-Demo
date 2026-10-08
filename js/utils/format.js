// Formato de moneda, números y fechas. Moneda configurable (default ARS).
let CURRENCY={ code:'ARS', symbol:'$', locale:'es-AR', decimals:2 };
export function setCurrency(cfg){ CURRENCY={...CURRENCY,...cfg}; }
export function getCurrency(){ return {...CURRENCY}; }

export function money(n){
  const v=Number(n)||0;
  return CURRENCY.symbol+' '+v.toLocaleString(CURRENCY.locale,{minimumFractionDigits:CURRENCY.decimals,maximumFractionDigits:CURRENCY.decimals});
}
export function num(n,dec=3){
  const v=Number(n)||0;
  return v.toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:dec});
}
export function pct(n){ return (Number(n)||0).toFixed(1)+'%'; }

export function fdate(ts){ if(!ts) return '—'; const d=new Date(ts);
  return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
export function fdatetime(ts){ if(!ts) return '—'; const d=new Date(ts);
  return d.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
export function ftime(ts){ if(!ts) return '—'; return new Date(ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}); }

// Rangos de fecha usados por reportes/dashboard.
export function dayStart(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);return x.getTime();}
export function dayEnd(d=new Date()){const x=new Date(d);x.setHours(23,59,59,999);return x.getTime();}
export function monthStart(d=new Date()){return new Date(d.getFullYear(),d.getMonth(),1).getTime();}
