// Caché incremental de colecciones para el POS (B1 — optimización de lecturas).
//
// Problema: el POS cargaba TODOS los productos y clientes en cada apertura. Con
// 2.000 productos eso cuesta ~2.000 lecturas por cada vez que se abre la pantalla,
// varias veces por día, agotando el cupo gratuito de Firestore.
//
// Solución: guardamos la colección en localStorage. En la primera apertura se baja
// completa (inevitable). En las siguientes solo se piden los documentos CAMBIADOS
// desde la última sincronización (where updatedAt >= lastSync) y se fusionan con
// la caché. Un TTL fuerza una recarga completa cada tanto para auto-sanear bajas.
import { DB } from '../services/db.service.js';
import { mergeById, maxUpdatedAt } from './cache-util.js';

const DEFAULT_TTL = 12 * 60 * 60 * 1000; // 12 h

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
}
function writeCache(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch (_) { /* cuota llena: se ignora */ }
}

// Sincroniza y devuelve la colección completa (array de documentos).
// `name`  : nombre de la colección (p. ej. 'products', 'clients').
// `ttlMs` : antigüedad máxima de la caché antes de recargar todo.
export async function syncCollection(name, { ttlMs = DEFAULT_TTL } = {}) {
  const key = 'pos_cache_' + name;
  const now = Date.now();
  const cache = readCache(key);

  // Sin caché válida o vencida -> carga completa.
  if (!cache || !Array.isArray(cache.docs) || (now - (+cache.ts || 0)) > ttlMs) {
    const docs = await DB.list(name);
    writeCache(key, { ts: now, lastSync: maxUpdatedAt(docs, 0), docs });
    return docs;
  }

  // Carga incremental: solo lo cambiado desde la última marca.
  let deltas = [];
  try {
    deltas = await DB.list(name, { where: [['updatedAt', '>=', +cache.lastSync || 0]] });
  } catch (_) {
    // Si la consulta incremental falla (p. ej. falta índice), recargamos todo.
    const docs = await DB.list(name);
    writeCache(key, { ts: now, lastSync: maxUpdatedAt(docs, 0), docs });
    return docs;
  }
  const merged = mergeById(cache.docs, deltas);
  writeCache(key, { ts: +cache.ts || now, lastSync: maxUpdatedAt(merged, +cache.lastSync || 0), docs: merged });
  return merged;
}

// Invalida la caché de una colección (fuerza recarga completa la próxima vez).
export function invalidateCache(name) {
  try { localStorage.removeItem('pos_cache_' + name); } catch (_) {}
}
