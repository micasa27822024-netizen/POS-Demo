// Lógica PURA de agregación de Reportes (sin navegador ni Firebase), testeable
// con `node --test`.
//
// Criterio contable (el que hace que Reportes CUADRE con el Dashboard):
//  - Las VENTAS suman en su propia fecha.
//  - Las DEVOLUCIONES restan en SU propia fecha (igual que dailyStats y el
//    Dashboard), NO en la fecha de la venta original. Así:
//      Facturación = Σ ventas del período − Σ devoluciones del período
//    y además se cumple: Σ medios de pago == Facturación, y la suma por
//    producto/día/vendedor también coincide (todo neto de devoluciones).
//  - Las ventas ANULADAS no entran (se asume filtradas por quien llama).

// Reparte el total NETO de una venta entre sus productos, prorrateando el
// descuento general con la MISMA fórmula que calcReturn (sales-calc.js). Así la
// suma de los importes por producto da exactamente el total de la venta, y al
// restar los reintegros de las devoluciones (misma base) todo cierra.
export function saleProductNet(sale) {
  const items = sale.items || [];
  const subtotal = +sale.subtotal || 0;
  const itemDiscount = +sale.itemDiscount || 0;
  const gDisc = +sale.generalDiscount || 0;
  const afterItem = subtotal - itemDiscount; // base para prorratear el desc. general
  const out = [];
  for (const it of items) {
    const gross = (+it.price || 0) * (+it.qty || 0);
    const netBeforeGeneral = gross - (+it.discount || 0);
    const generalShare = afterItem > 0 ? gDisc * (netBeforeGeneral / afterItem) : 0;
    out.push({
      productId: it.productId || it.name,
      name: it.name,
      qty: +it.qty || 0,
      rev: +(netBeforeGeneral - generalShare).toFixed(2)
    });
  }
  return out;
}

// Agrega ventas + devoluciones ya filtradas al período.
//  - sales:   ventas del período (SIN anuladas).
//  - returns: devoluciones del período (colección `returns`).
//  - dayKey:  función (timestamp) -> clave de día (p. ej. dayKeyAR).
export function aggregateReport(sales, returns, dayKey = (t) => String(t)) {
  let fact = 0, prof = 0, items = 0;
  const pay = {}, prodMap = {}, sellMap = {}, dayMap = {};
  // Vendedor por venta: para atribuir las devoluciones al vendedor ORIGINAL
  // (no al cajero que procesa la devolución) cuando la venta está en el período.
  const sellerBySale = {};

  const addProd = (pid, name, qty, rev) => {
    const e = prodMap[pid] || (prodMap[pid] = { name: name || pid, qty: 0, rev: 0 });
    e.qty += qty; e.rev += rev; if (name) e.name = name;
  };

  for (const v of (sales || [])) {
    const total = +v.total || 0;
    fact += total;
    prof += +v.profit || 0;
    items += (v.items || []).reduce((a, it) => a + (+it.qty || 0), 0);
    (v.payments || []).forEach(p => { pay[p.method] = (pay[p.method] || 0) + (+p.amount || 0); });
    for (const ln of saleProductNet(v)) addProd(ln.productId, ln.name, ln.qty, ln.rev);
    const seller = v.userName || '—';
    sellMap[seller] = (sellMap[seller] || 0) + total;
    if (v.id != null) sellerBySale[v.id] = seller;
    dayMap[dayKey(v.at)] = (dayMap[dayKey(v.at)] || 0) + total;
  }

  for (const r of (returns || [])) {
    const refund = +r.refundTotal || 0;
    fact -= refund;
    prof -= +r.profit || 0;
    items -= (r.lines || []).reduce((a, l) => a + (+l.qty || 0), 0);
    pay[r.method] = (pay[r.method] || 0) - refund;
    for (const l of (r.lines || [])) addProd(l.productId || l.name, l.name, -(+l.qty || 0), -(+l.refund || 0));
    // Atribuye el reintegro al vendedor original si la venta está en el período;
    // si no, al usuario que hizo la devolución. En ambos casos el TOTAL cierra.
    const seller = (r.saleId != null && sellerBySale[r.saleId]) || r.userName || '—';
    sellMap[seller] = (sellMap[seller] || 0) - refund;
    dayMap[dayKey(r.at)] = (dayMap[dayKey(r.at)] || 0) - refund;
  }

  fact = +fact.toFixed(2);
  prof = +prof.toFixed(2);
  const topRev = Object.values(prodMap)
    .filter(p => Math.abs(p.qty) > 0.0001 || Math.abs(p.rev) > 0.0001)
    .sort((a, b) => b.rev - a.rev);
  const sellers = Object.entries(sellMap)
    .map(([label, value]) => ({ label, value: +value.toFixed(2) }))
    .sort((a, b) => b.value - a.value);

  return { fact, prof, items: +items.toFixed(3), pay, prodMap, topRev, sellers, dayMap };
}
