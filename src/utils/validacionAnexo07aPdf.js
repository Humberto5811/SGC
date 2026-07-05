/** Generación PDF — Anexo 07-A Validación de propuestas técnicas (bienes) */

function ensureJsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca PDF no disponible. Recargue la página.');
  return window.jspdf.jsPDF;
}

export function downloadAnexo07A({ solicitud, formulario }) {
  const jsPDF = ensureJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const f = formulario || {};
  const items = f.items || [];

  doc.setFontSize(11);
  doc.text('ANEXO Nº 07-A: FORMATO DE VALIDACIÓN DE PROPUESTAS TÉCNICAS RECIBIDAS – BIENES', 40, 36);
  doc.setFontSize(8);
  doc.text('CUADRO DE VERIFICACIÓN, VALIDACIÓN Y EVALUACIÓN DE CUMPLIMIENTO DE ESPECIFICACIONES TÉCNICAS', 40, 50);
  doc.text(`ADQUISICIÓN DE: ${f.producto_adquisicion || solicitud?.denominacion || solicitud?.objeto || ''}`, 40, 62);
  doc.text(`Solicitud: ${solicitud?.solicitud_codigo || solicitud?.codigo || ''}`, 40, 74);

  const head = [[
    'Ítem', 'Nº REQ', 'Cód.SIGA', 'Descripción', 'Cant.', 'U.M.', 'Nº Cot.', 'Razón Social',
    'Marca', 'Procedencia', 'Inserto', 'Certificado', 'Obs.Recibidas',
    'Doc.oblig.', 'Vigencia', 'Plazo ent.', 'Resultado', 'Obs.Validación',
  ]];
  const body = items.map((it) => [
    String(it.item ?? ''),
    it.nro_req || '',
    it.codigo_sigamef || '',
    String(it.descripcion || '').slice(0, 35),
    String(it.cantidad ?? ''),
    it.um || '',
    String(it.cant_cotizaciones ?? ''),
    String(it.razon_social || '').slice(0, 20),
    it.marca || '',
    it.procedencia || '',
    it.inserto || '',
    it.certificado || '',
    String(it.obs_specs || '').slice(0, 25),
    it.acredita_doc || '',
    it.vigencia_minima_val || '',
    it.plazos_entrega_val || '',
    it.resultado || '',
    String(it.obs_validacion || '').slice(0, 25),
  ]);

  doc.autoTable({
    head,
    body,
    startY: 86,
    styles: { fontSize: 6, cellPadding: 2 },
    headStyles: { fillColor: [10, 66, 117], textColor: 255 },
    margin: { left: 30, right: 30 },
  });

  let y = doc.lastAutoTable.finalY + 18;
  doc.setFontSize(9);
  doc.text(`${f.lugar || 'Chorrillos'}, ${f.fecha || new Date().toLocaleDateString('es-PE')}`, 40, y);
  y += 16;
  doc.text(`Profesional que realizó la validación: ${f.profesional || ''}`, 40, y);
  y += 14;
  doc.text('Firma: _________________________________', 40, y);

  const codigo = (solicitud?.solicitud_codigo || 'SC').replace(/\s+/g, '_');
  doc.save(`Anexo_07A_Validacion_${codigo}.pdf`);
}

export function readPdfUpload(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Archivo no seleccionado'));
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        nombre: file.name,
        mime_type: file.type || 'application/pdf',
        base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl,
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

export function triggerPdfUpload(onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,application/pdf';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const meta = await readPdfUpload(file);
      onFile(meta);
    } catch (err) {
      alert(err.message);
    }
  };
  input.click();
}
