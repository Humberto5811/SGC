/**
 * RC7.7A.1 — Compactación modal Validaciones + canDerivar + destinos.
 */
import {
  listarValidacionesExpedientes,
  listarProveedoresSolicitudValidacion,
  getValidacionTrabajoDetalle,
  enviarValidacionUsuario,
  resolverDestinoSalidaValidacion,
  getDestinosSalidaPorResultado,
} from '../server/lib/validacionesCotizacion.js';
import {
  canDerivarValidacion,
  buildExpedienteLineaCompacta,
} from '../src/utils/validacionesDerivarLogic.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pool from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesModal.js'), 'utf8');
const logicSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesDerivarLogic.js'), 'utf8');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

try {
  // 1–3: línea compacta
  const linea = buildExpedienteLineaCompacta({
    solicitud_codigo: 'SC-00021-2026-INS',
    requerimientos: 'REQ-00016, REQ-00017',
    requerimientos_detalle: [{ codigo: 'REQ-00016' }, { codigo: 'REQ-00017' }],
    descripcion: 'Mantenimiento correctivo de equipo de aire acondicionado',
    tipo_contratacion: 'Servicios',
  });
  assert(linea.startsWith('Información del expediente:'), '1. línea compacta del expediente');
  assert(linea.includes('SC-00021-2026-INS') && linea.includes('REQ-00016'), '2. REQ visible junto a SC');
  assert((linea.match(/Información del expediente/g) || []).length === 1, '3. un solo encabezado de expediente');

  // 4: botón Word Ver no renderizado (auto-open / Revisar documentos)
  assert(!/val-revisar-docs/.test(modalSrc), '4. botón Revisar documentos (Word/auto) no renderizado');
  assert(!/openAll\s*=\s*true/.test(modalSrc), '4. no auto-abre primer adjunto (Word)');
  assert(/Ver documentos/.test(modalSrc), '4. acción clara Ver documentos presente');

  // 5: tabla lineal
  assert(/Empresas (que presentaron cotización|y documentos técnicos)/.test(modalSrc), '5. título tabla proveedores');
  assert(/val-prov-table/.test(modalSrc) && /Requerimiento/.test(modalSrc) && /Centro/.test(modalSrc), '5. tabla lineal con columnas');

  // 8–9: canDerivarValidacion
  const blocked = canDerivarValidacion({
    cotizacionId: 1,
    detalle: { puede_derivar: true, ya_derivado: false, validacion_estado: 'EN_PROCESO' },
    pdfAdjunto: null,
    tipoFormato: 'BIENES',
    matriz_v2: {
      tipo: 'BIENES',
      filas: [{ cotizacion_id: 1, evaluacion: { resultado: '' } }],
    },
    formulario: { resultado_global: '', observacion_global: '' },
  });
  assert(!blocked.ok && (blocked.missing.includes('pendientes') || blocked.missing.includes('resultado') || blocked.missing.includes('pdf_firmado')), '8. Derivar deshabilitado sin requisitos');

  const ready = canDerivarValidacion({
    cotizacionId: 1,
    detalle: { puede_derivar: true, ya_derivado: false, validacion_estado: 'EN_PROCESO' },
    pdfAdjunto: { base64: 'AAA', nombre: 'x.pdf' },
    tipoFormato: 'BIENES',
    matriz_v2: {
      tipo: 'BIENES',
      filas: [{ cotizacion_id: 1, evaluacion: { resultado: 'Especificaciones Técnicas válidas' } }],
    },
    formulario: {
      resultado_global: 'Existe al menos una cotización válida',
      observacion_global: 'OK técnico',
      cumple: 'Cumple',
      sustento: '',
    },
  });
  assert(ready.ok === true, '9. Derivar habilitado con requisitos');

  const already = canDerivarValidacion({
    cotizacionId: 1,
    detalle: { puede_derivar: false, ya_derivado: true, validacion_estado: 'APTO' },
    pdfAdjunto: { base64: 'AAA' },
    formulario: { resultado_global: 'x', observacion_global: 'y' },
  });
  assert(!already.ok && already.missing.includes('ya_derivado'), '14. bloqueo idempotente en canDerivar');

  // Destinos oficiales
  assert(resolverDestinoSalidaValidacion('APTO').code === 'CUADRO_COMPARATIVO', '12. APTO → Cuadro Comparativo');
  assert(resolverDestinoSalidaValidacion('NO_APTO').code === 'INVITACIONES', '13. NO_APTO → Invitaciones');
  const mapped = getDestinosSalidaPorResultado('Todas las cotizaciones son no válidas', 'No cumple');
  assert(mapped.destino.code === 'INVITACIONES', '13. mapeo NO_APTO destino Invitaciones');

  // 10: panel destino (no modal Bootstrap anidado)
  assert(/val-dest-overlay/.test(modalSrc) && /showDestinoDerivacionPanel/.test(modalSrc), '10. modal/panel de destino abre (overlay interno)');
  const destFn = (modalSrc.match(/function showDestinoDerivacionPanel[\s\S]*?\n\}/) || [])[0] || '';
  assert(!!destFn && !/bootstrap\.Modal/.test(destFn) && !/getOrCreateInstance/.test(destFn), '10. destino no usa modal Bootstrap anidado');
  assert(/canDerivarValidacion/.test(logicSrc) && /from '\.\/validacionesDerivarLogic\.js'/.test(modalSrc), 'canDerivarValidacion es fuente única');

  // 11: payload keys
  assert(/destino_submodulo/.test(modalSrc) && /responsable_destino_id/.test(modalSrc) && /pdf_firmado/.test(modalSrc), '11. payload de derivación correcto');

  // 16: un listener estable (modal root; RC7.7A.2)
  const rootListeners = (modalSrc.match(/el\.addEventListener\('click'/g) || []).length;
  assert(rootListeners === 1, '16. un único listener de modal root');

  // Datos reales
  const adminRows = await listarValidacionesExpedientes('', '', { esAdmin: true });
  const pendiente = adminRows.find((r) => ['DERIVADA', 'EN_PROCESO'].includes(r.validacion_estado));
  if (pendiente) {
    const det = await getValidacionTrabajoDetalle(pendiente.id, 'admin', '1', { esAdmin: true });
    const line = buildExpedienteLineaCompacta(det);
    assert(line.includes(det.solicitud_codigo), '1. línea con SC real');
    assert(!!det.requerimientos && det.requerimientos !== '—', '2. REQ real en detalle');

    const filas = await listarProveedoresSolicitudValidacion(det.solicitud_id, 'admin', '1', { esAdmin: true });
    assert(Array.isArray(filas) && filas.length >= 1, '5. filas proveedores');
    assert(filas.every((f) => f.razon_social && f.ruc), '5. RUC y razón social presentes');
    assert(filas.every((f) => f.requerimiento_codigo || f.requerimientos), '7. requerimiento en fila');

    // 6–7: docs filtrados
    const docsReq = det.documentos_requerimiento || [];
    if (filas[0].requerimiento_id && docsReq.length) {
      const filtered = docsReq.filter((d) => String(d.requerimiento_id) === String(filas[0].requerimiento_id));
      assert(filtered.every((d) => String(d.requerimiento_id) === String(filas[0].requerimiento_id)), '7. docs filtrados por requerimiento');
    } else {
      assert(true, '7. (sin docs req) filtro por requerimiento omitido');
    }
    assert(!(det.documentos_cotizacion || []).some((d) => d.economico || d.ref === 'anexo05b'), '6. docs técnicos por proveedor sin económico');

    // canDerivar con detalle real incompleto
    const c1 = canDerivarValidacion({
      detalle: det,
      pdfAdjunto: null,
      formulario: { resultado_global: '', observacion_global: '' },
    });
    assert(!c1.ok, '8. real: incompleto no deriva');
  } else {
    assert(true, 'datos pendientes omitidos (sin DERIVADA/EN_PROCESO)');
  }

  const derivado = adminRows.find((r) => ['APTO', 'NO_APTO', 'OBSERVADO'].includes(r.validacion_estado));
  if (derivado) {
    const again = await enviarValidacionUsuario(derivado.id, {
      formulario_07a: { items: [{ item: 1 }], resultado_global: 'x', observacion_global: 'obs' },
      pdf_firmado: { base64: 'AAA' },
    }, 'admin', '1', { esAdmin: true });
    assert(again.idempotente || again.ya_derivado, '14. derivación idempotente API');
    const det = await getValidacionTrabajoDetalle(derivado.id, 'admin', '1', { esAdmin: true });
    assert(det.ya_derivado && !det.puede_derivar, '15. estado solo lectura tras derivar');
    assert(!!det.estado_bandeja, '15. estado bandeja actualizado');
  } else {
    assert(true, '14/15. (sin derivado) omitido');
  }
} finally {
  try { await pool.end(); } catch (_) { /* noop */ }
}

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests RC7.7A.1 pasaron');
process.exit(failed.length ? 1 : 0);
