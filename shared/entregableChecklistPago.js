/**
 * RC8.15.6G-8 — Catálogo y resolución del checklist documental de Pagos.
 */
import { documentoValidoParaPago } from './entregableDocumentosTipos.js';

export const CHECKLIST_ESTADO = Object.freeze({
  COMPLETO: 'COMPLETO',
  VENCIDO: 'VENCIDO',
  FALTANTE: 'FALTANTE',
  NO_APLICA: 'NO_APLICA',
});

export const CHECKLIST_GRUPO = Object.freeze({
  CONTRACTUALES: 'CONTRACTUALES / REQUERIMIENTO',
  PRESENTACION: 'PRESENTACION DEL ENTREGABLE',
  COTIZACION: 'COTIZACION / EXPEDIENTE',
  PENALIDAD: 'PENALIDAD',
});

export const TIPO_CHECKLIST_OTRO = 'CHECKLIST_OTRO';

export const TIPOS_ANALISTA_CHECKLIST = Object.freeze([
  { codigo: 'FUP', label: 'FUP', obligatorio: true },
  { codigo: 'TCE', label: 'TCE', obligatorio: true },
  { codigo: 'REDAM', label: 'REDAM', obligatorio: true },
  { codigo: 'SERVIR', label: 'SERVIR', obligatorio: true },
  { codigo: 'DEBIDA_DILIGENCIA', label: 'DEBIDA DILIGENCIA', obligatorio: true },
  { codigo: 'REDJUM', label: 'REDJUM', obligatorio: true },
]);

const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

function blobDoc(doc = {}) {
  return norm(`${doc.tipo || ''} ${doc.tipo_documento || ''} ${doc.nombre || ''} ${doc.nombre_archivo || ''} ${doc.ref || ''} ${doc.preview_ref || ''}`);
}

function matchPattern(doc, patterns = []) {
  const b = blobDoc(doc);
  return patterns.some((p) => (p instanceof RegExp ? p.test(b) : b.includes(norm(p))));
}

function pickBest(docs = []) {
  if (!docs.length) return null;
  return docs[0];
}

function estadoDesdeDocumento(doc, { exigeVigencia = false, refDate = new Date() } = {}) {
  if (!doc) return CHECKLIST_ESTADO.FALTANTE;
  if (exigeVigencia) {
    const valido = documentoValidoParaPago({
      vigente: doc.vigente !== false,
      vigencia_hasta: doc.vigencia_hasta || doc.vigenciaHasta,
    }, refDate);
    if (!valido) return CHECKLIST_ESTADO.VENCIDO;
  }
  return CHECKLIST_ESTADO.COMPLETO;
}

function vigenciaTexto(doc) {
  if (!doc) return '—';
  const hasta = doc.vigencia_hasta || doc.vigenciaHasta;
  if (hasta) return String(hasta).slice(0, 10);
  return '—';
}

function previewFromExpediente(doc, fuente) {
  if (!doc) return null;
  return {
    kind: doc.kind || 'adjunto',
    id: doc.documentoId || doc.id,
    orden_id: doc.orden_id || null,
    cotizacion_id: doc.cotizacion_id || doc.cotizacionId || null,
    ref: doc.ref || doc.preview_ref || null,
    recepcion_id: doc.recepcion_id || null,
    nombre: doc.nombre || doc.nombre_archivo || 'documento',
    fuente,
  };
}

function previewFromPago(doc, fuente = 'Pagos') {
  if (!doc?.id) return null;
  return {
    kind: 'pago_documento',
    id: doc.id,
    nombre: doc.nombre_archivo || doc.descripcion || 'documento',
    fuente,
  };
}

/** Definiciones del bloque sistema (sin hardcodear nombres de archivo). */
export const CHECKLIST_SISTEMA_DEFS = Object.freeze([
  {
    codigo: 'ORDEN_FIRMADA',
    label: 'Orden de Servicio firmada',
    grupo: CHECKLIST_GRUPO.CONTRACTUALES,
    obligatorio: true,
    resolver: (ctx) => {
      const doc = pickBest(ctx.expediente.filter((d) => d.kind === 'orden'
        && /orden\s*firmada|orden_firmada/i.test(blobDoc(d))));
      return {
        estado: estadoDesdeDocumento(doc),
        vigencia: vigenciaTexto(doc),
        fuente: doc?.origen || 'Orden',
        preview: previewFromExpediente(doc, 'Orden'),
      };
    },
  },
  {
    codigo: 'PEDIDO',
    label: 'Pedido',
    grupo: CHECKLIST_GRUPO.CONTRACTUALES,
    obligatorio: true,
    resolver: (ctx) => {
      const doc = pickBest(ctx.expediente.filter((d) => matchPattern(d, [/pedido/, /sigamef/])
        || (d.origen === 'REQUERIMIENTO' && /pedido/i.test(blobDoc(d)))));
      const estado = doc ? CHECKLIST_ESTADO.COMPLETO
        : (ctx.resumen?.pedido_sigamef ? CHECKLIST_ESTADO.COMPLETO : CHECKLIST_ESTADO.FALTANTE);
      return {
        estado,
        vigencia: '—',
        fuente: doc?.origen || (ctx.resumen?.pedido_sigamef ? 'Requerimiento' : '—'),
        preview: previewFromExpediente(doc, 'Requerimiento'),
      };
    },
  },
  {
    codigo: 'TDR',
    label: 'TDR',
    grupo: CHECKLIST_GRUPO.CONTRACTUALES,
    obligatorio: true,
    resolver: (ctx) => {
      const doc = pickBest(ctx.expediente.filter((d) => matchPattern(d, [/\btdr\b/, /terminos?\s+de\s+referencia/])));
      return {
        estado: estadoDesdeDocumento(doc),
        vigencia: '—',
        fuente: doc?.origen || 'Requerimiento',
        preview: previewFromExpediente(doc, 'Requerimiento'),
      };
    },
  },
  {
    codigo: 'CCP_FIRMADA',
    label: 'CCP firmada',
    grupo: CHECKLIST_GRUPO.CONTRACTUALES,
    obligatorio: true,
    resolver: (ctx) => {
      const doc = pickBest(ctx.expediente.filter((d) => d.kind === 'ccp'));
      return {
        estado: doc ? CHECKLIST_ESTADO.COMPLETO : CHECKLIST_ESTADO.FALTANTE,
        vigencia: '—',
        fuente: 'CCP',
        preview: previewFromExpediente(doc, 'CCP'),
      };
    },
  },
  {
    codigo: 'ENTREGABLE',
    label: 'Entregable',
    grupo: CHECKLIST_GRUPO.PRESENTACION,
    obligatorio: true,
    resolver: (ctx) => mkEntregableTipo(ctx, 'ENTREGABLE'),
  },
  {
    codigo: 'RECIBO_HONORARIOS',
    label: 'Recibo por honorarios',
    grupo: CHECKLIST_GRUPO.PRESENTACION,
    obligatorio: true,
    resolver: (ctx) => mkEntregableTipo(ctx, 'RECIBO_HONORARIOS'),
  },
  {
    codigo: 'SUSPENSION_4TA',
    label: 'Suspensión de 4ta categoría',
    grupo: CHECKLIST_GRUPO.PRESENTACION,
    obligatorio: true,
    resolver: (ctx) => mkEntregableTipo(ctx, 'SUSPENSION_4TA', true),
  },
  {
    codigo: 'ANEXO_10_CCI',
    label: 'Anexo N.° 10 / CCI',
    grupo: CHECKLIST_GRUPO.PRESENTACION,
    obligatorio: true,
    resolver: (ctx) => mkEntregableTipo(ctx, 'ANEXO_10_CCI', true),
  },
  {
    codigo: 'COLEGIATURA',
    label: 'Colegiatura vigente',
    grupo: CHECKLIST_GRUPO.PRESENTACION,
    obligatorio: true,
    resolver: (ctx) => mkEntregableTipo(ctx, 'COLEGIATURA', true),
  },
  {
    codigo: 'SEGURO',
    label: 'Seguro vigente',
    grupo: CHECKLIST_GRUPO.PRESENTACION,
    obligatorio: true,
    resolver: (ctx) => mkEntregableTipo(ctx, 'SEGURO', true),
  },
  {
    codigo: 'ANEXO_06A',
    label: 'Anexo 06-A',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/anexo\s*0?6\s*-?\s*a/, /anexo05a/, /propuesta\s*t[eé]cnica/, /cotizaci[oó]n\s*5-?a/], ['anexo05a']),
  },
  {
    codigo: 'ANEXO_11',
    label: 'Anexo 11',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/anexo\s*11/, /anexo05b/, /propuesta\s*econ[oó]mica/, /cotizaci[oó]n\s*5-?b/], ['anexo05b']),
  },
  {
    codigo: 'ANEXO_LOC_9',
    label: 'Anexo Locadores 9',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*9/, /anexo\s*locador\s*9/]),
  },
  {
    codigo: 'ANEXO_LOC_10',
    label: 'Anexo Locadores 10',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*10/, /anexo\s*10(?!\s*\/\s*cci)/i]),
  },
  {
    codigo: 'ANEXO_LOC_11',
    label: 'Anexo Locadores 11',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*11/]),
  },
  {
    codigo: 'ANEXO_LOC_12',
    label: 'Anexo Locadores 12',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*12/]),
  },
  {
    codigo: 'ANEXO_LOC_13',
    label: 'Anexo Locadores 13',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*13/]),
  },
  {
    codigo: 'ANEXO_LOC_14',
    label: 'Anexo Locadores 14',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*14/]),
  },
  {
    codigo: 'ANEXO_LOC_15',
    label: 'Anexo Locadores 15',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*15/]),
  },
  {
    codigo: 'ANEXO_LOC_16',
    label: 'Anexo Locadores 16',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/locador(es)?\s*16/]),
  },
  {
    codigo: 'FORMACION_ACADEMICA',
    label: 'Formación académica',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/formaci[oó]n\s+acad[eé]mica/]),
  },
  {
    codigo: 'EXPERIENCIA_ESPECIFICA',
    label: 'Experiencia específica',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/experiencia\s+espec[ií]fica/]),
  },
  {
    codigo: 'EXPERIENCIA_GENERAL',
    label: 'Experiencia general',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/experiencia\s+general/]),
  },
  {
    codigo: 'CAPACITACION',
    label: 'Capacitación',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/capacitaci[oó]n/]),
  },
  {
    codigo: 'CURRICULUM_VITAE',
    label: 'Curriculum Vitae',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/curriculum\s+vitae/, /\bcv\b/]),
  },
  {
    codigo: 'MAESTRIA',
    label: 'Maestría',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/maestr[ií]a/]),
  },
  {
    codigo: 'RNP',
    label: 'Registro Nacional de Proveedores - RNP',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/\brnp\b/, /registro\s+nacional\s+de\s+proveedores/]),
  },
  {
    codigo: 'CONSULTA_RUC',
    label: 'Consulta RUC SUNAT',
    grupo: CHECKLIST_GRUPO.COTIZACION,
    obligatorio: true,
    resolver: (ctx) => mkCotizacion(ctx, [/consulta\s+ruc/, /\bruc\s+sunat\b/, /sunat/]),
  },
  {
    codigo: 'FORMATO_PENALIDAD_FIRMADO',
    label: 'Formato de penalidad firmado',
    grupo: CHECKLIST_GRUPO.PENALIDAD,
    obligatorio: true,
    condicionalPenalidad: true,
    resolver: (ctx) => {
      if (ctx.penalidadCodigo === 'NO_CORRESPONDE') {
        return { estado: CHECKLIST_ESTADO.NO_APLICA, vigencia: '—', fuente: '—', preview: null };
      }
      const doc = ctx.penalidadDocs.find((d) => d.tipo_documento === 'FORMATO_PENALIDAD_FIRMADO');
      return {
        estado: doc ? CHECKLIST_ESTADO.COMPLETO : CHECKLIST_ESTADO.FALTANTE,
        vigencia: '—',
        fuente: 'Penalidad',
        preview: previewFromPago(doc, 'Penalidad'),
      };
    },
  },
  {
    codigo: 'CARTA_PENALIDAD',
    label: 'Carta de penalidad',
    grupo: CHECKLIST_GRUPO.PENALIDAD,
    obligatorio: true,
    condicionalPenalidad: true,
    resolver: (ctx) => {
      if (ctx.penalidadCodigo === 'NO_CORRESPONDE') {
        return { estado: CHECKLIST_ESTADO.NO_APLICA, vigencia: '—', fuente: '—', preview: null };
      }
      const doc = ctx.penalidadDocs.find((d) => d.tipo_documento === 'CARTA_PENALIDAD');
      return {
        estado: doc ? CHECKLIST_ESTADO.COMPLETO : CHECKLIST_ESTADO.FALTANTE,
        vigencia: '—',
        fuente: 'Penalidad',
        preview: previewFromPago(doc, 'Penalidad'),
      };
    },
  },
]);

function mkEntregableTipo(ctx, tipo, exigeVigencia = false) {
  const doc = pickBest(ctx.entregableDocs.filter(
    (d) => String(d.tipo_documento || '').toUpperCase() === tipo,
  ));
  return {
    estado: estadoDesdeDocumento(doc, { exigeVigencia, refDate: ctx.refDate }),
    vigencia: vigenciaTexto(doc),
    fuente: 'Recepción / entregable',
    preview: previewFromExpediente(doc, 'Recepción'),
  };
}

function mkCotizacion(ctx, patterns, refs = []) {
  let doc = pickBest(ctx.expediente.filter((d) => d.kind === 'cotizacion' && (
    matchPattern(d, patterns) || refs.some((r) => String(d.ref || d.preview_ref || '').toLowerCase() === r)
  )));
  if (!doc) {
    doc = pickBest(ctx.expediente.filter((d) => matchPattern(d, patterns)));
  }
  return {
    estado: estadoDesdeDocumento(doc),
    vigencia: '—',
    fuente: doc?.origen || 'Cotización',
    preview: previewFromExpediente(doc, 'Cotización'),
  };
}

export function resolverFilasSistemaChecklist(ctx = {}) {
  return CHECKLIST_SISTEMA_DEFS.map((def) => {
    const resolved = def.resolver(ctx);
    return {
      codigo: def.codigo,
      label: def.label,
      grupo: def.grupo,
      bloque: 'SISTEMA',
      obligatorio: def.obligatorio !== false,
      condicional_penalidad: Boolean(def.condicionalPenalidad),
      ...resolved,
    };
  });
}

export function mapFilaAnalistaChecklist(row = {}) {
  const tipo = String(row.tipo_documento || '');
  const esOtro = tipo === TIPO_CHECKLIST_OTRO;
  const label = esOtro
    ? (row.descripcion || row.nombre_archivo || 'Otro documento')
    : (TIPOS_ANALISTA_CHECKLIST.find((t) => t.codigo === tipo)?.label || tipo);
  const obligatorio = row.obligatorio !== false;
  const estado = row.vigente === false
    ? CHECKLIST_ESTADO.FALTANTE
    : CHECKLIST_ESTADO.COMPLETO;
  return {
    codigo: esOtro ? `OTRO_${row.id}` : tipo,
    tipo_documento: tipo,
    label,
    bloque: 'ANALISTA',
    grupo: 'Documentos a cargo del Analista CM',
    obligatorio,
    estado,
    vigencia: '—',
    fuente: 'Analista CM',
    documento_id: row.id,
    descripcion: row.descripcion || null,
    preview: previewFromPago(row, 'Analista CM'),
  };
}

export function filasAnalistaBaseFaltantes(rowsAnalista = []) {
  const presentes = new Set(
    (rowsAnalista || [])
      .filter((r) => r.vigente !== false)
      .map((r) => String(r.tipo_documento || '')),
  );
  return TIPOS_ANALISTA_CHECKLIST
    .filter((def) => !presentes.has(def.codigo))
    .map((def) => ({
      codigo: def.codigo,
      tipo_documento: def.codigo,
      label: def.label,
      bloque: 'ANALISTA',
      grupo: 'Documentos a cargo del Analista CM',
      obligatorio: def.obligatorio !== false,
      estado: CHECKLIST_ESTADO.FALTANTE,
      vigencia: '—',
      fuente: 'Analista CM',
      documento_id: null,
      preview: null,
    }));
}

export function calcularProgresoChecklist(filas = []) {
  const cuenta = (filas || []).filter(
    (f) => f.obligatorio !== false && f.estado !== CHECKLIST_ESTADO.NO_APLICA,
  );
  const completos = cuenta.filter((f) => f.estado === CHECKLIST_ESTADO.COMPLETO);
  return {
    completos: completos.length,
    total: cuenta.length,
    texto: `Documentos obligatorios completos: ${completos.length} / ${cuenta.length}`,
  };
}

export function badgeEstadoChecklist(estado) {
  switch (estado) {
    case CHECKLIST_ESTADO.COMPLETO: return 'success';
    case CHECKLIST_ESTADO.VENCIDO: return 'warning';
    case CHECKLIST_ESTADO.NO_APLICA: return 'secondary';
    default: return 'danger';
  }
}

export function labelEstadoChecklist(estado) {
  switch (estado) {
    case CHECKLIST_ESTADO.COMPLETO: return 'Completo';
    case CHECKLIST_ESTADO.VENCIDO: return 'Vencido';
    case CHECKLIST_ESTADO.NO_APLICA: return 'No aplica';
    case CHECKLIST_ESTADO.FALTANTE: return 'Faltante';
    default: return String(estado || '—');
  }
}
