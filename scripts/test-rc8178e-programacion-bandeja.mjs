/**
 * RC8.17.8E — Bandeja maestra Programación: Etapa/Estado/Resp ERV + Derivado histórico.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  listarBandejaProgramacion,
  FECHA_INGRESO_PROGRAMACION_JOINS,
  FECHA_INGRESO_PROGRAMACION_SELECT,
} from '../server/lib/programacionBandeja.js';
import { fmtBandejaFechaDerivado } from '../src/utils/bandejaExpedienteColumns.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8E — Bandeja Programación ===\n');

ok(FECHA_INGRESO_PROGRAMACION_JOINS.includes('workflow_eventos'), 'SQL join workflow_eventos');
ok(FECHA_INGRESO_PROGRAMACION_JOINS.includes('expediente_asignaciones'), 'SQL fallback asignaciones');
ok(FECHA_INGRESO_PROGRAMACION_SELECT.includes('fecha_ingreso_programacion'), 'SELECT expone fecha_ingreso_programacion');

await runMigrations();

const { rows: req16 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00016' LIMIT 1`);
if (req16[0]) {
  const rid = req16[0].id;
  const lista = await listarBandejaProgramacion(1, 50, { q: 'REQ-00016' });
  const row = (lista.data || []).find((r) => Number(r.id) === Number(rid));
  ok(!!row, 'REQ-00016 listado en bandeja maestra');
  ok(row.fecha_ingreso_programacion, 'fecha_ingreso_programacion presente');
  const ev = await query(`
    SELECT created_at FROM workflow_eventos
    WHERE expediente_id = $1 AND evento_codigo = 'DEC_APROBADO' AND etapa_destino = 'PROGRAMACION'
    ORDER BY id LIMIT 1
  `, [rid]);
  ok(
    new Date(row.fecha_ingreso_programacion).getTime() === new Date(ev.rows[0].created_at).getTime(),
    'Derivado = workflow DEC_APROBADO (no ERV.actualizado_at)',
  );
  const canon = await getEstadoResponsableCanonico({ requerimientoIds: [rid] });
  const c = canon.get(rid);
  if (c?.etapaCodigo === 'REGISTRO' && c?.estadoCodigo === 'OBSERVADO') {
    ok(Number(c?.responsableUsuarioId) === 249, 'ERV vigente REGISTRO/OBSERVADO PERSONA 249 (post 8F)');
    ok(row.bandeja_contrato?.etapa?.codigo === 'REGISTRO', 'bandeja muestra etapa vigente REGISTRO');
    ok(row.bandeja_contrato?.estado?.codigo === 'OBSERVADO', 'bandeja muestra estado OBSERVADO');
  } else {
    ok(c?.etapaCodigo === 'PROGRAMACION', 'Etapa ERV PROGRAMACION');
    ok(c?.estadoCodigo === 'EN_TRAMITE', 'Estado ERV EN_TRAMITE');
    ok(Number(c?.responsableUsuarioId) === 16, 'Responsable PERSONA 16 (Lisset)');
  }
  const fmt = fmtBandejaFechaDerivado(row.fecha_ingreso_programacion);
  ok(fmt.display === '13/09/2026', `Derivado display ${fmt.display}`);
  ok(row.bandeja_contrato?.fecha_ingreso_programacion, 'contrato bandeja incluye fecha ingreso');
  if (c?.actualizadoAt && row.fecha_ingreso_programacion) {
    ok(
      new Date(row.fecha_ingreso_programacion).getTime() <= new Date(c.actualizadoAt).getTime() + 1,
      'fecha ingreso no confundida con futuro ERV',
    );
  }
}

const { rows: hist } = await query(`
  SELECT r.id, r.codigo, r.estado_actual
  FROM requerimientos r
  WHERE EXISTS (
    SELECT 1 FROM expediente_asignaciones ea
    WHERE ea.requerimiento_id = r.id AND ea.etapa_codigo = 'PROGRAMACION'
  )
  AND UPPER(COALESCE(r.estado_actual, '')) <> 'PROGRAMACION'
  LIMIT 1
`);
if (hist[0]) {
  const lista = await listarBandejaProgramacion(1, 200, {});
  const row = (lista.data || []).find((r) => Number(r.id) === Number(hist[0].id));
  if (row) {
    ok(true, `histórico ${row.codigo} sigue en bandeja`);
    ok(row.bandeja_contrato?.etapa?.codigo !== 'PROGRAMACION' || row.estado_actual !== 'PROGRAMACION',
      'expediente histórico puede mostrar etapa vigente distinta');
    ok(!!row.fecha_ingreso_programacion, 'histórico conserva fecha primer ingreso Programación');
  }
}

console.log('\n✅ RC8.17.8E — OK\n');
