/**
 * RC8.15.6C-2 — Derivación real de un entregable a Coordinador CM.
 * Fixtures aislados; OS 1105, Bienes y expediente global son solo lectura.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  derivarEntregableCoordinadorCM,
  listarBandejaEntregablesServicios,
  listarBandejaOrdenesEntregablesServicios,
  listarCoordinadoresCMEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
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

console.log('\n=== RC8.15.6C-2 — Derivar entregable a Coordinador CM ===\n');

const routeSource = read('server/routes/entregablesServicios.js');
const serviceSource = read('src/services/entregablesServiciosService.js');
const viewSource = read('src/views/ejecucion/presentacionEntregableView.js');
const backendSource = read('server/lib/entregablesServicios.js');
ok(/\/:id\/coordinadores-cm/.test(routeSource)
  && /listarCoordinadoresCM/.test(serviceSource), 'GET coordinadores CM conectado');
ok(/\/:id\/derivar-coordinador-cm/.test(routeSource)
  && /derivarCoordinadorCM/.test(serviceSource), 'POST derivación conectado');
ok(/Derivar a Coordinador CM/.test(viewSource)
  && /DerivarResponsable/.test(viewSource)
  && /disabled/.test(viewSource), 'modal exige seleccionar Coordinador CM');

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
  if (!base) throw new Error('No existe expediente base en Presentación de Entregables');
  requerimientoId = Number(base.requerimiento_id);
  const propietario = (await query(`
    SELECT * FROM usuarios
    WHERE activo=TRUE
    ORDER BY CASE WHEN LOWER(COALESCE(rol,''))='admin' THEN 0 ELSE 1 END, id
    LIMIT 1
  `)).rows[0];
  const candidatos = (await query(`
    SELECT * FROM usuarios
    WHERE id<>$1
    ORDER BY activo DESC, id
    LIMIT 2
  `, [propietario.id])).rows;
  if (candidatos.length < 2) throw new Error('Se requieren dos usuarios fixture adicionales');
  const coordinador = candidatos[0];
  const coordinadorInactivo = candidatos[1];
  usuariosOriginales.push(
    { id: propietario.id, cargo: propietario.cargo, permisos: propietario.permisos, activo: propietario.activo },
    { id: coordinador.id, cargo: coordinador.cargo, permisos: coordinador.permisos, activo: coordinador.activo },
    { id: coordinadorInactivo.id, cargo: coordinadorInactivo.cargo, permisos: coordinadorInactivo.permisos, activo: coordinadorInactivo.activo },
  );
  await query(`
    UPDATE usuarios
    SET activo=TRUE, cargo='Área Usuaria',
      permisos='{"perfil":"AREA_USUARIA"}'::jsonb
    WHERE id=$1
  `, [propietario.id]);
  await query(`
    UPDATE usuarios
    SET activo=TRUE, cargo='Coordinador CM',
      permisos='{"perfil":"COORDINADOR_CM"}'::jsonb
    WHERE id=$1
  `, [coordinador.id]);
  await query(`
    UPDATE usuarios
    SET activo=FALSE, cargo='Coordinador CM',
      permisos='{"perfil":"COORDINADOR_CM"}'::jsonb
    WHERE id=$1
  `, [coordinadorInactivo.id]);

  const propietarioCtx = {
    id: Number(propietario.id),
    rol: propietario.rol,
    cargo: propietario.cargo,
    permisos: propietario.permisos,
    centro: propietario.centro,
    codigo_centro_costo: propietario.codigo_centro_costo,
    alcance_datos: propietario.alcance_datos,
    username: propietario.username,
  };
  const coordinadorCtx = {
    id: Number(coordinador.id),
    rol: coordinador.rol,
    cargo: 'Coordinador CM',
    permisos: { perfil: 'COORDINADOR_CM' },
    alcance_datos: coordinador.alcance_datos,
    username: coordinador.username,
  };

  expedienteBefore = await snapshotExpediente(requerimientoId);
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,700,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimientoId, base.proveedor_id, `RC8156C2${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    const id = Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture C2 ${numero}`])).rows[0].id);
    await inicializarEstadoResponsableEntregable(id, { actualizadoPor: 'test-c2' });
    await query(`
      UPDATE entregable_estado_vigente
      SET responsable_tipo='PERSONA', responsable_usuario_id=$2,
        responsable_unidad='AREA_USUARIA',
        responsable_fuente='asignacion_explicita'
      WHERE orden_entrega_id=$1
    `, [id, propietario.id]);
    await query(`
      UPDATE entregable_asignaciones
      SET tipo_responsable='PERSONA', usuario_id=$2, unidad_codigo='AREA_USUARIA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [id, propietario.id]);
    return id;
  }

  async function crearRecepcion(entregaId, numero = 1, estado = 'RECIBIDO', tipo = 'INICIAL') {
    return (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'test-c2')
      RETURNING *
    `, [entregaId, ordenId, numero, tipo, `SGD-C2-${entregaId}-${numero}`, estado])).rows[0];
  }

  async function crearActa(entregaId, firmada = false) {
    const acta = (await query(`
      INSERT INTO entregable_conformidad_actas (
        orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
        estado_documental, generado_at, generado_por
      ) VALUES (
        $1,$2,
        (SELECT id FROM entregable_recepciones
         WHERE orden_entrega_id=$2
           AND estado IN ('RECIBIDO','SUBSANADO','CONFORME')
         ORDER BY numero_recepcion DESC, id DESC LIMIT 1),
        $3,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-c2'
      )
      RETURNING *
    `, [ordenId, entregaId, `ACTA-C2-${entregaId}`])).rows[0];
    if (firmada) {
      await query(`
        INSERT INTO entregable_conformidad_acta_visados (
          orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
          contenido_base64, estado_documental, vigente, created_by
        ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,
          'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-c2')
      `, [ordenId, entregaId, acta.id, `firmada-${entregaId}.pdf`,
        Buffer.from('%PDF-1.4 RC8156C2').toString('base64')]);
    }
    return acta;
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const sinActa = await crearEntrega(3);
  const sinFirmada = await crearEntrega(4);
  const observado = await crearEntrega(5);
  const etapaIncompatible = await crearEntrega(6);
  const r1 = await crearRecepcion(e1);
  await crearRecepcion(e2);
  await crearRecepcion(sinActa);
  await crearRecepcion(sinFirmada);
  const rObservada = await crearRecepcion(observado);
  await crearRecepcion(etapaIncompatible);
  await crearActa(e1, true);
  await crearActa(e2, true);
  await crearActa(sinFirmada, false);
  await crearActa(observado, true);
  await crearActa(etapaIncompatible, true);
  await query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, motivo, estado, observado_por
    ) VALUES ($1,$2,$3,'Observación abierta fixture','OBS_EMITIDA','test-c2')
  `, [ordenId, observado, rObservada.id]);
  await query(`
    UPDATE entregable_estado_vigente
    SET estado_codigo='REVISION_COORDINADOR_CM',
      estado_label='Revisión Coordinador CM',
      etapa_codigo='REVISION_COORDINADOR_CM',
      etapa_label='Revisión Coordinador CM',
      version=version+1
    WHERE orden_entrega_id=$1
  `, [etapaIncompatible]);

  const lista = await listarCoordinadoresCMEntregable(e1, propietarioCtx);
  ok(lista.some((item) => Number(item.id) === Number(coordinador.id))
    && !lista.some((item) => Number(item.id) === Number(coordinadorInactivo.id))
    && lista.every((item) => Number(item.id) !== Number(propietario.id)),
  'A. GET lista únicamente Coordinadores CM activos');

  const errorInvalido = await expectReject(() => derivarEntregableCoordinadorCM(
    e2,
    { responsable_id: propietario.id },
    propietarioCtx,
    propietario.username,
  ));
  ok(errorInvalido?.code === 'COORDINADOR_CM_INVALIDO',
    'B. destinatario sin perfil COORDINADOR_CM es rechazado');
  const errorSinActa = await expectReject(() => derivarEntregableCoordinadorCM(
    sinActa, { responsable_id: coordinador.id }, propietarioCtx, propietario.username,
  ));
  ok(errorSinActa?.code === 'SIN_ACTA_GENERADA', 'C. sin acta generada bloquea');
  const errorSinFirmada = await expectReject(() => derivarEntregableCoordinadorCM(
    sinFirmada, { responsable_id: coordinador.id }, propietarioCtx, propietario.username,
  ));
  ok(errorSinFirmada?.code === 'SIN_ACTA_FIRMADA_VIGENTE', 'D. sin acta firmada bloquea');
  const errorObservado = await expectReject(() => derivarEntregableCoordinadorCM(
    observado, { responsable_id: coordinador.id }, propietarioCtx, propietario.username,
  ));
  ok(errorObservado?.code === 'ENTREGABLE_OBSERVADO', 'E. observación abierta bloquea');
  const errorEtapa = await expectReject(() => derivarEntregableCoordinadorCM(
    etapaIncompatible, { responsable_id: coordinador.id }, propietarioCtx, propietario.username,
  ));
  ok(errorEtapa?.code === 'ETAPA_ENTREGABLE_NO_COMPATIBLE', 'F. etapa incompatible bloquea');

  ok(/transicionarEntregable\s*\(\{/.test(backendSource)
    && /ENTREGABLE_DERIVADO_COORDINADOR_CM/.test(backendSource),
  'G. derivación usa transicionarEntregable y evento canónico');
  ok(!/transicionarExpediente\s*\(/.test(backendSource),
    'H. derivación no usa transicionarExpediente');

  const e2Before = await snapshotEntregable(e2);
  const resultado = await derivarEntregableCoordinadorCM(
    e1,
    { responsable_id: coordinador.id },
    propietarioCtx,
    propietario.username,
  );
  ok(resultado.estado?.etapaCodigo === 'REVISION_COORDINADOR_CM',
    'I. E1 cambia a REVISION_COORDINADOR_CM');
  ok(resultado.estado?.responsableTipo === 'PERSONA'
    && Number(resultado.estado?.responsableUsuarioId) === Number(coordinador.id),
  'J. E1 queda a cargo del Coordinador PERSONA seleccionado');
  const asignacionesE1 = (await query(`
    SELECT * FROM entregable_asignaciones
    WHERE orden_entrega_id=$1 ORDER BY id
  `, [e1])).rows;
  ok(asignacionesE1.length === 2
    && asignacionesE1.filter((row) => row.activo).length === 1
    && Number(asignacionesE1.find((row) => row.activo)?.usuario_id) === Number(coordinador.id),
  'K. solo la asignación activa de E1 cambia');
  const eventosE1 = (await query(`
    SELECT * FROM entregable_eventos
    WHERE orden_entrega_id=$1
      AND evento_codigo='ENTREGABLE_DERIVADO_COORDINADOR_CM'
  `, [e1])).rows;
  ok(eventosE1.length === 1
    && eventosE1[0].etapa_anterior_codigo === 'PRESENTACION_ENTREGABLES'
    && eventosE1[0].etapa_nueva_codigo === 'REVISION_COORDINADOR_CM',
  'L. evento de E1 conserva transición y responsables');
  ok(await snapshotEntregable(e2) === e2Before, 'M/N. E2, su asignación y eventos permanecen intactos');
  ok(await snapshotExpediente(requerimientoId) === expedienteBefore,
    'O. expediente global y asignaciones globales permanecen intactos');

  const bandejaAu = await listarBandejaEntregablesServicios(propietarioCtx);
  const filaE1Au = bandejaAu.find((row) => Number(row.orden_entrega_id) === e1);
  const filaE2Au = bandejaAu.find((row) => Number(row.orden_entrega_id) === e2);
  ok(filaE1Au
    && !filaE1Au.puede_registrar_recepcion
    && !filaE1Au.puede_observar
    && !filaE1Au.puede_gestionar_conformidad
    && !filaE1Au.puede_derivar_coordinador_cm
    && filaE2Au?.puede_derivar_coordinador_cm,
  'P. Área Usuaria pierde acciones mutantes solo en E1');
  const bandejaCoord = await listarBandejaEntregablesServicios(coordinadorCtx);
  const filaE1Coord = bandejaCoord.find((row) => Number(row.orden_entrega_id) === e1);
  const accionesCoord = entregableMenuItems(filaE1Coord || {});
  const accionesCoordCodigos = accionesCoord.map((item) => item.act);
  ok(filaE1Coord?.responsable_usuario_id === Number(coordinador.id)
    && accionesCoordCodigos.includes('verExpediente')
    && accionesCoordCodigos.includes('observarEntregable')
    && accionesCoordCodigos.includes('derivarAnalistaCM')
    && accionesCoordCodigos.includes('verTrazabilidad')
    && !accionesCoordCodigos.includes('generarActa'),
  'Q. Coordinador CM ve E1 con las acciones de revisión vigentes');

  const ordenes = await listarBandejaOrdenesEntregablesServicios(propietarioCtx);
  const resumenOrden = ordenes.find((row) => Number(row.orden_id) === ordenId);
  ok(resumenOrden?.estado_agregado_heterogeneo === true
    && resumenOrden.estados_entregables.some((item) => item.codigo === 'REVISION_COORDINADOR_CM')
    && resumenOrden.estados_entregables.some((item) => item.codigo === 'PRESENTACION_ENTREGABLES'),
  'bandeja Órdenes conserva el resumen de etapas distintas por entregable');
  ok(await snapshotBienes() === bienesBefore, 'R. Recepción de Bienes permanece intacta');
  ok(await snapshotOs1105() === os1105Before, 'S. OS 1105 real permanece intacta');
  void r1;
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
      UPDATE usuarios
      SET cargo=$2, permisos=$3, activo=$4
      WHERE id=$1
    `, [usuario.id, usuario.cargo, usuario.permisos, usuario.activo]);
  }
}

await pool.end();
console.log(`\n=== Resultado RC8.15.6C-2: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
