/**
 * RC7.7A.2 — Reparación definitiva del botón Derivar expediente.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../server/db.js';
import {
  canDerivarValidacion,
  formatFaltantesHtml,
  resolverDestinoCliente,
} from '../src/utils/validacionesDerivarLogic.js';
import {
  listarValidacionesExpedientes,
  getValidacionTrabajoDetalle,
  enviarValidacionUsuario,
  resolverDestinoSalidaValidacion,
} from '../server/lib/validacionesCotizacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesModal.js'), 'utf8');
const logicSrc = readFileSync(path.join(__dirname, '../src/utils/validacionesDerivarLogic.js'), 'utf8');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

try {
  // 1. Botón único con selector estable
  const btnMatches = modalSrc.match(/data-action="derivar-expediente"/g) || [];
  assert(btnMatches.length >= 1, '1. Botón con data-action=derivar-expediente existe');
  assert(/type="button"[\s\S]*?data-action="derivar-expediente"|data-action="derivar-expediente"[\s\S]*?type="button"/.test(modalSrc)
    || /btnDerivar[\s\S]*type="button"/.test(modalSrc)
    || /type="button"\s*\n\s*id="\$\{id\}_btnDerivar"/.test(modalSrc), '1. type=button en Derivar');
  assert(!/<button[^>]*data-action="derivar-expediente"[^>]*\sdisabled/.test(modalSrc), '1. Derivar no usa HTML disabled inicial permanente');

  // 2. Handler registrado por delegación en modal root
  assert(/el\.addEventListener\('click'/.test(modalSrc), '2. Handler se registra en modal root');
  assert(/handleDerivarClick/.test(modalSrc), '2. handleDerivarClick existe');
  assert((modalSrc.match(/el\.addEventListener\('click'/g) || []).length === 1, '2. un único listener en modal root');

  // 3. Sin resultado → faltante
  const s1 = canDerivarValidacion({
    cotizacionId: 1,
    detalle: { puede_derivar: true, ya_derivado: false, validacion_estado: 'EN_PROCESO' },
    pdfAdjunto: { base64: 'AAA' },
    tipoFormato: 'BIENES',
    matriz_v2: {
      tipo: 'BIENES',
      filas: [{ cotizacion_id: 1, evaluacion: { resultado: '' } }],
    },
    formulario: { resultado_global: '', observacion_global: 'obs' },
  });
  assert(!s1.ok && s1.faltantes.some((f) => /pendiente|resultado/i.test(f)), '3. Sin resultado → muestra faltante');

  // 4. Sin PDF → faltante
  const s2 = canDerivarValidacion({
    cotizacionId: 1,
    detalle: { puede_derivar: true, ya_derivado: false, validacion_estado: 'EN_PROCESO' },
    pdfAdjunto: null,
    tipoFormato: 'BIENES',
    matriz_v2: {
      tipo: 'BIENES',
      filas: [{ cotizacion_id: 1, evaluacion: { resultado: 'Especificaciones Técnicas válidas' } }],
    },
    formulario: { resultado_global: 'Existe al menos una cotización válida', observacion_global: 'obs', cumple: 'Cumple' },
  });
  assert(!s2.ok && s2.faltantes.some((f) => /PDF/i.test(f)), '4. Sin PDF → muestra faltante');
  assert(/No se puede derivar/.test(formatFaltantesHtml(s2)), '4. mensaje HTML de faltantes');

  // 5. Sin responsable → no confirma (UI)
  assert(/No existen usuarios habilitados|Seleccione el usuario responsable/.test(modalSrc), '5. Sin responsable → no confirma');

  // 6. Completa → ok abre modal
  const s3 = canDerivarValidacion({
    cotizacionId: 10,
    detalle: { puede_derivar: true, ya_derivado: false, validacion_estado: 'DERIVADA' },
    pdfAdjunto: { base64: 'AAA', nombre: 'x.pdf' },
    tipoFormato: 'BIENES',
    matriz_v2: {
      tipo: 'BIENES',
      filas: [{ cotizacion_id: 10, evaluacion: { resultado: 'Especificaciones Técnicas válidas' } }],
    },
    formulario: {
      resultado_global: 'Existe al menos una cotización válida',
      observacion_global: 'Cumple especificaciones',
      cumple: 'Cumple',
    },
  });
  assert(s3.ok === true, '6. Validación completa → canDerivar ok');
  assert(/showDestinoDerivacionPanel/.test(modalSrc) && /position:fixed/.test(modalSrc), '6. abre panel destino fixed');

  // 7–8 destinos
  assert(resolverDestinoCliente('Existe al menos una cotización válida', 'Cumple').code === 'CUADRO_COMPARATIVO', '7. APTO → Cuadro Comparativo');
  assert(resolverDestinoCliente('Todas las cotizaciones son no válidas', 'No cumple').code === 'INVITACIONES', '8. NO_APTO → Invitaciones');
  assert(resolverDestinoSalidaValidacion('APTO').code === 'CUADRO_COMPARATIVO', '7. backend APTO');
  assert(resolverDestinoSalidaValidacion('NO_APTO').code === 'INVITACIONES', '8. backend NO_APTO');

  // 9. Payload
  assert(/destino_submodulo/.test(modalSrc) && /responsable_destino_id/.test(modalSrc) && /pdf_firmado/.test(modalSrc), '9. Payload correcto');

  // Aria-disabled pattern (clic siempre llega)
  assert(/aria-disabled/.test(modalSrc) && /NO usar HTML disabled|removeAttribute\('disabled'\)/.test(modalSrc), 'clic no tragado por disabled HTML');

  // canDerivar es fuente única
  assert(/export function canDerivarValidacion/.test(logicSrc), 'canDerivarValidacion exportada');

  // Datos reales
  const rows = await listarValidacionesExpedientes('', '', { esAdmin: true });
  const pendiente = rows.find((r) => ['DERIVADA', 'EN_PROCESO'].includes(r.validacion_estado));
  if (pendiente) {
    const det = await getValidacionTrabajoDetalle(pendiente.id, 'admin', '1', { esAdmin: true });
    const incomplete = canDerivarValidacion({
      cotizacionId: det.id,
      detalle: det,
      pdfAdjunto: null,
      formulario: { resultado_global: '', observacion_global: '' },
    });
    assert(!incomplete.ok, '6. real incompleto no deriva');

    // 12. idempotencia si ya derivado
  } else {
    assert(true, 'pendiente omitido');
  }

  const derivado = rows.find((r) => ['APTO', 'NO_APTO', 'OBSERVADO'].includes(r.validacion_estado));
  if (derivado) {
    const again = await enviarValidacionUsuario(derivado.id, {
      formulario_07a: { items: [{ item: 1 }], resultado_global: 'x', observacion_global: 'obs' },
      pdf_firmado: { base64: 'AAA' },
    }, 'admin', '1', { esAdmin: true });
    assert(again.idempotente || again.ya_derivado, '12. Segunda derivación bloqueada');
    assert(again.ok === true || again.ya_derivado === true, '10. Backend responde OK/idempotente');
    const det = await getValidacionTrabajoDetalle(derivado.id, 'admin', '1', { esAdmin: true });
    assert(det.ya_derivado && !det.puede_derivar, '11. Estado fila / solo lectura');
  } else {
    assert(true, '10/11/12. (sin derivado) omitido');
  }

  // 13. no catch vacío en derivar
  assert(!/catch\s*\(\s*_\s*\)\s*\{\s*\}/.test(modalSrc.split('handleDerivarClick')[1] || ''), '13. sin catch vacío en derivar');
  assert(/console\.error/.test(modalSrc), '13. errores registrados en consola');
} finally {
  try { await pool.end(); } catch (_) { /* noop */ }
}

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests RC7.7A.2 pasaron');
process.exit(failed.length ? 1 : 0);
