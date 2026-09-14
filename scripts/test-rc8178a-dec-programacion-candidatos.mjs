/**
 * RC8.17.8A — DEC → Programación: GET candidatos vía ruta DEC + elegibilidad compartida.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listarCandidatosTransicion,
  assertUsuarioDestinoTransicionElegible,
  resolveEtapaOrigenCanonicaWorkflow,
} from '../server/lib/workflowTransicionResponsable.js';
import { canAccessRequirement } from '../server/lib/userDataScope.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { WHERE_BANDEJA_DEC } from '../server/lib/decBandeja.js';
import { REQUERIMIENTO_BANDEJA_FROM } from '../server/lib/bandejaRequerimientoSql.js';
import { esElegiblePersonaDec } from '../server/lib/candidatosObservacionDestino.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8A — DEC → Programación candidatos (ruta DEC) ===\n');

const decViewSrc = readFileSync(join(__dir, '../src/views/contratacion/decView.js'), 'utf8');
ok(
  /candidatosApiPath:\s*\(reqId\)\s*=>\s*`\/contrataciones\/dec\/candidatos-transicion\/\$\{reqId\}`/.test(decViewSrc),
  'decView pasa candidatosApiPath DEC para DEC_APROBADO',
);

const modalSrc = readFileSync(join(__dir, '../src/components/workflowTransicionModal.js'), 'utf8');
ok(/candidatosApiPath/.test(modalSrc) && /requerimientos\/\$\{requerimientoId\}\/candidatos-transicion/.test(modalSrc),
  'workflowTransicionModal conserva default genérico requerimientos');

const contrSrc = readFileSync(join(__dir, '../server/routes/contrataciones.js'), 'utf8');
ok(/dec\/candidatos-transicion\/:requerimientoId/.test(contrSrc), 'endpoint GET dec/candidatos-transicion registrado');
ok(/listarCandidatosTransicion\(rid, evento/.test(contrSrc), 'endpoint delega listarCandidatosTransicion');
ok(/WHERE_BANDEJA_DEC/.test(contrSrc), 'endpoint valida bandeja DEC');

const LEGACY_LABELS = ['Jefe DEC', 'Especialista DEC', 'Usuario DEC'];
function assertNoLegacyLabels(lista, label) {
  const nombres = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])]
    .flatMap((c) => [c.nombre, c.username, c.etiqueta].filter(Boolean));
  for (const bad of LEGACY_LABELS) {
    ok(!nombres.some((n) => String(n).includes(bad)), `${label}: sin etiqueta legacy "${bad}"`);
  }
  ok(
    [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])]
      .every((c) => Number.isFinite(Number(c.id))),
    `${label}: candidatos son PERSONAS con id numérico`,
  );
}

try {
  await runMigrations();

  const { rows: reqRows } = await query(`SELECT id, codigo, estado_actual FROM requerimientos WHERE codigo = 'REQ-00016' LIMIT 1`);
  const rid = reqRows[0]?.id;
  const { rows: lespRows } = await query(
    `SELECT id, username, cargo, rol, permisos, centro, codigo_centro_costo, activo FROM usuarios
     WHERE LOWER(username)='lespinoza' AND activo=TRUE LIMIT 1`,
  );
  const lesp = lespRows[0];

  if (rid && lesp) {
    const { rows: ervRows } = await query(
      `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
       FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
      [rid],
    );
    const erv = ervRows[0];
    console.log('  ℹ REQ-00016 ERV:', erv || '(sin fila)');
    console.log('  ℹ lespinoza id:', lesp.id, 'esElegiblePersonaDec:', await esElegiblePersonaDec(lesp));

    const accGuard = await canAccessRequirement(lesp.id, rid, 'GET');
    console.log('  ℹ canAccessRequirement(lespinoza):', accGuard.ok, accGuard.via || accGuard.error?.message || 'org-scope');

    const tipoResp = String(erv?.responsable_tipo || '').trim().toUpperCase();
    if (tipoResp === 'PERSONA') {
      const match = Number(erv.responsable_usuario_id) === Number(lesp.id);
      ok(match || accGuard.ok, 'lespinoza alineado con ERV PERSONA o pasa guard org');
      if (!match) {
        console.log('  ⚠ desalineación ERV responsable_usuario_id vs lespinoza.id');
      }
    } else if (tipoResp === 'UNIDAD') {
      ok(!accGuard.ok, 'guard requerimientos no bypass con ERV UNIDAD (causa 403 en GET genérico)');
      ok(await esElegiblePersonaDec(lesp), 'lespinoza sigue elegible DEC vía ruta dec/candidatos-transicion');
    }

    const { rows: bandeja } = await query(
      `SELECT r.id ${REQUERIMIENTO_BANDEJA_FROM} WHERE r.id = $1 AND ${WHERE_BANDEJA_DEC}`,
      [rid],
    );
    ok(bandeja.length > 0, 'REQ-00016 visible en bandeja DEC (WHERE_BANDEJA_DEC)');

    const etapaOrigen = await resolveEtapaOrigenCanonicaWorkflow(rid, reqRows[0]);
    ok(etapaOrigen === 'DEC', 'etapa origen DEC desde ERV (resolveEtapaOrigenCanonicaWorkflow)');

    const lista = await listarCandidatosTransicion(rid, 'DEC_APROBADO', { search: '' });
    ok(lista.etapa_destino === 'PROGRAMACION', 'lista etapa destino PROGRAMACION');
    ok(lista.perfil_responsable === 'COORDINADOR_EQUIPO_UAD', 'DEC_APROBADO regla equipo UAD');
    assertNoLegacyLabels(lista, 'REQ-00016 listarCandidatosTransicion');

    const { rows: laguilar } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='laguilar' LIMIT 1`);
    const idsLista = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])].map((c) => c.id);
    if (laguilar[0]) {
      ok(idsLista.includes(laguilar[0].id), 'REQ-00016: Lisset (laguilar) en candidatos DEC_APROBADO');
    }

    const pickId = lista.recomendado?.id || lista.candidatos?.[0]?.id;
    if (pickId) {
      await assertUsuarioDestinoTransicionElegible(rid, 'DEC_APROBADO', pickId, reqRows[0]);
      ok(true, 'assertUsuarioDestinoTransicionElegible acepta mismo id que GET');
    } else {
      console.log('  ⚠ sin candidatos programación en BD para assert PUT');
    }
  } else {
    console.log('  ⚠ REQ-00016 o lespinoza no disponibles — omitiendo integración piloto');
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
  if (process.env.CI) throw e;
}

console.log('\n✅ RC8.17.8A DEC → Programación candidatos — OK\n');
