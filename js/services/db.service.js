// Capa de datos unificada. Misma API para Firestore (producción) y demo (local).
// Las pantallas y módulos SIEMPRE usan este servicio, nunca Firestore directo.
import { db, fb, DEMO_MODE } from './firebase.js';
import { demoStore } from './demo-store.js';

function applyFilters(arr,{where:w,orderBy:ob,limit:lim}={}){
  let r=arr;
  if(w) for(const [f,op,v] of w){
    r=r.filter(x=>{const val=x[f];
      switch(op){case '==':return val===v;case '!=':return val!==v;
        case '>':return val>v;case '>=':return val>=v;case '<':return val<v;case '<=':return val<=v;
        case 'in':return Array.isArray(v)&&v.includes(val);
        case 'array-contains':return Array.isArray(val)&&val.includes(v);default:return true;}});
  }
  if(ob){const [f,dir='asc']=Array.isArray(ob)?ob:[ob];
    r=[...r].sort((a,b)=>{const av=a[f],bv=b[f];if(av<bv)return dir==='desc'?1:-1;if(av>bv)return dir==='desc'?-1:1;return 0;});}
  if(lim) r=r.slice(0,lim);
  return r;
}

// Marcador de incremento atómico. En producción se mapea a FieldValue.increment;
// en demo se resuelve contra el valor actual al escribir.
function isInc(v){ return v && typeof v==='object' && Object.prototype.hasOwnProperty.call(v,'__inc'); }

export const DB = {
  async list(name,opts={}){
    if(DEMO_MODE){ return applyFilters(await demoStore.list(name),opts); }
    const {collection,getDocs,query,where,orderBy,limit,startAfter}=fb;
    const cons=[];
    if(opts.where) for(const [f,op,v] of opts.where) cons.push(where(f,op,v));
    if(opts.orderBy){const [f,dir='asc']=Array.isArray(opts.orderBy)?opts.orderBy:[opts.orderBy];cons.push(orderBy(f,dir));}
    if(opts.startAfter) cons.push(startAfter(opts.startAfter));
    if(opts.limit) cons.push(limit(opts.limit));
    const q=cons.length?query(collection(db,name),...cons):collection(db,name);
    const snap=await getDocs(q); return snap.docs.map(d=>({id:d.id,...d.data()}));
  },
  async get(name,id){
    if(DEMO_MODE) return demoStore.get(name,id);
    const {doc,getDoc}=fb; const s=await getDoc(doc(db,name,id)); return s.exists()?{id:s.id,...s.data()}:null;
  },
  async add(name,data){
    if(DEMO_MODE) return demoStore.add(name,data);
    const {collection,addDoc}=fb; const ref=await addDoc(collection(db,name),data); return {id:ref.id,...data};
  },
  async set(name,id,data){
    if(DEMO_MODE) return demoStore.set(name,id,data);
    const {doc,setDoc}=fb; await setDoc(doc(db,name,id),data,{merge:true}); return {id,...data};
  },
  async update(name,id,patch){
    if(DEMO_MODE) return demoStore.update(name,id,patch);
    const {doc,updateDoc}=fb; await updateDoc(doc(db,name,id),patch); return {id,...patch};
  },
  async remove(name,id){
    if(DEMO_MODE) return demoStore.remove(name,id);
    const {doc,deleteDoc}=fb; await deleteDoc(doc(db,name,id));
  },

  // Conteo del lado servidor (B1): evita descargar colecciones enteras.
  async count(name,opts={}){
    if(DEMO_MODE){ return (await demoStore.list(name)).length; }
    const {collection,query,where,getCountFromServer}=fb;
    const cons=[]; if(opts.where) for(const [f,op,v] of opts.where) cons.push(where(f,op,v));
    const q=cons.length?query(collection(db,name),...cons):collection(db,name);
    const snap=await getCountFromServer(q); return snap.data().count;
  },

  // A3: valor de incremento atómico para usar dentro de transacciones/lotes.
  increment(n){ return DEMO_MODE ? {__inc:n} : fb.increment(n); },

  // A3: ejecuta `fn(tx)` de forma atómica.
  // Producción -> runTransaction (todas las LECTURAS antes de las ESCRITURAS).
  // Demo       -> copia del store; si `fn` lanza, se restaura el estado previo.
  async transaction(fn){
    if(DEMO_MODE){
      const raw=demoStore._raw();
      const snapshot=JSON.stringify(raw);
      const genId=()=>'id_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
      const cur=(name,id)=>{ const c=raw[name]||[]; return c.find(x=>x.id===id)||null; };
      const resolve=(name,id,data)=>{ const ex=cur(name,id)||{}; const out={...data};
        for(const k in out) if(isInc(out[k])) out[k]=(+ex[k]||0)+out[k].__inc; return out; };
      const tx={
        get:async(name,id)=>{ const d=cur(name,id); return d?JSON.parse(JSON.stringify(d)):null; },
        set:(name,id,data)=>{ demoStore.set(name,id,resolve(name,id,data)); },
        add:(name,data)=>{ const id=genId(); const out={...data};
          for(const k in out) if(isInc(out[k])) out[k]=out[k].__inc; demoStore.set(name,id,out); return id; },
        update:(name,id,patch)=>{ demoStore.update(name,id,resolve(name,id,patch)); }
      };
      try{ return await fn(tx); }
      catch(e){ demoStore.seed(JSON.parse(snapshot)); throw e; }
    }
    const { runTransaction, doc, collection } = fb;
    return runTransaction(db, async(t)=>{
      const tx={
        get:async(name,id)=>{ const s=await t.get(doc(db,name,id)); return s.exists()?{id:s.id,...s.data()}:null; },
        set:(name,id,data)=>{ t.set(doc(db,name,id),data,{merge:true}); },
        add:(name,data)=>{ const ref=doc(collection(db,name)); t.set(ref,data); return ref.id; },
        update:(name,id,patch)=>{ t.update(doc(db,name,id),patch); }
      };
      return fn(tx);
    });
  }
};
