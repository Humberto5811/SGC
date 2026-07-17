/**
 * RC7.7C — Verificación final: Centro, reapertura, Ver, PDF, autocarga, endpoints.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveValidationCentro,
  consolidateCentros,
} from '../shared/validacionCentro.js';
import { buildValidationReportData } from '../src/utils/validacionReportData.js';
import { VALIDACION_CONFIG } from '../src/utils/validacionFormatosConfig.js';
import {
  puedeEnviarAValidacion,
  esEstadoEditableValidacion,
  canUserValidateExpediente,
  DESTINOS_SALIDA_VALIDACION,
  resolverDestinoSalidaValidacion,
} from '../server/lib/validacionesCotizacion.js';
import {
  classifyPreviewMode,
  isPdfLike,
  isImageLike,
  isOfficeLike,
  canPreviewInline,
} from '../src/utils/documentViewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const cotSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesModal.js'), 'utf8');
const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/validacionFormatosPdf.js'), 'utf8');
const viewerSrc = readFileSync(path.join(__dirname, '../src/utils/documentViewer.js'), 'utf8');
const portalSrc = readFileSync(path.join(__dirname, '../server/routes/portal.js'), 'utf8');

console.log('\n=== 1. resolveValidationCentro ===');
const c1 = resolveValidationCentro({
  requerimientoCentro: 'CNPB',
  pedidoCentro: 'OCI',
  itemCentro: 'X',
});
assert(c1.centro === 'CNPB' && c1.fuente === 'requerimiento', 'prioridad 1: requerimiento');

const c2 = resolveValidationCentro({
  pedidoCentro: 'OCI',
  cabeceraCentro: 'GG',
  informeCentro: 'OLD',
});
assert(c2.centro === 'OCI' && c2.fuente === 'pedido_sigamef', 'prioridad 2: pedido SIGAMEF (sin req_id)');

const c3 = resolveValidationCentro({
  informeCentro: 'PERSISTIDO',
  itemCentro: 'ITEM',
});
assert(c3.centro === 'PERSISTIDO' && c3.fuente === 'informe', 'prioridad 4: validacion_informe');

const c4 = resolveValidationCentro({ itemCentro: 'DEL_ITEM' });
assert(c4.centro === 'DEL_ITEM' && c4.fuente === 'item', 'prioridad 5: payload ítem');

const c5 = resolveValidationCentro({});
assert(c5.centro === '' && c5.warning === 'centro_no_resuelto', 'ausencia total → vacío + warning');

const multi = consolidateCentros(['CNPB', 'OCI', 'CNPB']);
assert(multi.multiple && multi.centros.length === 2, 'múltiples centros distintos');
assert(/Múltiples centros/.test(multi.label) && multi.display.includes('CNPB') && multi.display.includes('OCI'),
  'no elige uno arbitrario: lista / Múltiples centros');
assert(consolidateCentros(['CNPB', 'CNPB']).display === 'CNPB', 'mismo centro consolidado');
assert(consolidateCentros([]).display === '—', 'sin centros → guion');

console.log('\n=== 2. Flujo reapertura / DERIVADA ===');
assert(esEstadoEditableValidacion('DERIVADA'), 'DERIVADA habilita edición');
assert(esEstadoEditableValidacion('EN_PROCESO'), 'EN_PROCESO habilita edición');
assert(!esEstadoEditableValidacion('APTO'), 'APTO bloquea edición');
assert(!esEstadoEditableValidacion('OBSERVADO'), 'OBSERVADO (remitido) bloquea hasta devolver');
assert(puedeEnviarAValidacion('OBSERVADO') && puedeEnviarAValidacion('APTO'), 'analista puede devolver OBSERVADO/APTO');
assert(/idempotente/.test(cotSrc) && /ya_en_validacion/.test(cotSrc), 'derivar/devolver idempotente ante doble clic');
assert(/COALESCE\(UPPER\(TRIM\(validacion_estado\)\)/.test(cotSrc), 'UPDATE condiciona estado (anti-carrera)');
assert(/observación es obligatoria para devolver/i.test(cotSrc), 'reapertura exige observación');
assert(DESTINOS_SALIDA_VALIDACION.APTO.code === 'CUADRO_COMPARATIVO', 'remisión APTO → Cuadro Comparativo');
assert(DESTINOS_SALIDA_VALIDACION.OBSERVADO.code === 'RECEPCION_COTIZACIONES', 'OBSERVADO → Recepción');
assert(resolverDestinoSalidaValidacion('NO_APTO').code === 'RECEPCION_COTIZACIONES', 'NO_APTO → Recepción');
assert(/VALIDACION_USUARIO/.test(cotSrc), 'devolver sincroniza a VALIDACION_USUARIO');
assert(/validacion_reapertura/.test(cotSrc), 'historial reapertura');
assert(/observacion_retorno/.test(cotSrc) && /observacion_retorno/.test(modalSrc), 'observación visible en AU');
assert(/matriz_v2/.test(cotSrc), 'conserva matriz_v2 en informe');

const apto = {
  validacion_estado: 'APTO',
  validacion_responsable: 'Ana User',
  validacion_informe: { derivacion: { responsable_id: 5, responsable_nombre: 'Ana User' } },
};
assert(!canUserValidateExpediente(apto, 'Ana User', 5, {}).puedeValidar, 'APTO: AU no edita sin devolución');
const reabierta = { ...apto, validacion_estado: 'DERIVADA' };
assert(canUserValidateExpediente(reabierta, 'Ana User', 5, {}).puedeValidar, 'tras devolución (DERIVADA): AU edita');
assert(!canUserValidateExpediente(reabierta, 'Intruso', 99, {}).puedeValidar, 'rol no autorizado no edita');

console.log('\n=== 3. Botón Ver / MIME ===');
assert(classifyPreviewMode('application/pdf', 'a.PDF') === 'pdf', 'PDF mayúsculas');
assert(classifyPreviewMode('image/jpeg', 'foto.JPG') === 'image', 'JPEG');
assert(classifyPreviewMode('image/png', 'x.png') === 'image', 'PNG');
assert(classifyPreviewMode('image/webp', 'x.webp') === 'image', 'WEBP');
assert(classifyPreviewMode('text/plain', 'nota.txt') === 'text', 'TXT');
assert(classifyPreviewMode('', 'Informe Técnico.PDF') === 'pdf', 'MIME vacío + extensión PDF');
assert(classifyPreviewMode('application/octet-stream', 'propuesta.docx') === 'office', 'DOCX');
assert(classifyPreviewMode('', 'hoja.XLSX') === 'office', 'XLSX mayúsculas');
assert(classifyPreviewMode('', 'archivo con espacios y ñ.DOC') === 'office', 'nombre con espacios/tildes/ñ');
assert(canPreviewInline('application/pdf', 'a.pdf') && !canPreviewInline('', 'a.docx'), 'inline solo previewables');
assert(isOfficeLike('', 'a.doc') && isImageLike('image/png', '') && isPdfLike('', 'x.pdf'), 'helpers MIME');
assert(/sgcBlobCleanupBound/.test(viewerSrc), 'cleanup blob sin listeners duplicados');
assert(/no se puede previsualizar/i.test(viewerSrc), 'mensaje Office');

console.log('\n=== 4. PDF campo a campo (mapper) ===');
const obsLarga = `${'Observación técnica con tildes: verificación, ñandú. '.repeat(40)}FIN_OBS`;
const sustentoLargo = `${'Sustento legal y técnico. '.repeat(30)}FIN_SUS`;
const bienesDetalle = {
  solicitud_codigo: 'SC-Ñ-001',
  razon_social: 'Proveedor Uno S.A.',
  ruc: '20111111111',
  area_usuaria: 'Gerencia General',
  tipo_formato: 'BIENES',
  centro: 'CNPB',
  requerimientos_detalle: [{ id: 1, codigo: 'REQ-00016', centro: 'CNPB', centro_costo: 'CC-10' }],
  matriz_v2: {
    tipo: 'BIENES',
    filas: [
      {
        item_key: '1-0',
        requerimiento_id: 1,
        automaticos: {
          item: 1, nro_req: 'REQ-00016', centro: 'CNPB', centro_costo: 'CC-10',
          pedido_sigamef: 'PB-100', codigo_siga: '123456',
          descripcion: 'Equipo de cómputo portátil con especificación larga y caracteres: áéíóú ñ',
          cantidad: 0, um: 'UND', cant_cotizaciones: 2, razon_social: 'Proveedor Uno S.A.',
          marca: 'MarcaÑ', procedencia: 'PE',
        },
        evaluacion: {
          inserto: 'SI CUMPLE', certificado: 'NO REQUIERE', obs_specs: 'Obs fila',
          acredita_doc: 'SI CUMPLE', vigencia_minima: 'SI CUMPLE', plazos_entrega: 'SI CUMPLE',
          resultado: 'Especificaciones Técnicas NO válidas',
          observaciones: obsLarga,
        },
      },
      {
        item_key: '1-1',
        requerimiento_id: 1,
        automaticos: {
          item: 2, nro_req: 'REQ-00016', centro: 'OCI', centro_costo: 'CC-20',
          pedido_sigamef: 'PB-101', codigo_siga: '999',
          descripcion: 'Segundo ítem', cantidad: 3, um: 'UND', cant_cotizaciones: 2,
          razon_social: 'Proveedor Dos SAC', marca: 'Y', procedencia: 'CN',
        },
        evaluacion: {
          inserto: 'NO REQUIERE', certificado: 'SI CUMPLE', obs_specs: '',
          acredita_doc: 'SI CUMPLE', vigencia_minima: 'NO CUMPLE', plazos_entrega: 'SI CUMPLE',
          resultado: 'Especificaciones Técnicas válidas', observaciones: '',
        },
      },
    ],
  },
  formulario_07a: {
    profesional: 'Responsable AU',
    fecha: '15/07/2026',
    sustento: sustentoLargo,
    observacion_global: 'Obs remisión con ñ',
    producto_adquisicion: 'Adquisición mixta',
  },
};
const rb = buildValidationReportData(bienesDetalle);
assert(rb.tipoKey === 'BIENES', 'PDF datos → BIENES');
assert(/07-A/.test(rb.config.anexoTitulo) && /BIENES/.test(rb.config.anexoTitulo), 'plantilla 07-A Bienes');
assert(rb.cabecera.centro_multiple && /CNPB/.test(rb.cabecera.centro) && /OCI/.test(rb.cabecera.centro), 'cabecera múltiples centros');
assert(rb.matriz_v2.filas[0].automaticos.centro === 'CNPB', 'fila conserva su centro');
assert(rb.matriz_v2.filas[0].evaluacion.observaciones.endsWith('FIN_OBS'), 'última columna / obs larga intacta');
assert(rb.matriz_v2.filas[0].automaticos.cantidad === 0, 'cantidad cero preservada');
assert(rb.cabecera.pedidos_sigamef.includes('PB-100'), 'pedido SIGAMEF en cabecera');
assert(!/undefined|\[object Object\]/.test(JSON.stringify(rb.cabecera)), 'cabecera sin undefined/[object Object]');
assert(!/undefined|\[object Object\]/.test(JSON.stringify(rb.matriz_v2.filas)), 'filas sin basura');
assert(!Object.values(rb.cabecera).some((v) => v === undefined), 'cabecera sin valores undefined');
assert(/showHead:\s*'everyPage'/.test(pdfSrc), 'PDF: encabezados por página');
assert(/DETALLE DEL REQUERIMIENTO/.test(pdfSrc) && /07B_Servicios|ANEXO Nº 07-B/.test(pdfSrc), 'PDF Servicios 07-B institucional');
assert(/buildValidationReportData/.test(pdfSrc), 'PDF usa mapper común');
assert(!/Observaciones de remisión|Sustento:/.test(pdfSrc), 'PDF sin campos de remisión eliminados');

const serviciosDetalle = {
  solicitud_codigo: 'SC-S-002',
  razon_social: 'Servicios Ñ SAC',
  ruc: '20999999999',
  tipo_formato: 'SERVICIOS',
  matriz_v2: {
    tipo: 'SERVICIOS',
    filas: [{
      item_key: '2-0',
      automaticos: {
        item: 1, nro_req: 'REQ-00040', centro: 'GG', centro_costo: '',
        pedido_sigamef: 'PS-50', codigo_siga: '888',
        descripcion: 'Servicio de consultoría', cantidad: 1, um: 'UND',
        cant_cotizaciones: 1, razon_social: 'Servicios Ñ SAC',
      },
      evaluacion: {
        plazo_ejecucion: 'SI CUMPLE', formacion_academica: 'SI CUMPLE',
        capacitacion_personal: 'NO CUMPLE', experiencia_personal: 'SI CUMPLE',
        experiencia_facturacion: 'SI CUMPLE', canal_autorizado: 'SI CUMPLE',
        resultado: 'NO VALIDA', observaciones: 'Propuesta técnica insuficiente — detalle largo '.repeat(20),
      },
    }],
  },
  formulario_07a: { sustento: 'S', observacion_global: 'O', profesional: 'AU' },
};
const rs = buildValidationReportData(serviciosDetalle);
assert(rs.tipoKey === 'SERVICIOS' && /07-B/.test(rs.config.anexoTitulo), 'plantilla 07-B Servicios');
assert(!rs.config.columnas.some((c) => c.key === 'marca'), 'servicios no mezcla columnas de bienes');
assert(VALIDACION_CONFIG.BIENES.columnas.some((c) => c.key === 'marca'), 'bienes sí tiene marca');
assert(rs.matriz_v2.filas[0].evaluacion.observaciones.length > 100, 'obs servicios larga');
assert(rs.cabecera.centro === 'GG', 'centro servicios');

console.log('\n=== 5. Documentos solo al pulsar Ver documentos ===');
assert(/Pulse.*Ver documentos|Empresas que presentaron cotización/.test(modalSrc), 'lista de empresas sin abrir docs');
assert(/state\.selectedKey = ''/.test(modalSrc) || /selectedKey = ''/.test(modalSrc), 'al abrir no selecciona proveedor');
assert(!/firstBtn/.test(modalSrc), 'sin autocarga del primer proveedor');
assert(/Cerrar documentos/.test(modalSrc), 'permite cerrar panel de documentos');
assert(/No hay empresas en validación/.test(modalSrc), 'cero proveedores manejado');
assert(/val-ver-docs/.test(modalSrc), 'botón Ver documentos presente');

console.log('\n=== 6. Endpoints ===');
assert(/validaciones\/:id\/devolver/.test(portalSrc), 'endpoint devolver');
assert(/validaciones\/:id\/derivar/.test(portalSrc), 'endpoint derivar');
assert(/No autenticado/.test(portalSrc), 'exige autenticación');
assert(/idempotente/.test(portalSrc), 'respuesta marca idempotente');
assert(/status\(409\)/.test(portalSrc), 'conflicto de estado → 409');

console.log('\n=== 7. Resolver en backend ===');
assert(/resolveValidationCentro/.test(cotSrc), 'backend usa resolveValidationCentro');
assert(/loadPedidosCentroByReq/.test(cotSrc), 'backend carga pedidos SIGAMEF');
assert(/centro_no_resuelto/.test(cotSrc), 'warning técnico centro vacío');

// Ver no dispara descarga automática (openBase64Document no hace a.click)
const openB64 = viewerSrc.slice(viewerSrc.indexOf('export function openBase64Document'));
const openB64Body = openB64.slice(0, openB64.indexOf('export async function openAdjuntoDocument'));
assert(!/\.click\(\)/.test(openB64Body), 'Ver/openBase64Document no hace click de descarga');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error('FAIL:', f.msg));
  process.exit(1);
}
console.log('RC7.7C verificación final: PASS');
process.exit(0);
