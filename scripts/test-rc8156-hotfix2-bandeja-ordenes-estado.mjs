/**
 * RC8.15.6 HOTFIX2 — Estado/responsable agregado de la pestaña Órdenes.
 * Las comprobaciones reales son solo lectura; los casos de agregación usan contratos en memoria.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pool, { query } from '../server/db.js';
import {
  agregarEstadoResponsableOrden,
  listarBandejaOrdenesEntregablesServicios,
} from '../server/lib/entregablesServicios.js';
import { obtenerEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function contrato({
  entrega = 1,
  etapa = 'PRESENTACION_ENTREGABLES',
  etapaLabel = 'Presentación de Entregables',
  usuario = 65,
  nombre = 'RESPONSABLE UNO',
  fuenteEstado = 'ENTREGABLE',
} = {}) {
  return {
    ordenEntregaId: entrega,
    estadoCodigo: etapa,
    estadoLabel: etapaLabel,
    etapaCodigo: etapa,
    etapaLabel,
    responsableTipo: 'PERSONA',
    responsableUsuarioId: usuario,
    responsableNombre: nombre,
    responsableUnidad: 'Área Usuaria',
    fuenteEstado,
    fallbackGlobal: fuenteEstado === 'EXPEDIENTE_GLOBAL_FALLBACK',
  };
}

async function snapshot(queryText, params = []) {
  return JSON.stringify((await query(queryText, params)).rows);
}

console.log('\n=== RC8.15.6 HOTFIX2 — Bandeja Órdenes Estado/Responsable ===\n');

const uno = agregarEstadoResponsableOrden([contrato()]);
ok(uno.estado_responsable_vigente?.fuenteEstado === 'ENTREGABLE'
  && uno.estados_entregables[0]?.cantidad === 1,
'A. una entrega conserva su contrato específico canónico');

const iguales = agregarEstadoResponsableOrden([
  contrato({ entrega: 1 }),
  contrato({ entrega: 2 }),
]);
ok(!iguales.estado_agregado_heterogeneo
  && iguales.estados_entregables[0]?.cantidad === 2
  && iguales.responsables_entregables[0]?.cantidad === 2
  && Boolean(iguales.estado_responsable_vigente),
'B. misma etapa y responsable produce resumen uniforme');

const responsablesDistintos = agregarEstadoResponsableOrden([
  contrato({ entrega: 1 }),
  contrato({ entrega: 2, usuario: 66, nombre: 'RESPONSABLE DOS' }),
]);
ok(responsablesDistintos.estado_agregado_heterogeneo
  && responsablesDistintos.estados_entregables.length === 1
  && responsablesDistintos.responsables_entregables.length === 2
  && responsablesDistintos.estado_responsable_vigente == null,
'C. misma etapa y responsables distintos no elige uno arbitrariamente');

const etapasDistintas = agregarEstadoResponsableOrden([
  contrato({ entrega: 1 }),
  contrato({
    entrega: 2,
    etapa: 'REVISION_COORDINADOR_CM',
    etapaLabel: 'Revisión Coordinador CM',
  }),
]);
ok(etapasDistintas.estado_agregado_heterogeneo
  && etapasDistintas.estados_entregables.length === 2
  && etapasDistintas.estado_responsable_vigente == null,
'D. etapas distintas se representan como estados múltiples');

const fallback = agregarEstadoResponsableOrden([
  contrato({ fuenteEstado: 'EXPEDIENTE_GLOBAL_FALLBACK' }),
]);
ok(fallback.estado_responsable_vigente?.fallbackGlobal === true,
  'E. el fallback global por entregable conserva su fuente canónica');

const adaptado = adaptEstadoResponsable(iguales);
ok(adaptado.estadoLabel === 'Presentación de Entregables'
  && adaptado.estadoLabel !== 'Estado no disponible',
'F. una fuente canónica nunca produce estado vacío');
ok(adaptado.responsableDisplay === 'RESPONSABLE UNO'
  && adaptado.responsableDisplay !== 'Pendiente de asignación',
'G. una fuente canónica nunca produce responsable vacío');

const viewSource = readFileSync(
  new URL('../src/views/ejecucion/presentacionEntregableView.js', import.meta.url),
  'utf8',
);
const backendSource = readFileSync(
  new URL('../server/lib/entregablesServicios.js', import.meta.url),
  'utf8',
);
ok(/function renderEntregableRow[\s\S]*renderEstadoBadgeFromRow\(row\)[\s\S]*renderResponsableCellHtml\(row/.test(viewSource)
  && /item\.estado_responsable_vigente\s*=\s*erv/.test(backendSource),
'H. pestaña Entregables conserva estado y responsable específicos');

const osBefore = await snapshot(`
  SELECT oc.*, oe.id AS entrega_id, oe.estado AS entrega_estado,
    eev.estado_codigo, eev.etapa_codigo, eev.responsable_tipo,
    eev.responsable_usuario_id, eev.responsable_unidad
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  LEFT JOIN entregable_estado_vigente eev ON eev.orden_entrega_id=oe.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`);
const especificosBefore = await snapshot(`
  SELECT * FROM entregable_estado_vigente ORDER BY orden_entrega_id
`);
const globalBefore = await snapshot(`
  SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id
`);
const bienesBefore = await snapshot(`
  SELECT
    (SELECT COUNT(*)::int FROM recepcion_bienes_expedientes) AS expedientes,
    (SELECT COUNT(*)::int FROM recepciones_bienes) AS recepciones,
    (SELECT COUNT(*)::int FROM recepcion_bienes_eventos) AS eventos
`);

const candidatoFallback = (await query(`
  SELECT oe.id
  FROM orden_entregas oe
  JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
  JOIN expediente_estado_vigente ev ON ev.requerimiento_id=oc.requerimiento_id
  LEFT JOIN entregable_estado_vigente eev ON eev.orden_entrega_id=oe.id
  WHERE oe.estado='ACTIVO' AND eev.orden_entrega_id IS NULL
  ORDER BY oe.id
  LIMIT 1
`)).rows[0];
if (candidatoFallback) {
  const realFallback = await obtenerEstadoResponsableEntregable(candidatoFallback.id);
  assert.equal(realFallback?.fuenteEstado, 'EXPEDIENTE_GLOBAL_FALLBACK');
}

const ordenes = await listarBandejaOrdenesEntregablesServicios(null);
const os1105 = ordenes.find((row) => String(row.numero_orden) === '1105');
ok(os1105?.situacion_codigo === 'RECIBIDO_PARCIAL'
  && os1105?.situacion_label === 'Recibido parcial',
'I. Situación de OS 1105 continúa como Recibido parcial');
ok(await snapshot('SELECT * FROM entregable_estado_vigente ORDER BY orden_entrega_id')
  === especificosBefore,
'J. E1/E2 y demás estados específicos no se modifican');
ok(await snapshot('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id')
  === globalBefore,
'K. expediente global no se modifica');
ok(await snapshot(`
  SELECT oc.*, oe.id AS entrega_id, oe.estado AS entrega_estado,
    eev.estado_codigo, eev.etapa_codigo, eev.responsable_tipo,
    eev.responsable_usuario_id, eev.responsable_unidad
  FROM ordenes_contratacion oc
  LEFT JOIN orden_entregas oe ON oe.orden_id=oc.id
  LEFT JOIN entregable_estado_vigente eev ON eev.orden_entrega_id=oe.id
  WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
  ORDER BY oc.id, oe.id
`) === osBefore,
'L. OS 1105 real se consulta únicamente en lectura');
ok(await snapshot(`
  SELECT
    (SELECT COUNT(*)::int FROM recepcion_bienes_expedientes) AS expedientes,
    (SELECT COUNT(*)::int FROM recepciones_bienes) AS recepciones,
    (SELECT COUNT(*)::int FROM recepcion_bienes_eventos) AS eventos
`) === bienesBefore,
'M. Bienes permanece intacto');

await pool.end();
console.log(`\n=== Resultado HOTFIX2: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
