// Validación de unicidad contra la capa DB (sirve en demo y en producción).
// Comprueba que no exista OTRO documento en `coll` con `field` == `value`.
import { DB } from '../services/db.service.js';

// Devuelve true si el valor es único (o está vacío, que no se controla).
// `exceptId` excluye el propio documento al editar.
// `ci` compara sin distinguir mayúsculas/minúsculas (útil para email).
export async function isUnique(coll, field, value, exceptId = null, ci = false){
  let v = (value == null ? '' : String(value)).trim();
  if(!v) return true;
  let rows;
  if(ci){
    // No se puede filtrar case-insensitive en Firestore; traemos y comparamos.
    rows = await DB.list(coll).catch(()=>[]);
    const lv = v.toLowerCase();
    return !rows.some(r => r.id !== exceptId && String(r[field]||'').trim().toLowerCase() === lv);
  }
  rows = await DB.list(coll, { where: [[field, '==', v]] }).catch(()=>[]);
  return !rows.some(r => r.id !== exceptId);
}

// Lanza un Error con mensaje claro si el valor ya está en uso.
export async function assertUnique(coll, field, value, exceptId, label, ci = false){
  if(!(await isUnique(coll, field, value, exceptId, ci)))
    throw new Error((label || field) + ' «' + value + '» ya está en uso');
}
