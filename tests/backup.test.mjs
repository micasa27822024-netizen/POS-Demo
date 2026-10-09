// Tests del respaldo completo (punto 1 de la revisión): cobertura de colecciones
// y paginación. Lógica PURA (csv.js no importa Firebase).
// Se ejecutan con: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_COLLECTIONS, buildBackup, toCSV, parseCSV } from '../js/utils/csv.js';

test('BACKUP_COLLECTIONS: incluye cuentas por pagar y por cobrar', () => {
  assert.ok(BACKUP_COLLECTIONS.includes('accountsPayable'), 'falta accountsPayable (cuentas por pagar)');
  assert.ok(BACKUP_COLLECTIONS.includes('accountsReceivable'), 'falta accountsReceivable (cuentas por cobrar)');
});

test('BACKUP_COLLECTIONS: los gastos y las plantillas viajan dentro de otras colecciones', () => {
  // Los gastos son egresos de caja -> cashMovements; las plantillas son docs de settings.
  assert.ok(BACKUP_COLLECTIONS.includes('cashMovements'), 'falta cashMovements (donde viven los gastos)');
  assert.ok(BACKUP_COLLECTIONS.includes('settings'), 'falta settings (donde viven las plantillas)');
});

test('BACKUP_COLLECTIONS: no tiene colecciones repetidas', () => {
  assert.equal(new Set(BACKUP_COLLECTIONS).size, BACKUP_COLLECTIONS.length);
});

test('buildBackup: lee todas las colecciones por páginas sin perder documentos', async () => {
  // DB falso: 'accountsPayable' tiene 3 docs y pageSize=2 -> fuerza 2 páginas.
  const store = {
    accountsPayable: [{ id: 'ap1' }, { id: 'ap2' }, { id: 'ap3' }],
    settings: [{ id: 'business' }, { id: 'invoice' }, { id: 'ticket' }]
  };
  const fakeDB = {
    async list(name, opts = {}) {
      const all = store[name] || [];
      const limit = opts.limit || all.length;
      let start = 0;
      if (opts.startAfter != null) {
        const idx = all.findIndex(d => d.id === opts.startAfter);
        start = idx >= 0 ? idx + 1 : all.length;
      }
      return all.slice(start, start + limit);
    }
  };
  const bk = await buildBackup(fakeDB, { pageSize: 2 });
  assert.equal(bk.data.accountsPayable.length, 3);        // no se pierde el 3º al paginar
  assert.deepEqual(bk.data.accountsPayable.map(d => d.id), ['ap1', 'ap2', 'ap3']);
  assert.deepEqual(bk.data.settings.map(d => d.id), ['business', 'invoice', 'ticket']);
  // y existe una entrada por cada colección declarada (aunque esté vacía)
  for (const name of BACKUP_COLLECTIONS) assert.ok(Array.isArray(bk.data[name]), 'sin entrada para ' + name);
});

test('toCSV/parseCSV: ida y vuelta con acentos y comas', () => {
  const rows = [{ concepto: 'Compra, flete', monto: '1.250,00' }];
  const csv = toCSV(rows);
  assert.ok(csv.charCodeAt(0) === 0xFEFF, 'debe llevar BOM para Excel');
  const back = parseCSV(csv);
  assert.deepEqual(back, rows);
});
