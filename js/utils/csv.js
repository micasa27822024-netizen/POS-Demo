// Exportación/importación CSV sencilla (sin dependencias).
export function exportCSV(filename,rows){
  if(!rows.length){ rows=[{}]; }
  const cols=Object.keys(rows[0]);
  const esc=v=>{v=v==null?'':String(v);return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const csv=[cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  URL.revokeObjectURL(a.href);
}
export function parseCSV(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.trim());
  if(!lines.length) return [];
  const split=l=>{const out=[];let cur='',q=false;
    for(let i=0;i<l.length;i++){const ch=l[i];
      if(q){if(ch==='"'){if(l[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}
      else{if(ch==='"')q=true;else if(ch===','){out.push(cur);cur='';}else cur+=ch;}}
    out.push(cur);return out;};
  const headers=split(lines[0]).map(h=>h.trim());
  return lines.slice(1).map(l=>{const vals=split(l);const o={};headers.forEach((h,i)=>o[h]=(vals[i]||'').trim());return o;});
}
