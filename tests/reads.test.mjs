// Tests de la optimización de lecturas (B1): bandera de reposición, caché
// incremental del POS y agregados del Dashboard. Lógica PURA, sin navegador.
// Se ejecutan con: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsRestock } from '../js/services/stock-flags.js';
import { mergeById, maxUpdatedAt } from '../js/utils/cache-util.js';
import { aggregateDaily, topProductIds } from '../js/services/dashboard-agg.js';

test('needsRestock: marca cuando el stock llega o baja del mínimo', () => {
  assert.equal(needsRestock({ active: true, stock: 7, stockMin: 10 }), true);   // bajo mínimo
  assert.equal(needsRestock({ active: true, stock: 10, stockMin: 10 }), true);  // en el mínimo
  assert.equal(needsRestock({ active: true, stock: 0, stockMin: 15 }), true);   // sin stock
  assert.equal(needsRestock({ active: true, stock: 48, stockMin: 12 }), false); // ok
});

test('needsRestock: los productos inactivos nunca se marcan', () => {
  assert.equal(needsRestock({ active: false, stock: 0, stockMin: 15 }), false);
  assert.equal(needsRestock(null), false);
});

test('needsRestock: tolera campos ausentes (stock/min como 0)', () => {
  assert.equal(needsRestock({ active: true }), true);        // 0 <= 0
  assert.equal(needsRestock({ active: true, stock: 1 }), false); // 1 <= 0 es false
});

test('mergeById: los deltas pisan a los cacheados con el mismo id', () => {
  const cached = [{ id: 'a', stock: 10 }, { id: 'b', stock: 5 }];
  const deltas = [{ id: 'b', stock: 3 }, { id: 'c', stock: 7 }];
  const out = mergeById(cached, deltas);
  const map = Object.fromEntries(out.map(d => [d.id, d.stock]));
  assert.deepEqual(map, { a: 10, b: 3, c: 7 }); // b actualizado, c nuevo, a intacto
  assert.equal(out.length, 3);
});

test('mergeById: tolera listas vacías o nulas', () => {
  assert.deepEqual(mergeById(null, null), []);
  assert.deepEqual(mergeById([{ id: 'x' }], null), [{ id: 'x' }]);
});

test('maxUpdatedAt: devuelve la mayor marca de tiempo', () => {
  assert.equal(maxUpdatedAt([{ updatedAt: 100 }, { updatedAt: 300 }, { updatedAt: 200 }]), 300);
  assert.equal(maxUpdatedAt([], 50), 50);          // respeta el piso
  assert.equal(maxUpdatedAt([{ updatedAt: 10 }], 50), 50); // nunca por debajo del piso
});

test('aggregateDaily: consolida tp_/tc_/pm_ de varios días', () => {
  const docs = [
    { date: '2026-10-01', total: 100, tp_p1: 2, tp_p2: 1, tc_cA: 100, pm_efectivo: 60, pm_debito: 40 },
    { date: '2026-10-02', total: 50, tp_p1: 3, tc_cA: 30, tc_cB: 20, pm_efectivo: 50 }
  ];
  const { prodQty, catAmt, payTotals } = aggregateDaily(docs);
  assert.deepEqual(prodQty, { p1: 5, p2: 1 });
  assert.deepEqual(catAmt, { cA: 130, cB: 20 });
  assert.deepEqual(payTotals, { efectivo: 110, debito: 40 });
});

test('aggregateDaily: no confunde «total»/«cost» con los prefijos tp_/tc_/pm_', () => {
  const { prodQty, catAmt, payTotals } = aggregateDaily([{ total: 999, cost: 10, profit: 5, salesCount: 1 }]);
  assert.deepEqual(prodQty, {});
  assert.deepEqual(catAmt, {});
  assert.deepEqual(payTotals, {});
});

test('topProductIds: ordena desc por cantidad e ignora los <= 0', () => {
  const prodQty = { p1: 5, p2: 1, p3: 9, p4: 0, p5: -2 };
  assert.deepEqual(topProductIds(prodQty, 2), ['p3', 'p1']);
  assert.deepEqual(topProductIds(prodQty, 10), ['p3', 'p1', 'p2']); // p4=0 y p5<0 fuera
});
