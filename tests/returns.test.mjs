// Tests unitarios de la lógica PURA de devoluciones parciales (C3).
// Se ejecutan con: node --test  (no requieren navegador ni Firebase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcReturn } from '../js/services/sales-calc.js';

// Venta de referencia:
//  A: 2 u a $100 (costo 60), sin desc.   -> bruto 200
//  B: 1 u a $1000 (costo 400), desc 150  -> bruto 1000, desc ítem 150
//  subtotal 1200, desc ítem 150, desc general 50  -> total 1000, costo 520
const SALE = {
  items: [
    { productId: 'A', name: 'Prod A', unit: 'unidad', qty: 2, price: 100, cost: 60, discount: 0 },
    { productId: 'B', name: 'Prod B', unit: 'unidad', qty: 1, price: 1000, cost: 400, discount: 150 }
  ],
  subtotal: 1200, itemDiscount: 150, generalDiscount: 50
};

test('calcReturn: línea completa con desc. ítem + prorrateo del desc. general', () => {
  const r = calcReturn(SALE, [{ productId: 'B', qty: 1 }]);
  // neto antes del general = 1000 - 150 = 850; prorrateo = 50 * 850/1050 = 40.48
  assert.equal(r.detail.length, 1);
  assert.equal(r.detail[0].refund, 809.52);
  assert.equal(r.detail[0].cost, 400);
  assert.equal(r.refundTotal, 809.52);
  assert.equal(r.cost, 400);
  assert.equal(r.profit, 409.52);
});

test('calcReturn: devolución parcial de cantidad (1 de 2)', () => {
  const r = calcReturn(SALE, [{ productId: 'A', qty: 1 }]);
  // neto 100; prorrateo general = 50 * 100/1050 = 4.76 -> refund 95.24
  assert.equal(r.detail[0].refund, 95.24);
  assert.equal(r.detail[0].cost, 60);
  assert.equal(r.profit, 35.24);
});

test('calcReturn: descuento de ítem se prorratea por cantidad devuelta', () => {
  // Venta B pero con 2 unidades y desc. ítem total 200; sin desc. general.
  const sale = {
    items: [{ productId: 'B', name: 'B', unit: 'unidad', qty: 2, price: 1000, cost: 400, discount: 200 }],
    subtotal: 2000, itemDiscount: 200, generalDiscount: 0
  };
  const r = calcReturn(sale, [{ productId: 'B', qty: 1 }]);
  // bruto 1000; desc ítem prorrateado = 200 * (1/2) = 100 -> refund 900
  assert.equal(r.detail[0].refund, 900);
  assert.equal(r.profit, 500); // 900 - 400
});

test('calcReturn: respeta lo ya devuelto (returnedSoFar)', () => {
  // Ya se devolvió 1 de A (quedan 1 disponible); devolver 1 está OK.
  const r = calcReturn(SALE, [{ productId: 'A', qty: 1 }], { A: 1 });
  assert.equal(r.detail[0].qty, 1);
  // Pedir 2 cuando solo queda 1 debe fallar.
  assert.throws(() => calcReturn(SALE, [{ productId: 'A', qty: 2 }], { A: 1 }), /disponible/);
});

test('calcReturn: no permite devolver más de lo vendido', () => {
  assert.throws(() => calcReturn(SALE, [{ productId: 'A', qty: 3 }]), /disponible/);
});

test('calcReturn: ítem inexistente en la venta lanza error', () => {
  assert.throws(() => calcReturn(SALE, [{ productId: 'Z', qty: 1 }]), /no pertenece/);
});

test('calcReturn: sin cantidades válidas lanza error', () => {
  assert.throws(() => calcReturn(SALE, [{ productId: 'A', qty: 0 }]), /No hay cantidades/);
});

test('calcReturn: múltiples líneas suman refund/costo/ganancia', () => {
  const r = calcReturn(SALE, [{ productId: 'A', qty: 2 }, { productId: 'B', qty: 1 }]);
  // A: 2u -> neto 200, general 50*200/1050=9.52 -> 190.48 ; B: 809.52
  const sumRefund = +(r.detail[0].refund + r.detail[1].refund).toFixed(2);
  assert.equal(r.refundTotal, sumRefund);
  assert.equal(r.cost, 520); // 120 + 400
  // devolver TODO equivale al total de la venta (1000) salvo redondeo por prorrateo
  assert.ok(Math.abs(r.refundTotal - 1000) < 0.02);
});
