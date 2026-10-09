// Tests del CANDADO FISCAL con vencimiento (punto 4 de la revisión).
// Lógica PURA: no requieren navegador ni Firebase. Se ejecutan con: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FISCAL_LOCK_TTL_MS, hasFiscalCae, isLockActive, evaluateFiscalLock, withLock }
  from '../js/services/fiscal-lock.js';

test('FISCAL_LOCK_TTL_MS: el candado vence a los 2 minutos', () => {
  assert.equal(FISCAL_LOCK_TTL_MS, 2 * 60 * 1000);
});

test('hasFiscalCae: solo cuenta como emitido si hay CAE y estado fiscal real', () => {
  assert.equal(hasFiscalCae({ cae: '7501', estado: 'aprobado' }), true);
  assert.equal(hasFiscalCae({ estado: 'aprobado' }), false);          // sin CAE
  assert.equal(hasFiscalCae({ cae: '7501', estado: 'no_fiscal' }), false); // interno X
  assert.equal(hasFiscalCae({ cae: '7501', estado: 'error' }), false);     // reintentable
  assert.equal(hasFiscalCae(null), false);
});

test('evaluateFiscalLock: SKIP cuando la venta ya tiene CAE emitido', () => {
  const ev = evaluateFiscalLock({ cae: '7501', estado: 'aprobado' }, Date.now());
  assert.equal(ev.action, 'skip');
});

test('evaluateFiscalLock: BLOCKED cuando hay una solicitud en curso FRESCA', () => {
  const now = 1_000_000;
  const f = { estado: 'solicitando', lockedAt: now - 30 * 1000 }; // 30 s < 2 min
  const ev = evaluateFiscalLock(f, now);
  assert.equal(ev.action, 'blocked');
  assert.ok(ev.remainingMs > 0 && ev.remainingMs <= FISCAL_LOCK_TTL_MS);
  assert.match(ev.reason, /en curso/);
});

test('evaluateFiscalLock: PROCEED con TAKEOVER cuando el candado venció (abandonado)', () => {
  const now = 10_000_000;
  const f = { estado: 'solicitando', lockedAt: now - (FISCAL_LOCK_TTL_MS + 1) }; // > 2 min
  const ev = evaluateFiscalLock(f, now);
  assert.equal(ev.action, 'proceed');
  assert.equal(ev.takeover, true);
});

test('evaluateFiscalLock: PROCEED normal cuando no hay candado', () => {
  assert.deepEqual(evaluateFiscalLock({ estado: 'no_fiscal' }, Date.now()),
    { action: 'proceed', takeover: false });
  assert.deepEqual(evaluateFiscalLock({}, Date.now()),
    { action: 'proceed', takeover: false });
  assert.deepEqual(evaluateFiscalLock(null, Date.now()),
    { action: 'proceed', takeover: false });
});

test('evaluateFiscalLock: PROCEED al reintentar tras un error (estado error)', () => {
  const ev = evaluateFiscalLock({ estado: 'error', error: 'red' }, Date.now());
  assert.equal(ev.action, 'proceed');
  assert.equal(ev.takeover, false);
});

test('evaluateFiscalLock: una solicitud sin lockedAt (dato viejo) se trata como vencida', () => {
  // Ventas que quedaron 'solicitando' ANTES de este arreglo no tienen lockedAt:
  // lockedAt=0 -> siempre vencido -> se puede retomar (no quedan trabadas).
  const ev = evaluateFiscalLock({ estado: 'solicitando' }, Date.now());
  assert.equal(ev.action, 'proceed');
  assert.equal(ev.takeover, true);
});

test('isLockActive: distingue candado fresco de vencido', () => {
  const now = 5_000_000;
  assert.equal(isLockActive({ estado: 'solicitando', lockedAt: now - 10_000 }, now), true);
  assert.equal(isLockActive({ estado: 'solicitando', lockedAt: now - (FISCAL_LOCK_TTL_MS + 1) }, now), false);
  assert.equal(isLockActive({ estado: 'aprobado', cae: '1' }, now), false);
});

test('withLock: toma el candado con sello de tiempo y preserva los campos fiscales', () => {
  const now = 123456;
  const out = withLock({ puntoVenta: '0003', tipoComprobante: 'B' }, now, 'u42');
  assert.equal(out.estado, 'solicitando');
  assert.equal(out.lockedAt, now);
  assert.equal(out.lockedBy, 'u42');
  assert.equal(out.puntoVenta, '0003');
  assert.equal(out.tipoComprobante, 'B');
  // Sin usuario -> lockedBy nulo.
  assert.equal(withLock({}, now).lockedBy, null);
});
