// Tests de la agregación de Reportes (punto 2 de la revisión: «no cuadran»).
// Verifica el invariante clave: Σ medios de pago == Facturación, y que las
// devoluciones resten en SU fecha (consistente con el Dashboard). PURO -> node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReport, saleProductNet } from '../js/services/report-calc.js';

// Clave de día simple (YYYY-MM-DD en UTC) para los tests.
const dayKey = ts => new Date(ts).toISOString().slice(0, 10);
const D1 = Date.parse('2026-10-01T12:00:00Z');
const D2 = Date.parse('2026-10-02T12:00:00Z');

// Venta de ejemplo: 2 productos, con descuento general, totalmente pagada.
function venta() {
  return {
    id: 's1', number: 1001, userName: 'Ana', at: D1,
    items: [
      { productId: 'p1', name: 'Yerba', price: 1000, qty: 2, discount: 0, cost: 600 },
      { productId: 'p2', name: 'Azúcar', price: 500, qty: 1, discount: 100, cost: 300 }
    ],
    subtotal: 2500, itemDiscount: 100, generalDiscount: 200, total: 2200,
    cost: 1500, profit: 700,
    payments: [{ method: 'efectivo', amount: 1200 }, { method: 'debito', amount: 1000 }]
  };
}

test('saleProductNet: la suma por producto == total de la venta', () => {
  const net = saleProductNet(venta());
  const sum = +net.reduce((a, l) => a + l.rev, 0).toFixed(2);
  assert.equal(sum, 2200);
});

test('sin devoluciones: Σ medios de pago == Facturación', () => {
  const r = aggregateReport([venta()], [], dayKey);
  assert.equal(r.fact, 2200);
  const sumPay = +Object.values(r.pay).reduce((a, v) => a + v, 0).toFixed(2);
  assert.equal(sumPay, r.fact);
  const sumProd = +r.topRev.reduce((a, p) => a + p.rev, 0).toFixed(2);
  assert.equal(sumProd, r.fact); // la columna «Facturado» también cuadra
});

test('con devolución: resta de facturación, pagos, producto y vendedor; sigue cuadrando', () => {
  // Devuelve 1 Yerba. Reintegro net.: 1000 (prorrateado el desc. general -> ~909,09... usamos valor del detalle).
  const ret = {
    id: 'r1', saleId: 's1', at: D2, method: 'efectivo', userName: 'Beto',
    refundTotal: 909.09, profit: 290.91,
    lines: [{ productId: 'p1', name: 'Yerba', qty: 1, refund: 909.09 }]
  };
  const r = aggregateReport([venta()], [ret], dayKey);
  assert.equal(r.fact, +(2200 - 909.09).toFixed(2)); // 1290.91
  // Invariante central: medios de pago cuadran con facturación.
  const sumPay = +Object.values(r.pay).reduce((a, v) => a + v, 0).toFixed(2);
  assert.equal(sumPay, r.fact);
  // El efectivo bajó por el reintegro.
  assert.equal(+r.pay.efectivo.toFixed(2), +(1200 - 909.09).toFixed(2));
  // Producto p1 queda neto (2 vendidas - 1 devuelta = 1).
  const p1 = r.topRev.find(p => p.name === 'Yerba');
  assert.equal(p1.qty, 1);
  // El reintegro se atribuye al vendedor ORIGINAL (Ana), no a quien devolvió (Beto).
  const ana = r.sellers.find(s => s.label === 'Ana');
  assert.equal(ana.value, +(2200 - 909.09).toFixed(2));
  assert.ok(!r.sellers.some(s => s.label === 'Beto'));
});

test('devolución cuyo venta NO está en el período: igual resta y cuadra', () => {
  // Solo llegó la devolución al período (la venta fue antes). Facturación negativa es válida.
  const ret = {
    id: 'r2', saleId: 'sOLD', at: D1, method: 'debito', userName: 'Caro',
    refundTotal: 500, profit: 150, lines: [{ productId: 'p9', name: 'Fideos', qty: 1, refund: 500 }]
  };
  const r = aggregateReport([], [ret], dayKey);
  assert.equal(r.fact, -500);
  const sumPay = +Object.values(r.pay).reduce((a, v) => a + v, 0).toFixed(2);
  assert.equal(sumPay, r.fact); // -500 == -500
  // Al no estar la venta original, se atribuye a quien hizo la devolución (Caro).
  assert.equal(r.sellers.find(s => s.label === 'Caro').value, -500);
});

test('serie por día: ventas suman en su día, devoluciones restan en el suyo', () => {
  const ret = { id: 'r3', saleId: 's1', at: D2, method: 'efectivo', refundTotal: 200, profit: 50,
    lines: [{ productId: 'p1', name: 'Yerba', qty: 0.2, refund: 200 }] };
  const r = aggregateReport([venta()], [ret], dayKey);
  assert.equal(r.dayMap['2026-10-01'], 2200);  // día de la venta
  assert.equal(r.dayMap['2026-10-02'], -200);   // día de la devolución
});
