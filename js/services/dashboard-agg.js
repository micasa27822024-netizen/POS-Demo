// Agregados del Dashboard (B1 — optimización de lecturas). Lógica PURA testeable.
//
// En vez de descargar hasta 3.000 ventas para rankear productos/categorías, el
// Dashboard suma campos ya pre-agregados que cada venta/devolución escribe de
// forma incremental en `dailyStats`:
//   - tp_<productId> : unidades vendidas (netas de devoluciones)
//   - tc_<categoryId>: importe vendido por categoría (neto)
//   - pm_<metodo>    : importe cobrado por medio de pago (neto)
// Esta función recorre los documentos diarios y los consolida.
export function aggregateDaily(docs) {
  const prodQty = {}, catAmt = {}, payTotals = {};
  for (const d of (docs || [])) {
    for (const k in d) {
      if (k.length > 3 && k[0] === 't' && k[1] === 'p' && k[2] === '_') {
        const id = k.slice(3); prodQty[id] = (prodQty[id] || 0) + (+d[k] || 0);
      } else if (k.length > 3 && k[0] === 't' && k[1] === 'c' && k[2] === '_') {
        const id = k.slice(3); catAmt[id] = (catAmt[id] || 0) + (+d[k] || 0);
      } else if (k.length > 3 && k[0] === 'p' && k[1] === 'm' && k[2] === '_') {
        const m = k.slice(3); payTotals[m] = (payTotals[m] || 0) + (+d[k] || 0);
      }
    }
  }
  return { prodQty, catAmt, payTotals };
}

// Devuelve los ids de los N productos más vendidos (desc por cantidad), ignorando
// cantidades <= 0 (pueden quedar en 0 si lo vendido fue luego devuelto).
export function topProductIds(prodQty, n = 5) {
  return Object.entries(prodQty || {})
    .filter(([, q]) => (+q || 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}
