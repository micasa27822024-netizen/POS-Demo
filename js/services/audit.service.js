// Registro de auditoría. Guarda cada operación relevante en `auditLogs`.
import { DB } from './db.service.js';
import { Auth } from './auth.service.js';

export const Audit={
  async log(action,entity,detail={}){
    const u=Auth.profile;
    try{
      await DB.add('auditLogs',{
        action, entity,
        userId:u?.id||null, userName:u?.name||'sistema', userEmail:u?.email||null,
        detail, at:Date.now()
      });
    }catch(e){ console.warn('No se pudo registrar auditoría',e); }
  }
};
