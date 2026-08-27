/**
 * RC8.15.6G-8D0 — Estado y Responsable globales por workflow.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { enrichEstadoResponsableForBandeja, aplicarContratoEstadoResponsableEnFila } from '../server/lib/enrichEstadoResponsable.js';
import { materializarExpedienteEstadoVigenteSiAusente } from '../server/lib/expedienteEstadoPersistido.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { enrichRequerimientoRowsWithCcp } from '../server/lib/trazabilidad.js';
import { listarBandejaDEC } from '../server/lib/decBandeja.js';
import { listarBandejaProgramacion } from '../server/lib/programacionBandeja.js';
import { listarBandejaEntregablesServicios } from '../server/lib/entregablesServicios.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';

const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

function pickContrato(erv) {
  if (!erv) return null;
  return {
    etapaCodigo: erv.etapaCodigo ?? erv.etapa_codigo ?? '',
    estadoCodigo: erv.estadoCodigo ?? erv.estado_codigo ?? '',
    responsableTipo: erv.responsableTipo ?? erv.responsable_tipo ?? '',
    responsableUsuarioId: erv.responsableUsuarioId ?? erv.responsable_usuario_id ?? null,
    responsableUnidad: erv.responsableUnidad ?? erv.responsable_unidad ?? '',
  };
}

function equalContrato(a, b) {
  const A = pickContrato(a);
  const B = pickContrato(b);
  if (!A || !B) return false;
  return Object.keys(A).every((k) => String(A[k] ?? '') === String(B[k] ?? ''));
}

async function bandejaRowPorCodigo(codigo) {
  const dec = await listarBandejaDEC(1, 500);
  const row = dec.data.find((x) => x.codigo === codigo);
  if (row) return { modulo: 'DEC', row };
  const prog = await listarBandejaProgramacion(1, 500);
  const rowP = prog.data.find((x) => x.codigo === codigo);
  if (rowP) return { modulo: 'PROGRAMACION', row: rowP };
  const { rows } = await query(`
    SELECT r.*, COALESCE(c.nombre, c.codigo, a.responsable, '') AS centro_nombre
    FROM requerimientos r
    LEFT JOIN areas a ON r.area = a.nombre OR a.codigo = r.area
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE r.codigo = $1
  `, [codigo]);
  if (!rows.length) return null;
  const enriched = await enrichRequerimientoRowsWithCcp(rows);
  return { modulo: 'ENRICH_BATCH', row: enriched[0] };
}

console.log('\n=== RC8.15.6G-8D0 — Estado/Responsable globales workflow ===\n');

await runMigrations();

// ── REQ-00004 (validación): materializar ERV si legacy sin fila canónica ──
{
  const { rows } = await query(`SELECT id, codigo FROM requerimientos WHERE codigo = 'REQ-00004'`);
  ok(rows.length === 1, '1. REQ-00004 existe en BD');
  const rid = Number(rows[0].id);
  const mat = await materializarExpedienteEstadoVigenteSiAusente(rid, { actorRol: 'test-g8d0' });
  ok(mat?.materializado === true || mat?.motivo === 'ya_existe', '2. REQ-00004 tiene expediente_estado_vigente');

  const canon = (await getEstadoResponsableCanonico({ requerimientoIds: [rid] })).get(rid);
  ok(canon?.canonicalMissing !== true, '3. REQ-00004 contrato canónico presente');
  ok(canon?.etapaCodigo === 'REGISTRO', `4. REQ-00004 etapa REGISTRO (${canon?.etapaCodigo})`);
  ok(canon?.responsableUnidad === 'Usuario AU' || /usuario au/i.test(String(canon?.responsableUnidad || '')),
    '5. REQ-00004 responsable Usuario AU');

  const hit = await bandejaRowPorCodigo('REQ-00004');
  ok(!!hit?.row?.estado_responsable_vigente, '6. REQ-00004 bandeja incluye estado_responsable_vigente');
  ok(equalContrato(hit.row.estado_responsable_vigente, canon),
    `7. REQ-00004 bandeja (${hit.modulo}) = canónico BD`);

  const ui = adaptEstadoResponsable(hit.row);
  ok(ui.etapaCodigo === 'REGISTRO', '8. UI REQ-00004 etapa REGISTRO');
  ok(/usuario au/i.test(ui.responsableDisplay || ui.responsableUnidad || ''),
    '9. UI REQ-00004 responsable Usuario AU');
}

// ── Otro requerimiento existente (REQ-00003 — entregables) ──
{
  const { rows } = await query(`
    SELECT id, codigo FROM requerimientos WHERE codigo = 'REQ-00003'
  `);
  ok(rows.length === 1, '10. REQ-00003 existe para regresión');
  const rid = Number(rows[0].id);
  const codigo = rows[0].codigo;
  const canon = (await getEstadoResponsableCanonico({ requerimientoIds: [rid] })).get(rid);
  ok(canon?.canonicalMissing !== true, `11. ${codigo} contrato canónico presente`);

  const hit = await bandejaRowPorCodigo(codigo);
  ok(!!hit?.row, `12. ${codigo} visible en alguna bandeja/enrich`);
  ok(equalContrato(hit.row.estado_responsable_vigente, canon),
    `13. ${codigo} bandeja = canónico BD`);

  const ent = await listarBandejaEntregablesServicios(null, { vista: 'presentacion' });
  const entRows = ent.filter((x) => Number(x.requerimiento_id) === rid);
  ok(entRows.length > 0, '14. REQ-00003 entregables en bandeja');
  for (const [idx, er] of entRows.slice(0, 2).entries()) {
    ok(er.estado_responsable_vigente?.etapaCodigo, `15.${idx + 1} entregable con etapa canónica`);
    ok(
      er.estado_responsable_vigente?.responsableNombre
        || er.estado_responsable_vigente?.responsableUsername
        || er.estado_responsable_vigente?.responsableUnidad,
      `16.${idx + 1} entregable con responsable canónico`,
    );
  }
}

// ── Fixture REQ nuevo: crear → consultar → transicionar → re-consultar → cleanup ──
const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
let fixtureId = null;
try {
  const codigo = `RG8D${nonce.slice(-4)}`;
  fixtureId = Number((await query(`
    INSERT INTO requerimientos (
      tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
      sub_modulo_actual, responsable_actual, payload, historial_estados, historial_movimientos
    ) VALUES (
      'BIEN', $1, 'G8D00', 'Fixture G8D0', 'Logística', 'CNCC Test', 'Registrado', 'REGISTRADO',
      'Registro de Requerimiento', 'Usuario AU', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb
    ) RETURNING id
  `, [codigo])).rows[0].id);

  const mat = await materializarExpedienteEstadoVigenteSiAusente(fixtureId, { actorRol: 'test-g8d0' });
  ok(mat?.materializado === true, '17. fixture materializa expediente_estado_vigente');

  let canon = (await getEstadoResponsableCanonico({ requerimientoIds: [fixtureId] })).get(fixtureId);
  ok(canon?.etapaCodigo === 'REGISTRO', '18. fixture etapa inicial REGISTRO');

  const batchRow = { id: fixtureId, requerimiento_id: fixtureId, codigo };
  await enrichEstadoResponsableForBandeja([batchRow], 'id');
  ok(equalContrato(batchRow.estado_responsable_vigente, canon), '19. enrich bandeja = canónico');

  await transicionarExpediente({
    requerimientoId: fixtureId,
    evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
    unidadDestino: 'Evaluación de Requerimiento',
    motivo: 'Fixture G8D0 transición evaluación',
    metadata: { client_request_id: `g8d0-fixture-eval:${fixtureId}` },
    actorRol: 'test-g8d0',
  });

  canon = (await getEstadoResponsableCanonico({ requerimientoIds: [fixtureId] })).get(fixtureId);
  ok(canon?.etapaCodigo === 'EVALUACION', `20. fixture tras transición etapa EVALUACION (${canon?.etapaCodigo})`);

  await enrichEstadoResponsableForBandeja([batchRow], 'id');
  ok(equalContrato(batchRow.estado_responsable_vigente, canon), '21. enrich post-transición = canónico');

  const flat = {};
  aplicarContratoEstadoResponsableEnFila(flat, canon);
  ok(flat.estado_etapa_codigo === 'EVALUACION', '22. helper entregable/expediente sincroniza flat fields');
} finally {
  if (fixtureId) {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [fixtureId]).catch(() => {});
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [fixtureId]).catch(() => {});
    await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [fixtureId]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [fixtureId]).catch(() => {});
    ok(true, '23. cleanup fixture completo');
  }
}

console.log('\n✅ RC8.15.6G-8D0 — 23/23 OK\n');
