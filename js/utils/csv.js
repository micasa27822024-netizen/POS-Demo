// Utilidades de exportación (CSV y respaldo JSON). B5.
// Se centraliza acá la generación de archivos descargables para reutilizarla
// desde Reportes y desde Configuración (respaldo completo).

// Convierte un arreglo de objetos a texto CSV (con BOM para Excel).
export function toCSV(rows, headers) {
  const cols = headers || (rows.length ? Object.keys(rows[0]) : []);
  const esc = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const lines = [cols.map(esc).join(',')];
  for (const r of rows) lines.push(cols.map(c => esc(r[c])).join(','));
  return '\ufeff' + lines.join('\r\n');
}

// Dispara la descarga de un archivo en el navegador.
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Colecciones incluidas en el respaldo completo del sistema.
export const BACKUP_COLLECTIONS = [
  'settings', 'categories', 'products', 'clients', 'suppliers',
  'sales', 'payments', 'purchases', 'stockMovements',
  'cashRegisters', 'cashMovements', 'accountsReceivable',
  'counters', 'dailyStats', 'auditLogs'
];

// Construye un respaldo JSON completo leyendo cada colección por páginas
// (B1: nunca se asume un único getDocs gigante; se usa limit + startAfter).
export async function buildBackup(DB, { pageSize = 500, orderField = null } = {}) {
  const out = { _meta: { app: 'POS Pro', version: 1, exportedAt: new Date().toISOString() }, data: {} };
  for (const name of BACKUP_COLLECTIONS) {
    const all = [];
    let cursor = null;
    // Ordenamos por un campo estable si existe (at) para paginar de forma determinista.
    const ob = orderField || 'at';
    for (let guard = 0; guard < 1000; guard++) {
      const opts = { limit: pageSize };
      // Intentamos ordenar por 'at'; si la colección no lo tiene, se cae a sin orden.
      try {
        opts.orderBy = [ob, 'asc'];
        if (cursor != null) opts.startAfter = cursor;
        const page = await DB.list(name, opts);
        if (!page.length) break;
        all.push(...page);
        if (page.length < pageSize) break;
        const last = page[page.length - 1];
        cursor = last[ob];
        if (cursor == null) break; // sin campo de orden: evitamos bucle
      } catch (_) {
        // Fallback: una sola lectura simple.
        const page = await DB.list(name);
        all.length = 0; all.push(...page); break;
      }
    }
    out.data[name] = all;
  }
  return out;
}
