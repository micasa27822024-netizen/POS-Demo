# Tests de POS Pro

Dos niveles de prueba, ambos ejecutables sin build:

## 1) Unitarios (lógica pura) — corren siempre

Validan la lógica de negocio aislada en módulos sin dependencias de navegador
ni Firebase (`js/services/sales-calc.js`, `js/services/product-calc.js`).

```bash
node --test
```

Cubren:

- `calcTotals`: subtotal, descuentos por ítem, descuento general acotado al
  subtotal, cantidades decimales (kg) y redondeo a 2 decimales.
- `isDecimalUnit`: unidades decimales vs. enteras.
- `margin`: ganancia, margen sobre venta, markup sobre costo y bordes
  (precio 0 / costo 0, sin división por cero).

No requieren instalar nada: usan el runner nativo `node:test`.

## 2) Reglas de Firestore (emulador) — opcional

`tests/rules.test.mjs` valida la **matriz de permisos** (sección 7 del informe)
contra `firebase/firestore.rules`. Se auto-saltea si no están el emulador ni
la librería. Para ejecutarlo de verdad:

```bash
npm i -D @firebase/rules-unit-testing firebase
firebase emulators:start --only firestore        # en otra terminal
FIRESTORE_EMULATOR_HOST=localhost:8080 node --test tests/rules.test.mjs
```

Casos cubiertos:

| Caso | Esperado |
|------|----------|
| Anónimo lee productos | ❌ deniega |
| Usuario inactivo | ❌ sin permisos (rol `none`) |
| Cajero lee productos | ✅ permite |
| Cajero crea productos | ❌ deniega |
| Encargado crea productos | ✅ permite |
| Cajero descuenta stock (venta) | ✅ solo `stock`+`updatedAt` |
| Cajero cambia otros campos del producto | ❌ deniega |
| Cajero escribe `users` | ❌ deniega |
| Admin escribe `settings` | ✅ permite |
| Encargado escribe `settings` | ❌ deniega |

## Concurrencia

La atomicidad de numeración + stock + caja + cuenta corriente se garantiza en
`Sales.confirm` (`js/services/sales.service.js`) mediante una única
transacción (`DB.transaction`) que hace **todas las lecturas antes de las
escrituras** y usa el contador `counters/sales` con `increment`. Así, dos
ventas simultáneas nunca comparten número ni dejan stock inconsistente: si la
transacción detecta un cambio concurrente, Firestore la reintenta.
