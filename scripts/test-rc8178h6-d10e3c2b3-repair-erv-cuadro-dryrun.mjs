/**
 * RC8.17.8H6-D10-E3-C2.6B3 — Pruebas aisladas (sin BD) lógica de reparación ERV cuadro.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assessErvCuadroCoordGap,
  buildAuditIdempotencyKey,
  validarPrecondicionesEjecucionC26b3,
  CASE_DEFAULT,
  EVENTO_CANONICO,
  EVENTO_REPARACION_AUDIT,
  ESTRATEGIA_REPARACION_C26B3,
  PROCEDIMIENTO_REVERSION,
} from '../server/lib/repairErvCuadroDerivacionCoordC26b3.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repairLibPath = path.join(__dirname, '../server/lib/repairErvCuadroDerivacionCoordC26b3.js');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC8.17.8H6 D10-E3-C2.6B3 repair ERV cuadro (unit) ===\n');

{
  const gap = assessErvCuadroCoordGap(
    {
      etapa_codigo: 'CUADRO_COMPARATIVO',
      estado_codigo: 'CUADRO_COMPARATIVO',
      responsable_tipo: 'UNIDAD',
      responsable_unidad: 'Coordinador CM',
    },
    { id: 1, tipo_responsable: 'UNIDAD', usuario_id: null },
  );
  assert(gap.needsRepair && !gap.alreadyOk, 'UNIDAD + estado no EN_TRAMITE → necesita reparación');
  assert(gap.reasons.some((r) => r.includes('EN_TRAMITE')), 'motivo incluye EN_TRAMITE');
}

{
  const gap = assessErvCuadroCoordGap(
    {
      etapa_codigo: 'CUADRO_COMPARATIVO',
      estado_codigo: 'EN_TRAMITE',
      responsable_tipo: TIPO_RESPONSABLE.PERSONA,
      responsable_usuario_id: 20,
    },
    { id: 2, tipo_responsable: TIPO_RESPONSABLE.PERSONA, usuario_id: 20 },
  );
  assert(gap.alreadyOk && !gap.needsRepair, 'PERSONA + EN_TRAMITE alineado → idempotente');
}

assert(buildAuditIdempotencyKey(7) === 'repair-c26b3:req7:audit-erv-cuadro-coord',
  'idempotency auditoría estable');

assert(ESTRATEGIA_REPARACION_C26B3.modo === 'ADMINISTRATIVA', 'modo administrativo');
assert(
  ESTRATEGIA_REPARACION_C26B3.emite_eventos.length === 1
    && ESTRATEGIA_REPARACION_C26B3.emite_eventos[0] === EVENTO_REPARACION_AUDIT,
  'solo un evento de auditoría en reparación',
);
assert(
  ESTRATEGIA_REPARACION_C26B3.prohibido.includes('CUADRO_DERIVADO_COORDINACION')
    && ESTRATEGIA_REPARACION_C26B3.prohibido.includes('appendMovimiento')
    && ESTRATEGIA_REPARACION_C26B3.prohibido.includes('transicionarExpediente'),
  'estrategia prohíbe re-derivación y movimientos',
);

{
  const src = fs.readFileSync(repairLibPath, 'utf8');
  assert(!src.includes("from './expedienteTransicion.js'"),
    'lib reparación no importa expedienteTransicion');
  assert(!src.includes('transicionarExpediente('),
    'lib reparación no invoca transicionarExpediente');
  assert(!src.includes('appendMovimiento('),
    'lib reparación no invoca appendMovimiento');
  assert(src.includes('insertWorkflowEvento'),
    'lib registra evento REPARACION vía insertWorkflowEvento');
}

assert(EVENTO_CANONICO === 'CUADRO_DERIVADO_COORDINACION',
  'EVENTO_CANONICO solo para elegibilidad de candidatos');
assert(EVENTO_REPARACION_AUDIT.includes('C26B3'), 'código evento auditoría');

assert(CASE_DEFAULT.solicitud_codigo === 'SC-00001-2026-INS', 'caso acotado SC-00001');
assert(CASE_DEFAULT.requerimiento_codigo === 'REQ-00001', 'caso acotado REQ-00001');
assert(Number(CASE_DEFAULT.nro_invitacion) === 7, 'invitación 7');

assert(Array.isArray(PROCEDIMIENTO_REVERSION.pasos) && PROCEDIMIENTO_REVERSION.pasos.length >= 4,
  'procedimiento reversión documentado');
assert(
  PROCEDIMIENTO_REVERSION.advertencia.toLowerCase().includes('no eliminar'),
  'reversión prohíbe borrar eventos históricos',
);

{
  const auditOk = {
    ok: true,
    alcance: {
      requerimiento_codigo: 'REQ-00001',
      nro_invitacion: 7,
      cuadro: { id: 2, version: 3, estado: 'PENDIENTE_COORDINADOR' },
    },
    expediente_estado_vigente: {
      etapa_codigo: 'CUADRO_COMPARATIVO',
      estado_codigo: 'CUADRO_COMPARATIVO',
      responsable_tipo: 'UNIDAD',
      responsable_unidad: 'Coordinador CM',
    },
    asignacion_activa: [{ id: 1, tipo_responsable: 'UNIDAD', usuario_id: null }],
    hallazgos: { gap: { needsRepair: true, alreadyOk: false, reasons: ['x'] } },
  };
  const pre = validarPrecondicionesEjecucionC26b3(auditOk);
  assert(pre.ok, 'precondiciones VPS típicas (UNIDAD + cuadro 2 v3 PENDIENTE_COORDINADOR) → ok');
}

{
  const auditMal = {
    ok: true,
    alcance: {
      requerimiento_codigo: 'REQ-00002',
      nro_invitacion: 7,
      cuadro: { id: 2, version: 3, estado: 'ADJUDICADO' },
    },
    expediente_estado_vigente: { responsable_tipo: 'PERSONA', responsable_usuario_id: 1 },
    asignacion_activa: [{ tipo_responsable: 'PERSONA', usuario_id: 1 }],
    hallazgos: { gap: { needsRepair: false, alreadyOk: true } },
  };
  const pre = validarPrecondicionesEjecucionC26b3(auditMal);
  assert(!pre.ok && pre.errores.length >= 3,
    'precondiciones rechazan REQ/cuadro/UNIDAD incorrectos');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((t) => console.error('FAIL:', t.msg));
  process.exit(1);
}
