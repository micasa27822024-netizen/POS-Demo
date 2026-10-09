// Tests unitarios de la lógica PURA (B3). Se ejecutan con: node --test
// No requieren navegador ni Firebase: importan solo los módulos *-calc.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcTotals, isDecimalUnit, DECIMAL_UNITS } from '../js/services/sales-calc.js';
import { margin } from '../js/services/product-calc.js';

test('calcTotals: carrito simple sin descuentos', () => {
  const t = calcTotals([{ qty: 2, price: 100, cost: 60, discount: 0 }]);
  assert.equal(t.subtotal, 200);
  assert.equal(t.itemDiscount, 0);
  assert.equal(t.total, 200);
  assert.equal(t.cost, 120);
  assert.equal(t.profit, 80);
});

test('calcTotals: descuento por ítem', () => {
  const t = calcTotals([{ qty: 1, price: 1000, cost: 400, discount: 150 }]);
  assert.equal(t.subtotal, 1000);
  assert.equal(t.itemDiscount, 150);
  assert.equal(t.total, 850);
  assert.equal(t.profit, 450);
});

test('calcTotals: descuento general acotado al subtotal', () => {
  const t = calcTotals([{ qty: 1, price: 500, cost: 0, discount: 0 }], 99999);
  assert.equal(t.generalDiscount, 500); // no puede superar el subtotal
  assert.equal(t.total, 0);
});

test('calcTotals: cantidades decimales (kg)', () => {
  const t = calcTotals([{ qty: 1.5, price: 1000, cost: 600, discount: 0 }]);
  assert.equal(t.subtotal, 1500);
  assert.equal(t.cost, 900);
  assert.equal(t.profit, 600);
});

test('calcTotals: redondeo a 2 decimales', () => {
  const t = calcTotals([{ qty: 3, price: 0.1, cost: 0, discount: 0 }]);
  assert.equal(t.subtotal, 0.3);
  assert.equal(t.total, 0.3);
});

test('isDecimalUnit: unidades decimales vs enteras', () => {
  for (const u of DECIMAL_UNITS) assert.equal(isDecimalUnit(u), true);
  assert.equal(isDecimalUnit('unidad'), false);
  assert.equal(isDecimalUnit('caja'), false);
  assert.equal(isDecimalUnit(undefined), false);
});

test('margin: ganancia, margen sobre venta y markup sobre costo', () => {
  const m = margin(60, 100);
  assert.equal(m.profit, 40);
  assert.equal(m.marginPct, 40);                 // 40/100
  assert.equal(Math.round(m.markupPct), 67);     // 40/60
});

test('margin: precio 0 no divide por cero', () => {
  const m = margin(10, 0);
  assert.equal(m.marginPct, 0);
  assert.equal(m.profit, -10);
});

test('margin: costo 0 => markup 0', () => {
  const m = margin(0, 100);
  assert.equal(m.markupPct, 0);
  assert.equal(m.profit, 100);
});
