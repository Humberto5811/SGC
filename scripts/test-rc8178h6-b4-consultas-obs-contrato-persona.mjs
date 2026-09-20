/**
 * RC8.17.8H6-B4 — Contrato candidato → payload FE → motor CONSULTAS_OBSERVADA.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { listarCandidatosObservacionDestino } from '../server/lib/candidatosObservacionDestino.js';
import { observarConsultasObservaciones } from '../server/lib/consultasObservacionesExpediente.js';
import { SUBMODULO_CONSULTAS_OBSERVACIONES } from '../server/lib/consultasObservacionesBandeja.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-B4 — Consultas obs contrato PERSONA ===\n');

const expSrc = readFileSync(
  new URL('../server/lib/consultasObservacionesExpediente.js', import.meta.url),
  'utf8',
);
ok(expSrc.includes('usuario_destino_id'), 'BE lee usuario_destino_id del body');
ok(expSrc.includes('resolveUsuarioDestinoObservacionConsultas'), 'BE resuelve destino canónico');

const viewSrc = readFileSync(
  new URL('../src/views/contratacion/consultasObservacionesView.js', import.meta.url),
  'utf8',
);
ok(viewSrc.includes('renderActionMenuCell'), 'UX — menú Acciones patrón bandeja CM');
ok(viewSrc.includes('sgc-bandeja-wrap'), 'UX — contenedor sgc-bandeja-wrap sin viewport interno');
ok(!viewSrc.includes('co-exp-table-wrap'), 'UX — sin co-exp-table-wrap legacy');
ok(viewSrc.includes('bindActionMenus'), 'UX — bindActionMenus (Popper fixed / portal)');

await runMigrations({ silent: true });

const { rows: uPool } = await query(`SELECT id, nombre, apellidos, nombres, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 3`);
const analistaId = uPool[0]?.id || 260;
const ts = Date.now();
let rid = null;

async function erv() {
  const { rows } = await query(
    `SELECT etapa_codigo, estado_codigo, estado_label, responsable_tipo, responsable_usuario_id
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid],
  );
  return rows[0] || null;
}

const ins = await query(`
  INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, estado_actual,
    sub_modulo_actual, responsable_actual, payload)
  VALUES ('bienes', $1, 'T0001', 'Test H6-B4', 'Test', 'CNCC', 'En trámite', 'CONSULTAS_OBSERVACIONES',
    'Consultas y Observaciones', $2, '{"observaciones":[]}'::jsonb)
  RETURNING id
`, [`REQ-TEST-H6B4-${ts}`, String(analistaId)]);
rid = ins.rows[0].id;

await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, responsable_fuente, version
  ) VALUES ($1, 'CONSULTAS_OBSERVACIONES', 'Consultas y Observaciones', 'EN_TRAMITE', 'En trámite',
    'PERSONA', $2, 'asignacion_explicita', 1)
`, [rid, analistaId]);

let cand = await listarCandidatosObservacionDestino({
  requerimientoId: rid,
  destinoSubmodulo: 'Registro de Requerimiento',
});
let destinoSub = 'Registro de Requerimiento';
let destinoEtapa = 'REGISTRO';
if (!cand.recomendado && !(cand.candidatos || []).length) {
  cand = await listarCandidatosObservacionDestino({
    requerimientoId: rid,
    destinoSubmodulo: 'DEC',
  });
  destinoSub = 'DEC';
  destinoEtapa = 'DEC';
}
ok(cand.soportado === true, 'GET candidatos soportado');
const destinatario = cand.recomendado || cand.candidatos?.[0];
ok(destinatario?.id != null, 'candidato con id numérico');
ok(typeof destinatario.nombre === 'string' && destinatario.nombre.length > 0, 'candidato con nombre');

// Mismo contrato que reqShared / modalObservaciones (nombre + usuario_destino_id)
await observarConsultasObservaciones(rid, {
  motivo: 'Obs test B4 contrato FE',
  usuario: uPool[0]?.username || 'test-h6b4',
  origen_submodulo: SUBMODULO_CONSULTAS_OBSERVACIONES,
  destino_submodulo: destinoSub,
  destino_etapa: destinoEtapa,
  destino_persona: destinatario.nombre,
  usuario_destino_id: destinatario.id,
  client_request_id: `test-h6b4-obs:${rid}:${ts}`,
});

const post = await erv();
ok(post?.etapa_codigo === 'CONSULTAS_OBSERVACIONES', 'ERV etapa CONSULTAS_OBSERVACIONES');
ok(post?.estado_codigo === 'OBSERVADO', 'ERV estado OBSERVADO');
ok(post?.responsable_tipo === 'PERSONA', 'ERV responsable PERSONA');
ok(Number(post?.responsable_usuario_id) === Number(destinatario.id), 'ERV responsable = destinatario seleccionado');
ok(post?.estado_label === 'Observado', 'ERV estado_label Observado (no cuadro CM)');
ok(!String(post?.estado_label || '').includes('C.C.'), 'ERV label sin C.C.');

console.log('\n✅ RC8.17.8H6-B4 OK\n');
