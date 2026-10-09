// Tests de la interfaz fiscal AFIP/ARCA (C1 — preparación sin backend).
// Se ejecutan con: node --test  (no requieren navegador ni Firebase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fiscal, fiscalDefault, tipoPorCondicion, CODIGO_AFIP } from '../js/services/fiscal.service.js';

test('tipoPorCondicion: mapea la condición de IVA al tipo de comprobante', () => {
  assert.equal(tipoPorCondicion('Responsable Inscripto'), 'A');
  assert.equal(tipoPorCondicion('Monotributo'), 'C');
  assert.equal(tipoPorCondicion('Exento'), 'C');
  assert.equal(tipoPorCondicion('Consumidor Final'), 'X');
  assert.equal(tipoPorCondicion(undefined), 'X');
});

test('fiscalDefault: comprobante interno X, numeración fiscal separada en 0, sin CAE', () => {
  const f = fiscalDefault();
  assert.equal(f.tipoComprobante, 'X');
  assert.equal(f.puntoVenta, '0001');
  assert.equal(f.numero, 0);       // numeración fiscal SEPARADA de la interna
  assert.equal(f.cae, '');
  assert.equal(f.caeVto, '');
  assert.equal(f.estado, 'no_fiscal');
  assert.equal(f.error, '');
  const f2 = fiscalDefault({ puntoVenta: '0003', tipoComprobante: 'B' });
  assert.equal(f2.puntoVenta, '0003');
  assert.equal(f2.tipoComprobante, 'B');
});

test('CODIGO_AFIP: códigos de comprobante', () => {
  assert.deepEqual(CODIGO_AFIP, { X: '99', A: '01', B: '06', C: '11' });
});

test('Fiscal.requestCAE: proveedor NULO por defecto deja comprobante interno X', async () => {
  Fiscal.setProvider(null);               // asegura el proveedor nulo
  assert.equal(Fiscal.isEnabled(), false);
  const f = await Fiscal.requestCAE({ number: 10, total: 1000 }, { puntoVenta: '0002' });
  assert.equal(f.tipoComprobante, 'X');
  assert.equal(f.puntoVenta, '0002');
  assert.equal(f.estado, 'no_fiscal');
  assert.equal(f.cae, '');
});

test('Fiscal.setProvider: un backend real completa tipo, numeración fiscal y CAE', async () => {
  Fiscal.setProvider(async (sale, cfg) => ({
    tipoComprobante: 'B', puntoVenta: cfg.puntoVenta, numero: 42,
    cae: '75123456789012', caeVto: '2026-10-20', estado: 'aprobado', error: ''
  }));
  assert.equal(Fiscal.isEnabled(), true);
  const f = await Fiscal.requestCAE({ number: 11, total: 2000 }, { puntoVenta: '0001' });
  assert.equal(f.tipoComprobante, 'B');
  assert.equal(f.numero, 42);           // numeración fiscal independiente de sale.number
  assert.equal(f.cae, '75123456789012');
  assert.equal(f.estado, 'aprobado');
  Fiscal.setProvider(null);             // restaura el nulo para no afectar otros tests
});

test('Fiscal.requestCAE: nunca lanza; un backend con error devuelve estado error', async () => {
  Fiscal.setProvider(async () => { throw new Error('AFIP sin respuesta'); });
  const f = await Fiscal.requestCAE({ number: 12 }, {});
  assert.equal(f.estado, 'error');
  assert.equal(f.error, 'AFIP sin respuesta');
  Fiscal.setProvider(null);
});
