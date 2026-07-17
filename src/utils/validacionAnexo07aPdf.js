/** RC7.7B — PDF institucional + upload firmado (compat 07-A). */
export { downloadAnexo07A, downloadFormatoValidacion } from './validacionFormatosPdf.js';

/** Límite institucional de PDF firmado (10 MB). */
export const MAX_PDF_FIRMADO_BYTES = 10 * 1024 * 1024;

export function readPdfUpload(file, opts = {}) {
  const maxBytes = opts.maxBytes ?? MAX_PDF_FIRMADO_BYTES;
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Archivo no seleccionado'));
    const mime = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    if (mime && mime !== 'application/pdf' && !name.endsWith('.pdf')) {
      return reject(new Error('Solo se aceptan archivos PDF'));
    }
    if (file.size > maxBytes) {
      const mb = (maxBytes / (1024 * 1024)).toFixed(0);
      return reject(new Error(`El PDF supera el tamaño máximo permitido (${mb} MB)`));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        nombre: file.name,
        mime_type: file.type || 'application/pdf',
        base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
        tamaño_bytes: file.size,
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {(meta: object) => void} onFile
 * @param {{ onError?: (msg: string) => void, maxBytes?: number }} [opts]
 */
export function triggerPdfUpload(onFile, opts = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,application/pdf';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const meta = await readPdfUpload(file, opts);
      onFile(meta);
    } catch (err) {
      if (typeof opts.onError === 'function') opts.onError(err.message);
      else console.error(err);
    }
  };
  input.click();
}
