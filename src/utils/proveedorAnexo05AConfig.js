/**
 * Modelo único de columnas — Información técnica (pantalla) y Anexo 05-A (PDF).
 * Solo columnas que ya existen en el aplicativo; no inventa campos institucionales.
 */

export const ANEXO_05A_HEADER = {
  titulo: 'ANEXO 05-A',
  subtitulo: 'INFORMACIÓN TÉCNICA SOLICITADA (CUMPLIMIENTO DEL ÍTEM)',
};

/** Gris institucional / naranja columnas del proveedor (impresión). */
export const ANEXO_05A_COLORS = {
  institutional: [120, 120, 120],
  provider: [230, 126, 34],
  institutionalText: [255, 255, 255],
  providerText: [255, 255, 255],
};

/**
 * @typedef {object} Anexo05AColumn
 * @property {string} key
 * @property {string} label
 * @property {'item'|'form'|'docs'} source
 * @property {string} [field]
 * @property {boolean} editable
 * @property {boolean} [required]
 * @property {string} [inputClass]
 * @property {string} [inputType]
 * @property {number} [maxlength]
 * @property {string} [placeholder]
 * @property {string[]} [options]
 * @property {'institutional'|'provider'} headerColorType
 * @property {boolean} [screen]
 * @property {boolean} [pdf]
 * @property {number} [pdfWidth]
 * @property {string} [align]
 * @property {string} [headerGroup]
 */

/** Columnas institucionales (precargadas). */
export const ANEXO_05A_INSTITUTIONAL_COLUMNS = [
  {
    key: 'requerimiento',
    label: 'Req.',
    source: 'item',
    field: 'requerimiento_codigo',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: true,
    pdfWidth: 42,
    align: 'left',
  },
  {
    key: 'centro',
    label: 'Centro',
    source: 'item',
    field: 'centro',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: true,
    pdfWidth: 50,
    align: 'left',
  },
  {
    key: 'codigo_sigamef',
    label: 'Código SIGA',
    source: 'item',
    field: 'codigo_sigamef',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: true,
    pdfWidth: 48,
    align: 'left',
  },
  {
    key: 'descripcion',
    label: 'Descripción',
    source: 'item',
    field: 'descripcion',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: true,
    pdfWidth: 80,
    align: 'left',
  },
  {
    key: 'cantidad',
    label: 'Cant.',
    source: 'item',
    field: 'cantidad',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: true,
    pdfWidth: 26,
    align: 'center',
  },
  {
    key: 'unidad_medida',
    label: 'U.M.',
    source: 'item',
    field: 'unidad_medida',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: true,
    pdfWidth: 26,
    align: 'center',
  },
  {
    key: 'docs',
    label: 'Requerimiento/Pedidos',
    source: 'docs',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: true,
    pdf: false,
  },
  {
    key: 'pedido_sigamef',
    label: 'Pedido SIGAMEF',
    source: 'item',
    field: 'pedido_sigamef',
    editable: false,
    headerColorType: 'institutional',
    headerGroup: 'base',
    screen: false,
    pdf: true,
    pdfWidth: 48,
    align: 'left',
  },
];

/** Columnas completadas por el proveedor (Cumplimiento del ítem). */
export const ANEXO_05A_PROVIDER_COLUMNS = [
  {
    key: 'presentacion',
    label: 'Presentación',
    source: 'form',
    field: 'presentacion',
    editable: true,
    required: true,
    inputClass: 'prov-f-presentacion',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 42,
  },
  {
    key: 'cantidad_ofertada',
    label: 'Cant. ofertada',
    source: 'form',
    field: 'cantidad_ofertada',
    editable: true,
    required: true,
    inputClass: 'prov-f-cant',
    inputType: 'number',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 34,
  },
  {
    key: 'marca',
    label: 'Marca',
    source: 'form',
    field: 'marca',
    editable: true,
    required: true,
    inputClass: 'prov-f-marca',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 36,
  },
  {
    key: 'modelo',
    label: 'Modelo',
    source: 'form',
    field: 'modelo',
    editable: true,
    required: true,
    inputClass: 'prov-f-modelo',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 36,
  },
  {
    key: 'pais',
    label: 'País',
    source: 'form',
    field: 'pais',
    editable: true,
    required: true,
    inputClass: 'prov-f-pais',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 34,
  },
  {
    key: 'anio_fabricacion',
    label: 'Año fab.',
    source: 'form',
    field: 'anio_fabricacion',
    editable: true,
    required: true,
    inputClass: 'prov-f-anio',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 30,
  },
  {
    key: 'garantia',
    label: 'Garantía',
    source: 'form',
    field: 'garantia',
    editable: true,
    required: true,
    inputClass: 'prov-f-garantia',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 36,
  },
  {
    key: 'vigencia_minima',
    label: 'Vigencia mín.',
    source: 'form',
    field: 'vigencia_minima',
    editable: true,
    required: true,
    inputClass: 'prov-f-vigencia',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 36,
  },
  {
    key: 'compromiso_canje',
    label: 'Canje',
    source: 'form',
    field: 'compromiso_canje',
    editable: true,
    required: false,
    inputClass: 'prov-f-canje',
    inputType: 'select',
    options: ['Sí', 'No', 'Parcial'],
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 30,
  },
  {
    key: 'plazo_entrega',
    label: 'Plazo entrega',
    source: 'form',
    field: 'plazo_entrega',
    editable: true,
    required: true,
    inputClass: 'prov-f-plazo',
    inputType: 'text',
    maxlength: 500,
    placeholder: 'Ej.: 20 unidades a 10 días, 10 unidades a 40 días',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 62,
  },
  {
    key: 'doc_tecnica',
    label: 'Doc. técnica',
    source: 'form',
    field: 'doc_tecnica',
    editable: true,
    required: true,
    inputClass: 'prov-f-doctec',
    inputType: 'text',
    headerColorType: 'provider',
    headerGroup: 'cumplimiento',
    screen: true,
    pdf: true,
    pdfWidth: 44,
  },
];

export const ANEXO_05A_COLUMNS = [
  ...ANEXO_05A_INSTITUTIONAL_COLUMNS,
  ...ANEXO_05A_PROVIDER_COLUMNS,
];

export function getAnexo05AScreenColumns() {
  return ANEXO_05A_COLUMNS.filter((c) => c.screen !== false);
}

export function getAnexo05APdfColumns() {
  return ANEXO_05A_COLUMNS.filter((c) => c.pdf !== false);
}

export function getAnexo05AProviderScreenColumns() {
  return ANEXO_05A_PROVIDER_COLUMNS.filter((c) => c.screen !== false);
}

export function getAnexo05AInstitutionalScreenColumns() {
  return ANEXO_05A_INSTITUTIONAL_COLUMNS.filter((c) => c.screen !== false);
}

/** Display de centro — nunca usa paquete. */
export function displayItemCentro(it) {
  if (!it || typeof it !== 'object') return '—';
  const display = String(it.centro_display || '').trim();
  if (display) return display;
  const codigo = String(it.centro_codigo || '').trim();
  const nombre = String(it.centro_nombre || '').trim();
  if (codigo && nombre && codigo !== nombre) return `${codigo} — ${nombre}`;
  const centro = String(it.centro || '').trim();
  return nombre || codigo || centro || '—';
}

export function resolveAnexo05ACellValue(col, item, formItem = {}, rowIndex = 0) {
  if (col.key === 'centro') return displayItemCentro(item);
  if (col.source === 'form') {
    const v = formItem?.[col.field];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (col.field === 'requerimiento_codigo') {
    return String(item?.requerimiento_codigo || item?.requerimiento_id || '');
  }
  if (col.field === 'cantidad') return String(item?.cantidad ?? 1);
  if (col.field === 'unidad_medida') return String(item?.unidad_medida || item?.um || 'UND');
  if (col.field) {
    const v = item?.[col.field];
    return v == null || v === '' ? '' : String(v);
  }
  return '';
}
