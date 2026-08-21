/**
 * RC8.15.6D — Revisión del Coordinador CM: observar o derivar a Analista CM.
 * Fixtures aislados; no modifica OS 1105, Bienes ni el expediente global.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  listarAnalistasCMEntregable,
  listarBandejaEntregablesServicios,
  listarTrazabilidadEntregable,
  observarEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function expectReject(work) {
  try { await work(); return null; } catch (error) { return error; }
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_estado_vigente e WHERE e.orden_id=oc.id) AS estados,
      (SELECT COUNT(*)::int FROM entregable_asignaciones a WHERE a.orden_id=oc.id) AS asignaciones,
      (SELECT COUNT(*)::int FROM entregable_eventos ev WHERE ev.orden_id=oc.id) AS eventos
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

async function snapshotBienes() {
  const result = {};
  for (const table of [
    'recepcion_bienes_expedientes',
    'recepciones_bienes',
    'recepcion_bienes_eventos',
  ]) {
    result[table] = Number((await query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
  }
  return JSON.stringify(result);
}

async function snapshotExpediente(requerimientoId) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1',
      [requerimientoId],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM expediente_asignaciones WHERE requerimiento_id=$1 ORDER BY id',
      [requerimientoId],
    )).rows,
  });
}

async function snapshotEntregable(entregaId) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
      [entregaId],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id',
      [entregaId],
    )).rows,
    eventos: (await query(
      'SELECT * FROM entregable_eventos WHERE orden_entrega_id=$1 ORDER BY id',
      [entregaId],
    )).rows,
  });
}

console.log('\n=== RC8.15.6D — Revisión Coordinador CM ===\n');

const backendSource = read('server/lib/entregablesServicios.js');
const routeSource = read('server/routes/entregablesServicios.js');
const viewSource = read('src/views/ejecucion/presentacionEntregableView.js');
ok(ETAPAS.REVISION_ANALISTA_CM === 'REVISION_ANALISTA_CM'
  && getTransition({
    tipoContratacion: 'SERVICIO',
    etapaOrigen: ETAPAS.REVISION_COORDINADOR_CM,
    eventoCodigo: EVENTOS.ENTREGABLE_DERIVADO_ANALISTA_CM,
  })?.etapa_destino === ETAPAS.REVISION_ANALISTA_CM,
'etapa y transición canónica de Analista CM existen');
ok(/analistas-cm/.test(routeSource)
  && /derivar-analista-cm/.test(routeSource)
  && /Derivar a Analista CM/.test(viewSource), 'GET, POST y modal Analista CM conectados');
ok(/trazabilidad/.test(routeSource)
  && /TrazabilidadModal/.test(viewSource), 'timeline usa entregable_eventos');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();
let ordenId = null;
let requerimientoId = null;
let expedienteBefore = null;
const usuariosOriginales = [];

try {
  const base = (await query(`
    SELECT e.requerimiento_id, oc.proveedor_id
    FROM expediente_estado_vigente e
    JOIN ordenes_contratacion oc ON oc.requerimiento_id=e.requerimiento_id
    WHERE e.etapa_codigo='PRESENTACION_ENTREGABLES'
      AND oc.proveedor_id IS NOT NULL
    ORDER BY e.requerimiento_id
    LIMIT 1
  `)).rows[0];
  const usuarios = (await query(`
    SELECT * FROM usuarios
    WHERE activo=TRUE
    ORDER BY id
    LIMIT 3
  `)).rows;
  if (!base || usuarios.length < 3) throw new Error('No existe base mínima para fixture RC8.15.6D');
  const [areaUsuaria, coordinador, analista] = usuarios;
  for (const usuario of usuarios) {
    usuariosOriginales.push({
      id: usuario.id,
      cargo: usuario.cargo,
      permisos: usuario.permisos,
      activo: usuario.activo,
    });
  }
  await query(`
    UPDATE usuarios SET cargo='Área Usuaria',
      permisos='{"perfil":"AREA_USUARIA"}'::jsonb, activo=TRUE WHERE id=$1
  `, [areaUsuaria.id]);
  await query(`
    UPDATE usuarios SET cargo='Coordinador CM',
      permisos='{"perfil":"COORDINADOR_CM"}'::jsonb, activo=TRUE WHERE id=$1
  `, [coordinador.id]);
  await query(`
    UPDATE usuarios SET cargo='Analista CM',
      permisos='{"perfil":"ANALISTA_CM"}'::jsonb, activo=TRUE WHERE id=$1
  `, [analista.id]);
  const centroReq = (await query(`
    SELECT r.cmn, r.area, r.payload FROM requerimientos r WHERE r.id=$1
  `, [base.requerimiento_id])).rows[0];
  const { resolverCentroDesdeRequerimiento } = await import('../server/lib/recepcionBienesAlcance.js');
  const centro = resolverCentroDesdeRequerimiento(centroReq);
  await query(`
    UPDATE usuarios SET centro=$2, codigo_centro_costo=$2 WHERE id=$1
  `, [areaUsuaria.id, centro.centro_codigo]);
  ok(resolveFunctionalProfiles({ permisos: { perfil: 'ANALISTA_CM' } })
    .includes('ANALISTA_CONTRATACIONES'), 'alias ANALISTA_CM resuelve a ANALISTA_CONTRATACIONES');

  const areaCtx = {
    id: Number(areaUsuaria.id),
    rol: areaUsuaria.rol,
    cargo: 'Área Usuaria',
    permisos: { perfil: 'AREA_USUARIA' },
    username: areaUsuaria.username,
  };
  const coordinadorCtx = {
    id: Number(coordinador.id),
    rol: coordinador.rol,
    cargo: 'Coordinador CM',
    permisos: { perfil: 'COORDINADOR_CM' },
    username: coordinador.username,
  };
  const analistaCtx = {
    id: Number(analista.id),
    rol: analista.rol,
    cargo: 'Analista CM',
    permisos: { perfil: 'ANALISTA_CM' },
    username: analista.username,
  };

  requerimientoId = Number(base.requerimiento_id);
  expedienteBefore = await snapshotExpediente(requerimientoId);
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,300,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimientoId, base.proveedor_id, `RC8156D${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    const id = Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture D ${numero}`])).rows[0].id);
    await inicializarEstadoResponsableEntregable(id, { actualizadoPor: 'test-d' });
    await query(`
      UPDATE entregable_estado_vigente
      SET responsable_tipo='PERSONA', responsable_usuario_id=$2,
        responsable_unidad='AREA_USUARIA', responsable_fuente='asignacion_explicita'
      WHERE orden_entrega_id=$1
    `, [id, areaUsuaria.id]);
    await query(`
      UPDATE entregable_asignaciones
      SET tipo_responsable='PERSONA', usuario_id=$2, unidad_codigo='AREA_USUARIA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [id, areaUsuaria.id]);
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-d')
      RETURNING *
    `, [id, ordenId, `SGD-D-${id}`])).rows[0];
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-d')
      RETURNING *
    `, [ordenId, id, recepcion.id, `ACTA-D-${id}`])).rows[0];
    await query(`
      INSERT INTO entregable_conformidad_acta_visados (
        orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
        contenido_base64, estado_documental, vigente, created_by
      ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,
        'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-d')
    `, [ordenId, id, acta.id, `firmada-${id}.pdf`,
      Buffer.from('%PDF-1.4 RC8156D').toString('base64')]);
    return { id, recepcion };
  }

  const observarFixture = await crearEntrega(1);
  const derivarFixture = await crearEntrega(2);
  const hermano = await crearEntrega(3);
  await derivarEntregableCoordinadorCM(
    observarFixture.id,
    { responsable_id: coordinador.id },
    areaCtx,
    areaUsuaria.username,
  );
  await derivarEntregableCoordinadorCM(
    derivarFixture.id,
    { responsable_id: coordinador.id },
    areaCtx,
    areaUsuaria.username,
  );
  const hermanoBefore = await snapshotEntregable(hermano.id);

  const noResponsable = await expectReject(() => observarEntregable(
    observarFixture.id,
    { recepcion_id: observarFixture.recepcion.id, motivo: 'No autorizado' },
    areaCtx,
    areaUsuaria.username,
  ));
  ok(noResponsable?.code === 'COORDINADOR_CM_NO_AUTORIZADO',
    'A. solo Coordinador CM responsable puede operar');
  const sinMotivo = await expectReject(() => observarEntregable(
    observarFixture.id,
    { recepcion_id: observarFixture.recepcion.id, motivo: '' },
    coordinadorCtx,
    coordinador.username,
  ));
  ok(sinMotivo?.code === 'MOTIVO_OBSERVACION_REQUERIDO',
    'B. observación del Coordinador requiere motivo');
  const sinDestino = await expectReject(() => observarEntregable(
    observarFixture.id,
    { recepcion_id: observarFixture.recepcion.id, motivo: 'Sin destino' },
    coordinadorCtx,
    coordinador.username,
  ));
  ok(sinDestino?.code === 'USUARIO_DESTINO_ID_REQUERIDO',
    'B2. observación del Coordinador requiere destinatario AU');

  const resultadoObservacion = await observarEntregable(
    observarFixture.id,
    {
      recepcion_id: observarFixture.recepcion.id,
      motivo: 'Subsanar documentación observada por Coordinación CM',
      usuario_destino_id: areaUsuaria.id,
    },
    coordinadorCtx,
    coordinador.username,
  );
  const estadoObservado = (await query(`
    SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1
  `, [observarFixture.id])).rows[0];
  ok(Number(resultadoObservacion.orden_entrega_id) === observarFixture.id
    && Number((await query(
      'SELECT COUNT(*)::int AS n FROM entregable_observaciones WHERE id=$1',
      [resultadoObservacion.id],
    )).rows[0].n) === 1,
  'C. observación reutiliza entregable_observaciones');
  ok(estadoObservado.etapa_codigo === 'PRESENTACION_ENTREGABLES'
    && Number(estadoObservado.responsable_usuario_id) === Number(areaUsuaria.id),
  'D. E1 pasa al AU seleccionado en PRESENTACION_ENTREGABLES');
  const workflowObs = (await query(`
    SELECT wo.* FROM workflow_observaciones wo
    JOIN entregable_observaciones eo ON eo.workflow_observacion_id=wo.id
    WHERE eo.id=$1
  `, [resultadoObservacion.id])).rows[0];
  ok(workflowObs
    && Number(workflowObs.usuario_origen_id) === Number(coordinador.id)
    && Number(workflowObs.usuario_destino_id) === Number(areaUsuaria.id)
    && workflowObs.origen_submodulo_codigo === 'REVISION_COORDINADOR_CM',
  'E. routing canónico registra emisor, destinatario y etapa origen');
  const asignacionesObservada = (await query(`
    SELECT * FROM entregable_asignaciones
    WHERE orden_entrega_id=$1 ORDER BY id
  `, [observarFixture.id])).rows;
  ok(asignacionesObservada.at(-1).etapa_codigo === 'PRESENTACION_ENTREGABLES'
    && Number(asignacionesObservada.at(-1).usuario_id) === Number(areaUsuaria.id)
    && asignacionesObservada.at(-1).activo === true,
  'F. asignación activa queda en AU destino');
  ok(resultadoObservacion.estado === 'OBS_EMITIDA'
    && resultadoObservacion.origen === 'COORDINADOR_CM'
    && resultadoObservacion.workflow_observacion,
  'G. observación CM queda abierta con workflow enlazado');
  const bandejaArea = await listarBandejaEntregablesServicios(areaCtx);
  const filaObservada = bandejaArea.find(
    (row) => Number(row.orden_entrega_id) === observarFixture.id,
  );
  const accionesArea = entregableMenuItems(filaObservada || {});
  ok(filaObservada?.situacion_codigo === 'OBSERVADO'
    && filaObservada?.puede_subsanar
    && accionesArea.some((item) => item.act === 'subsanarEntregable')
    && !accionesArea.some((item) => item.act === 'generarActa'),
  'H. E1 queda OBSERVADO y Área Usuaria solo puede subsanar');
  ok(await snapshotEntregable(hermano.id) === hermanoBefore,
    'I. E2 permanece intacto tras observar E1');

  const analistas = await listarAnalistasCMEntregable(derivarFixture.id, coordinadorCtx);
  ok(analistas.some((item) => Number(item.id) === Number(analista.id))
    && analistas.every((item) => Number(item.id) !== Number(areaUsuaria.id)),
  'I/J. lista solo Analistas CM activos y excluye usuario sin perfil');
  ok(/transicionarEntregable\s*\(\{/.test(backendSource)
    && /ENTREGABLE_DERIVADO_ANALISTA_CM/.test(backendSource),
  'K. derivación Analista usa transicionarEntregable');
  const resultadoAnalista = await derivarEntregableAnalistaCM(
    derivarFixture.id,
    { responsable_id: analista.id },
    coordinadorCtx,
    coordinador.username,
  );
  ok(resultadoAnalista.estado?.etapaCodigo === 'REVISION_ANALISTA_CM',
    'L. etapa final es REVISION_ANALISTA_CM');
  ok(resultadoAnalista.estado?.responsableTipo === 'PERSONA'
    && Number(resultadoAnalista.estado?.responsableUsuarioId) === Number(analista.id),
  'M. responsable final es Analista CM PERSONA');
  const asignacionesAnalista = (await query(`
    SELECT * FROM entregable_asignaciones
    WHERE orden_entrega_id=$1 ORDER BY id
  `, [derivarFixture.id])).rows;
  ok(asignacionesAnalista.some((row) => row.etapa_codigo === 'REVISION_COORDINADOR_CM'
    && Number(row.usuario_id) === Number(coordinador.id)
    && row.activo === false), 'N. asignación del Coordinador se cierra');
  ok(asignacionesAnalista.at(-1).etapa_codigo === 'REVISION_ANALISTA_CM'
    && Number(asignacionesAnalista.at(-1).usuario_id) === Number(analista.id)
    && asignacionesAnalista.at(-1).activo === true,
  'O. asignación del Analista queda activa');
  const trazabilidad = await listarTrazabilidadEntregable(derivarFixture.id, analistaCtx);
  ok(trazabilidad.some((evento) => evento.evento_codigo === 'ENTREGABLE_DERIVADO_ANALISTA_CM'
    && evento.etapa_anterior_codigo === 'REVISION_COORDINADOR_CM'
    && evento.etapa_nueva_codigo === 'REVISION_ANALISTA_CM'),
  'P. evento de derivación Analista registrado en entregable_eventos');
  const bandejaAnalista = await listarBandejaEntregablesServicios(analistaCtx);
  const filaAnalista = bandejaAnalista.find(
    (row) => Number(row.orden_entrega_id) === derivarFixture.id,
  );
  const accionesAnalista = entregableMenuItems(filaAnalista || {});
  ok(accionesAnalista.map((item) => item.act).join(',')
    === 'verExpediente,observarEntregable,derivarPago,verTrazabilidad',
  'Analista CM recibe las acciones productivas definidas en RC8.15.6E-2');
  ok(await snapshotEntregable(hermano.id) === hermanoBefore,
    'E2 permanece intacto tras derivar otro E1 a Analista');
  ok(await snapshotExpediente(requerimientoId) === expedienteBefore,
    'Q. expediente y asignaciones globales permanecen intactos');
  ok(await snapshotBienes() === bienesBefore, 'R. Recepción de Bienes permanece intacta');
  ok(await snapshotOs1105() === os1105Before, 'S. OS 1105 real permanece intacta');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
  for (const usuario of usuariosOriginales) {
    await query(`
      UPDATE usuarios SET cargo=$2, permisos=$3, activo=$4 WHERE id=$1
    `, [usuario.id, usuario.cargo, usuario.permisos, usuario.activo]);
  }
}

await pool.end();
console.log(`\n=== Resultado RC8.15.6D: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
