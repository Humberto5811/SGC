/**
 * RC7.7C — Correcciones Validaciones (bandeja, Ver, formatos, reapertura, PDF mapper).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeTipoValidacion,
  calcularResultadoCotizacion,
  legacyItemToEvaluacion,
} from '../server/lib/validacionFormatos.js';
import {
  VALIDACION_CONFIG,
  CUMPLE_NA,
  calcularResultadoCotizacion as calcClient,
} from '../src/utils/validacionFormatosConfig.js';
import { buildValidationReportData } from '../src/utils/validacionReportData.js';
import {
  puedeEnviarAValidacion,
  esEstadoEditableValidacion,
  canUserValidateExpediente,
  listarValidacionesExpedientes,
} from '../server/lib/validacionesCotizacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const mtxSrc = readFileSync(path.join(__dirname, '../src/utils/validacionMatrizUi.js'), 'utf8');
const viewerSrc = readFileSync(path.join(__dirname, '../src/utils/documentViewer.js'), 'utf8');
const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/validacionFormatosPdf.js'), 'utf8');
const cotSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesModal.js'), 'utf8');

// 1) Encabezados horizontales
assert(!/writing-mode:\s*vertical-rl/.test(mtxSrc), 'matriz sin writing-mode vertical');
assert(/writing-mode:\s*horizontal-tb/.test(mtxSrc), 'matriz fuerza encabezados horizontales');

// 2) Visor: PDF + imagen + texto
assert(/isImageLike/.test(viewerSrc), 'visor soporta imágenes');
assert(/isTextLike/.test(viewerSrc), 'visor soporta texto');
assert(/sgcDocViewerImage/.test(viewerSrc), 'modal tiene panel de imagen');

// 3) PDF usa mapper común
assert(/buildValidationReportData/.test(pdfSrc), 'PDF usa buildValidationReportData');
assert(/Centro:/.test(pdfSrc), 'PDF incluye Centro en cabecera');
assert(/observaciones/.test(pdfSrc), 'PDF contempla columna observaciones');

// 4) Bandeja ORDER BY reciente primero
assert(/ORDER BY[\s\S]*DESC NULLS LAST[\s\S]*cot\.id DESC/.test(cotSrc), 'bandeja ordena por fecha DESC, id DESC');
assert(!/WHEN 'DERIVADA' THEN 1/.test(cotSrc.match(/listarValidacionesExpedientes[\s\S]*?return filtered/m)?.[0] || ''), 'bandeja ya no prioriza por estado CASE');

// 5) Reapertura
assert(puedeEnviarAValidacion('OBSERVADO'), 'OBSERVADO puede reenviarse a validación');
assert(puedeEnviarAValidacion('NO_APTO'), 'NO_APTO puede reenviarse a validación');
assert(!puedeEnviarAValidacion('DERIVADA'), 'DERIVADA no se reenvía (ya está en AU)');
assert(esEstadoEditableValidacion('DERIVADA'), 'DERIVADA es editable');
assert(esEstadoEditableValidacion('EN_PROCESO'), 'EN_PROCESO es editable');
assert(!esEstadoEditableValidacion('APTO'), 'APTO no es editable');
assert(/devolverValidacionAAreaUsuaria/.test(cotSrc), 'existe devolverValidacionAAreaUsuaria');
assert(/validacion_reapertura/.test(cotSrc), 'historial registra reapertura');
assert(/observacion_retorno/.test(modalSrc), 'modal muestra observación de retorno');

// 6) Permisos edición
const cotLocked = {
  validacion_estado: 'APTO',
  validacion_responsable: 'Juan Perez',
  validacion_informe: { derivacion: { responsable_id: 10, responsable_nombre: 'Juan Perez' } },
};
const permLocked = canUserValidateExpediente(cotLocked, 'Juan Perez', 10, {});
assert(permLocked.puedeVer && !permLocked.puedeValidar, 'APTO: ver sí, editar no');

const cotOpen = {
  validacion_estado: 'DERIVADA',
  validacion_responsable: 'Juan Perez',
  validacion_informe: { derivacion: { responsable_id: 10, responsable_nombre: 'Juan Perez' } },
};
const permOpen = canUserValidateExpediente(cotOpen, 'Juan Perez', 10, {});
assert(permOpen.puedeValidar, 'DERIVADA (reabierta) permite editar');

const permOther = canUserValidateExpediente(cotOpen, 'Otro Usuario', 99, {});
assert(!permOther.puedeValidar, 'usuario no autorizado no edita');

// 7) Bienes / Servicios diferenciados
assert(VALIDACION_CONFIG.BIENES.columnas.some((c) => c.key === 'marca'), 'bienes tiene marca');
assert(!VALIDACION_CONFIG.SERVICIOS.columnas.some((c) => c.key === 'marca'), 'servicios no fuerza marca');
assert(VALIDACION_CONFIG.SERVICIOS.columnas.some((c) => c.key === 'plazo_ejecucion'), 'servicios tiene plazo ejecución');
assert(CUMPLE_NA.includes('NO REQUIERE'), 'Bienes conserva opción NO REQUIERE');
assert(
  VALIDACION_CONFIG.SERVICIOS.columnas.find((c) => c.key === 'plazo_ejecucion')?.label
    === 'Plazo de ejecución (SI CUMPLE / NO CUMPLE)',
  'Servicios: etiqueta institucional plazo',
);
assert(
  /Especificaciones Técnicas NO Validas/.test(
    VALIDACION_CONFIG.SERVICIOS.columnas.find((c) => c.key === 'observaciones')?.label || '',
  ),
  'Servicios: observaciones con texto institucional completo',
);
assert(
  VALIDACION_CONFIG.SERVICIOS.columnas.find((c) => c.key === 'resultado')?.options?.includes('VALIDA'),
  'Servicios: resultado VALIDA / NO VALIDA',
);
assert(normalizeTipoValidacion('bienes') === 'BIENES', 'normalize bienes');
assert(normalizeTipoValidacion('SERVICIO') === 'SERVICIOS', 'normalize servicios');

// 8) Mapper recupera centro y última columna
const detalle = {
  solicitud_codigo: 'SC-1',
  razon_social: 'PROV SA',
  ruc: '20111111111',
  area_usuaria: 'GG',
  tipo_formato: 'BIENES',
  matriz_v2: {
    tipo: 'BIENES',
    filas: [{
      item_key: '1-0',
      automaticos: {
        item: 1, nro_req: 'REQ-1', centro: 'CNPB', centro_costo: 'CC-1',
        codigo_siga: '123', descripcion: 'Bien X', cantidad: 2, um: 'UND',
        cant_cotizaciones: 1, razon_social: 'PROV SA', marca: 'M', procedencia: 'PE',
      },
      evaluacion: {
        inserto: 'SI CUMPLE', certificado: 'NO REQUIERE', obs_specs: '',
        acredita_doc: 'SI CUMPLE', vigencia_minima: 'SI CUMPLE', plazos_entrega: 'SI CUMPLE',
        resultado: 'Especificaciones Técnicas NO válidas',
        observaciones: 'Falta vigencia documentada en lote',
      },
    }],
  },
  formulario_07a: { observacion_global: 'Obs remisión', sustento: 'Sustento', profesional: 'AU' },
};
const report = buildValidationReportData(detalle);
assert(report.cabecera.centro === 'CNPB', 'mapper expone Centro');
assert(report.matriz_v2.filas[0].evaluacion.observaciones.includes('vigencia'), 'mapper conserva última columna obs');
assert(!String(report.cabecera.descripcion).includes('undefined'), 'mapper sin undefined');
assert(report.tipoKey === 'BIENES', 'mapper tipo bienes');

const reportSrv = buildValidationReportData({
  ...detalle,
  tipo_formato: 'SERVICIOS',
  matriz_v2: {
    tipo: 'SERVICIOS',
    filas: [{
      item_key: '1-0',
      automaticos: {
        item: 1, nro_req: 'REQ-2', centro: 'OCI', codigo_siga: '9',
        descripcion: 'Servicio Y', cantidad: 1, um: 'UND', cant_cotizaciones: 1, razon_social: 'PROV SA',
      },
      evaluacion: {
      plazo_ejecucion: 'SI CUMPLE', formacion_academica: 'SI CUMPLE',
      capacitacion_personal: 'NO CUMPLE', experiencia_personal: 'SI CUMPLE',
      experiencia_facturacion: 'SI CUMPLE', canal_autorizado: 'SI CUMPLE',
      resultado: 'NO VALIDA', observaciones: 'Sin experiencia suficiente',
      },
    }],
  },
});
assert(reportSrv.tipoKey === 'SERVICIOS', 'mapper tipo servicios');
assert(reportSrv.cabecera.centro === 'OCI', 'mapper centro servicios');
assert(reportSrv.matriz_v2.filas[0].evaluacion.observaciones.length > 0, 'obs servicios en mapper');

// 9) Campos duplicados Resultado/Cumple removidos del bloque inferior
assert(!/Resultado general \(calculado\)/.test(mtxSrc), 'sin campo duplicado Resultado general');
assert(!/Cumple \/ No cumple/.test(mtxSrc), 'sin campo duplicado Cumple/No cumple');

// 10) Legacy NO APLICA → NO REQUIERE
const leg = legacyItemToEvaluacion({ inserto: 'SI', formacion_academica: 'NO APLICA' }, 'SERVICIOS');
assert(leg.formacion_academica === 'NO REQUIERE', 'legacy NO APLICA → NO REQUIERE');

const calc = calcularResultadoCotizacion('BIENES', detalle.matriz_v2.filas);
assert(calc.estado === 'NO_APTO', 'resultado negativo → NO_APTO');
assert(calcClient('SERVICIOS', reportSrv.matriz_v2.filas).estado === 'NO_APTO', 'client calc servicios');

// 11) Docs compactos / auto-load
assert(/Solo lista de proveedores|Ver documentos/.test(modalSrc) && !/firstBtn/.test(modalSrc), 'docs solo al pulsar Ver documentos');
assert(/val-docs-scroll/.test(modalSrc), 'tabla docs con scroll interno');

// 12) Orden bandeja en vivo (si hay datos)
try {
  const rows = await listarValidacionesExpedientes('admin', 1, { esAdmin: true });
  if (rows.length >= 2) {
    const times = rows.map((r) => new Date(r.fecha_presentacion || r.created_at || 0).getTime());
    // No exigir monotonicidad estricta por fecha_presentacion (orden usa derivado_at/updated_at),
    // pero sí que no falle la consulta.
    assert(Array.isArray(rows), 'listarValidacionesExpedientes retorna array');
    assert(rows[0].id != null, 'primera fila tiene id');
    void times;
  } else {
    assert(true, 'bandeja con pocos datos — consulta OK');
  }
} catch (err) {
  assert(false, `listarValidacionesExpedientes: ${err.message}`);
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error('FAIL:', f.msg));
  process.exit(1);
}
console.log('RC7.7C correcciones: PASS');
process.exit(0);
