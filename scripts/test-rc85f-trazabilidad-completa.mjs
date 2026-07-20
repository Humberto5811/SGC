/**
 * RC8.5-F — Trazabilidad completa del expediente (no solo Invitaciones).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeMovimientos } from '../server/lib/movimientos.js';
import { enrichRequerimientoRow, ETAPAS } from '../server/lib/trazabilidad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.5-F Trazabilidad completa ===\n');

// merge no descarta el historial más completo
const merged = mergeMovimientos(
  [{ id: 1, fecha: '2026-01-10T10:00:00Z', accion: 'DERIVADO', etapa: 'INVITACIONES', observacion: 'Solo invitaciones' }],
  [
    { fecha: '2026-01-01T10:00:00Z', accion: 'CREADO', etapa: 'REGISTRADO', observacion: 'Registro' },
    { fecha: '2026-01-02T10:00:00Z', accion: 'DERIVADO', etapa: 'EVALUACION', observacion: 'A evaluación' },
    { fecha: '2026-01-10T10:00:00Z', accion: 'DERIVADO', etapa: 'INVITACIONES', observacion: 'Solo invitaciones' },
    { fecha: '2026-01-12T10:00:00Z', accion: 'DERIVADO', etapa: 'CUADRO_COMPARATIVO', observacion: 'A cuadro' },
  ],
);
assert(merged.length >= 4, 'merge une persistido + reconstruido');
assert(merged.some((m) => m.etapa === 'REGISTRADO'), 'incluye Registro');
assert(merged.some((m) => m.etapa === 'EVALUACION'), 'incluye Evaluación');
assert(merged.some((m) => m.etapa === 'CUADRO_COMPARATIVO'), 'incluye Cuadro');
assert(merged.filter((m) => m.etapa === 'INVITACIONES' && /Solo invitaciones/.test(m.observacion || '')).length === 1,
  'no duplica Invitaciones');

// enrich con estado en Cuadro debe reconstruir pipeline completo (no truncar en Evaluación)
const row = {
  id: 99,
  codigo: 'REQ-TEST',
  estado: 'En Cuadro Comparativo',
  estado_actual: 'CUADRO_COMPARATIVO',
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
  fecha_estado_actual: '2026-01-15T12:00:00Z',
  historial_movimientos: JSON.stringify([
    {
      id: 1, fecha: '2026-01-10T10:00:00Z', accion: 'DERIVADO',
      etapa: 'INVITACIONES', subModulo: 'Invitaciones', observacion: 'En Invitaciones',
    },
  ]),
  historial_estados: '[]',
  payload: JSON.stringify({
    historial_evaluacion: [
      { tipo: 'derivacion', fecha: '2026-01-02T09:00:00Z', usuario: 'AU', observacion: 'A evaluación' },
      { tipo: 'aprobacion', fecha: '2026-01-03T09:00:00Z', usuario: 'Gerente' },
    ],
    historial_dec: [{ tipo: 'aprobacion_dec', fecha: '2026-01-04T09:00:00Z', usuario: 'DEC' }],
    historial_programacion: [{ fecha: '2026-01-05T09:00:00Z', usuario: 'Prog' }],
    historial_actos: [{ tipo: 'aprobacion_invitaciones', fecha: '2026-01-06T09:00:00Z', usuario: 'Coord' }],
    historial_invitaciones: [
      { tipo: 'ingreso_invitaciones', fecha: '2026-01-07T09:00:00Z', usuario: 'Analista' },
      { tipo: 'convocatoria_enviada', fecha: '2026-01-08T09:00:00Z', usuario: 'Analista', contador: 3 },
    ],
  }),
};
const enriched = enrichRequerimientoRow(row);
const etapas = new Set((enriched.historialMovimientos || []).map((m) => String(m.etapa || '').toUpperCase()));
assert(etapas.has('REGISTRADO') || etapas.has('EVALUACION'), 'enrich incluye etapas tempranas');
assert(etapas.has('INVITACIONES'), 'enrich incluye Invitaciones');
assert(etapas.has('CUADRO_COMPARATIVO') || String(enriched.estado_actual).includes('CUADRO'),
  'enrich llega a Cuadro Comparativo');
assert((enriched.historialMovimientos || []).length > 1, 'enrich no deja un solo movimiento');

assert(ETAPAS.RECEPCION_COTIZACIONES && ETAPAS.VALIDACION_USUARIO && ETAPAS.CUADRO_COMPARATIVO && ETAPAS.CCP,
  'catálogo etapas Workflow completo');

const lib = fs.readFileSync(path.join(root, 'server/lib/trazabilidad.js'), 'utf8');
assert(/mergeMovimientos/.test(lib), 'usa mergeMovimientos');
assert(/collectCuadroRevisionMovimientos|cuadros_comparativos/.test(lib), 'incorpora historial de cuadro');
assert(/PIPELINE_OFICIAL|RECEPCION_COTIZACIONES/.test(lib), 'pipeline oficial extendido');

const tabs = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoExpedienteTabs.js'), 'utf8');
assert(/Fecha/.test(tabs) && /Usuario/.test(tabs) && /Acción|Accion/.test(tabs)
  && /Estado/.test(tabs) && /Versión|Version/.test(tabs) && /Documento/.test(tabs),
'pestaña muestra columnas completas');

const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCoordModal.js'), 'utf8');
assert(/trazabilidadService\.get/.test(modal) && /Fusionar trazabilidad|movKey|historialMovimientos/.test(modal),
  'modal fusiona trazabilidad de requerimientos');

const wf = fs.readFileSync(path.join(root, 'core/workflowEngine/WorkflowTransitions.js'), 'utf8');
assert(/CUADRO_COMPARATIVO/.test(wf) && /INVITACIONES/.test(wf), 'Workflow oficial intacto');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.5-F: PASS\n');
