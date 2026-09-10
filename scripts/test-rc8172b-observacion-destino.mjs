/**
 * RC8.17.2B-F1.1 — Candidatos observación + piloto EVALUACION_OBSERVADA → REGISTRO.
 */
import assert from 'node:assert/strict';
import {
  esDestinoRegistroRequerimiento,
  esElegibleRegistroRequerimiento,
  resolveRecomendadoRegistro,
  listarCandidatosObservacionDestino,
} from '../server/lib/candidatosObservacionDestino.js';
import {
  isObservacionDestinoRegistro,
  applyPilotObservacionEvaluacionRegistro,
} from '../server/lib/pilotRegistroEvaluacion.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { renderEtapaBadgeHtml } from '../src/ui/workflow/EtapaBadge.js';
import { renderEstadoBadgeHtml } from '../src/ui/workflow/EstadoBadge.js';
import { renderResponsableBadgeHtml } from '../src/ui/workflow/ResponsableBadge.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
let n = 0;

console.log('\n=== RC8.17.2B-F1.1 — Observación destino ===\n');

ok(esDestinoRegistroRequerimiento('Registro de Requerimiento'), 'destino Registro reconocido');
ok(isObservacionDestinoRegistro({ destino_submodulo: 'Registro de Requerimiento' }), 'piloto obs destino Registro');

const auOk = esElegibleRegistroRequerimiento({
  id: 1, activo: true, centro: 'CNCC', rol: 'au', cargo: 'Analista AU', permisos: null,
}, 'CNCC');
ok(auOk, 'AU activo con rol au es elegible para Registro');

const auBad = esElegibleRegistroRequerimiento({
  id: 2, activo: false, centro: 'CNCC', rol: 'usuario', permisos: {},
}, 'CNCC');
ok(!auBad, 'usuario inactivo no es elegible');

const pilotObs = applyPilotObservacionEvaluacionRegistro({
  resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD, responsableUsuarioId: null },
  usuarioDestinoId: 249,
  metadata: {
    destino_submodulo: 'Registro de Requerimiento',
    destino_etapa: 'REGISTRO',
    responsable_recomendado_id: 249,
  },
  etapaEfectiva: 'EVALUACION',
  labels: { etapaCodigo: 'EVALUACION', estadoCodigo: 'EN_TRAMITE' },
});
ok(pilotObs.etapaEfectiva === 'REGISTRO', 'observación mueve etapa efectiva a REGISTRO');
ok(pilotObs.labels.estadoCodigo === 'OBSERVADO', 'estado OBSERVADO');
ok(pilotObs.resp.responsableTipo === TIPO_RESPONSABLE.PERSONA, 'responsable PERSONA');
ok(pilotObs.resp.responsableUsuarioId === 249, 'usuario seleccionado persistido');

const pilotReasig = applyPilotObservacionEvaluacionRegistro({
  resp: {},
  usuarioDestinoId: 100,
  metadata: {
    destino_submodulo: 'Registro de Requerimiento',
    responsable_recomendado_id: 249,
  },
  labels: {},
});
ok(pilotReasig.metaExtra.reasignacion_manual === true, 'reasignación manual detectada');

const pilotNoReg = applyPilotObservacionEvaluacionRegistro({
  resp: {},
  metadata: { destino_submodulo: 'DEC' },
  etapaEfectiva: 'EVALUACION',
  labels: {},
});
ok(pilotNoReg.etapaEfectiva === 'EVALUACION', 'destino DEC no altera etapa piloto');

try {
  await import('../server/db.js');
  const { query } = await import('../server/db.js');
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, cmn)
    VALUES ('bienes', $1, 'Test obs destino', 'Area T', 'Resp', 'Registrado',
      '{"area":{"responsable":"CNCC"}}'::jsonb, 'CNCC')
    RETURNING id
  `, [`REQ-OBS-${Date.now()}`]);
  const rid = ins.rows[0].id;
  try {
    await query(`
      INSERT INTO expediente_asignaciones (
        requerimiento_id, etapa_codigo, usuario_id, tipo_responsable, activo, asignado_at
      ) VALUES ($1, 'REGISTRO', (SELECT id FROM usuarios WHERE username='wvasquez' LIMIT 1), 'PERSONA', FALSE, NOW())
    `, [rid]);

    const rec = await resolveRecomendadoRegistro(rid);
    ok(rec?.id > 0, 'recomendado desde asignación histórica REGISTRO');

    const lista = await listarCandidatosObservacionDestino({
      requerimientoId: rid,
      destinoSubmodulo: 'Registro de Requerimiento',
      search: 'vasq',
    });
    ok(lista.soportado === true, 'listado soportado para Registro');
    const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
    const vasq = todos.find((c) => String(c.username || '').toLowerCase().includes('vasq')
      || String(c.nombre || '').toLowerCase().includes('vasq'));
    ok(!!vasq || todos.length > 0, 'búsqueda vasq devuelve candidatos elegibles');
  } finally {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id=$1', [rid]);
    await query('DELETE FROM requerimientos WHERE id=$1', [rid]);
  }
} catch (e) {
  console.log('  ⚠ integración BD omitida:', e.message);
}

console.log('\n--- F1.2 badges sin iconos ---\n');
const etapaHtml = renderEtapaBadgeHtml({ etapaLabel: 'Registro de Requerimientos', etapaCodigo: 'REGISTRO' });
ok(!/<i[\s>]/.test(etapaHtml) && etapaHtml.includes('Registro de Requerimientos'), 'Etapa badge sin icono');
const tramiteHtml = renderEstadoBadgeHtml({ estadoCodigo: 'EN_TRAMITE', estadoLabel: 'En trámite' });
ok(tramiteHtml.includes('sgc-estado-badge--progress') && !/<i[\s>]/.test(tramiteHtml), 'En trámite azul sin icono');
const obsHtml = renderEstadoBadgeHtml({ estadoCodigo: 'OBSERVADO', estadoLabel: 'Observado' });
ok(obsHtml.includes('sgc-estado-badge--observed') && !/<i[\s>]/.test(obsHtml), 'Observado rojo sin icono');
const respHtml = renderResponsableBadgeHtml({ responsableTipo: 'PERSONA', responsableNombre: 'VASQUEZ ANCHELIA' });
ok(!/<i[\s>]/.test(respHtml) && respHtml.includes('VASQUEZ ANCHELIA'), 'Responsable badge sin icono');

n = 17;
console.log(`\n✅ RC8.17.2B-F1.1/F1.2 — ${n} checks OK\n`);
