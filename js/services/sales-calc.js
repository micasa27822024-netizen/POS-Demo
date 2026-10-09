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

// C3: cálculo PURO de una devolución parcial. Dado la venta original, las líneas
// a devolver [{productId, qty}] y lo ya devuelto por producto (returnedSoFar),
// valida la disponibilidad y devuelve el detalle con los importes a reintegrar.
// Prorratea el descuento general segun el peso neto de cada línea.
// Lanza Error si una línea no pertenece a la venta o supera lo disponible.
export function calcReturn(sale, lines, returnedSoFar = {}) {
  const items = sale.items || [];
  const subtotal = +sale.subtotal || 0;
  const itemDiscount = +sale.itemDiscount || 0;
  const gDisc = +sale.generalDiscount || 0;
  const afterItem = subtotal - itemDiscount; // base para prorratear el desc. general
  const detail = [];
  let refundTotal = 0, costTotal = 0;
  for (const req of (lines || [])) {
    const q = +req.qty || 0;
    if (q <= 0) continue;
    const it = items.find(x => x.productId === req.productId);
    if (!it) throw new Error('Un ítem no pertenece a la venta');
    const sold = +it.qty || 0;
    const already = +returnedSoFar[req.productId] || 0;
    const avail = +(sold - already).toFixed(3);
    if (q > avail + 0.0001)
      throw new Error('No podés devolver ' + q + ' de «' + it.name + '»: disponible ' + avail);
    const grossLine = (+it.price || 0) * q;
    const itemDiscLine = sold > 0 ? (+it.discount || 0) * (q / sold) : 0;
    const netBeforeGeneral = grossLine - itemDiscLine;
    const generalShare = afterItem > 0 ? gDisc * (netBeforeGeneral / afterItem) : 0;
    const refundLine = +(netBeforeGeneral - generalShare).toFixed(2);
    const costLine = +((+it.cost || 0) * q).toFixed(2);
    refundTotal += refundLine;
    costTotal += costLine;
    detail.push({ productId: req.productId, name: it.name, unit: it.unit || '', qty: q, refund: refundLine, cost: costLine });
  }
  if (!detail.length) throw new Error('No hay cantidades válidas para devolver');
  refundTotal = +refundTotal.toFixed(2);
  costTotal = +costTotal.toFixed(2);
  return { detail, refundTotal, cost: costTotal, profit: +(refundTotal - costTotal).toFixed(2) };
}
