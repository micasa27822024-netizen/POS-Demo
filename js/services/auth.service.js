// Autenticación. Firebase Auth en producción; sesión simulada en MODO DEMO.
// A1: en producción el perfil es el documento users/{uid} (ID = uid de Auth).
import { auth, fb, DEMO_MODE, createSecondaryAuth } from './firebase.js';
import { DB } from './db.service.js';

const SESS='pos_demo_session';
let currentProfile=null;
const listeners=[];

export function onUser(cb){ listeners.push(cb); if(currentProfile!==undefined) cb(currentProfile); }
function emit(){ listeners.forEach(cb=>cb(currentProfile)); }

// Solo DEMO: el perfil se busca por email (IDs locales aleatorios).
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
        if(!u){ currentProfile=null; emit(); return res(); }
        // Perfil por UID (la regla permite leer el doc propio).
        const prof=await DB.get('users',u.uid).catch(()=>null);
        if(!prof || prof.active===false){
          // Sin perfil o inactivo: no se concede acceso.
          await fb.signOut(auth).catch(()=>{});
          currentProfile=null; emit(); return res();
        }
        currentProfile={...prof,id:u.uid};
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
    const uid=cred.user.uid;
    const prof=await DB.get('users',uid).catch(()=>null);
    if(!prof){ await fb.signOut(auth); throw new Error('El usuario no tiene un perfil asignado. Contactá al administrador.'); }
    if(prof.active===false){ await fb.signOut(auth); throw new Error('Usuario desactivado'); }
    currentProfile={...prof,id:uid};
    await DB.update('users',uid,{lastLogin:Date.now()}).catch(()=>{});
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
    try{
      await fb.updatePassword(auth.currentUser,newPass);
    }catch(ex){
      if(ex&&ex.code==='auth/requires-recent-login')
        throw new Error('Por seguridad, volvé a iniciar sesión antes de cambiar la contraseña.');
      throw ex;
    }
    return true;
  },

  // Alta de usuario (perfil + credencial). En demo solo crea el perfil.
  async createUser({name,email,password,role,active=true}){
    if(DEMO_MODE){
      const exists=await loadProfile(email); if(exists) throw new Error('Ya existe un usuario con ese email');
      return DB.add('users',{name,email,role,active,demoPassword:password,createdAt:Date.now(),lastLogin:null});
    }
    // Unicidad de email (el admin puede consultar todos los usuarios).
    const dup=await DB.list('users',{where:[['email','==',email]]}).catch(()=>[]);
    if(dup && dup.length) throw new Error('Ya existe un usuario con ese email');
    // Crea la credencial en una instancia secundaria para NO cerrar la sesión del admin.
    const sec=await createSecondaryAuth();
    const cred=await sec.authMod.createUserWithEmailAndPassword(sec.secAuth,email,password);
    const uid=cred.user.uid;
    // El perfil se escribe con la sesión del admin (instancia principal).
    try{
      const res=await DB.set('users',uid,{name,email,role,active,uid,createdAt:Date.now(),lastLogin:null});
      await sec.authMod.signOut(sec.secAuth).catch(()=>{});
      return res;
    }catch(ex){
      // Rollback: si no se pudo guardar el perfil, se elimina la credencial recién
      // creada para no dejar una cuenta de Auth huérfana (que luego no podría ni
      // iniciar sesión ni volver a crearse por email duplicado).
      try{ await sec.authMod.deleteUser(cred.user); }
      catch(_){ await sec.authMod.signOut(sec.secAuth).catch(()=>{}); }
      throw new Error('No se pudo guardar el perfil del usuario; se canceló el alta. Reintentá.');
    }
  }
};
