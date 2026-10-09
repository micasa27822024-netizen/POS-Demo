// C1 / punto 4: CANDADO FISCAL con vencimiento.
//
// Problema que resuelve: al pedir el CAE se marca la venta como 'solicitando'
// para que dos pedidos simultáneos (doble clic, dos pestañas) no soliciten dos
// veces. Pero si el navegador se cierra, se corta la red o el backend queda
// colgado JUSTO después de poner el candado y ANTES de guardar el resultado, la
// venta quedaba 'solicitando' PARA SIEMPRE y nunca más se le podía emitir el CAE.
//
// Solución: el candado VENCE a los 2 minutos. Si una solicitud quedó trabada más
// de ese tiempo, se considera ABANDONADA y un nuevo intento puede retomarla.
// Lógica PURA (sin navegador ni Firebase), testeable con `node --test`.

export const FISCAL_LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutos

// ¿La venta ya tiene un CAE emitido? (no hay que volver a solicitarlo).
// 'no_fiscal' (interno X) y 'error' NO cuentan como emitido: admiten reintento.
export function hasFiscalCae(fiscal) {
  const f = fiscal || {};
  return !!f.cae && f.estado !== 'no_fiscal' && f.estado !== 'error';
}

// ¿Hay un candado de solicitud ACTIVO (fresco, dentro del TTL)?
export function isLockActive(fiscal, now = Date.now(), ttl = FISCAL_LOCK_TTL_MS) {
  const f = fiscal || {};
  if (f.estado !== 'solicitando') return false;
  const since = +f.lockedAt || 0;
  return (now - since) < ttl;
}

// Decide qué hacer al intentar solicitar el CAE, segun el estado fiscal actual.
// Devuelve uno de:
//   { action: 'skip' }                      -> ya tiene CAE: no se solicita.
//   { action: 'blocked', reason, remainingMs } -> solicitud en curso y fresca.
//   { action: 'proceed', takeover: bool }    -> se puede tomar el candado.
//        takeover=true cuando se reclama un candado VENCIDO (abandonado).
export function evaluateFiscalLock(fiscal, now = Date.now(), ttl = FISCAL_LOCK_TTL_MS) {
  const f = fiscal || {};
  if (hasFiscalCae(f)) return { action: 'skip' };
  if (f.estado === 'solicitando') {
    const since = +f.lockedAt || 0;
    const elapsed = now - since;
    if (elapsed < ttl) {
      const remainingMs = ttl - elapsed;
      const secs = Math.max(1, Math.ceil(remainingMs / 1000));
      return {
        action: 'blocked',
        remainingMs,
        reason: 'Ya hay una solicitud de CAE en curso para esta venta. Reintentá en ' + secs + ' s.'
      };
    }
    // Candado vencido: el intento anterior quedó abandonado -> se retoma.
    return { action: 'proceed', takeover: true };
  }
  return { action: 'proceed', takeover: false };
}

// Construye el objeto fiscal con el candado TOMADO (estado 'solicitando' + sello
// de tiempo). Preserva el resto de los campos fiscales existentes.
export function withLock(fiscal, now = Date.now(), lockedBy = null) {
  return { ...(fiscal || {}), estado: 'solicitando', lockedAt: now, lockedBy: lockedBy || null };
}
