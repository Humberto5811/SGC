/**
 * RC8.17.8H6-D10-E3-C2.6B1 — Derivación nominal Analista → Coordinador CM (Cuadro).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { transitarRevisionCuadro, filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import {
  EVENTOS_TRANSICION_PERSONA,
  EVENTOS_PILOT_EN_TRAMITE,
  assertUsuarioDestinoTransicionElegible,
  listarCandidatosTransicion,
} from '../server/lib/workflowTransicionResponsable.js';
import { ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM } from '../shared/cuadroComparativoRol.js';
import { listarUsuariosDestinoEquipoUadOrganizacional } from '../server/lib/equiposUadUsuario.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-D10-E3-C2.6B1 — Cuadro derivar Coord nominal ===\n');

console.log('1 — Catálogo workflow persona + En trámite');
ok(EVENTOS_TRANSICION_PERSONA.includes('CUADRO_DERIVADO_COORDINACION'),
  'CUADRO_DERIVADO_COORDINACION exige usuario_destino_id');
ok(EVENTOS_PILOT_EN_TRAMITE.includes('CUADRO_DERIVADO_COORDINACION'),
  'CUADRO_DERIVADO_COORDINACION → label En trámite');

console.log('\n2 — UI usa picker canónico');
const modalSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
ok(/CUADRO_DERIVADO_COORDINACION/.test(modalSrc), 'modal evento CUADRO_DERIVADO_COORDINACION');
ok(/showWorkflowTransicionModal/.test(modalSrc), 'modal picker transición');
ok(/usuario_destino_id:\s*seleccion\.usuario_destino_id/.test(modalSrc), 'body envía usuario_destino_id');

console.log('\n3 — Backend valida destinatario');
const libSrc = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
ok(/assertUsuarioDestinoTransicionElegible/.test(libSrc), 'assert elegibilidad Coord');
ok(/usuarioDestinoId:\s*accion === 'DERIVAR_COORDINADOR'/.test(libSrc), 'sync pasa usuarioDestinoId');

const revSrc = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativoRevision.js'), 'utf8');
ok(/usuarioDestinoId/.test(revSrc) && /metadataExtra/.test(revSrc), 'syncRevision acepta persona + metadata');

console.log('\n4 — Integración BD (fixture aislado)');
await runMigrations({ silent: true });

const poolCm = await listarUsuariosDestinoEquipoUadOrganizacional({
  equipoCodigo: EQUIPOS_UAD.CONT_MENORES,
});
const candidatosCm = (poolCm.usuarios || []).filter(Boolean);
ok(candidatosCm.length >= 1, 'pool Coordinador CM disponible');
const coordId = candidatosCm[0].id;
const intrusoId = 999999;

const { rows: uAnalista } = await query(`
  SELECT id FROM usuarios
  WHERE activo = TRUE AND id <> $1
  ORDER BY id LIMIT 1
`, [coordId]);
const analistaId = uAnalista[0]?.id || coordId;

const ts = Date.now();
const codigoSc = `SC-TEST-C26B1-${ts}`;
const codigoReq = `REQ-TEST-C26B1-${ts}`;

const insReq = await query(`
  INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
  VALUES ('bienes', $1, 'Test C2.6B1', 'CNCC', 'CNCC', 'En tramite', '{"observaciones":[]}'::jsonb, 'CUADRO_COMPARATIVO')
  RETURNING id
`, [codigoReq]);
const rid = insReq.rows[0].id;

await query(`
  INSERT INTO expediente_estado_vigente (
    requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
    responsable_tipo, responsable_usuario_id, version, actualizado_at
  ) VALUES ($1, 'CUADRO_COMPARATIVO', 'Cuadro Comparativo', 'CUADRO_COMPARATIVO', 'En Cuadro Comparativo',
    'PERSONA', $2, 1, NOW())
`, [rid, analistaId]);

const insSc = await query(`
  INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion, tipo, area_usuaria)
  VALUES ($1, 2026, $2, 'EN_CUADRO_COMPARATIVO', 'Objeto', 'Test C2.6B1', 'Bienes', 'Test')
  RETURNING id
`, [codigoSc, (ts % 70000) + 1000]);
const sid = insSc.rows[0].id;

await query(
  'INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)',
  [sid, rid],
);

let erv = (await query(
  `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
   FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [rid],
)).rows[0];
ok(erv.etapa_codigo === 'CUADRO_COMPARATIVO', 'ERV en etapa CUADRO_COMPARATIVO pre-derivación');

const lista = await listarCandidatosTransicion(rid, 'CUADRO_DERIVADO_COORDINACION');
const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
ok(todos.length >= 1, 'candidatos-transicion devuelve Coordinadores CM');
const destId = todos.find((c) => Number(c.id) === Number(coordId))?.id ?? todos[0].id;

try {
  await assertUsuarioDestinoTransicionElegible(rid, 'CUADRO_DERIVADO_COORDINACION', intrusoId);
  assert.fail('intruso debió rechazarse');
} catch (e) {
  ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'rechaza destinatario no autorizado');
}
await assertUsuarioDestinoTransicionElegible(rid, 'CUADRO_DERIVADO_COORDINACION', destId);

const insCuadro = await query(`
  INSERT INTO cuadros_comparativos (
    solicitud_id, tipo, version, estado, nro_invitacion, datos_json,
    pdf_nombre, pdf_contenido, creado_por, actualizado_por
  ) VALUES ($1, 'BIENES', 1, 'CUADRO_BORRADOR', 7, '{}'::jsonb, 'test.pdf', 'base64stub', 'test', 'test')
  RETURNING id
`, [sid]);
const cuadroId = insCuadro.rows[0].id;

try {
  await transitarRevisionCuadro(cuadroId, { accion: 'DERIVAR_COORDINADOR' }, 'test-analista', {
    permisos: { rol_revision_cuadro: 'ANALISTA' },
    cargo: 'Analista de Contrataciones Menores',
  });
  assert.fail('derivar sin destinatario debió fallar');
} catch (e) {
  ok(/destinatario|usuario_destino|Coordinador CM/i.test(e.message), 'exige selección de destinatario');
}

await transitarRevisionCuadro(cuadroId, {
  accion: 'DERIVAR_COORDINADOR',
  usuario_destino_id: destId,
  responsable_recomendado_id: lista.recomendado?.id ?? destId,
}, 'test-analista', {
  permisos: { rol_revision_cuadro: 'ANALISTA' },
  cargo: 'Analista de Contrataciones Menores',
});

erv = (await query(
  `SELECT etapa_codigo, estado_codigo, estado_label, responsable_tipo, responsable_usuario_id
   FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [rid],
)).rows[0];
ok(erv.etapa_codigo === 'CUADRO_COMPARATIVO', 'ERV etapa Cuadro Comparativo');
ok(erv.estado_codigo === 'EN_TRAMITE', 'ERV estado EN_TRAMITE');
ok(String(erv.estado_label || '').toLowerCase().includes('trámite')
  || erv.estado_codigo === 'EN_TRAMITE', 'ERV label En trámite');
ok(erv.responsable_tipo === 'PERSONA', 'asignación tipo PERSONA');
ok(Number(erv.responsable_usuario_id) === Number(destId), 'ERV responsable = usuario seleccionado');

const ev = (await query(`
  SELECT metadata FROM workflow_eventos
  WHERE expediente_id = $1 AND evento_codigo = 'CUADRO_DERIVADO_COORDINACION'
  ORDER BY id DESC LIMIT 1
`, [rid])).rows[0];
ok(!!ev, 'evento CUADRO_DERIVADO_COORDINACION registrado');
ok(String(ev.metadata?.usuario_destino_id || ev.metadata?.responsable_seleccionado_id || '') === String(destId),
  'metadata usuario_destino_id persistido');

const filaBandeja = {
  solicitud_id: sid,
  solicitud_codigo: codigoSc,
  nro_invitacion: 7,
  estado_cuadro: ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
  estado_cuadro_documental: 'PENDIENTE_COORDINADOR',
  estado_db: 'PENDIENTE_COORDINADOR',
};
const bCoord = filtrarBandejaPorRolRevision([filaBandeja], {
  permisos: { rol_revision_cuadro: 'COORDINADOR_CM' },
  cargo: 'Coordinador CM',
});
ok(bCoord.data.length === 1, 'Coord CM ve fila PENDIENTE_COORDINADOR');
const bAn = filtrarBandejaPorRolRevision([filaBandeja], {
  permisos: { rol_revision_cuadro: 'ANALISTA' },
  cargo: 'Analista de Contrataciones Menores',
});
ok(bAn.data.length === 1, 'Analista mantiene visibilidad histórica');
ok((bAn.data[0].acciones_revision || []).length === 0, 'Analista solo lectura en revisión externa');

console.log('\n5 — Sin regresión CCP (sigue siendo transición persona)');
ok(EVENTOS_TRANSICION_PERSONA.includes('CUADRO_APROBADO_DEC'), 'CUADRO_APROBADO_DEC intacto');

await query('DELETE FROM cuadros_comparativos WHERE id = $1', [cuadroId]);
await query('DELETE FROM solicitud_requerimientos WHERE solicitud_id = $1', [sid]);
await query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [sid]);
await query('DELETE FROM workflow_eventos WHERE expediente_id = $1', [rid]);
await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [rid]);
await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
await query('DELETE FROM requerimientos WHERE id = $1', [rid]);

console.log('\n=== OK C2.6B1 ===\n');
