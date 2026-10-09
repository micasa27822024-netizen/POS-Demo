// Lógica PURA de productos (sin dependencias de navegador ni Firebase).
// Aislada para poder testearla con `node --test` (B3).

// margin: calcula ganancia, margen sobre venta y markup sobre costo.
export function margin(cost, price) {
  cost = Number(cost) || 0; price = Number(price) || 0;
  const profit = price - cost;
  const marginPct = price > 0 ? (profit / price) * 100 : 0;   // margen sobre venta
  const markupPct = cost > 0 ? (profit / cost) * 100 : 0;      // ganancia sobre costo
  return { profit, marginPct, markupPct };
}
