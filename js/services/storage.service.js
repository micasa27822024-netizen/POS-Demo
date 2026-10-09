// Gestión de imágenes SIN Firebase Storage (plan Spark gratuito).
// La imagen se comprime en el navegador y se guarda como dataURL (base64)
// dentro del propio documento de Firestore. Así NO hace falta el plan Blaze.
//
// Firestore permite hasta ~1 MB por documento. Comprimiendo a ~500 px y
// calidad 0,7 cada foto ocupa ~30-70 KB, muy por debajo del límite.

const MAX_BYTES = 100 * 1024; // tope duro del dataURL (base64) ~100 KB
const TARGET_BYTES = 30 * 1024; // objetivo recomendado por B1 (~30 KB, miniatura)

// Redimensiona y comprime la imagen usando un <canvas> del navegador.
function renderDataUrl(file, { maxW, maxH, quality }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      const r = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * r); h = Math.round(h * r);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
    img.src = url;
  });
}

// Comprime y, si hace falta, reduce más hasta entrar en el tope de Firestore.
export async function compressImage(file, opts = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('El archivo no es una imagen');
  // B1: las imágenes se guardan como miniatura (ref. 200x200, JPEG 0,7, objetivo <30 KB).
  let { maxW = 200, maxH = 200, quality = 0.7 } = opts;
  let dataUrl = await renderDataUrl(file, { maxW, maxH, quality });
  // Si supera el objetivo, bajamos calidad y tamaño progresivamente.
  let guard = 0;
  while (dataUrl.length > TARGET_BYTES && guard++ < 6) {
    quality = Math.max(0.4, quality - 0.1);
    maxW = Math.round(maxW * 0.85); maxH = Math.round(maxH * 0.85);
    dataUrl = await renderDataUrl(file, { maxW, maxH, quality });
  }
  if (dataUrl.length > MAX_BYTES) throw new Error('La imagen es demasiado grande; probá con una más liviana');
  return dataUrl;
}

export const Storage = {
  // Devuelve el dataURL comprimido listo para guardar en Firestore.
  // (El 2º parámetro se mantiene por compatibilidad y se ignora.)
  async upload(file, _path) {
    return compressImage(file);
  }
};
