/**
 * RC8.17.8H6-C3-A2 — Reconciliador ERV post COTIZACION_PRESENTADA (legacy).
 *
 * ADVERTENCIA OPERATIVA:
 * - Sin --apply: solo lectura (SELECT); no modifica workflow ni tablas.
 * - Con --apply: dispara transicionarExpediente(COTIZACION_PRESENTADA) por candidato.
 * - Ejecutar en el servidor/entorno cuya BD se desea reconciliar.
 *
 * Uso:
 *   node scripts/reconcile-rc8178h6-c3a-erv-post-cotizacion.mjs
 *   node scripts/reconcile-rc8178h6-c3a-erv-post-cotizacion.mjs --apply
 *
 * Prohibido: runMigrations, UPDATE/INSERT/DELETE directos (salvo vía transicionarExpediente en --apply).
 */
import pool, { query } from '../server/db.js';
import { resolveAnalistaInvitacionesPrevio, parseErvMetadata } from '../server/lib/consultasExpedienteEstado.js';
import { ESTADO_PILOT_EN_TRAMITE } from '../server/lib/pilotRegistroEvaluacion.js';

const APPLY = process.argv.includes('--apply');
const ETAPA_RC = 'RECEPCION_COTIZACIONES';

const CANDIDATES_SQL = `
  SELECT DISTINCT ON (eev.requerimiento_id)
    eev.requerimiento_id,
    r.codigo,
    eev.etapa_codigo,
    eev.estado_codigo,
    eev.estado_label,
    eev.etapa_label,
    eev.responsable_tipo,
    eev.responsable_usuario_id,
    eev.responsable_unidad,
    eev.metadata_json
  FROM expediente_estado_vigente eev
  INNER JOIN requerimientos r ON r.id = eev.requerimiento_id
  WHERE eev.requerimiento_id IN (
    SELECT DISTINCT COALESCE(cot.requerimiento_id, sr.requerimiento_id)::int
    FROM cotizaciones_proveedor cot
    LEFT JOIN solicitud_requerimientos sr ON sr.solicitud_id = cot.solicitud_id
    WHERE UPPER(TRIM(COALESCE(cot.estado, ''))) = 'COTIZACION_PRESENTADA'
      AND COALESCE(cot.requerimiento_id, sr.requerimiento_id) IS NOT NULL
  )
    AND UPPER(TRIM(COALESCE(eev.etapa_codigo, ''))) = 'RECEPCION_COTIZACIONES'
    AND (
      UPPER(TRIM(COALESCE(eev.estado_codigo, ''))) <> 'EN_TRAMITE'
      OR UPPER(TRIM(COALESCE(eev.responsable_tipo, ''))) <> 'PERSONA'
    )
  ORDER BY eev.requerimiento_id, r.codigo
`;

function needsReconciliation(erv) {
  if (!erv) return false;
  if (String(erv.etapa_codigo || '').trim().toUpperCase() !== ETAPA_RC) return false;
  const enTramite = String(erv.estado_codigo || '').trim().toUpperCase() === ESTADO_PILOT_EN_TRAMITE;
  const persona = String(erv.responsable_tipo || '').trim().toUpperCase() === 'PERSONA';
  return !(enTramite && persona && erv.responsable_usuario_id != null);
}

function formatResponsable(erv) {
  const tipo = String(erv?.responsable_tipo || '—').trim() || '—';
  const val = erv?.responsable_usuario_id != null
    ? String(erv.responsable_usuario_id)
    : (erv?.responsable_unidad || '—');
  return `${tipo} / ${val}`;
}

function formatNombreUsuario(u) {
  if (!u) return '—';
  const comp = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
  return comp || u.nombre || '—';
}

async function hasUsernameColumn() {
  const { rows } = await query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'username'
    LIMIT 1
  `);
  return rows.length > 0;
}

async function loadUsuarioDisplay(usuarioId, withUsername) {
  if (usuarioId == null || !Number.isFinite(Number(usuarioId))) return null;
  const cols = withUsername
    ? 'id, nombre, apellidos, nombres, username'
    : 'id, nombre, apellidos, nombres';
  const { rows } = await query(
    `SELECT ${cols} FROM usuarios WHERE id = $1 LIMIT 1`,
    [Number(usuarioId)],
  );
  return rows[0] || null;
}

async function fetchErv(requerimientoId) {
  const { rows } = await query(
    `SELECT *
     FROM expediente_estado_vigente
     WHERE requerimiento_id = $1
     LIMIT 1`,
    [requerimientoId],
  );
  return rows[0] || null;
}

async function resolveAnalistaForErv(requerimientoId, ervRow) {
  const ev = ervRow ? { ...ervRow, metadata: parseErvMetadata(ervRow) } : null;
  return resolveAnalistaInvitacionesPrevio(requerimientoId, ev);
}

function printCandidateBlock({
  codigo,
  requerimientoId,
  erv,
  analistaId,
  usuarioRow,
  withUsername,
  actionLabel,
}) {
  console.log(`\n${codigo || '—'} (id=${requerimientoId})`);
  console.log('ACTUAL');
  console.log(`  Etapa: ${erv.etapa_codigo || '—'} (${erv.etapa_label || '—'})`);
  console.log(`  Estado: ${erv.estado_codigo || '—'} (${erv.estado_label || '—'})`);
  console.log(`  Responsable: ${formatResponsable(erv)}`);
  console.log('RESOLUCIÓN');
  if (analistaId == null) {
    console.log('  Analista previo ID: —');
    console.log('  Nombre: —');
    console.log(`  Acción: ${actionLabel} — SKIP (sin analista resoluble)`);
    return;
  }
  console.log(`  Analista previo ID: ${analistaId}`);
  console.log(`  Nombre: ${formatNombreUsuario(usuarioRow)}`);
  if (withUsername && usuarioRow?.username != null && String(usuarioRow.username).trim()) {
    console.log(`  Usuario/login: ${usuarioRow.username}`);
  }
  console.log('PROPUESTO');
  console.log(`  Etapa: ${ETAPA_RC}`);
  console.log(`  Estado: ${ESTADO_PILOT_EN_TRAMITE}`);
  console.log(`  Responsable: PERSONA / ${analistaId}`);
  console.log(`  Acción: ${actionLabel}`);
}

async function applyReconciliation(requerimientoId, codigo, withUsername) {
  const fresh = await fetchErv(requerimientoId);
  if (!fresh) {
    console.log(`  APPLY SKIP — ${codigo}: sin ERV vigente`);
    return { outcome: 'skip_no_erv' };
  }
  if (String(fresh.etapa_codigo || '').trim().toUpperCase() !== ETAPA_RC) {
    console.log(`  APPLY SKIP — ${codigo}: etapa actual ${fresh.etapa_codigo} (ya no ${ETAPA_RC})`);
    return { outcome: 'skip_etapa' };
  }
  if (!needsReconciliation(fresh)) {
    console.log(`  APPLY SKIP — ${codigo}: ya EN_TRAMITE + PERSONA`);
    return { outcome: 'skip_ok' };
  }

  const analistaId = await resolveAnalistaForErv(requerimientoId, fresh);
  if (analistaId == null || !Number.isFinite(Number(analistaId))) {
    console.log(`  APPLY SKIP — ${codigo}: sin analista previo resoluble`);
    return { outcome: 'skip_sin_analista' };
  }

  const { transicionarExpediente } = await import('../server/lib/expedienteTransicion.js');
  await transicionarExpediente({
    requerimientoId,
    evento: 'COTIZACION_PRESENTADA',
    usuarioDestinoId: Number(analistaId),
    metadata: {
      client_request_id: `reconcile-c3a:${requerimientoId}:${Date.now()}`,
      via: 'reconcile-rc8178h6-c3a-erv-post-cotizacion',
      analista_invitaciones_previo_id: Number(analistaId),
    },
    actorRol: 'RECONCILE_C3A',
  });

  const post = await fetchErv(requerimientoId);
  const u = await loadUsuarioDisplay(analistaId, withUsername);
  console.log(`  APPLY OK — ${codigo}: PERSONA(${analistaId}) ${formatNombreUsuario(u)}`);
  if (post) {
    console.log(`    Post: ${post.etapa_codigo}/${post.estado_codigo}/${post.responsable_tipo}/${post.responsable_usuario_id ?? '—'}`);
  }
  return { outcome: 'applied' };
}

async function main() {
  console.log('\n=== RC8.17.8H6-C3-A2 — Reconciliador ERV post cotización ===');
  console.log(`Modo: ${APPLY ? 'APPLY (escritura vía workflow)' : 'DRY-RUN (solo SELECT)'}\n`);

  const withUsername = await hasUsernameColumn();
  const { rows: candidates } = await query(CANDIDATES_SQL);

  let reconciliables = 0;
  let sinAnalista = 0;

  for (const row of candidates) {
    const rid = Number(row.requerimiento_id);
    const erv = row;
    const analistaId = await resolveAnalistaForErv(rid, erv);
    const usuarioRow = analistaId != null
      ? await loadUsuarioDisplay(analistaId, withUsername)
      : null;

    if (analistaId != null) reconciliables += 1;
    else sinAnalista += 1;

    printCandidateBlock({
      codigo: row.codigo,
      requerimientoId: rid,
      erv,
      analistaId,
      usuarioRow,
      withUsername,
      actionLabel: APPLY ? 'APPLY — transicionar COTIZACION_PRESENTADA' : 'DRY-RUN — SIN CAMBIOS',
    });
  }

  let applied = 0;
  let applySkips = 0;

  if (APPLY) {
    console.log('\n--- Aplicación ---');
    for (const row of candidates) {
      const rid = Number(row.requerimiento_id);
      const analistaId = await resolveAnalistaForErv(rid, row);
      if (analistaId == null) {
        applySkips += 1;
        continue;
      }
      try {
        const result = await applyReconciliation(rid, row.codigo, withUsername);
        if (result.outcome === 'applied') applied += 1;
        else applySkips += 1;
      } catch (e) {
        applySkips += 1;
        console.log(`  APPLY ERROR — ${row.codigo}: ${e.message || e}`);
      }
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`  candidatos: ${candidates.length}`);
  console.log(`  reconciliables (con analista): ${reconciliables}`);
  console.log(`  sin analista: ${sinAnalista}`);
  console.log(`  apply: ${APPLY}`);
  if (APPLY) {
    console.log(`  aplicados: ${applied}`);
    console.log(`  omitidos/error apply: ${applySkips}`);
  } else {
    console.log('  (ningún cambio en BD — use --apply para transicionar)');
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error('FATAL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) { /* ok */ }
  });
