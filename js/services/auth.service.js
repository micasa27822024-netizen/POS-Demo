// Autenticación. Firebase Auth en producción; sesión simulada en MODO DEMO.
import { auth, fb, DEMO_MODE } from './firebase.js';
import { DB } from './db.service.js';

const SESS='pos_demo_session';
let currentProfile=null;
const listeners=[];

export function onUser(cb){ listeners.push(cb); if(currentProfile!==undefined) cb(currentProfile); }
function emit(){ listeners.forEach(cb=>cb(currentProfile)); }

async function loadProfile(email){
  const list=await DB.list('users',{where:[['email',email==null?'':'==',email]]});
  return list[0]||null;
}

export const Auth = {
  get profile(){ return currentProfile; },

  async init(){
    if(DEMO_MODE){
      const email=localStorage.getItem(SESS);
      currentProfile = email ? await loadProfile(email) : null;
      emit(); return;
    }
    return new Promise(res=>{
      fb.onAuthStateChanged(auth, async(u)=>{
        currentProfile = u ? (await DB.list('users',{where:[['email','==',u.email]]}))[0]||{email:u.email,role:'cajero',name:u.email} : null;
        emit(); res();
      });
    });
  },

  async login(email,password){
    if(DEMO_MODE){
      const p=await loadProfile(email);
      if(!p) throw new Error('Usuario no encontrado');
      if(p.active===false) throw new Error('Usuario desactivado');
      if(p.demoPassword && p.demoPassword!==password) throw new Error('Contraseña incorrecta');
      localStorage.setItem(SESS,email);
      currentProfile=p; await DB.update('users',p.id,{lastLogin:Date.now()}).catch(()=>{}); emit();
      return p;
    }
    const cred=await fb.signInWithEmailAndPassword(auth,email,password);
    currentProfile=(await DB.list('users',{where:[['email','==',email]]}))[0]||null;
    if(currentProfile?.active===false){ await fb.signOut(auth); throw new Error('Usuario desactivado'); }
    if(currentProfile) await DB.update('users',currentProfile.id,{lastLogin:Date.now()}).catch(()=>{});
    emit(); return currentProfile;
  },

  async logout(){
    if(DEMO_MODE){ localStorage.removeItem(SESS); currentProfile=null; emit(); return; }
    await fb.signOut(auth); currentProfile=null; emit();
  },

  async resetPassword(email){
    if(DEMO_MODE){ const p=await loadProfile(email); if(!p) throw new Error('Email no registrado'); return true; }
    await fb.sendPasswordResetEmail(auth,email); return true;
  },

  async changePassword(newPass){
    if(DEMO_MODE){ if(currentProfile) await DB.update('users',currentProfile.id,{demoPassword:newPass}); return true; }
    await fb.updatePassword(auth.currentUser,newPass); return true;
  },

  // Alta de usuario (perfil + credencial). En demo solo crea el perfil.
  async createUser({name,email,password,role,active=true}){
    if(DEMO_MODE){
      const exists=await loadProfile(email); if(exists) throw new Error('Ya existe un usuario con ese email');
      return DB.add('users',{name,email,role,active,demoPassword:password,createdAt:Date.now(),lastLogin:null});
    }
    const cred=await fb.createUserWithEmailAndPassword(auth,email,password);
    return DB.add('users',{name,email,role,active,uid:cred.user.uid,createdAt:Date.now(),lastLogin:null});
  }
};
