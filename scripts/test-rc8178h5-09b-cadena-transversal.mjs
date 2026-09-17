/**
 * RC8.17.8H5-09B — Cadena transversal Programación → CM → obs/subs → Invitaciones + histórico ERV.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { derivarActos } from '../server/lib/actosPreparatorios.js';
import { listarBandejaActos } from '../server/lib/actosPreparatorios.js';
import { listarBandejaProgramacion } from '../server/lib/programacionBandeja.js';
import { listarBandejaInvitaciones } from '../server/lib/invitacionesBandeja.js';
import { registrarSubsanacionDerivacion } from '../server/lib/trazabilidad.js';
import { getExpedienteContratoUnificado } from '../server/lib/expedienteContratoLectura.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';
import { listarUsuariosDestinoEquipoUadOrganizacional } from '../server/lib/equiposUadUsuario.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H5-09B — Cadena transversal ERV ===\n');

console.log('H — Matriz tramo común REGISTRO → PROGRAMACION');
for (const [orig, ev, dest] of [
  ['REGISTRO', 'REQUERIMIENTO_ENVIADO_EVALUACION', 'EVALUACION'],
  ['EVALUACION', 'EVALUACION_APROBADA', 'DEC'],
  ['DEC', 'DEC_APROBADO', 'PROGRAMACION'],
  ['PROGRAMACION', 'PROGRAMACION_APROBADA', 'COORDINACION_CM'],
  ['COORDINACION_CM', 'COORDINACION_CM_APROBADA', 'INVITACIONES'],
]) {
  const t = getTransition({ tipoContratacion: 'BIEN', etapaOrigen: orig, eventoCodigo: ev });
  ok(t?.etapa_destino === dest, `${ev}: ${orig} → ${dest}`);
}

await runMigrations({ silent: true });

const { rows: uCoord } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE AND UPPER(COALESCE(equipo_uad,'')) = 'CONT_MENORES' ORDER BY id LIMIT 1`,
);
const { rows: uAu } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE AND id <> $1 ORDER BY id LIMIT 1 OFFSET 2`,
  [uCoord[0]?.id || 0],
);
const poolCm = await listarUsuariosDestinoEquipoUadOrganizacional({ equipoCodigo: EQUIPOS_UAD.CONT_MENORES });
const analistaCand = (poolCm.usuarios || []).find((u) => Number(u.id) !== Number(uCoord[0]?.id));

const coordId = uCoord[0]?.id || 20;
const auId = uAu[0]?.id || 65;
const analistaId = analistaCand?.id || coordId;

let tempRid = null;
try {
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES (
      'bienes', $1, 'T0001', 'Test H5-09B cadena', 'Test', 'CNCC',
      'Registrado', 'REGISTRO', '{"observaciones":[]}'::jsonb
    )
    RETURNING id
  `, [`REQ-TEST-H5-09B-${Date.now()}`]);
  tempRid = ins.rows[0].id;
  const ts = Date.now();

  const trans = async (evento, uid, extra = {}) => {
    await transicionarExpediente({
      requerimientoId: tempRid,
      evento,
      usuarioDestinoId: uid,
      metadata: {
        client_request_id: `test-h5-09b:${evento}:${tempRid}:${ts}`,
        via: 'test-rc8178h5-09b',
        ...extra,
      },
      actorRol: 'test-h5-09b',
    });
  };

  await trans('REQUERIMIENTO_ENVIADO_EVALUACION', auId);
  await trans('EVALUACION_APROBADA', coordId);
  await trans('DEC_APROBADO', coordId);

  console.log('\nA — PROGRAMACION_APROBADA → COORDINACION_CM');
  await trans('PROGRAMACION_APROBADA', coordId);
  let erv = (await query(
    'SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [tempRid],
  )).rows[0];
  ok(erv.etapa_codigo === 'COORDINACION_CM', 'A1 ERV etapa COORDINACION_CM');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'A2 ERV EN_TRAMITE');
  ok(erv.responsable_tipo === 'PERSONA' && Number(erv.responsable_usuario_id) === coordId, 'A3 responsable coordinador');

  console.log('\nB — Observación CM → REGISTRO');
  const obsId = `obs_h5_09b_${tempRid}`;
  const payload = {
    observaciones: [{
      id: obsId,
      estado: 'RECIBIDA',
      cerrada: false,
      origen_submodulo: 'Coordinación CM',
      destino_submodulo: 'Registro de Requerimiento',
      usuario_origen_id: coordId,
      usuario_destino_id: auId,
    }],
  };
  await query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [tempRid, JSON.stringify(payload)]);
  await transicionarExpediente({
    requerimientoId: tempRid,
    evento: 'COORDINACION_CM_OBSERVADA',
    usuarioDestinoId: auId,
    metadata: {
      client_request_id: `test-h5-09b:cm-obs:${tempRid}:${ts}`,
      etapa_destino: 'REGISTRO',
      observacion_id: obsId,
      via: 'test-rc8178h5-09b',
    },
    actorRol: 'test-h5-09b',
  });
  erv = (await query(
    'SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [tempRid],
  )).rows[0];
  ok(erv.etapa_codigo === 'REGISTRO', 'B1 ERV REGISTRO');
  ok(erv.estado_codigo === 'OBSERVADO', 'B2 ERV OBSERVADO');
  ok(Number(erv.responsable_usuario_id) === auId, 'B3 responsable AU');

  console.log('\nC — Subsanación → COORDINACION_CM (emisor)');
  await registrarSubsanacionDerivacion({
    requerimientoId: tempRid,
    usuario: String(auId),
    textoSubsanacion: 'Subsanación test H5-09B',
    origenSubmodulo: 'Registro de Requerimiento',
    destinoSubmodulo: 'Coordinación CM',
    destinoPersona: String(coordId),
    observacionId: obsId,
    usuarioDestinoId: coordId,
  });
  erv = (await query(
    'SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [tempRid],
  )).rows[0];
  ok(erv.etapa_codigo === 'COORDINACION_CM', 'C1 ERV COORDINACION_CM');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'C2 ERV EN_TRAMITE');
  ok(Number(erv.responsable_usuario_id) === coordId, 'C3 responsable emisor CM');

  console.log('\nD — Derivar CM → INVITACIONES (analista)');
  ok(analistaCand != null, 'D0 analista elegible en pool CONT_MENORES');
  const crqDerive = `actos-derivar:cm-invitaciones:${tempRid}`;
  await derivarActos(tempRid, {
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    destino_persona: String(analistaId),
    destino_submodulo: 'Invitaciones',
    usuario: 'test-h5-09b',
  });
  erv = (await query(
    'SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [tempRid],
  )).rows[0];
  ok(erv.etapa_codigo === 'INVITACIONES', 'D1 ERV INVITACIONES');
  ok(erv.estado_codigo === 'EN_TRAMITE', 'D2 ERV EN_TRAMITE');
  ok(Number(erv.responsable_usuario_id) === analistaId, 'D3 responsable analista');

  console.log('\nE — Histórico bandejas + mismo ERV');
  const q = { q: String(tempRid) };
  const exp = await getExpedienteContratoUnificado(tempRid);
  const etapaActual = exp.etapa?.codigo;
  const estadoActual = exp.estado?.codigo;
  ok(etapaActual === 'INVITACIONES' && estadoActual === 'EN_TRAMITE', 'E0 ERV unificado Invitaciones/En trámite');

  const cmRows = (await listarBandejaActos(1, 50, q)).data || [];
  const progRows = (await listarBandejaProgramacion(1, 50, q)).data || [];
  const invRows = (await listarBandejaInvitaciones(1, 50, q)).data || [];
  ok(cmRows.some((r) => Number(r.id) === tempRid), 'E1 visible bandeja Coordinación CM (histórico)');
  ok(progRows.some((r) => Number(r.id) === tempRid), 'E2 visible bandeja Programación (histórico)');
  ok(invRows.some((r) => Number(r.id) === tempRid), 'E3 visible bandeja Invitaciones');

  const sameErv = (row) => {
    const ec = String(row?.etapa_codigo || row?.expediente_estado_vigente?.etapa_codigo || row?.estado_actual || '').toUpperCase();
    return ec === 'INVITACIONES' || ec === 'INVITACIONES';
  };
  ok(cmRows.filter((r) => Number(r.id) === tempRid).every(sameErv), 'E4 CM muestra etapa actual Invitaciones');
  ok(progRows.filter((r) => Number(r.id) === tempRid).every(sameErv), 'E5 Programación muestra etapa actual');
  ok(invRows.filter((r) => Number(r.id) === tempRid).every(sameErv), 'E6 Invitaciones muestra etapa actual');

  console.log('\nF — CONT_MENORES nunca etapa ERV');
  const { rows: badErv } = await query(
    `SELECT 1 FROM expediente_estado_vigente WHERE requerimiento_id = $1 AND UPPER(etapa_codigo) = 'CONT_MENORES'`,
    [tempRid],
  );
  ok(badErv.length === 0, 'F1 sin CONT_MENORES en ERV');

  console.log('\nG — Idempotencia doble derivar (ASIGNADA I→I)');
  const nEvBefore = (await query(
    'SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE expediente_id = $1 AND evento_codigo = $2',
    [tempRid, 'COORDINACION_CM_ASIGNADA'],
  )).rows[0].n;
  await derivarActos(tempRid, {
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    destino_persona: String(analistaId),
    destino_submodulo: 'Invitaciones',
    usuario: 'test-h5-09b',
  });
  const nEvAfter = (await query(
    'SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE expediente_id = $1 AND evento_codigo = $2',
    [tempRid, 'COORDINACION_CM_ASIGNADA'],
  )).rows[0].n;
  ok(nEvAfter === nEvBefore + 1, 'G1 primer ASIGNADA registrado');
  await derivarActos(tempRid, {
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    destino_persona: String(analistaId),
    destino_submodulo: 'Invitaciones',
    usuario: 'test-h5-09b',
  });
  const nEvDup = (await query(
    'SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE expediente_id = $1 AND evento_codigo = $2',
    [tempRid, 'COORDINACION_CM_ASIGNADA'],
  )).rows[0].n;
  ok(nEvDup === nEvAfter, 'G2 doble clic mismo analista no duplica ASIGNADA');

  void crqDerive;
} finally {
  if (tempRid != null) {
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [tempRid]);
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [tempRid]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [tempRid]);
    await query('DELETE FROM requerimientos WHERE id = $1', [tempRid]);
  }
}

console.log('\n=== RC8.17.8H5-09B OK ===\n');
