/**
 * RC8.15.6G-7I — Catálogo y reglas de documentos tipificados del entregable.
 */

function toIsoDate(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

export const TIPO_ENTREGABLE = 'ENTREGABLE';
export const TIPO_OTRO = 'OTRO';

export const TIPOS_DOCUMENTO_ENTREGABLE = Object.freeze([
  { codigo: TIPO_ENTREGABLE, label: 'Entregable', obligatorio: true, multiples: false, vigencia: false },
  { codigo: 'RECIBO_HONORARIOS', label: 'Recibo por honorarios', obligatorio: false, multiples: false, vigencia: false },
  { codigo: 'SUSPENSION_4TA', label: 'Suspensión 4ta categoría', obligatorio: false, multiples: false, vigencia: true },
  { codigo: 'COLEGIATURA', label: 'Colegiatura', obligatorio: false, multiples: false, vigencia: true },
  { codigo: 'ANEXO_10_CCI', label: 'Anexo 10 CCI', obligatorio: false, multiples: false, vigencia: true },
  { codigo: 'SEGURO', label: 'Seguro', obligatorio: false, multiples: false, vigencia: true },
  { codigo: TIPO_OTRO, label: 'Otro', obligatorio: false, multiples: true, vigencia: false },
]);

export const TIPOS_CON_VIGENCIA = new Set(
  TIPOS_DOCUMENTO_ENTREGABLE.filter((t) => t.vigencia).map((t) => t.codigo),
);

const TIPOS_MAP = new Map(TIPOS_DOCUMENTO_ENTREGABLE.map((t) => [t.codigo, t]));

export function normalizeTipoDocumento(value) {
  const code = String(value || TIPO_ENTREGABLE).trim().toUpperCase();
  return TIPOS_MAP.has(code) ? code : TIPO_ENTREGABLE;
}

export function labelTipoDocumento(value) {
  return TIPOS_MAP.get(normalizeTipoDocumento(value))?.label || String(value || TIPO_ENTREGABLE);
}

export function tipoPermiteMultiples(value) {
  return TIPOS_MAP.get(normalizeTipoDocumento(value))?.multiples === true;
}

export function tipoPermiteVigencia(value) {
  return TIPOS_MAP.get(normalizeTipoDocumento(value))?.vigencia === true;
}

export function validarMetadatosDocumentoEntregable(payload = {}, tipoRaw) {
  const tipo = normalizeTipoDocumento(tipoRaw || payload.tipo_documento);
  const meta = {
    tipo_documento: tipo,
    nombre: String(payload.nombre || payload.descripcion || '').trim() || null,
    fecha_documento: toIsoDate(payload.fecha_documento) || null,
    vigencia_desde: toIsoDate(payload.vigencia_desde) || null,
    vigencia_hasta: toIsoDate(payload.vigencia_hasta) || null,
    observacion: String(payload.observacion || '').trim() || null,
  };
  if (tipo === TIPO_OTRO && !meta.nombre) {
    const err = new Error('La descripción es obligatoria para documentos OTRO');
    err.status = 400;
    err.code = 'OTRO_DESCRIPCION_REQUERIDA';
    throw err;
  }
  if (tipoPermiteVigencia(tipo)) {
    if (meta.vigencia_desde && meta.vigencia_hasta && meta.vigencia_hasta < meta.vigencia_desde) {
      const err = new Error('La vigencia hasta no puede ser anterior a vigencia desde');
      err.status = 400;
      err.code = 'VIGENCIA_INVALIDA';
      throw err;
    }
  } else {
    meta.vigencia_desde = null;
    meta.vigencia_hasta = null;
  }
  return meta;
}

export function documentoValidoParaPago(doc, refDate = new Date()) {
  if (!doc || doc.vigente === false) return false;
  const hasta = doc.vigencia_hasta || doc.vigenciaHasta;
  if (!hasta) return true;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  const fin = new Date(`${String(hasta).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(fin.getTime())) return true;
  return fin >= ref;
}

export function mapDocumentoEntregableRow(row = {}) {
  const tipo = normalizeTipoDocumento(row.tipo_documento);
  const mapped = {
    id: row.id,
    recepcion_id: row.recepcion_id,
    tipo_documento: tipo,
    tipo_label: labelTipoDocumento(tipo),
    nombre: row.nombre || null,
    nombre_archivo: row.nombre_archivo,
    mime_type: row.mime_type,
    tamanio_bytes: row.tamanio_bytes,
    fecha_documento: row.fecha_documento ? String(row.fecha_documento).slice(0, 10) : null,
    vigencia_desde: row.vigencia_desde ? String(row.vigencia_desde).slice(0, 10) : null,
    vigencia_hasta: row.vigencia_hasta ? String(row.vigencia_hasta).slice(0, 10) : null,
    observacion: row.observacion || null,
    vigente: row.vigente !== false,
    reemplaza_id: row.reemplaza_id || null,
    created_at: row.created_at,
    valido_para_pago: documentoValidoParaPago(row),
  };
  return mapped;
}

export function buildDocumentosTipificadosEntregable(docs = []) {
  return (docs || [])
    .filter((d) => d && d.vigente !== false)
    .map((d) => mapDocumentoEntregableRow(d));
}

export function assertEntregableObligatorioPresente(documentos = []) {
  const vigentes = (documentos || []).filter((d) => d?.vigente !== false);
  const tieneEntregable = vigentes.some(
    (d) => normalizeTipoDocumento(d.tipo_documento) === TIPO_ENTREGABLE,
  );
  if (!tieneEntregable) {
    const err = new Error('El documento ENTREGABLE es obligatorio');
    err.status = 400;
    err.code = 'ENTREGABLE_OBLIGATORIO';
    throw err;
  }
}
