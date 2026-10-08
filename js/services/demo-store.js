// Almacén local que emula colecciones Firestore (solo MODO DEMO).
// Persiste en localStorage para que los datos sobrevivan recargas.
const KEY='pos_demo_db_v1';
let store = JSON.parse(localStorage.getItem(KEY)||'{}');

function persist(){ localStorage.setItem(KEY, JSON.stringify(store)); }
function col(name){ if(!store[name]) store[name]=[]; return store[name]; }
function uid(){ return 'id_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }

export const demoStore = {
  _raw:()=>store,
  reset(){ store={}; persist(); },
  seed(data){ store=data; persist(); },
  has(name){ return !!(store[name] && store[name].length); },
  async list(name){ return clone(col(name)); },
  async get(name,id){ const d=col(name).find(x=>x.id===id); return d?clone(d):null; },
  async add(name,data){ const doc={id:uid(),...data}; col(name).push(doc); persist(); return clone(doc); },
  async set(name,id,data){ const c=col(name); const i=c.findIndex(x=>x.id===id);
    const doc={...(i>=0?c[i]:{}),...data,id}; if(i>=0)c[i]=doc; else c.push(doc); persist(); return clone(doc); },
  async update(name,id,patch){ const c=col(name); const i=c.findIndex(x=>x.id===id);
    if(i<0) throw new Error('No existe '+name+'/'+id); c[i]={...c[i],...patch}; persist(); return clone(c[i]); },
  async remove(name,id){ const c=col(name); const i=c.findIndex(x=>x.id===id); if(i>=0){c.splice(i,1);persist();} }
};
