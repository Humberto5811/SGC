/**
 * RC7.6.4 — Prueba sincronización Workflow Validación AU (BD real).
 */
import { query } from '../server/db.js';
import { mapEstadoToUbicacion, enrichRequerimientoRow } from '../server/lib/trazabilidad.js';
import { syncRequerimientosSolicitudWorkflow } from '../server/lib/cotizacionWorkflowSync.js';
import { enrichReqRow } from '../src/utils/trazabilidad.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';

const tests = [];
function assert(cond, msg) { tests.push({ ok: !!cond, msg }); }

assert(mapEstadoToUbicacion('En Valid. Usuario') === 'VALIDACION_USUARIO', 'map En Valid. Usuario → VALIDACION_USUARIO');

const { rows: reqRows } = await query("SELECT * FROM requerimientos WHERE codigo = 'REQ-00016'");
const req = reqRows[0];
assert(!!req, 'REQ-00016 existe');

const { rows: cotRows } = await query(`
  SELECT solicitud_id, validacion_estado, validacion_responsable
  FROM cotizaciones_proveedor
  WHERE requerimiento_id = $1 AND validacion_estado = 'DERIVADA'
  ORDER BY updated_at DESC LIMIT 1
`, [req?.id]);

if (req && cotRows.length) {
  const cot = cotRows[0];
  const antes = String(req.estado_actual || '').toUpperCase();

  if (antes !== 'VALIDACION_USUARIO') {
    const r1 = await syncRequerimientosSolicitudWorkflow(cot.solicitud_id, {
      etapaDestino: 'VALIDACION_USUARIO',
      usuario: 'test-rc764',
      observacion: 'Prueba RC7.6.4 — sincronización Validación AU',
      etapaEjecutor: 'RECEPCION_COTIZACIONES',
      responsable: cot.validacion_responsable,
    });
    assert(r1.actualizados >= 1, 'sync actualiza al menos un requerimiento');
  }

  const { rows: freshRows } = await query('SELECT * FROM requerimientos WHERE id = $1', [req.id]);
  const fresh = freshRows[0];
  assert(String(fresh.estado_actual).toUpperCase() === 'VALIDACION_USUARIO', 'estado_actual = VALIDACION_USUARIO');
  assert(String(fresh.estado).includes('Valid'), 'estado negocio refleja Validación');
  assert(String(fresh.responsable_actual).includes('ZEPPILLI'), 'responsable = asignado AU');

  const apiRow = enrichRequerimientoRow(fresh);
  assert(apiRow.estado_actual === 'VALIDACION_USUARIO', 'API enrich estado_actual');

  const clientRow = enrichReqRow(fresh);
  assert(clientRow.estado_actual === 'VALIDACION_USUARIO', 'client enrich estado_actual');

  const visual = buildEstadoVisual(fresh);
  assert(visual.workflowActual === 'VALIDACION_USUARIO', 'Presenter workflowActual');
  assert(/valid/i.test(visual.textoPrincipal), 'Presenter textoPrincipal Validación');

  const r2 = await syncRequerimientosSolicitudWorkflow(cot.solicitud_id, {
    etapaDestino: 'VALIDACION_USUARIO',
    usuario: 'test-rc764',
    observacion: 'Prueba idempotencia RC7.6.4',
    etapaEjecutor: 'RECEPCION_COTIZACIONES',
    responsable: cot.validacion_responsable,
  });
  assert(r2.actualizados === 0 && r2.omitidos >= 1, 'sync idempotente no duplica');

  const { rows: hist } = await query(
    'SELECT historial_movimientos FROM requerimientos WHERE id = $1',
    [req.id],
  );
  const movs = Array.isArray(hist[0]?.historial_movimientos)
    ? hist[0].historial_movimientos
    : JSON.parse(hist[0]?.historial_movimientos || '[]');
  const derivados = movs.filter((m) => String(m.accion || '').toUpperCase() === 'DERIVADO'
    && String(m.etapaDestino || m.destino || '').toUpperCase() === 'VALIDACION_USUARIO');
  assert(derivados.length <= 2, 'sin duplicación excesiva de trazabilidad DERIVADO→VALIDACION_USUARIO');
}

const failed = tests.filter((t) => !t.ok);
tests.forEach((t) => console.log(t.ok ? 'OK' : 'FAIL', t.msg));
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests RC7.6.4 pasaron');
process.exit(failed.length ? 1 : 0);
