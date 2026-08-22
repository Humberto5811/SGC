/**
 * RC8.15.6G-6 — Pagos: columnas, trazabilidad entregable, penalidad y ampliaciones.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import {
  evaluarPenalidadEntregable,
  listarBandejaPreparacionExpedientePago,
  listarTrazabilidadEntregable,
  obtenerContextoPenalidadPagoEntregable,
  obtenerPanelTrazabilidadEntregable,
  registrarAmpliacionPlazoPenalidad,
  eliminarAmpliacionPlazoPenalidad,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import {
  calcularPenalidadPlazosBase,
  validarCoherenciaPenalidad,
} from '../shared/penalidadPlazos.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

async function expectError(work) {
  try {
    await work();
    return null;
  } catch (e) {
    return e;
  }
}

console.log('\n=== RC8.15.6G-6 — Pagos penalidad / trazabilidad ===\n');

// A — orden columnas FE
{
  const view = read('src/views/ejecucion/derivacionPagoView.js');
  const headerIdx = view.indexOf('<th class="text-center">Penalidad</th>');
  const estadoIdx = view.indexOf('<th>Estado</th>', headerIdx);
  const respIdx = view.indexOf('<th>Responsable</th>', estadoIdx);
  const accIdx = view.indexOf('<th>Acciones</th>', respIdx);
  ok(headerIdx > 0 && estadoIdx > headerIdx && respIdx > estadoIdx && accIdx > respIdx,
    'A. columnas finales: Penalidad | Estado | Responsable | Acciones');
  const rowBlock = view.slice(view.indexOf('function renderRow'), view.indexOf('async function loadDestinatarios'));
  const penIdx = rowBlock.indexOf('renderPenalidadBadge');
  const estIdx = rowBlock.indexOf('renderEstadoBadgeFromRow');
  const resIdx = rowBlock.indexOf('renderResponsableCellHtml');
  ok(penIdx < estIdx && estIdx < resIdx, 'A2. celdas de fila en el mismo orden');
}

// Migración 055 presente
ok(read('server/migrations/055_entregable_penalidad_ampliacion_plazo.js').includes('entregable_penalidad_ampliacion_plazo'),
  'Migración 055 definida');

// Fórmulas base
{
  const r = calcularPenalidadPlazosBase({
    fechaMaximaContractual: '2026-01-10',
    ampliaciones: [{ dias_ampliacion: 5 }, { dias_ampliacion: 3 }],
    fechaPresentacion: '2026-01-20',
  });
  ok(r.total_dias_ampliacion === 8, 'I. suma ampliaciones = 8');
  ok(r.fecha_maxima_ajustada === '2026-01-18', 'J. fecha máxima ajustada = 10 + 8 días');
  ok(r.dias_atraso === 2, 'K. días de atraso = 20 - 18 = 2');
  ok(!validarCoherenciaPenalidad({ correspondePenalidad: true, diasAtraso: 0 }).ok,
    'coherencia: Sí sin atraso requiere sustento');
}

let fixtureOrdenId = null;
let fixtureEntregaId = null;
let fixtureAnalistaId = null;
let fixtureOtroAnalistaId = null;
const fixtureUsuarioIds = [];

try {
  const tables = await query(`
    SELECT to_regclass('public.entregable_penalidad_ampliacion_plazo') AS amp
  `);
  ok(Boolean(tables.rows[0]?.amp), 'Tabla entregable_penalidad_ampliacion_plazo disponible (ejecutar migrate)');

  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];

  async function crearUsuario(sufijo) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos)
      VALUES ($1,$2,$3,'usuario','Analista CM',TRUE,$4::jsonb) RETURNING *
    `, [
      `G6${sufijo}${nonce}`.slice(0, 20),
      `g6_${nonce}_${sufijo}`,
      `Fixture G6 ${sufijo}`,
      JSON.stringify({ perfil: 'ANALISTA_CM' }),
    ])).rows[0];
    fixtureUsuarioIds.push(row.id);
    return row;
  }

  const analista = await crearUsuario('resp');
  const otro = await crearUsuario('otro');
  fixtureAnalistaId = analista.id;
  fixtureOtroAnalistaId = otro.id;
  const ctx = (user) => ({
    id: Number(user.id),
    username: user.username,
    nombre: user.nombre,
    cargo: user.cargo,
    rol: user.rol,
    permisos: { perfil: 'ANALISTA_CM' },
  });

  fixtureOrdenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion, enviado_proveedor_at
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,500,'EN_EJECUCION','SERVICIO',CURRENT_DATE) RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G6${nonce}`])).rows[0].id);

  fixtureEntregaId = Number((await query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
      fecha_base, fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','G6 E1',10,CURRENT_DATE,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [fixtureOrdenId])).rows[0].id);

  await inicializarEstadoResponsableEntregable(fixtureEntregaId, { actualizadoPor: 'test-g6' });
  await query(`
    UPDATE entregable_estado_vigente
    SET etapa_codigo=$2, etapa_label='Preparación de expediente para Pago',
        estado_codigo='EN_PREPARACION_PAGO', estado_label='En preparación de pago',
        responsable_tipo='PERSONA', responsable_usuario_id=$3
    WHERE orden_entrega_id=$1
  `, [fixtureEntregaId, ETAPAS.PREPARACION_EXPEDIENTE_PAGO, analista.id]);
  await query(`
    UPDATE entregable_asignaciones
    SET usuario_id=$2, tipo_responsable='PERSONA', etapa_codigo=$3
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [fixtureEntregaId, analista.id, ETAPAS.PREPARACION_EXPEDIENTE_PAGO]);
  await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE+15,$3,'RECIBIDO','test-g6')
  `, [fixtureEntregaId, fixtureOrdenId, `SGD-G6-${nonce}`]);

  const fila = (await listarBandejaPreparacionExpedientePago(ctx(analista)))
    .find((item) => Number(item.orden_entrega_id) === fixtureEntregaId);
  ok(Boolean(fila), 'B. fixture aparece en bandeja Pagos');

  const contexto = await obtenerContextoPenalidadPagoEntregable(fixtureEntregaId, ctx(analista));
  ok(contexto.numero_entrega === 1, 'F. carga número entregable');
  ok(contexto.fecha_maxima_contractual, 'F2. fecha máxima contractual');
  ok(contexto.fecha_presentacion, 'F3. fecha presentación desde recepción vigente');
  ok(contexto.puede_editar === true, 'responsable puede editar');

  const amp1 = await registrarAmpliacionPlazoPenalidad(fixtureEntregaId, {
    dias_ampliacion: 4,
    numero_documento: `RES-${nonce}-1`,
    fecha_documento: '2026-02-01',
    observacion: 'Primera ampliación',
    documento: {
      nombre_archivo: 'amp1.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('amp1'),
    },
  }, ctx(analista), analista.username);
  ok(amp1.ampliacion?.documento_id > 0, 'G. ampliación registrada');
  ok(amp1.ampliacion?.documento_nombre === 'amp1.pdf', 'H. adjunto asociado');

  await registrarAmpliacionPlazoPenalidad(fixtureEntregaId, {
    dias_ampliacion: 2,
    numero_documento: `RES-${nonce}-2`,
    fecha_documento: '2026-02-05',
    documento: {
      nombre_archivo: 'amp2.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('amp2'),
    },
  }, ctx(analista), analista.username);

  const ctx2 = await obtenerContextoPenalidadPagoEntregable(fixtureEntregaId, ctx(analista));
  ok(ctx2.total_dias_ampliacion === 6, 'I2. suma dos ampliaciones en contexto');
  ok(Number(ctx2.dias_atraso) >= 0, 'K2. días de atraso calculados en contexto');

  const eventosAntes = (await listarTrazabilidadEntregable(fixtureEntregaId, ctx(analista))).length;
  ok(eventosAntes >= 2, 'E. histórico con eventos de ampliación');

  const errOtro = await expectError(() => registrarAmpliacionPlazoPenalidad(fixtureEntregaId, {
    dias_ampliacion: 1,
    numero_documento: 'X',
    fecha_documento: '2026-02-06',
    documento: { nombre_archivo: 'x.pdf', mime_type: 'application/pdf', contenido_base64: pdf('x') },
  }, ctx(otro), otro.username));
  ok(errOtro?.status === 403, 'L. usuario no responsable no puede modificar ampliaciones');

  await evaluarPenalidadEntregable(fixtureEntregaId, {
    corresponde_penalidad: false,
    observacion: ctx2.dias_atraso > 0 ? 'Excepción documentada' : '',
  }, ctx(analista), analista.username);

  const panel = await obtenerPanelTrazabilidadEntregable(fixtureEntregaId, ctx(analista));
  ok(panel.contexto.etapa_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'C. trazabilidad panel reconoce PEP como etapa vigente');
  ok(String(panel.contexto.submodulo_label || '').toLowerCase().includes('pago'),
    'C2. submódulo Pagos en encabezado');
  ok(Number(panel.contexto.responsable_usuario_id || panel.contexto.responsable_nombre) > 0
    || Boolean(panel.contexto.responsable_nombre),
    'D. responsable vigente expuesto');
  ok(panel.eventos.length >= eventosAntes, 'E2. recorrido conserva eventos previos');

  // OS 1105/E1 — solo lectura
  const os1105 = (await query(`
    SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, u.username, u.id AS responsable_id,
      u.nombre, u.rol, u.cargo, u.permisos
    FROM ordenes_contratacion oc
    JOIN orden_entregas oe ON oe.orden_id = oc.id AND oe.numero_entrega = 1 AND oe.estado = 'ACTIVO'
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105'
    ORDER BY oc.id LIMIT 1
  `)).rows[0];
  if (os1105?.orden_entrega_id) {
    const ctx1105 = {
      id: Number(os1105.responsable_id),
      username: os1105.username,
      nombre: os1105.nombre,
      cargo: os1105.cargo,
      rol: os1105.rol,
      permisos: os1105.permisos,
    };
    const fila1105 = (await listarBandejaPreparacionExpedientePago(ctx1105))
      .find((item) => Number(item.orden_entrega_id) === Number(os1105.orden_entrega_id));
    ok(Boolean(fila1105), 'B2. OS 1105/E1 en bandeja Pagos');
    const panel1105 = await obtenerPanelTrazabilidadEntregable(os1105.orden_entrega_id, ctx1105);
    ok(panel1105.contexto.etapa_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
      'C3. OS 1105/E1 trazabilidad PEP');
    ok(String(os1105.username || '').toLowerCase() === 'jcrisostomo'
      || String(panel1105.contexto.responsable_username || '').toLowerCase() === 'jcrisostomo',
      'D2. OS 1105/E1 responsable jcrisostomo');
    ok(panel1105.contexto.fuente_estado === 'ENTREGABLE', 'OS 1105 usa estado entregable, no expediente global');
    ok(panel1105.eventos.length > 0, 'E3. OS 1105 conserva histórico entregable');
  } else {
    console.log('  ~ OS 1105/E1 no disponible en este entorno (omitido)');
  }
} catch (err) {
  console.error(`  ✗ Error en pruebas G6: ${err.message}`);
  if (err.code === '42P01') {
    console.error('    Ejecute: node server/migrate.js');
  }
  throw err;
} finally {
  if (fixtureEntregaId) {
    await query('DELETE FROM entregable_penalidad_ampliacion_plazo WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM entregable_pago_documentos WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM entregable_penalidad_evaluacion WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM entregable_eventos WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM entregable_recepciones WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM entregable_estado_vigente WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM entregable_asignaciones WHERE orden_entrega_id=$1', [fixtureEntregaId]).catch(() => {});
    await query('DELETE FROM orden_entregas WHERE id=$1', [fixtureEntregaId]).catch(() => {});
  }
  if (fixtureOrdenId) {
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [fixtureOrdenId]).catch(() => {});
  }
  if (fixtureUsuarioIds.length) {
    await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [fixtureUsuarioIds]).catch(() => {});
  }
}

console.log('\nG-6 completado.\n');
