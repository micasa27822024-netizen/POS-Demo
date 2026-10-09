// Utilidades PURAS para el caché incremental del POS (B1 — optimización de lecturas).
// Sin navegador ni Firebase: se testean con node --test.

// Combina los documentos cacheados con los «deltas» (documentos cambiados desde la
// última sincronización). Los deltas pisan a los cacheados con el mismo id, de modo
// que el resultado refleja el último estado conocido de cada documento.
export function mergeById(cached, deltas) {
  const map = new Map();
  for (const d of (cached || [])) { if (d && d.id != null) map.set(d.id, d); }
  for (const d of (deltas || [])) { if (d && d.id != null) map.set(d.id, d); }
  return [...map.values()];
}

// Devuelve el mayor `updatedAt` de una lista de documentos (nunca menor que `floor`).
// Se usa como marca para pedir en la próxima sincronización solo lo cambiado después.
export function maxUpdatedAt(docs, floor = 0) {
  let m = +floor || 0;
  for (const d of (docs || [])) { const u = +(d && d.updatedAt) || 0; if (u > m) m = u; }
  return m;
}
