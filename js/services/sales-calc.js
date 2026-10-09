// Lógica PURA de cálculo de ventas (sin dependencias de navegador ni Firebase).
// Se aísla aquí para poder testearla con `node --test` (B3).

// Unidades que admiten cantidades decimales.
export const DECIMAL_UNITS = ['kg', 'g', 'litro', 'ml', 'metro'];
export const isDecimalUnit = u => DECIMAL_UNITS.includes(u);

// Calcula totales de un carrito. items:[{qty,price,cost,discount}]
export function calcTotals(items, generalDiscount = 0) {
  let subtotal = 0, cost = 0, itemDisc = 0;
  for (const it of items) {
    const gross = it.price * it.qty;
    const d = it.discount || 0;
    subtotal += gross; itemDisc += d; cost += (it.cost || 0) * it.qty;
  }
  const afterItem = subtotal - itemDisc;
  const gDisc = Math.min(generalDiscount || 0, afterItem);
  const total = +(afterItem - gDisc).toFixed(2);
  const totalCost = +cost.toFixed(2);
  return {
    subtotal: +subtotal.toFixed(2), itemDiscount: +itemDisc.toFixed(2),
    generalDiscount: +gDisc.toFixed(2), total, cost: totalCost,
    profit: +(total - totalCost).toFixed(2)
  };
}
