// Tests de la optimización de lecturas (B1): bandera de reposición, caché
// incremental del POS y agregados del Dashboard. Lógica PURA, sin navegador.
// Se ejecutan con: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsRestock } from '../js/services/stock-flags.js';
import { diffRestock } from '../js/services/stock-flags.js';
import { mergeById, maxUpdatedAt, syncFloor } from '../js/utils/cache-util.js';
import { splitDocs, rejoinDocs, packImages, byteSize } from '../js/utils/cache-split.js';
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

// Punto C: recálculo único de la bandera de reposición.
test('diffRestock: solo devuelve los productos cuya bandera está desactualizada', () => {
  const products = [
    { id: 'a', active: true, stock: 2, stockMin: 10 },                 // falta flag -> true
    { id: 'b', active: true, stock: 2, stockMin: 10, needsRestock: true }, // ya correcto
    { id: 'c', active: true, stock: 50, stockMin: 10, needsRestock: true }, // sobra flag -> false
    { id: 'd', active: true, stock: 50, stockMin: 10 },                 // correcto (sin flag)
    { id: 'e', active: false, stock: 0, stockMin: 5, needsRestock: true } // inactivo -> false
  ];
  const changes = diffRestock(products);
  // Solo a, c y e necesitan corrección.
  assert.deepEqual(changes, [
    { id: 'a', needsRestock: true },
    { id: 'c', needsRestock: false },
    { id: 'e', needsRestock: false }
  ]);
});

test('diffRestock: lista vacía o nula no rompe', () => {
  assert.deepEqual(diffRestock([]), []);
  assert.deepEqual(diffRestock(null), []);
});

// Punto D: tolerancia al desfase de relojes en la sincronización incremental.
test('syncFloor: resta el margen a la última marca y nunca baja de 0', () => {
  const skew = 10 * 60 * 1000; // 10 min
  assert.equal(syncFloor(1_000_000_000, skew), 1_000_000_000 - skew);
  assert.equal(syncFloor(5 * 60 * 1000, skew), 0); // marca < margen -> piso 0
  assert.equal(syncFloor(0, skew), 0);
  assert.equal(syncFloor(null, skew), 0);
});

test('syncFloor: sin margen devuelve la misma marca', () => {
  assert.equal(syncFloor(123456, 0), 123456);
});

// Punto E: separar las fotos pesadas del catálogo liviano para no reventar
// localStorage.
test('splitDocs: separa el campo image y deja el catálogo liviano', () => {
  const docs = [
    { id: 'p1', name: 'Gaseosa', price: 1800, image: 'data:img;base64,AAA' },
    { id: 'p2', name: 'Pan', price: 900, image: '' },   // imagen vacía -> no cuenta
    { id: 'p3', name: 'Queso', price: 9200 }             // sin imagen
  ];
  const { light, images } = splitDocs(docs);
  // El liviano no lleva imagen.
  assert.ok(light.every(d => !('image' in d)));
  assert.equal(light.length, 3);
  // Solo p1 tiene imagen guardada aparte.
  assert.deepEqual(Object.keys(images), ['p1']);
  assert.equal(images.p1.image, 'data:img;base64,AAA');
});

test('rejoinDocs: reensambla imagen cuando existe y deja placeholder cuando no', () => {
  const light = [{ id: 'p1', name: 'Gaseosa' }, { id: 'p2', name: 'Pan' }];
  const images = { p1: { image: 'data:img;base64,AAA' } };
  const full = rejoinDocs(light, images);
  assert.equal(full[0].image, 'data:img;base64,AAA');
  assert.equal('image' in full[1], false); // sin foto -> el POS muestra el ícono
});

test('splitDocs + rejoinDocs: ida y vuelta conserva los documentos completos', () => {
  const docs = [{ id: 'p1', name: 'A', price: 1, image: 'IMG1' }, { id: 'p2', name: 'B', price: 2 }];
  const { light, images } = splitDocs(docs);
  const back = rejoinDocs(light, images);
  assert.deepEqual(back, docs);
});

test('packImages: respeta el presupuesto y descarta lo que no entra', () => {
  const big = 'x'.repeat(1000);
  const images = { a: { image: big }, b: { image: big }, c: { image: big } };
  // Presupuesto para ~2 imágenes.
  const { images: kept, keptIds, skipped } = packImages(images, ['a', 'b', 'c'], 2200);
  assert.equal(keptIds.length, 2);
  assert.equal(skipped, 1);
  assert.ok(kept.a && kept.b && !kept.c); // respeta el orden recibido
});

test('packImages: sin presupuesto suficiente no guarda ninguna (no rompe)', () => {
  const images = { a: { image: 'x'.repeat(1000) } };
  const { images: kept, keptIds, skipped } = packImages(images, ['a'], 10);
  assert.deepEqual(kept, {});
  assert.equal(keptIds.length, 0);
  assert.equal(skipped, 1);
});

test('byteSize: mide strings y objetos sin romper con nulos', () => {
  assert.equal(byteSize(null), 0);
  assert.equal(byteSize('abc'), 3);
  assert.equal(byteSize({ a: 1 }), JSON.stringify({ a: 1 }).length);
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
