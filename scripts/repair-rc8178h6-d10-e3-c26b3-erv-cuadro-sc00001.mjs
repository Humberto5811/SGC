/**
 * RC8.17.8H6-D10-E3-C2.6B3 — Reparación ERV cuadro SC-00001 / REQ-00001 / Inv. 7
 *
 * Por defecto: DRY-RUN (no escribe BD).
 * Ejecución real: requiere --execute y --usuario-destino-id=<id> (Coordinador CM elegible).
 * No infiere usuario (no usar wrodriguez por defecto).
 *
 *   node scripts/repair-rc8178h6-d10-e3-c26b3-erv-cuadro-sc00001.mjs
 *   node scripts/repair-rc8178h6-d10-e3-c26b3-erv-cuadro-sc00001.mjs --usuario-destino-id=20
 *   node scripts/repair-rc8178h6-d10-e3-c26b3-erv-cuadro-sc00001.mjs --listar-candidatos
 *   node scripts/repair-rc8178h6-d10-e3-c26b3-erv-cuadro-sc00001.mjs --execute --usuario-destino-id=20
 *
 * Reversión: ver PROCEDIMIENTO_REVERSION en server/lib/repairErvCuadroDerivacionCoordC26b3.js
 */
import pool from '../server/db.js';
import {
  CASE_DEFAULT,
  REPAIR_TICKET,
  PROCEDIMIENTO_REVERSION,
  auditarErvCuadroDerivacionCoord,
  planReparacionErvCuadroDerivacionCoord,
  aplicarReparacionErvCuadroDerivacionCoord,
  listarCandidatosCoordinadorCmCuadro,
} from '../server/lib/repairErvCuadroDerivacionCoordC26b3.js';

function parseArgs(argv) {
  const args = {
    dryRun: true,
    execute: false,
    listarCandidatos: false,
    usuarioDestinoId: null,
    solicitudCodigo: CASE_DEFAULT.solicitud_codigo,
    requerimientoCodigo: CASE_DEFAULT.requerimiento_codigo,
    nroInvitacion: CASE_DEFAULT.nro_invitacion,
    cuadroId: CASE_DEFAULT.cuadro_id,
    cuadroVersion: CASE_DEFAULT.cuadro_version,
  };
  for (const a of argv) {
    if (a === '--execute') {
      args.execute = true;
      args.dryRun = false;
    } else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--listar-candidatos') args.listarCandidatos = true;
    else if (a.startsWith('--usuario-destino-id=')) {
      args.usuarioDestinoId = parseInt(a.slice('--usuario-destino-id='.length), 10);
    } else if (a.startsWith('--solicitud-codigo=')) {
      args.solicitudCodigo = a.slice(18).trim();
    } else if (a.startsWith('--requerimiento-codigo=')) {
      args.requerimientoCodigo = a.slice(23).trim();
    } else if (a.startsWith('--nro-invitacion=')) {
      args.nroInvitacion = parseInt(a.slice(17), 10);
    } else if (a.startsWith('--cuadro-id=')) {
      args.cuadroId = parseInt(a.slice(12), 10);
    } else if (a.startsWith('--cuadro-version=')) {
      args.cuadroVersion = parseInt(a.slice(17), 10);
    }
  }
  return args;
}

function section(t) {
  console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  section(`${REPAIR_TICKET} — Reparación ERV Cuadro (modo=${args.execute ? 'EXECUTE' : 'DRY-RUN'})`);

  const auditOnly = await auditarErvCuadroDerivacionCoord({
    solicitudCodigo: args.solicitudCodigo,
    requerimientoCodigo: args.requerimientoCodigo,
    nroInvitacion: args.nroInvitacion,
    cuadroId: args.cuadroId,
    cuadroVersion: args.cuadroVersion,
  });

  if (!auditOnly.ok) {
    console.error(JSON.stringify({ error: auditOnly.error }, null, 2));
    await pool.end();
    process.exit(1);
  }

  console.log(JSON.stringify({
    alcance: auditOnly.alcance,
    expediente_estado_vigente: auditOnly.expediente_estado_vigente,
    asignacion_activa: auditOnly.asignacion_activa,
    hallazgos: auditOnly.hallazgos,
    objetivo: auditOnly.objetivo_post_reparacion,
  }, null, 2));

  if (args.listarCandidatos) {
    section('Candidatos Coordinador CM (CUADRO_DERIVADO_COORDINACION)');
    const rid = auditOnly.alcance.requerimiento_id;
    const lista = await listarCandidatosCoordinadorCmCuadro(rid);
    console.log(JSON.stringify({
      recomendado: lista.recomendado || null,
      candidatos: (lista.candidatos || []).map((c) => ({
        id: c.id,
        username: c.username,
        nombre: c.nombre,
        cargo: c.cargo,
      })),
    }, null, 2));
    await pool.end();
    return;
  }

  if (args.usuarioDestinoId == null || !Number.isFinite(args.usuarioDestinoId)) {
    console.log('\nIndique --usuario-destino-id=<id> (Coordinador CM elegible).');
    console.log('  Opcional: --listar-candidatos para ver ids válidos.');
    console.log('  Sin --execute no se escribe en BD.\n');
    await pool.end();
    process.exit(args.dryRun ? 0 : 2);
  }

  if (args.execute) {
    const result = await aplicarReparacionErvCuadroDerivacionCoord({
      solicitudCodigo: args.solicitudCodigo,
      requerimientoCodigo: args.requerimientoCodigo,
      nroInvitacion: args.nroInvitacion,
      cuadroId: args.cuadroId,
      cuadroVersion: args.cuadroVersion,
      usuarioDestinoId: args.usuarioDestinoId,
    });
    console.log(JSON.stringify(result, null, 2));
    await pool.end();
    process.exit(result.ok ? 0 : 1);
  }

  const planned = await planReparacionErvCuadroDerivacionCoord({
    solicitudCodigo: args.solicitudCodigo,
    requerimientoCodigo: args.requerimientoCodigo,
    nroInvitacion: args.nroInvitacion,
    cuadroId: args.cuadroId,
    cuadroVersion: args.cuadroVersion,
    usuarioDestinoId: args.usuarioDestinoId,
  });

  section('Plan DRY-RUN');
  console.log(JSON.stringify(planned, null, 2));

  section('Reversión (referencia)');
  console.log(JSON.stringify(PROCEDIMIENTO_REVERSION, null, 2));

  console.log('\nBD no modificada. Para aplicar tras aprobación:');
  console.log(`  node scripts/repair-rc8178h6-d10-e3-c26b3-erv-cuadro-sc00001.mjs --execute --usuario-destino-id=${args.usuarioDestinoId}\n`);

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch (_) { /* noop */ }
  process.exit(1);
});
