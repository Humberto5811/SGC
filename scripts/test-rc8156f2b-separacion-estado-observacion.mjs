/**
 * RC8.15.6F-2B — Separación Estado workflow / Situación / Observación.
 */
import { readFileSync } from 'node:fs';
import pool, { query } from '../server/db.js';
import {
  agregarEstadoResponsableOrden,
  inicializarEstadoResponsableEntregable,
  listarBandejaEntregablesServicios,
  observarEntregableDirigido,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import {
  obtenerEstadoResponsableEntregable,
} from '../server/lib/entregableEstadoPersistido.js';
import { renderEstadoBadgeFromRow } from '../src/ui/workflow/EstadoBadge.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

let passed = 0;
let failed = 0;

function ok(c, m) { if (c) { passed += 1; console.log(`  ✓ ${m}`); } else { failed += 1; console.error(`  ✗ ${m}`); } }
async function snap(sql, params = []) { return JSON.stringify((await query(sql, params)).rows); }

console.log('\n=== RC8.15.6F-2B — Separación estado / situación / observación ===\n');

const viewSource = readFileSync('src/views/ejecucion/presentacionEntregableView.js', 'utf8');
ok(!/situacion_codigo === 'SUBSANADO'/.test(viewSource)
  && !/situacion_codigo === 'OBSERVADO'/.test(viewSource),
'5/6. columna Estado ya no usa situación documental');

const globalBefore = await snap('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id');

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const permReg = JSON.stringify({
    modulos: ['CONTRATACIONES'], submodulos: ['REGISTRO_ORDENES_CONTRATACION'],
    actividades: ['VER'], actividadesPorSubmodulo: { REGISTRO_ORDENES_CONTRATACION: ['VER'] },
  });
  const permPe = JSON.stringify({
    modulos: ['EJECUCION'], submodulos: ['PRESENTACION_ENTREGABLES'],
    actividades: ['VER', 'EDITAR'], actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
  });
  const mkUser = async (suf, perm) => (await client.query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
  `, [`F2B${suf}${nonce}`.slice(0, 20), `f2b_${nonce}_${suf}`, `F2B ${suf}`, perm])).rows[0];

  const origen = await mkUser('o', permPe);
  const destino = await mkUser('d', permReg);
  const origenCtx = { id: Number(origen.id), rol: 'usuario', permisos: JSON.parse(permPe), username: origen.username };
  const destCtx = { id: Number(destino.id), rol: 'usuario', permisos: JSON.parse(permReg), username: destino.username };

  const base = (await client.query(`
    SELECT e.requerimiento_id, oc.proveedor_id
    FROM expediente_estado_vigente e
    JOIN ordenes_contratacion oc ON oc.requerimiento_id=e.requerimiento_id
    WHERE e.etapa_codigo='PRESENTACION_ENTREGABLES' AND oc.proveedor_id IS NOT NULL
    ORDER BY e.requerimiento_id LIMIT 1
  `)).rows[0];
  const ordenId = Number((await client.query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,500,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F2B${nonce}`])).rows[0].id);

  async function crearEntrega(n) {
    return Number((await client.query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
    `, [ordenId, n, `F2B ${n}`])).rows[0].id);
  }
  async function crearRecepcion(eid, n, tipo = 'INICIAL') {
    return (await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'RECIBIDO','test-f2b') RETURNING *
    `, [eid, ordenId, n, tipo, `SGD-F2B-${nonce}-${n}`])).rows[0];
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  await crearRecepcion(e1, 1);
  await crearRecepcion(e2, 1);
  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f2b', client });
  await inicializarEstadoResponsableEntregable(e2, { actualizadoPor: 'test-f2b', client });
  await client.query(`
    UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA', responsable_usuario_id=$2,
      responsable_unidad=NULL, responsable_fuente='PERSONA' WHERE orden_entrega_id=$1
  `, [e1, origen.id]);
  await client.query(`
    UPDATE entregable_asignaciones SET activo=FALSE, cerrado_at=NOW() WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-f2b','fixture')
  `, [ordenId, e1, base.requerimiento_id, origen.id]);

  const antes = (await client.query(`
    SELECT etapa_codigo, etapa_label FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0];
  const e2Snap = await snap('SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1', [e2]);

  const obs = await observarEntregableDirigido(e1, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destino.id,
    motivo: 'Separación F2B',
  }, origenCtx, origen.username, client);

  const despues = (await client.query(`
    SELECT etapa_codigo, etapa_label, estado_label, metadata_json
    FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e1])).rows[0];
  const wo = (await client.query(`
    SELECT destino_submodulo_codigo FROM workflow_observaciones
    WHERE id=$1
  `, [Number(obs.workflow_observacion.id)])).rows[0];

  ok(despues.etapa_codigo === antes.etapa_codigo, '1. reasignación conserva etapa_codigo');
  ok(despues.etapa_label === 'Presentación de Entregables', '2. conserva etapa_label canónico');
  ok(despues.etapa_label !== 'Registro de Órdenes', '2b. label destino no contamina etapa');
  ok(wo.destino_submodulo_codigo === 'REGISTRO_ORDENES_CONTRATACION', '3. routing destino separado');
  ok(wo.destino_submodulo_codigo === 'REGISTRO_ORDENES_CONTRATACION'
    && despues.etapa_codigo !== 'REGISTRO_ORDENES_CONTRATACION',
  '7. destino Registro Órdenes no contamina etapa workflow');
  ok(despues.metadata_json?.destino_submodulo_codigo === 'REGISTRO_ORDENES_CONTRATACION',
    '3b. metadata conserva destino routing');
  ok(await snap('SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1', [e2]) === e2Snap,
    '12. E2 intacto tras observación dirigida');

  // Fallback UNIDAD sin estado específico (simula OS 1105)
  const e3 = await crearEntrega(3);
  await crearRecepcion(e3, 1);
  const countAntes = Number((await client.query(`
    SELECT COUNT(*)::int n FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e3])).rows[0].n);
  const lectura = await obtenerEstadoResponsableEntregable(e3, { client });
  const countDespues = Number((await client.query(`
    SELECT COUNT(*)::int n FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e3])).rows[0].n);
  ok(countAntes === 0 && countDespues === 0, '11. lectura no crea estado específico');
  ok(lectura?.etapaCodigo === 'PRESENTACION_ENTREGABLES'
    && lectura?.fallbackGlobal === true,
  '10. fallback UNIDAD/global sin fila específica');
  ok(lectura?.responsableTipo === 'UNIDAD', '10b. responsable fallback UNIDAD');

  const persona = await obtenerEstadoResponsableEntregable(e1, { client });
  ok(persona?.responsableTipo === 'PERSONA'
    && Number(persona?.responsableUsuarioId) === Number(destino.id),
  '9. estado específico PERSONA prevalece sobre fallback');

  // Subsanación: situación SUBSANADO, workflow intacto
  const e4 = await crearEntrega(4);
  const r4 = await crearRecepcion(e4, 1);
  await inicializarEstadoResponsableEntregable(e4, { actualizadoPor: 'test-f2b', client });
  await client.query(`
    UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA', responsable_usuario_id=$2
    WHERE orden_entrega_id=$1
  `, [e4, origen.id]);
  await client.query(`
    UPDATE entregable_asignaciones SET activo=FALSE, cerrado_at=NOW() WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e4]);
  await client.query(`
    INSERT INTO entregable_asignaciones (
      orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
      usuario_id, tipo_responsable, activo, asignado_por, origen_asignacion
    ) VALUES ($1,$2,$3,'PRESENTACION_ENTREGABLES',$4,'PERSONA',TRUE,'test-f2b','fixture')
  `, [ordenId, e4, base.requerimiento_id, origen.id]);
  await observarEntregableDirigido(e4, {
    destino_submodulo_codigo: 'REGISTRO_ORDENES_CONTRATACION',
    usuario_destino_id: destino.id,
    motivo: 'Para subsanar',
  }, origenCtx, origen.username, client);

  await client.query('COMMIT');
  const woIds = (await query(`
    SELECT workflow_observacion_id AS id FROM entregable_observaciones WHERE orden_id=$1
  `, [ordenId])).rows.map((r) => r.id).filter(Boolean);
  const pdf = Buffer.from('%PDF-1.4 RC8156F2B subsanacion fixture padding').toString('base64');
  const obsRow = (await query(`
    SELECT id FROM entregable_observaciones WHERE orden_entrega_id=$1 AND estado='OBS_EMITIDA' LIMIT 1
  `, [e4])).rows[0];
  await subsanarEntregable(e4, {
    observacion_id: obsRow.id,
    fecha_recepcion_mesa_partes: '2026-08-19',
    numero_expediente_sgd: `SGD-SUB-${nonce}`,
    documentos: [{ nombre_archivo: 'sub.pdf', mime_type: 'application/pdf', contenido_base64: pdf }],
  }, destCtx, destino.username);
  const wfPostSub = (await query(`
    SELECT etapa_codigo, etapa_label FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [e4])).rows[0];
  ok(wfPostSub.etapa_codigo === 'PRESENTACION_ENTREGABLES'
    && wfPostSub.etapa_label === 'Presentación de Entregables',
  '8. tras subsanar workflow sigue Presentación de Entregables');

  await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [ordenId]);
  if (woIds.length) {
    await query('DELETE FROM workflow_observaciones WHERE id = ANY($1::int[])', [woIds]);
  }
  await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  await query('DELETE FROM usuarios WHERE id IN ($1,$2)', [origen.id, destino.id]);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
  ok(false, `fixture (${error.message})`);
} finally {
  client.release();
}

// Bandeja: situación vs workflow (sin tocar OS 1105)
const bandeja = await listarBandejaEntregablesServicios({ id: 1, rol: 'admin' });
const rowObs = bandeja.find((r) => r.situacion_codigo === 'OBSERVADO') || bandeja[0];
if (rowObs) {
  ok(rowObs.estado_etapa_codigo !== 'SUBSANADO'
    && rowObs.estado_etapa_codigo !== 'OBSERVADO',
  '5/6b. situación no reemplaza código workflow en bandeja');
  const badge = renderEstadoBadgeFromRow(rowObs);
  ok(/Presentación de Entregables|Revisión|Derivación|Pago/i.test(badge)
    && !/Subsanado|Observado/.test(badge),
  '4. badge Estado refleja workflow canónico');
}

const agreg = agregarEstadoResponsableOrden([{
  ordenEntregaId: 1,
  estadoCodigo: 'PRESENTACION_ENTREGABLES',
  estadoLabel: 'Presentación de Entregables',
  etapaCodigo: 'PRESENTACION_ENTREGABLES',
  etapaLabel: 'Presentación de Entregables',
  responsableTipo: 'UNIDAD',
  responsableUnidad: 'Área Usuaria',
  fuenteEstado: 'EXPEDIENTE_GLOBAL_FALLBACK',
}]);
ok(agreg.estado_etapa_label === 'Presentación de Entregables', '14. HOTFIX2 agregación conserva label canónico');

const menu = entregableMenuItems({ solo_lectura_routing_origen: true, puede_ver_trazabilidad: true });
ok(menu.some((i) => i.act === 'verExpediente')
  && !menu.some((i) => i.act === 'subsanarEntregable'),
'15. HOTFIX3 menú exclusivo origen');

ok(await snap('SELECT * FROM expediente_estado_vigente ORDER BY requerimiento_id') === globalBefore,
  '13. expediente global intacto');

console.log(`\n=== Resultado RC8.15.6F-2B: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
await pool.end();
