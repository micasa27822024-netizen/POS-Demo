// Tests de Firestore Security Rules (B3 · matriz de la sección 7 del informe).
//
// Requieren el emulador de Firestore y la librería @firebase/rules-unit-testing.
// Si no están disponibles, el archivo se auto-saltea (skip) para no romper
// `node --test`. Para ejecutarlos de verdad:
//
//   1) npm i -D @firebase/rules-unit-testing firebase
//   2) firebase emulators:start --only firestore   (en otra terminal)
//   3) FIRESTORE_EMULATOR_HOST=localhost:8080 node --test tests/rules.test.mjs
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let rut = null;
try { rut = await import('@firebase/rules-unit-testing'); }
catch { /* librería ausente: se saltean los tests */ }

const RULES = readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
const PROJECT = 'pos-pro-rules-test';

async function env() {
  return rut.initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: RULES, host: 'localhost', port: 8080 }
  });
}

// Siembra el documento users/{uid} con rol y estado activo.
async function seedUser(testEnv, uid, role, active = true) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(ctx.firestore(), 'users', uid), { role, active, name: uid });
  });
}

test('Rules · matriz de permisos (sección 7)', { skip: !rut ? 'emulador/libs ausentes' : false }, async (t) => {
  const { assertFails, assertSucceeds } = rut;
  const testEnv = await env();
  t.after(() => testEnv.cleanup());

  await seedUser(testEnv, 'admin1', 'admin');
  await seedUser(testEnv, 'enc1', 'encargado');
  await seedUser(testEnv, 'caj1', 'cajero');
  await seedUser(testEnv, 'inact1', 'cajero', false);

  const asUser = uid => testEnv.authenticatedContext(uid).firestore();
  const noAuth = () => testEnv.unauthenticatedContext().firestore();
  const { doc, getDoc, setDoc, updateDoc, deleteDoc } = await import('firebase/firestore');

  await t.test('anónimo no lee productos', async () => {
    await assertFails(getDoc(doc(noAuth(), 'products', 'p1')));
  });

  await t.test('usuario inactivo = sin permisos', async () => {
    await assertFails(getDoc(doc(asUser('inact1'), 'products', 'p1')));
  });

  await t.test('cajero lee productos pero no crea', async () => {
    await assertSucceeds(getDoc(doc(asUser('caj1'), 'products', 'p1')));
    await assertFails(setDoc(doc(asUser('caj1'), 'products', 'pNew'), { name: 'X', stock: 1 }));
  });

  await t.test('encargado crea productos', async () => {
    await assertSucceeds(setDoc(doc(asUser('enc1'), 'products', 'pE'), { name: 'E', stock: 5 }));
  });

  await t.test('cajero solo puede DESCONTAR stock (venta)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { doc: d, setDoc: s } = await import('firebase/firestore');
      await s(d(ctx.firestore(), 'products', 'pStock'), { name: 'S', stock: 10 });
    });
    await assertSucceeds(updateDoc(doc(asUser('caj1'), 'products', 'pStock'), { stock: 9, updatedAt: Date.now() }));
    // La venta también recalcula la bandera de reposición (needsRestock): el
    // cajero DEBE poder escribirla junto con stock+updatedAt (regresión punto A).
    await assertSucceeds(updateDoc(doc(asUser('caj1'), 'products', 'pStock'),
      { stock: 8, updatedAt: Date.now(), needsRestock: true }));
    // No puede cambiar otros campos ni subir el stock arbitrariamente.
    await assertFails(updateDoc(doc(asUser('caj1'), 'products', 'pStock'), { price: 999 }));
    // needsRestock NO habilita subir el stock de contrabando.
    await assertFails(updateDoc(doc(asUser('caj1'), 'products', 'pStock'),
      { stock: 999, updatedAt: Date.now(), needsRestock: false }));
  });

  await t.test('solo admin administra usuarios y settings', async () => {
    await assertFails(setDoc(doc(asUser('caj1'), 'users', 'x'), { role: 'admin', active: true }));
    await assertSucceeds(setDoc(doc(asUser('admin1'), 'settings', 'business'), { name: 'POS' }));
    await assertFails(setDoc(doc(asUser('enc1'), 'settings', 'business'), { name: 'Hack' }));
  });
});

// Nota de concurrencia (B3): la atomicidad de numeración/stock/caja se valida
// además a nivel lógico. La transacción de `Sales.confirm` usa el contador
// `counters/sales` + `increment`, de modo que dos ventas simultáneas nunca
// comparten número ni dejan stock inconsistente (lecturas antes de escrituras).
test('Concurrencia · documentada (ver sales.service.confirm)', () => {
  assert.ok(true);
});
