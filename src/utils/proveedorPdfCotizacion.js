/** Generación PDF — Anexo 05-A y 05-B (portal proveedores) */

export const TEXTO_AUTORIZACION_CORREO = 'Asimismo, AUTORIZO que el correo electrónico consignado en la presente Declaración Jurada sea utilizado como medio formal de comunicación con la Entidad para que me notifique las siguientes actuaciones: i) emisión de la Orden o Contrato, ii) ampliación de plazo, iii) otras modificaciones a la Orden o Contrato, iv) Observaciones al bien y Levantamiento de Observaciones al bien, v) apercibimiento para cumplimiento de obligaciones contractuales, vi) Resolución Parcial o Total del Contrato u Orden, vii) comunicación de penalidades y descargos respectivos; y viii) otras actuaciones durante la etapa de ejecución contractual.';

export const TEXTO_LEY_27444 = '1.-El numeral 42.1 del artículo 42.- Presunción de veracidad de la Ley Nº 27444 - Ley del Procedimiento Administrativo General, establece que todas las declaraciones juradas, los documentos sucedáneos presentados y la información incluida en los escritos y formularios que presenten los administrados para la realización de procedimientos administrativos, se presumen verificados por quien hace uso de ellos, así como de contenido veraz para fines del procedimiento administrativo. Esta presunción admite prueba en contrario.';

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

export function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function appendWrappedText(doc, text, x, y, maxWidth, lineHeight = 11) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function appendDatosProveedor(doc, datos, startY) {
  const d = datos || {};
  let y = startY;
  doc.setFontSize(9);
  const rows = [
    ['Razón Social:', d.razon_social || ''],
    ['RUC:', d.ruc || ''],
    ['Domicilio fiscal:', d.domicilio_fiscal || ''],
    ['Datos Representante Legal:', d.representante_legal || ''],
    ['Persona de Contacto:', d.persona_contacto || ''],
    ['Celular:', d.celular || ''],
    ['Correo electrónico:', d.correo || ''],
    ['Validez de la oferta:', d.validez_oferta || ''],
    ['Firma del Representante legal:', d.firma_representante || ''],
  ];
  rows.forEach(([label, val]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 40, y);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(String(val), 360);
    doc.text(lines, 170, y);
    y += Math.max(12, lines.length * 11);
  });
  return y + 8;
}

export function downloadAnexo05A({ solicitud, items, formItems, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const codigo = solicitud?.codigo || 'SC';
  doc.setFontSize(12);
  doc.text('ANEXO 05-A — INFORMACIÓN TÉCNICA SOLICITADA (CUMPLIMIENTO DEL ÍTEM)', 40, 40);
  doc.setFontSize(9);
  doc.text(`Solicitud: ${codigo} — ${solicitud?.denominacion || solicitud?.objeto || ''}`, 40, 56);
  doc.text(`Proveedor: ${datos?.razon_social || proveedor?.razon_social || ''} · RUC ${datos?.ruc || proveedor?.ruc || ''}`, 40, 68);

  const head = [[
    'Req.', 'Código SIGA', 'Descripción', 'Cant.', 'Presentación', 'Cant.of.', 'Marca', 'Modelo',
    'País', 'Año', 'Garantía', 'Vigencia', 'Canje', 'Plazo', 'Doc.téc.',
  ]];
  const body = (items || []).map((it, idx) => {
    const f = formItems[idx] || {};
    return [
      it.requerimiento_codigo || '',
      it.codigo_sigamef || '',
      String(it.descripcion || '').slice(0, 40),
      String(it.cantidad ?? 1),
      f.presentacion || '',
      String(f.cantidad_ofertada ?? ''),
      f.marca || '',
      f.modelo || '',
      f.pais || '',
      f.anio_fabricacion || '',
      f.garantia || '',
      f.vigencia_minima || '',
      f.compromiso_canje || '',
      f.plazo_entrega || '',
      f.doc_tecnica || '',
    ];
  });

  doc.autoTable({
    startY: 82,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [13, 110, 253] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`Anexo_05-A_${codigo.replace(/\s+/g, '_')}.pdf`);
}

export function downloadAnexo05B({ solicitud, items, precios, proveedor, datos }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const codigo = solicitud?.codigo || 'SC';
  doc.setFontSize(12);
  doc.text('ANEXO 05-B — OFERTA ECONÓMICA (incluido IGV)', 40, 40);
  doc.setFontSize(9);
  doc.text(`Solicitud: ${codigo}`, 40, 56);

  let total = 0;
  const body = (items || []).map((it, idx) => {
    const p = precios[it.item_key] || {};
    total += Number(p.total || 0);
    return [
      String(idx + 1),
      String(it.descripcion || '').slice(0, 60),
      String(it.cantidad ?? 1),
      money(p.unitario),
      money(p.total),
    ];
  });

  doc.autoTable({
    startY: 72,
    head: [['Ítem', 'Descripción', 'Cant.', 'P.Unitario S/.', 'P.Total S/.']],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [108, 117, 125] },
    margin: { left: 40, right: 40 },
  });

  let y = doc.lastAutoTable.finalY + 14;
  doc.setFontSize(10);
  doc.text(`Monto total de la oferta (incluido IGV): S/ ${money(total)}`, 40, y);
  y += 22;
  y = appendDatosProveedor(doc, datos, y);
  doc.setFontSize(8);
  y = appendWrappedText(doc, TEXTO_AUTORIZACION_CORREO, 40, y, 520);
  y += 6;
  appendWrappedText(doc, TEXTO_LEY_27444, 40, y, 520);
  doc.save(`Anexo_05-B_${codigo.replace(/\s+/g, '_')}.pdf`);
}

export function readUploadFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Archivo no seleccionado'));
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nombre: file.name,
        mime_type: file.type || 'application/octet-stream',
        base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

export function triggerFileInput(accept, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const meta = await readUploadFile(file);
      onFile(meta);
    } catch (err) {
      alert(err.message);
    }
  };
  input.click();
}
