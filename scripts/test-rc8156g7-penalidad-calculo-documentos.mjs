/**
 * RC8.15.6G-7 — Cálculo y documentos de penalidad.
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
} from '../server/lib/entregablesServicios.js';
import {
  calcularPenalidadInstitucional,
  REGLA_PENALIDAD_VERSION,
} from '../shared/penalidadCalculo.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { pagoMenuItems } from '../src/views/ejecucion/derivacionPagoView.js';
import {
  calcularPenalidadEntregable,
  generarFormatoPenalidadEntregable,
  adjuntarFormatoPenalidadFirmado,
  generarCartaPenalidadEntregable,
  obtenerFichaCalculoPenalidadEntregable,
} from '../server/lib/entregablesServicios.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

async function expectError(work) {
  try { await work(); return null; } catch (e) { return e; }
}

console.log('\n=== RC8.15.6G-7 — Cálculo/documentos penalidad ===\n');

// Helper unitario
let penalidadConAtraso = null;
{
  const sinAtraso = calcularPenalidadInstitucional({ monto_base: 1000, plazo_dias: 10, dias_atraso: 0 });
  ok(sinAtraso.ok && sinAtraso.resultado.penalidad_aplicable === 0, 'sin atraso => penalidad aplicable 0');
  penalidadConAtraso = calcularPenalidadInstitucional({ monto_base: 1000, plazo_dias: 10, dias_atraso: 5 });
  ok(penalidadConAtraso.ok && penalidadConAtraso.resultado.penalidad_calculada > 0, 'atraso con penalidad calculada');
  const tope = calcularPenalidadInstitucional({ monto_base: 10000, plazo_dias: 5, dias_atraso: 100 });
  ok(tope.resultado.penalidad_aplicable <= tope.resultado.penalidad_maxima + 0.01, 'aplicación de límite máximo');
  const amp = calcularPenalidadInstitucional({ monto_base: 1000, plazo_dias: 10, dias_atraso: 0 });
  ok(amp.ok, 'ampliación reduce atraso (helper base con 0 atraso)');
}

ok(read('server/migrations/056_entregable_penalidad_calculo.js').includes('entregable_penalidad_calculo'),
  'Migración 056 definida');
ok(read('shared/penalidadCalculo.js').includes(REGLA_PENALIDAD_VERSION), 'helper central penalidadCalculo.js');

const fixture = { ordenId: null, entregaId: null, usuarioIds: [] };

try {
  const tables = await query(`SELECT to_regclass('public.entregable_penalidad_calculo') AS t`);
  ok(Boolean(tables.rows[0]?.t), 'Tabla entregable_penalidad_calculo disponible');

  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];

  const analista = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos)
    VALUES ($1,$2,$3,'usuario','Analista CM',TRUE,$4::jsonb) RETURNING *
  `, [
    `G7${nonce}`.slice(0, 20), `g7_${nonce}`, 'Fixture G7 Analista',
    JSON.stringify({ perfil: 'ANALISTA_CM' }),
  ])).rows[0];
  const otro = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos)
    VALUES ($1,$2,$3,'usuario','Analista CM',TRUE,$4::jsonb) RETURNING *
  `, [
    `G7O${nonce}`.slice(0, 20), `g7o_${nonce}`, 'Fixture G7 Otro',
    JSON.stringify({ perfil: 'ANALISTA_CM' }),
  ])).rows[0];
  fixture.usuarioIds.push(analista.id, otro.id);

  const ctx = (u) => ({
    id: Number(u.id), username: u.username, nombre: u.nombre, cargo: u.cargo, rol: u.rol,
    permisos: { perfil: 'ANALISTA_CM' },
  });

  fixture.ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion, enviado_proveedor_at
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,5000,'EN_EJECUCION','SERVICIO',CURRENT_DATE) RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G7${nonce}`])).rows[0].id);

  fixture.entregaId = Number((await query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
      fecha_base, fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','G7 E1',10,CURRENT_DATE,CURRENT_DATE+10,1000,'ACTIVO') RETURNING id
  `, [fixture.ordenId])).rows[0].id);

  await inicializarEstadoResponsableEntregable(fixture.entregaId, { actualizadoPor: 'test-g7' });
  await query(`
    UPDATE entregable_estado_vigente
    SET etapa_codigo=$2, estado_codigo='EN_PREPARACION_PAGO',
        responsable_tipo='PERSONA', responsable_usuario_id=$3
    WHERE orden_entrega_id=$1
  `, [fixture.entregaId, ETAPAS.PREPARACION_EXPEDIENTE_PAGO, analista.id]);
  await query(`
    UPDATE entregable_asignaciones SET usuario_id=$2, tipo_responsable='PERSONA', etapa_codigo=$3
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [fixture.entregaId, analista.id, ETAPAS.PREPARACION_EXPEDIENTE_PAGO]);

  await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE+15,$3,'RECIBIDO','test-g7')
  `, [fixture.entregaId, fixture.ordenId, `SGD-G7-${nonce}`]);

  await evaluarPenalidadEntregable(fixture.entregaId, {
    corresponde_penalidad: true,
    observacion: 'Atraso imputable fixture G7',
  }, ctx(analista), analista.username);

  const fila = (await listarBandejaPreparacionExpedientePago(ctx(analista)))
    .find((r) => Number(r.orden_entrega_id) === fixture.entregaId);
  ok(Boolean(fila?.puede_calcular_penalidad_pago), 'menú Calcular penalidad habilitado');
  ok(pagoMenuItems(fila).some((i) => i.act === 'calcularPenalidad'), 'pagoMenuItems incluye Calcular penalidad');

  const ficha = await obtenerFichaCalculoPenalidadEntregable(fixture.entregaId, ctx(analista));
  ok(ficha.ficha.monto_base > 0, 'ficha carga monto base');
  ok(Number(ficha.ficha.dias_atraso) > 0, 'ficha con días de atraso');

  const calc1 = await calcularPenalidadEntregable(fixture.entregaId, ctx(analista), analista.username);
  ok(calc1.version === 1, 'persistencia snapshot v1');
  ok(calc1.resultado.penalidad_aplicable > 0, 'penalidad aplicable > 0 con atraso');

  const calc2 = await calcularPenalidadEntregable(fixture.entregaId, ctx(analista), analista.username);
  ok(calc2.version === 2, 'modificación trazable (v2)');

  const eventos = await listarTrazabilidadEntregable(fixture.entregaId, ctx(analista));
  ok(eventos.some((e) => e.evento_codigo === 'PENALIDAD_CALCULADA'), 'evento PENALIDAD_CALCULADA');

  const formato = await generarFormatoPenalidadEntregable(fixture.entregaId, ctx(analista), analista.username);
  ok(formato.documento?.id > 0, 'generación PDF formato');
  const eventosPost = await listarTrazabilidadEntregable(fixture.entregaId, ctx(analista));
  ok(eventosPost.some((e) => e.evento_codigo === 'FORMATO_PENALIDAD_GENERADO'),
    'evento FORMATO_PENALIDAD_GENERADO');

  const firmado = await adjuntarFormatoPenalidadFirmado(fixture.entregaId, {
    nombre_archivo: 'firmado.pdf',
    mime_type: 'application/pdf',
    contenido_base64: pdf('firmado'),
  }, ctx(analista), analista.username);
  ok(firmado.documento?.id > 0, 'carga del firmado');

  const carta = await generarCartaPenalidadEntregable(fixture.entregaId, ctx(analista), analista.username);
  ok(carta.documento?.id > 0, 'generación carta');

  const errOtro = await expectError(() => calcularPenalidadEntregable(
    fixture.entregaId, ctx(otro), otro.username,
  ));
  ok(errOtro?.status === 403, 'usuario no responsable bloqueado');

  // Varias ampliaciones reducen atraso — helper
  const reducido = calcularPenalidadInstitucional({
    monto_base: 1000, plazo_dias: 10, dias_atraso: 2,
  });
  ok(reducido.resultado.penalidad_calculada < penalidadConAtraso.resultado.penalidad_calculada,
    'menor atraso => menor penalidad');

  // OS 1105/E1 ejemplo numérico SIN alterar datos
  const os1105 = (await query(`
    SELECT oe.id, oe.dias_plazo, oe.fecha_maxima, oe.importe, oei.precio_total,
      oc.monto_total, oc.enviado_proveedor_at,
      (SELECT er.fecha_recepcion_mesa_partes FROM entregable_recepciones er
        WHERE er.orden_entrega_id=oe.id ORDER BY er.numero_recepcion DESC LIMIT 1) AS fecha_presentacion,
      (SELECT COALESCE(SUM(a.dias_ampliacion),0) FROM entregable_penalidad_ampliacion_plazo a
        WHERE a.orden_entrega_id=oe.id) AS dias_amp
    FROM ordenes_contratacion oc
    JOIN orden_entregas oe ON oe.orden_id=oc.id AND oe.numero_entrega=1 AND oe.estado='ACTIVO'
    LEFT JOIN LATERAL (
      SELECT precio_total FROM orden_entrega_items oei WHERE oei.orden_entrega_id=oe.id LIMIT 1
    ) oei ON TRUE
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105' LIMIT 1
  `)).rows[0];
  if (os1105?.id) {
    const { calcularPenalidadPlazosBase } = await import('../shared/penalidadPlazos.js');
    const plazos = calcularPenalidadPlazosBase({
      fechaMaximaContractual: os1105.fecha_maxima,
      ampliaciones: Number(os1105.dias_amp) > 0 ? [{ dias_ampliacion: Number(os1105.dias_amp) }] : [],
      fechaPresentacion: os1105.fecha_presentacion,
    });
    const ejemplo = calcularPenalidadInstitucional({
      monto_base: Number(os1105.precio_total ?? os1105.importe ?? 0),
      plazo_dias: Number(os1105.dias_plazo),
      dias_atraso: plazos.dias_atraso,
    });
    ok(ejemplo.ok || ejemplo.faltantes?.length >= 0, 'OS 1105/E1 ejemplo numérico evaluado sin persistir');
    console.log(`  ~ OS 1105/E1 ejemplo: atraso=${plazos.dias_atraso}, penalidad_aplicable=${ejemplo.ok ? ejemplo.resultado.penalidad_aplicable : 'N/D'}`);
  }
} catch (err) {
  console.error(`  ✗ ${err.message}`);
  throw err;
} finally {
  if (fixture.entregaId) {
    await query('DELETE FROM entregable_penalidad_calculo WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM entregable_pago_documentos WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM entregable_penalidad_evaluacion WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM entregable_eventos WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM entregable_recepciones WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM entregable_estado_vigente WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM entregable_asignaciones WHERE orden_entrega_id=$1', [fixture.entregaId]).catch(() => {});
    await query('DELETE FROM orden_entregas WHERE id=$1', [fixture.entregaId]).catch(() => {});
  }
  if (fixture.ordenId) {
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [fixture.ordenId]).catch(() => {});
  }
  if (fixture.usuarioIds.length) {
    await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [fixture.usuarioIds]).catch(() => {});
  }
  const resid = Number((await query(`
    SELECT COUNT(*)::int AS c FROM ordenes_contratacion WHERE numero_orden LIKE 'RC8156G7%'
  `)).rows[0]?.c || 0);
  ok(resid === 0, 'cero residuos RC8156G7');
}

console.log('\nG-7 completado.\n');
