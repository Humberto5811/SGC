/**
 * RC8.15.6C-1 — Etapa canónica Revisión Coordinador CM.
 * Pruebas puras de catálogo/transición y snapshots de módulos protegidos.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  ETAPAS,
  esEtapaPermitidaParaTipo,
  getEtapaMeta,
  getLabelEtapa,
} from '../shared/workflow/etapas.js';
import { EVENTOS, getEventoMeta } from '../shared/workflow/eventos.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import {
  buildEstadoLabels,
  mapEtapaDestinoBD,
  resolverResponsableSincero,
} from '../server/lib/expedienteEstadoPersistido.js';
import { buildContratoCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { etapaEsPostCcp } from '../server/lib/bandejaVisibilidad.js';
import { getEstadoCatalogEntry } from '../src/ui/workflow/estadoCatalogo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id, oc.estado,
      (SELECT COUNT(*)::int FROM entregable_recepciones er WHERE er.orden_id=oc.id) AS recepciones,
      (SELECT COUNT(*)::int FROM entregable_observaciones eo WHERE eo.orden_id=oc.id) AS observaciones
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

async function snapshotBienes() {
  const result = {};
  for (const table of [
    'recepcion_bienes_expedientes',
    'recepciones_bienes',
    'recepcion_bienes_eventos',
  ]) {
    result[table] = Number((await query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
  }
  return JSON.stringify(result);
}

console.log('\n=== RC8.15.6C-1 — Etapa Revisión Coordinador CM ===\n');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();
const etapa = ETAPAS.REVISION_COORDINADOR_CM;
const meta = getEtapaMeta(etapa);
const evento = EVENTOS.ENTREGABLE_DERIVADO_COORDINADOR_CM;
const transServicio = getTransition({
  tipoContratacion: 'SERVICIO',
  etapaOrigen: ETAPAS.PRESENTACION_ENTREGABLES,
  eventoCodigo: evento,
});
const transLocacion = getTransition({
  tipoContratacion: 'LOCACION',
  etapaOrigen: ETAPAS.PRESENTACION_ENTREGABLES,
  eventoCodigo: evento,
});
const transBien = getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: ETAPAS.PRESENTACION_ENTREGABLES,
  eventoCodigo: evento,
});
const transicionSource = read('server/lib/expedienteTransicion.js');

ok(etapa === 'REVISION_COORDINADOR_CM' && Boolean(meta),
  'A. etapa REVISION_COORDINADOR_CM existe');
ok(meta?.label === 'Revisión Coordinador CM'
  && getLabelEtapa(etapa) === 'Revisión Coordinador CM', 'B. label correcto');
ok(evento === 'ENTREGABLE_DERIVADO_COORDINADOR_CM'
  && getEventoMeta(evento)?.cambiaUbicacion === true, 'C. evento canónico existe');
ok(transServicio?.etapa_origen === 'PRESENTACION_ENTREGABLES'
  && transServicio?.etapa_destino === etapa
  && /estadoVigente\?\.etapa_codigo/.test(transicionSource),
'D. transición usa PRESENTACION_ENTREGABLES desde la fuente canónica');
ok(transServicio?.tipo_contratacion === 'SERVICIO'
  && esEtapaPermitidaParaTipo(etapa, 'SERVICIO'), 'E. aplica a SERVICIO');
ok(transLocacion?.tipo_contratacion === 'LOCACION'
  && transLocacion?.etapa_destino === etapa
  && esEtapaPermitidaParaTipo(etapa, 'LOCACION'), 'F. aplica a LOCACION');
ok(transBien === null && !esEtapaPermitidaParaTipo(etapa, 'BIEN'),
  'G. no aplica a BIEN');

const coordinacionPrevia = getEtapaMeta(ETAPAS.COORDINACION_CM);
ok(coordinacionPrevia?.submoduloCodigo === 'COORDINACION_CM'
  && coordinacionPrevia?.responsableCodigo === 'COORDINADOR_CM'
  && mapEtapaDestinoBD(ETAPAS.COORDINACION_CM) === 'ACTOS_PREPARATORIOS',
'H. COORDINACION_CM pre-invitación permanece intacta');
ok(mapEtapaDestinoBD(etapa) === 'EN_EJECUCION'
  && mapEtapaDestinoBD(etapa) !== 'ACTOS_PREPARATORIOS',
'I. nueva etapa usa mapping legacy neutro de ejecución');

const responsablePersona = resolverResponsableSincero({
  usuarioDestinoId: 987654,
  unidadDestino: transServicio?.responsable_destino,
  etapaCodigo: etapa,
});
ok(transServicio?.responsable_destino === 'COORDINADOR_CM'
  && responsablePersona.responsableTipo === 'PERSONA'
  && responsablePersona.responsableUsuarioId === 987654
  && /usuarioDestinoId/.test(transicionSource),
'J. transición admite responsable PERSONA seleccionado explícitamente');

const visual = getEstadoCatalogEntry(etapa);
ok(visual.label === 'Revisión Coordinador CM'
  && visual.categoria === 'EN_PROCESO'
  && visual.icono !== 'bi-question-circle', 'K. catálogo visual no cae a unknown');

const labels = buildEstadoLabels(etapa);
ok(labels.etapaLabel === 'Revisión Coordinador CM'
  && labels.estadoLabel === 'Revisión Coordinador CM',
'L. Registro de Requerimientos puede resolver el label');

const contrato = buildContratoCanonico({
  requerimiento_id: 1,
  estado_codigo: etapa,
  estado_label: 'Revisión Coordinador CM',
  etapa_codigo: etapa,
  etapa_label: 'Revisión Coordinador CM',
  responsable_tipo: 'PERSONA',
  responsable_usuario_id: 987654,
});
ok(contrato.etapaLabel === 'Revisión Coordinador CM'
  && etapaEsPostCcp({ etapaCodigo: etapa }), 'M. Registro de Órdenes conserva visibilidad y label');
ok(meta?.submoduloCodigo === 'PRESENTACION_ENTREGABLES'
  && meta?.submoduloLabel === 'Presentación de Entregables'
  && contrato.etapaCodigo === etapa, 'N. Presentación Entregables mantiene el expediente visible');

ok(await snapshotOs1105() === os1105Before, 'O. OS 1105 permanece intacta');
ok(await snapshotBienes() === bienesBefore, 'P. Recepción de Bienes permanece intacta');

await pool.end();
console.log(`\n=== Resultado RC8.15.6C-1: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
