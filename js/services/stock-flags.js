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
