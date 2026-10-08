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

export const DB = {
  async list(name,opts={}){
    if(DEMO_MODE){ return applyFilters(await demoStore.list(name),opts); }
    const {collection,getDocs,query,where,orderBy,limit}=fb;
    const cons=[];
    if(opts.where) for(const [f,op,v] of opts.where) cons.push(where(f,op,v));
    if(opts.orderBy){const [f,dir='asc']=Array.isArray(opts.orderBy)?opts.orderBy:[opts.orderBy];cons.push(orderBy(f,dir));}
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
  }
};
