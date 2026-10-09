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
//
// Punto E: para que las fotos (base64, pesadas) no revienten la cuota de
// localStorage y hagan fallar el guardado en silencio, el catálogo LIVIANO (sin
// fotos) y las FOTOS se guardan por separado. El liviano siempre entra y se
// persiste siempre (garantiza el ahorro de lecturas); las fotos van aparte con
// un presupuesto de espacio.
import { DB } from '../services/db.service.js';
import { mergeById, maxUpdatedAt, syncFloor } from './cache-util.js';
import { splitDocs, rejoinDocs, packImages } from './cache-split.js';

// Punto D: la vigencia completa baja de 12 h a 2 h, para que las bajas y los
// cambios de equipos con el reloj corrido se saneen seguido (antes tardaban
// hasta 12 h en aparecer).
const DEFAULT_TTL = 2 * 60 * 60 * 1000; // 2 h
// Margen de tolerancia al desfase de relojes entre PCs (ver cache-util.syncFloor).
const CLOCK_SKEW_MS = 10 * 60 * 1000; // 10 min
// Punto E: presupuesto de espacio para las fotos cacheadas (localStorage ~5 MB;
// dejamos margen para el catálogo liviano y otras claves de la app).
const IMAGE_BUDGET_BYTES = 3.5 * 1024 * 1024; // ~3,5 MB

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
}
function writeRaw(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); return true; }
  catch (_) { /* cuota llena */ return false; }
}
function removeRaw(key) { try { localStorage.removeItem(key); } catch (_) {} }

// Guarda el catálogo liviano (sin fotos) y, por separado, las fotos recortadas a
// un presupuesto. El liviano se persiste SIEMPRE; si aun así no entrara (caso
// extremo), al menos no quedan fotos viejas ocupando lugar.
function persist(name, { ts, lastSync, docs }) {
  const { light, images } = splitDocs(docs);
  const order = docs.map(d => d && d.id).filter(Boolean);
  const okLight = writeRaw('pos_cache_' + name, { ts, lastSync, docs: light });
  if (okLight) {
    const packed = packImages(images, order, IMAGE_BUDGET_BYTES);
    if (!writeRaw('pos_img_' + name, packed.images)) removeRaw('pos_img_' + name);
  } else {
    // Si ni el liviano entra, no dejamos fotos huérfanas de una versión previa.
    removeRaw('pos_img_' + name);
  }
}

// Lee el catálogo completo de la caché (liviano + fotos reunidas).
function readFull(name) {
  const meta = readCache('pos_cache_' + name);
  if (!meta || !Array.isArray(meta.docs)) return null;
  const images = readCache('pos_img_' + name) || {};
  return { ts: +meta.ts || 0, lastSync: +meta.lastSync || 0, docs: rejoinDocs(meta.docs, images) };
}

// Sincroniza y devuelve la colección completa (array de documentos).
// `name`  : nombre de la colección (p. ej. 'products', 'clients').
// `ttlMs` : antigüedad máxima de la caché antes de recargar todo.
export async function syncCollection(name, { ttlMs = DEFAULT_TTL } = {}) {
  const now = Date.now();
  const cache = readFull(name);

  // Sin caché válida o vencida -> carga completa.
  if (!cache || (now - cache.ts) > ttlMs) {
    const docs = await DB.list(name);
    persist(name, { ts: now, lastSync: maxUpdatedAt(docs, 0), docs });
    return docs;
  }

  // Carga incremental: solo lo cambiado desde la última marca, con un margen
  // hacia atrás (CLOCK_SKEW_MS) para tolerar relojes desfasados entre equipos.
  let deltas = [];
  const since = syncFloor(cache.lastSync, CLOCK_SKEW_MS);
  try {
    deltas = await DB.list(name, { where: [['updatedAt', '>=', since]] });
  } catch (_) {
    // Si la consulta incremental falla (p. ej. falta índice), recargamos todo.
    const docs = await DB.list(name);
    persist(name, { ts: now, lastSync: maxUpdatedAt(docs, 0), docs });
    return docs;
  }
  const merged = mergeById(cache.docs, deltas);
  persist(name, { ts: cache.ts || now, lastSync: maxUpdatedAt(merged, cache.lastSync), docs: merged });
  return merged;
}

// Invalida la caché de una colección (fuerza recarga completa la próxima vez).
export function invalidateCache(name) {
  removeRaw('pos_cache_' + name);
  removeRaw('pos_img_' + name);
}
