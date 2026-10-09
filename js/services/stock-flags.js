// Bandera de reposición (B1 — optimización de lecturas).
// Lógica PURA (sin navegador ni Firebase) para poder testearla con node --test.
//
// Firestore no puede comparar dos campos del mismo documento (stock <= stockMin)
// dentro de una consulta. Por eso guardamos en cada producto una bandera booleana
// `needsRestock` que se recalcula en CADA cambio de stock/mínimo/estado. Así el
// Dashboard consulta SOLO los productos a reponer (where needsRestock == true),
// en vez de descargar toda la colección de productos para filtrarla en el cliente.

// Un producto necesita reposición cuando está activo y su stock quedó en el
// mínimo o por debajo (incluye «sin stock», stock <= 0).
export function needsRestock(p) {
  if (!p || p.active === false) return false;
  const stock = +p.stock || 0;
  const min = +p.stockMin || 0;
  return stock <= min;
}

// Punto C (recálculo de reposición): la bandera `needsRestock` solo se recalcula
// cuando el producto se MODIFICA. Los productos que ya estaban bajo el mínimo y
// no se mueven nunca la tuvieron, así que no aparecían en las alertas del
// Dashboard. Esta función PURA compara, para una lista de productos, la bandera
// GUARDADA contra la que CORRESPONDE, y devuelve solo los que hay que corregir:
//   [{ id, needsRestock }]  (ya listos para escribir en Firestore).
// Devolver solo las diferencias evita reescribir toda la colección (menos
// escrituras y menos ruido en la caché del POS).
export function diffRestock(products) {
  const out = [];
  for (const p of (products || [])) {
    if (!p || p.id == null) continue;
    const should = needsRestock(p);
    const stored = p.needsRestock === true;
    if (should !== stored) out.push({ id: p.id, needsRestock: should });
  }
  return out;
}
