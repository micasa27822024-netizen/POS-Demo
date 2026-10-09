// Punto E: la caché del POS vive en localStorage (~5 MB). Las fotos de producto
// (base64, hasta ~100 KB c/u) hacen que, con catálogos de algunos cientos de
// artículos con foto, el guardado SUPERE la cuota y falle en silencio: entonces
// la caché nunca se persiste y el POS vuelve a LEER TODO en cada apertura (se
// pierde justo el ahorro de lecturas que buscábamos).
//
// Solución (lógica PURA, testeable): separar lo PESADO (las fotos) de lo LIVIANO
// (nombre, precio, stock, códigos…). El catálogo liviano SIEMPRE entra en la
// cuota y se persiste siempre, así el ahorro de lecturas queda garantizado.
// Las fotos se guardan aparte y con un PRESUPUESTO de espacio: entran las que
// caben; las que no, se muestran con el ícono genérico (sin romper nada).

export const HEAVY_FIELDS = ['image'];

// Tamaño aproximado en bytes de un valor serializado a JSON.
export function byteSize(value) {
  if (value == null) return 0;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s ? s.length : 0;
}

// Separa una lista de documentos en:
//   light  : los mismos documentos SIN los campos pesados.
//   images : mapa { id: { campo: valor } } solo con los campos pesados presentes.
export function splitDocs(docs, heavyFields = HEAVY_FIELDS) {
  const light = [];
  const images = {};
  for (const d of (docs || [])) {
    if (!d || d.id == null) continue;
    const copy = { ...d };
    const heavy = {};
    for (const f of heavyFields) {
      if (copy[f] != null && copy[f] !== '') { heavy[f] = copy[f]; }
      delete copy[f];
    }
    light.push(copy);
    if (Object.keys(heavy).length) images[d.id] = heavy;
  }
  return { light, images };
}

// Recompone los documentos completos a partir del catálogo liviano y el mapa de
// imágenes. Los documentos sin imagen guardada quedan sin ese campo (el POS
// muestra el ícono genérico).
export function rejoinDocs(light, images = {}, heavyFields = HEAVY_FIELDS) {
  return (light || []).map(d => {
    if (!d || d.id == null) return d;
    const heavy = images[d.id];
    if (!heavy) return d;
    const out = { ...d };
    for (const f of heavyFields) { if (heavy[f] != null) out[f] = heavy[f]; }
    return out;
  });
}

// Recorta el mapa de imágenes para que no supere un presupuesto de bytes.
// Mantiene las entradas en el orden recibido (`order`, normalmente el de la
// lista de productos) hasta llenar el presupuesto; el resto se descarta.
// Devuelve { images, keptIds, skipped, bytes }.
export function packImages(images = {}, order = [], budgetBytes = 3.5 * 1024 * 1024) {
  const out = {};
  let bytes = 0, skipped = 0;
  const keptIds = [];
  const ids = order && order.length ? order : Object.keys(images);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue; seen.add(id);
    const entry = images[id];
    if (!entry) continue;
    const size = byteSize(entry) + byteSize(id) + 4; // margen por claves/comas
    if (bytes + size > budgetBytes) { skipped++; continue; }
    out[id] = entry; bytes += size; keptIds.push(id);
  }
  // Entradas que estaban en el mapa pero no en `order` (por las dudas).
  for (const id in images) {
    if (seen.has(id)) continue;
    const size = byteSize(images[id]) + byteSize(id) + 4;
    if (bytes + size > budgetBytes) { skipped++; continue; }
    out[id] = images[id]; bytes += size; keptIds.push(id);
  }
  return { images: out, keptIds, skipped, bytes };
}
