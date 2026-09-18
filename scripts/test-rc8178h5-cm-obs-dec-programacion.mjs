/**
 * RC8.17.8H5 — CM observación → DEC / Programación (candidatos + ERV piloto).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  listarCandidatosObservacionDestino,
  listarCandidatosSubsanacionDestino,
} from '../server/lib/candidatosObservacionDestino.js';
import { applyPilotObservacionDecDestino, ETAPAS_OBSERVACION_DEC } from '../server/lib/workflowTransicionResponsable.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H5 — CM obs DEC / Programación ===\n');

ok(ETAPAS_OBSERVACION_DEC.includes('DEC'), 'ETAPAS_OBSERVACION_DEC incluye DEC');

const expSrc = readFileSync(join(__dir, '../server/lib/expedienteTransicion.js'), 'utf8');
ok(/etapasObsCmPilot\.has\(etapaDestNorm\)/.test(expSrc), 'COORDINACION_CM_OBSERVADA piloto multi-destino');

const actosView = readFileSync(join(__dir, '../src/views/contratacion/actosPreparativosView.js'), 'utf8');
ok(/destinosPermitidosObservacion/.test(actosView), 'UX CM limita destinos observación');

ok(getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'PROGRAMACION',
  eventoCodigo: 'PROGRAMACION_APROBADA',
})?.etapa_destino === 'COORDINACION_CM', 'D PROGRAMACION_APROBADA → CM intacto');

ok(getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'COORDINACION_CM',
  eventoCodigo: 'COORDINACION_CM_APROBADA',
})?.etapa_destino === 'INVITACIONES', 'D COORDINACION_CM_APROBADA → Invitaciones intacto');

for (const etapa of ['DEC', 'PROGRAMACION']) {
  const pilot = applyPilotObservacionDecDestino({
    resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD, responsableUnidad: 'X' },
    usuarioDestinoId: 42,
    metadata: { etapa_destino: etapa, evento: 'COORDINACION_CM_OBSERVADA' },
    etapaEfectiva: 'COORDINACION_CM',
    labels: {},
  });
  ok(pilot.etapaEfectiva === etapa, `piloto CM → ${etapa}: etapa ${etapa}`);
  ok(pilot.labels.estadoCodigo === 'OBSERVADO', `piloto CM → ${etapa}: OBSERVADO`);
  ok(Number(pilot.resp.responsableUsuarioId) === 42, `piloto CM → ${etapa}: PERSONA 42`);
}

await runMigrations({ silent: true });

const { rows: reqRows } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00001' LIMIT 1`);
const rid = reqRows[0]?.id;
if (!rid) {
  console.log('  ⚠ Sin REQ-00001; omitiendo integración BD');
  process.exit(0);
}

const listaDec = await listarCandidatosObservacionDestino({
  requerimientoId: rid,
  destinoSubmodulo: 'DEC',
});
ok(listaDec.soportado === true, 'A DEC soportado');
const idsDec = [...(listaDec.recomendado ? [listaDec.recomendado] : []), ...(listaDec.candidatos || [])].map((c) => c.id);
ok(idsDec.length >= 1, 'A DEC tiene al menos un candidato activo');

const { rows: inactivosDec } = await query(
  `SELECT id FROM usuarios WHERE activo = FALSE AND (
     UPPER(COALESCE(cargo,'')) LIKE '%DEC%' OR UPPER(COALESCE(rol,'')) LIKE '%DEC%'
   ) LIMIT 5`,
);
for (const u of inactivosDec) {
  ok(!idsDec.includes(Number(u.id)), `A DEC excluye inactivo id=${u.id}`);
}

const listaProg = await listarCandidatosObservacionDestino({
  requerimientoId: rid,
  destinoSubmodulo: 'Programación',
});
ok(listaProg.soportado === true, 'B Programación soportado');
const progPool = [...(listaProg.recomendado ? [listaProg.recomendado] : []), ...(listaProg.candidatos || [])];
ok(progPool.length >= 1, 'B Programación tiene candidatos');
const { rows: progUad } = await query(
  `SELECT id, username, equipo_uad, activo FROM usuarios
   WHERE activo = TRUE AND UPPER(TRIM(COALESCE(equipo_uad,''))) = $1`,
  [EQUIPOS_UAD.PROGRAMACION],
);
const progIdsUad = progUad.map((u) => Number(u.id));
ok(progPool.some((c) => progIdsUad.includes(Number(c.id))), 'B candidato pertenece equipo_uad PROGRAMACION');

const listaReg = await listarCandidatosObservacionDestino({
  requerimientoId: rid,
  destinoSubmodulo: 'Registro de Requerimiento',
});
ok(listaReg.soportado === true, 'C Registro sigue soportado');

const listaEval = await listarCandidatosObservacionDestino({
  requerimientoId: rid,
  destinoSubmodulo: 'Evaluación de Requerimiento',
});
ok(listaEval.soportado === true, 'C Evaluación sigue soportada');

const { rows: cmUsers } = await query(
  `SELECT id FROM usuarios WHERE activo = TRUE
   AND UPPER(TRIM(COALESCE(equipo_uad,''))) = $1 LIMIT 1`,
  [EQUIPOS_UAD.CONT_MENORES],
);
if (cmUsers[0]) {
  const subs = await listarCandidatosSubsanacionDestino({
    requerimientoId: rid,
    destinoSubmodulo: 'Coordinación CM',
    search: '',
  });
  ok(subs.soportado === true, 'subsanación retorno CM soportada');
  ok(subs.destino_etapa === 'COORDINACION_CM', 'subsanación etapa COORDINACION_CM');
}

console.log('\n✅ RC8.17.8H5 CM obs DEC/Programación OK\n');
