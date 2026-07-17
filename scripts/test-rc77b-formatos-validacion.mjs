/**
 * RC7.7B — Formatos institucionales Bienes / Servicios.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../server/db.js';
import {
  normalizeTipoValidacion,
  calcularResultadoCotizacion,
  validarMatrizCompleta,
  legacyItemToEvaluacion,
  filasV2ToLegacyItems,
} from '../server/lib/validacionFormatos.js';
import {
  getValidacionConfig,
  TIPO_VALIDACION,
  VALIDACION_CONFIG,
  calcularResultadoCotizacion as calcClient,
  validarMatrizCompleta as validClient,
  filasV2ToLegacyItems as filasClient,
} from '../src/utils/validacionFormatosConfig.js';
import {
  listarValidacionesExpedientes,
  getValidacionTrabajoDetalle,
  guardarValidacionParcial,
} from '../server/lib/validacionesCotizacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/validacionFormatosPdf.js'), 'utf8');
const mtxSrc = readFileSync(path.join(__dirname, '../src/utils/validacionMatrizUi.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesModal.js'), 'utf8');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

function filaBienes(overrides = {}) {
  return {
    item_key: '1-0',
    cotizacion_id: 1,
    proveedor_id: 1,
    requerimiento_codigo: 'REQ-00016',
    automaticos: {
      item: 1, nro_req: 'REQ-00016', centro: 'CNPB', codigo_siga: '123',
      descripcion: 'Equipo', cantidad: 2, um: 'UND', cant_cotizaciones: 2,
      razon_social: 'PROVEEDOR SA', marca: 'X', procedencia: 'PE',
    },
    evaluacion: {
      inserto: 'SI CUMPLE', certificado: 'SI CUMPLE', obs_specs: '',
      acredita_doc: 'SI CUMPLE', vigencia_minima: 'SI CUMPLE', plazos_entrega: 'SI CUMPLE',
      resultado: 'Especificaciones Técnicas válidas', observaciones: '',
    },
    ...overrides,
  };
}

function filaServicios(overrides = {}) {
  return {
    item_key: '1-0',
    cotizacion_id: 1,
    proveedor_id: 1,
    requerimiento_codigo: 'REQ-00040',
    automaticos: {
      item: 1, nro_req: 'REQ-00040', centro: 'CNPB', codigo_siga: '999',
      descripcion: 'Servicio', cantidad: 1, um: 'UND', cant_cotizaciones: 1,
      razon_social: 'SERVICIOS SAC',
    },
    evaluacion: {
      plazo_ejecucion: 'SI CUMPLE', formacion_academica: 'SI CUMPLE',
      capacitacion_personal: 'SI CUMPLE', experiencia_personal: 'SI CUMPLE',
      experiencia_facturacion: 'SI CUMPLE', canal_autorizado: 'SI CUMPLE',
      resultado: 'VALIDA', observaciones: '',
    },
    ...overrides,
  };
}

try {
  // Config / normalización
  assert(normalizeTipoValidacion('Bien') === 'BIENES', 'normaliza Bien → BIENES');
  assert(normalizeTipoValidacion('Servicios') === 'SERVICIOS', 'normaliza Servicios');
  assert(normalizeTipoValidacion('Locador') === 'LOCADORES', 'normaliza Locador');
  assert(!!VALIDACION_CONFIG.BIENES && !!VALIDACION_CONFIG.SERVICIOS, 'config BIENES y SERVICIOS');
  assert(VALIDACION_CONFIG.BIENES.columnas.length === 20, 'Bienes: 20 columnas');
  assert(VALIDACION_CONFIG.SERVICIOS.columnas.length === 18, 'Servicios: 18 columnas');
  assert(!VALIDACION_CONFIG.SERVICIOS.columnas.some((c) => c.key === 'marca'), '5. Servicios sin Marca');
  assert(VALIDACION_CONFIG.BIENES.columnas.some((c) => c.key === 'marca'), 'Bienes incluye Marca');

  // 1–2 Bienes
  const b1 = calcularResultadoCotizacion('BIENES', [filaBienes()]);
  assert(b1.estado === 'APTO', '1. Bien un proveedor → APTO');
  const bNeg = {
    ...filaBienes(),
    evaluacion: {
      ...filaBienes().evaluacion,
      resultado: 'Especificaciones Técnicas NO válidas',
      observaciones: 'No cumple vigencia',
    },
  };
  const b2 = calcularResultadoCotizacion('BIENES', [filaBienes(), bNeg]);
  assert(b2.estado === 'NO_APTO', '2. Bien varios — una negativa → NO_APTO');

  // 3–4 Servicios
  const s1 = calcClient('SERVICIOS', [filaServicios()]);
  assert(s1.estado === 'APTO' && s1.resultado_global === 'VALIDA', '3. Servicio un proveedor → VALIDA');
  const sNeg = {
    ...filaServicios(),
    evaluacion: { ...filaServicios().evaluacion, resultado: 'NO VALIDA', observaciones: 'Sin experiencia' },
  };
  assert(calcularResultadoCotizacion('SERVICIOS', [filaServicios(), sNeg]).estado === 'NO_APTO', '4. Servicio varios — negativa');

  // 5–6 campos
  const autoKeys = ['item', 'nro_req', 'centro', 'codigo_siga', 'descripcion', 'cantidad', 'um', 'cant_cotizaciones', 'razon_social'];
  assert(autoKeys.every((k) => VALIDACION_CONFIG.BIENES.columnas.some((c) => c.key === k && c.kind === 'auto')), '5. campos automáticos Bienes');
  assert(VALIDACION_CONFIG.BIENES.columnas.filter((c) => c.kind === 'eval').length >= 7, '6. criterios editables Bienes');

  // 7 observación obligatoria
  const vBad = validarMatrizCompleta('BIENES', [{
    ...filaBienes(),
    evaluacion: { ...filaBienes().evaluacion, resultado: 'Especificaciones Técnicas NO válidas', observaciones: '' },
  }]);
  assert(!vBad.ok, '7. observación obligatoria NO CUMPLE / NO válidas');
  const vOk = validClient('SERVICIOS', [filaServicios()]);
  assert(vOk.ok, 'matriz válida SERVICIOS');

  // 8 resultado por proveedor (filas independientes)
  const legacy = filasV2ToLegacyItems([filaBienes(), {
    ...filaBienes({ item_key: '1-1' }),
    automaticos: { ...filaBienes().automaticos, item: 2, razon_social: 'OTRO SA' },
    evaluacion: { ...filaBienes().evaluacion, resultado: 'Especificaciones Técnicas NO válidas', observaciones: 'x' },
  }], 'BIENES');
  assert(legacy.length === 2 && legacy[0].razon_social !== legacy[1].razon_social, '8. resultado por proveedor independiente');

  // 10 compat legacy
  const ev = legacyItemToEvaluacion({
    inserto: 'Sí', certificado: 'No', acredita_doc: 'SI CUMPLE',
    vigencia_minima_val: 'SI CUMPLE', plazos_entrega_val: 'NO CUMPLE',
    resultado: 'Especificaciones Técnicas NO válidas', obs_validacion: 'motivo',
  }, 'BIENES');
  assert(ev.inserto === 'SI CUMPLE' && ev.certificado === 'NO CUMPLE' && ev.observaciones === 'motivo', '10. compatibilidad legacy');

  // 11–12 PDF
  assert(/downloadFormatoValidacion/.test(pdfSrc), '11. PDF generator downloadFormatoValidacion');
  assert(/07-A/.test(VALIDACION_CONFIG.BIENES.anexoTitulo) && /BIENES/.test(VALIDACION_CONFIG.BIENES.anexoTitulo), '11. PDF Bienes título institucional');
  assert(/07-B/.test(VALIDACION_CONFIG.SERVICIOS.anexoTitulo) && /SERVICIOS/.test(VALIDACION_CONFIG.SERVICIOS.anexoTitulo), '12. PDF Servicios título institucional');
  assert(/landscape/.test(pdfSrc) && /FIRMA:/.test(pdfSrc), '13. Firma y orientación PDF');
  assert(/07B_Servicios|ANEXO Nº 07-B/.test(pdfSrc) && /DETALLE DEL REQUERIMIENTO/.test(pdfSrc), '13b. PDF Servicios 07-B con grupos');
  assert(!/Sustento de la remisión|Observaciones de remisión/.test(mtxSrc), '13c. sin campos remisión debajo de matriz');

  // UI
  assert(/val-mtx-auto/.test(mtxSrc) && /val-mtx-eval/.test(mtxSrc), 'matriz UI celeste/verde');
  assert(/renderMatrizValidacion/.test(modalSrc), 'modal usa matriz RC7.7B');
  assert(/matriz_v2/.test(modalSrc), '14. archivo firmado + matriz_v2 en flujo');

  // Datos reales
  const rows = await listarValidacionesExpedientes('', '', { esAdmin: true });
  const pendiente = rows.find((r) => ['DERIVADA', 'EN_PROCESO'].includes(r.validacion_estado));
  if (pendiente) {
    const det = await getValidacionTrabajoDetalle(pendiente.id, 'admin', '1', { esAdmin: true });
    assert(!!det.matriz_v2?.filas, 'matriz_v2 en trabajo detalle');
    assert(!!det.tipo_formato, 'tipo_formato expuesto');
    assert(Array.isArray(det.formulario_07a?.items), '10. legacy formulario_07a presente');
    const fila0 = det.matriz_v2.filas[0];
    if (fila0) {
      assert(!!fila0.automaticos?.nro_req || fila0.automaticos?.nro_req === '', '5. auto nro_req');
      assert(fila0.automaticos?.razon_social != null, '5. auto razón social');
      assert(!String(fila0.automaticos?.nro_req || '').match(/^PED-/), 'sin PED- en REQ');
    }

    // 9 borrador
    try {
      const filas = det.matriz_v2.filas.map((f) => ({
        ...f,
        evaluacion: { ...f.evaluacion, obs_specs: (f.evaluacion?.obs_specs || '') + '' },
      }));
      await guardarValidacionParcial(pendiente.id, {
        matriz_v2: { ...det.matriz_v2, filas },
        formulario_07a: det.formulario_07a,
      }, 'admin', '1', { esAdmin: true });
      assert(true, '9. Guardado borrador con matriz_v2');
    } catch (err) {
      assert(false, `9. Guardado borrador: ${err.message}`);
    }

    // 15 bloqueo post-derivación
    if (det.ya_derivado) {
      assert(det.puede_editar === false, '15. bloqueo post-derivación');
    } else {
      assert(det.puede_editar === true || det.puede_editar === false, '15. flag puede_editar presente');
    }
  } else {
    assert(true, 'datos pendientes omitidos');
  }

  const derivado = rows.find((r) => ['APTO', 'NO_APTO', 'OBSERVADO'].includes(r.validacion_estado));
  if (derivado) {
    const det = await getValidacionTrabajoDetalle(derivado.id, 'admin', '1', { esAdmin: true });
    assert(det.ya_derivado && !det.puede_editar, '15. derivado solo lectura');
  }

  // Locadores no como Bienes
  const loc = getValidacionConfig('Locador');
  assert(loc.tipoKey === TIPO_VALIDACION.LOCADORES && !loc.config, 'Locadores fuera de formato Bienes');
} finally {
  try { await pool.end(); } catch (_) { /* noop */ }
}

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests RC7.7B pasaron');
process.exit(failed.length ? 1 : 0);
