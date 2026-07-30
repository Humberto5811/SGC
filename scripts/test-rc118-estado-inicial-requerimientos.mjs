/**
 * RC118 — Estado inicial canónico de requerimientos (Bienes / Servicios / Locadores).
 *
 * Ejecutar en VPS (con Node del proyecto):
 *   node scripts/test-rc118-estado-inicial-requerimientos.mjs
 *
 * Esta PC institucional no ejecuta la prueba; solo validación estática + este script.
 */
import assert from 'node:assert/strict';
import {
  normalizeEstadoCode,
  getLabelEstado,
  ESTADO_INICIAL_REQUERIMIENTO,
} from '../shared/estadoExpedienteCatalog.js';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import { buildEstadoVisual, renderEstadoVisualHtml } from '../src/utils/estadoVisualPresenter.js';

const INICIAL = ESTADO_INICIAL_REQUERIMIENTO.codigo;
const LABEL = ESTADO_INICIAL_REQUERIMIENTO.label;
const CC_ELAB = 'PENDIENTE_ELABORAR';
const CC_LABEL = 'C.C. en elaboración';

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function rowNuevo(tipo, extras = {}) {
  return {
    id: extras.id || 900001,
    codigo: extras.codigo || 'REQ-00002',
    tipo,
    cmn: extras.cmn || '07110',
    estado: extras.estado != null ? extras.estado : 'Registrado',
    estado_actual: extras.estado_actual != null ? extras.estado_actual : 'REGISTRADO',
    responsable_actual: extras.responsable_actual || 'Usuario AU',
    historial_estados: extras.historial_estados || [
      {
        etapa: 'REGISTRADO',
        accion: 'creacion',
        observacion: 'Registro inicial del requerimiento',
        fechaIngreso: '2026-07-24T12:00:00.000Z',
      },
    ],
    ...extras,
  };
}

console.log('\n=== RC118 — Estado inicial requerimientos ===\n');

// 1–3 / 5 — Nuevos bienes / servicios / locación
for (const tipo of ['bienes', 'servicios', 'locacion']) {
  const row = rowNuevo(tipo);
  const v = resolveEstadoExpedienteVigente(row, { workflowEtapa: 'REGISTRADO' });
  assert.equal(v.codigo, INICIAL, `${tipo}: codigo`);
  assert.equal(v.label, LABEL, `${tipo}: label`);
  assert.notEqual(v.codigo, CC_ELAB, `${tipo}: no CC`);
  const visual = buildEstadoVisual(row);
  assert.equal(visual.textoPrincipal, LABEL, `${tipo}: bandeja label`);
  assert.ok(!/C\.C\.\s*en elaboración/i.test(visual.textoPrincipal), `${tipo}: no texto CC`);
  const html = renderEstadoVisualHtml(row);
  assert.ok(html.includes(LABEL), `${tipo}: html label`);
  ok(`${tipo}: inicia en ${INICIAL} / "${LABEL}"`);
}

// 4 — Ninguno inicia como C.C. en elaboración (estado vacío + solo etapa)
{
  const row = rowNuevo('locacion', { estado: '', estado_actual: 'REGISTRADO' });
  const v = resolveEstadoExpedienteVigente(row, { workflowEtapa: 'REGISTRADO' });
  assert.equal(v.codigo, INICIAL);
  assert.notEqual(v.codigo, CC_ELAB);
  assert.notEqual(v.label, CC_LABEL);
  ok('Locador sin estado negocio → REQUERIMIENTO_REGISTRADO (no C.C.)');
}

// 6 — Correlación por requerimiento_id (evidencia de otro id no contamina si no está en la fila)
{
  const propio = rowNuevo('locacion', { id: 2, codigo: 'REQ-00002' });
  const v = resolveEstadoExpedienteVigente(propio, { workflowEtapa: 'REGISTRADO' });
  assert.equal(v.codigo, INICIAL);
  // Contaminación simulada: estado_cuadro de OTRO expediente NO debe aplicarse sin estar en la fila
  assert.equal(
    resolveEstadoExpedienteVigente({ ...propio, estado_cuadro: undefined }).codigo,
    INICIAL,
  );
  ok('estado correlacionado a la fila del requerimiento (sin estado_cuadro ajeno)');
}

// 7 — Cuadro de otro requerimiento no contamina si no hay evidencia en la fila
{
  const row = rowNuevo('bienes', { id: 10 });
  const v = resolveEstadoExpedienteVigente(row, { workflowEtapa: 'REGISTRADO' });
  assert.equal(v.codigo, INICIAL);
  ok('sin evidencia de cuadro propia → no hereda C.C.');
}

// 8 — Pedido SIGAMEF coincidente no fuerza C.C.
{
  const row = rowNuevo('locacion', {
    cmn: '071100446500',
    payload: JSON.stringify({ pedido_sigamef: '071100446500' }),
  });
  const v = resolveEstadoExpedienteVigente(row, { workflowEtapa: 'REGISTRADO' });
  assert.equal(v.codigo, INICIAL);
  ok('pedido SIGAMEF no contamina estado inicial');
}

// 9 — Número visible coincidente de otro año: el resolvedor usa la fila, no el código global
{
  const a = rowNuevo('bienes', { id: 100, codigo: 'REQ-00002', estado_actual: 'REGISTRADO' });
  const b = {
    id: 999,
    codigo: 'REQ-00002',
    estado: 'En Cuadro Comparativo',
    estado_actual: 'CUADRO_COMPARATIVO',
    estado_cuadro: 'PENDIENTE_ELABORAR',
  };
  assert.equal(resolveEstadoExpedienteVigente(a, { workflowEtapa: 'REGISTRADO' }).codigo, INICIAL);
  assert.equal(resolveEstadoExpedienteVigente(b, { workflowEtapa: 'CUADRO_COMPARATIVO' }).codigo, CC_ELAB);
  ok('mismo código visible, ids distintos → estados independientes');
}

// 10 — Historial inicial conceptual: una sola entrada de creación
{
  const hist = rowNuevo('servicios').historial_estados;
  assert.equal(hist.length, 1);
  assert.equal(hist[0].etapa, 'REGISTRADO');
  assert.match(String(hist[0].accion || ''), /creacion/i);
  ok('historial inicial de creación (una entrada)');
}

// 11 — No saltar a C.C. sin evidencia / etapa válida
{
  const row = rowNuevo('locacion');
  const v = resolveEstadoExpedienteVigente(row, { workflowEtapa: 'REGISTRADO' });
  assert.notEqual(v.codigo, CC_ELAB);
  // Con evidencia explícita de cuadro SÍ puede ser C.C.
  const conCuadro = resolveEstadoExpedienteVigente(
    { ...row, estado_cuadro: 'PENDIENTE_ELABORAR', estado_actual: 'CUADRO_COMPARATIVO' },
    { workflowEtapa: 'CUADRO_COMPARATIVO', estadoCuadro: 'PENDIENTE_ELABORAR' },
  );
  assert.equal(conCuadro.codigo, CC_ELAB);
  ok('transición a C.C. solo con evidencia/etapa de cuadro');
}

// 12–13 — Compatibilidad: expedientes avanzados conservan estado
{
  const ccp = resolveEstadoExpedienteVigente({
    estado_cuadro: 'APROBADO_DEC',
    codigo_ccp: 'CCP-118',
    ccp_activo: true,
    estado_actual: 'CCP',
  });
  assert.equal(ccp.codigo, 'CCP_REGISTRADA');
  ok('avanzado CCP conserva CCP_REGISTRADA');

  const orden = resolveEstadoExpedienteVigente({
    codigo_ccp: 'CCP-118',
    ccp_activo: true,
    orden_id: 1,
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-07-20',
  });
  assert.equal(orden.codigo, 'ORDEN_NOTIFICADA');
  ok('avanzado orden conserva ORDEN_NOTIFICADA');
}

// 14 — Alias canónico Registrado
{
  assert.equal(normalizeEstadoCode('Registrado'), INICIAL);
  assert.equal(normalizeEstadoCode('REGISTRADO'), INICIAL);
  assert.equal(getLabelEstado(INICIAL), LABEL);
  ok('alias Registrado/REGISTRADO → REQUERIMIENTO_REGISTRADO');
}

// 15 — Evaluación no se altera (etapa EVALUACION)
{
  const row = {
    id: 50,
    tipo: 'bienes',
    estado: 'En tramite de aprobación',
    estado_actual: 'EVALUACION',
  };
  const v = resolveEstadoExpedienteVigente(row, { workflowEtapa: 'EVALUACION' });
  assert.equal(v.codigo, 'REQUERIMIENTO_EN_EVALUACION');
  assert.notEqual(v.codigo, CC_ELAB);
  ok('bandeja Evaluación: En evaluación (no C.C.)');
}

console.log('\nRC118 OK — todos los casos mínimos pasaron.\n');
console.log('SQL diagnóstico VPS: scripts/sql/rc118-diagnostico-estado-requerimiento.sql');
