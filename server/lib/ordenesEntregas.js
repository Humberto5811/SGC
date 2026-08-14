/**
 * Cronograma de entregas / entregables de órdenes de contratación.
 */
import { getClient, query } from '../db.js';
import {
  httpError,
  getOrdenById,
  reconciliarItemsContractuales,
  registrarEventoOrden,
  guardarInicioActividad,
  sincronizarPreciosItemsDesdeCuadro,
  ESTADOS_ORDEN,
} from './ordenesContratacion.js';
import { calcularFechaMaximaEntrega, normalizeTipoDias } from './diasPlazo.js';
import {
  validarCronogramaContraItems,
  normalizarLineasEntrega,
  normalizarLineasEntregableItemUnico,
  esCronogramaPorHitos,
} from './ordenesValidaciones.js';
import { normalizeCondicionInicio } from '../../shared/ordenCronogramaContractual.js';
import {
  buildEntregaContract,
  normalizeCodigoEntrega,
  resolveEtiquetaEntrega,
  correlativoFromEntrega,
} from '../../shared/entregaContractual.js';

export { validarCronogramaContraItems };

const COND_INICIO = Object.freeze({
  EMISION_ORDEN: 'EMISION_ORDEN',
  DIA_SIGUIENTE_NOTIFICACION: 'DIA_SIGUIENTE_NOTIFICACION',
  SUSCRIPCION_ACTA_INICIO: 'SUSCRIPCION_ACTA_INICIO',
  DIA_SIGUIENTE_ACTA_INICIO: 'DIA_SIGUIENTE_ACTA_INICIO',
  SUSCRIPCION_CONTRATO: 'SUSCRIPCION_CONTRATO',
  DIA_SIGUIENTE_CONTRATO: 'DIA_SIGUIENTE_CONTRATO',
});

function assertEditableCronograma(orden) {
  const bloqueados = [
    ESTADOS_ORDEN.ORDEN_ENVIADA,
    ESTADOS_ORDEN.ORDEN_ENVIADA_PENDIENTE_CONFIRMACION,
    ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA,
    ESTADOS_ORDEN.ORDEN_EN_EJECUCION,
    ESTADOS_ORDEN.DERIVADO_EJECUCION,
    ESTADOS_ORDEN.ORDEN_ANULADA,
  ];
  if (bloqueados.includes(orden.estado)) {
    throw httpError('El cronograma no es editable en este estado', 409, 'CRONOGRAMA_BLOQUEADO');
  }
}

function descAuto(e, total = 1) {
  const etiqueta = resolveEtiquetaEntrega(e, { totalEntregas: total });
  if (etiqueta && etiqueta !== '—') return etiqueta;
  const tipo = String(e.tipo_entrega || 'ENTREGA').toUpperCase();
  const num = Number(e.numero_entrega) || 1;
  const label = tipo === 'ENTREGABLE' ? 'Entregable' : (tipo === 'PRESTACION' ? 'Prestación' : 'Entrega');
  return String(e.descripcion || '').trim() || `${label} ${num === 1 && total === 1 ? 'única' : num}`;
}

function resolveCodigoYEtiqueta(e, total = 1) {
  const correlativo = String(e.correlativo || e.codigo_entrega || '').trim().toUpperCase();
  let codigo = normalizeCodigoEntrega(correlativo || e.codigo_entrega);
  if (!codigo) {
    const n = Number(e.numero_entrega) || 1;
    codigo = (n === 1 && total === 1) ? 'UNICO' : `E${n}`;
  }
  let etiqueta = String(e.etiqueta_entrega || '').trim();
  if (!etiqueta) {
    if (codigo === 'UNICO') etiqueta = 'ÚNICO';
    else etiqueta = resolveEtiquetaEntrega({ ...e, codigo_entrega: codigo }, { totalEntregas: total });
  }
  return { codigo, etiqueta };
}

/** Fechas de cronograma con conteo inclusivo (día 1 = fecha efectiva). */
function fechasEntregaDesdeCondicion(orden, e) {
  // Normaliza cada candidato por separado (no un OR crudo) — un valor legacy/no-canónico
  // en la entrega no debe enmascarar la condición realmente vigente de la orden.
  const cond = normalizeCondicionInicio(e.evento_inicio_plazo)
    || normalizeCondicionInicio(e.condicion_inicio)
    || normalizeCondicionInicio(orden.condicion_inicio)
    || COND_INICIO.EMISION_ORDEN;
  const manual = e.fecha_manual || e.fecha_evento || e.fecha_base || null;
  const calc = calcularFechaMaximaEntrega({
    condicionInicio: cond,
    fechaOrden: orden.fecha_orden,
    fechaNotificacion: orden.enviado_proveedor_at,
    fechaActa: manual,
    fechaContrato: manual,
    plazoDias: e.dias_plazo,
    tipoDias: normalizeTipoDias(e.tipo_dias || 'calendario'),
  });
  return {
    condicion: cond,
    fechaEvento: calc.fechaEvento,
    fechaEfectiva: calc.fechaEfectivaInicio,
    fechaMaxima: calc.fechaMaxima,
    pendienteNotificacion: !!calc.pendienteNotificacion,
  };
}

export async function listarEntregas(ordenId, client = null) {
  const run = client?.query ? client.query.bind(client) : query;
  const { rows: entregas } = await run(`
    SELECT * FROM orden_entregas
    WHERE orden_id = $1 AND estado <> 'ANULADO'
    ORDER BY numero_entrega ASC, id ASC
  `, [ordenId]);

  const total = entregas.length;
  const out = [];
  for (const e of entregas) {
    const { rows: items } = await run(`
      SELECT ei.*, oi.descripcion AS item_descripcion, oi.orden_item
      FROM orden_entrega_items ei
      JOIN orden_items oi ON oi.id = ei.orden_item_id
      WHERE ei.orden_entrega_id = $1
      ORDER BY oi.orden_item ASC
    `, [e.id]);
    const contract = buildEntregaContract(e, { totalEntregas: total });
    out.push({
      id: e.id,
      orden_id: e.orden_id,
      numero_entrega: e.numero_entrega,
      tipo_entrega: e.tipo_entrega,
      descripcion: e.descripcion,
      etiqueta_entrega: contract.etiquetaEntrega,
      codigo_entrega: contract.codigoEntrega,
      correlativo: correlativoFromEntrega({ ...e, ...contract }, total),
      dias_plazo: e.dias_plazo,
      tipo_dias: e.tipo_dias,
      evento_inicio_plazo: e.evento_inicio_plazo,
      fecha_base: e.fecha_base,
      fecha_maxima: e.fecha_maxima,
      lugar_entrega: e.lugar_entrega,
      observaciones: e.observaciones,
      porcentaje: e.porcentaje != null ? Number(e.porcentaje) : null,
      importe: e.importe != null ? Number(e.importe) : null,
      estado: e.estado,
      entregaContract: contract,
      items: items.map((it) => ({
        id: it.id,
        orden_item_id: it.orden_item_id,
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        precio_total: Number(it.precio_total),
        porcentaje: it.porcentaje != null ? Number(it.porcentaje) : null,
        item_descripcion: it.item_descripcion,
        orden_item: it.orden_item,
      })),
    });
  }
  return out;
}

export async function recalcularFechasEntregas(ordenId) {
  const orden = await getOrdenById(ordenId);
  const entregas = await listarEntregas(ordenId);
  const updated = [];
  for (const e of entregas) {
    const f = fechasEntregaDesdeCondicion(orden, e);
    await query(`
      UPDATE orden_entregas SET
        fecha_base = $2, fecha_maxima = $3, evento_inicio_plazo = $4, updated_at = NOW()
      WHERE id = $1
    `, [e.id, f.fechaEfectiva, f.fechaMaxima, f.condicion]);
    updated.push({
      id: e.id,
      fecha_base: f.fechaEfectiva,
      fecha_maxima: f.fechaMaxima,
      evento_inicio_plazo: f.condicion,
      pendiente_notificacion: f.pendienteNotificacion,
    });
  }
  return updated;
}

/**
 * Ejecuta el reemplazo completo usando un client que YA está en transacción.
 * Exportado para pruebas de rollback con un client controlado.
 */
export async function guardarEntregasConClient(
  client,
  ordenId,
  entregasPayload,
  usuario,
  rol,
  deps = {},
) {
  if (!client?.query) throw new TypeError('client transaccional requerido');
  const run = client.query.bind(client);
  const getOrden = deps.getOrdenById || getOrdenById;
  const syncPrices = deps.sincronizarPreciosItemsDesdeCuadro
    || sincronizarPreciosItemsDesdeCuadro;
  const saveInicio = deps.guardarInicioActividad || guardarInicioActividad;
  const syncChecklist = deps.sincronizarEstadoSegunChecklist
    || (await import('./ordenesChecklist.js')).sincronizarEstadoSegunChecklist;
  const registerEvent = deps.registrarEventoOrden || registrarEventoOrden;
  const listEntregas = deps.listarEntregas || listarEntregas;

  // Serializa ediciones concurrentes del mismo cronograma.
  await run('SELECT id FROM ordenes_contratacion WHERE id = $1 FOR UPDATE', [ordenId]);
  const orden = await getOrden(ordenId, client);
  assertEditableCronograma(orden);
  const itemsFisicos = await syncPrices(ordenId, client);
  const ordenFresh = await getOrden(ordenId, client);
  // Conserva la reconciliación contractual previa al reemplazo:
  // reconciliarItemsContractuales(ordenFresh, itemsFisicos), ahora con el mismo client.
  const { items } = deps.reconciliarItemsContractuales
    ? await deps.reconciliarItemsContractuales(ordenFresh, itemsFisicos, client)
    : await reconciliarItemsContractuales(ordenFresh, itemsFisicos, client);

  // Persistir inicio de actividad si viene en el payload raíz
  if (entregasPayload._inicio_actividad) {
    await saveInicio({
      requerimiento_id: ordenFresh.requerimiento_id,
      orden_id: ordenId,
      ...entregasPayload._inicio_actividad,
    }, usuario, rol, client);
  }

  const list = Array.isArray(entregasPayload) ? [...entregasPayload]
    : (Array.isArray(entregasPayload.entregas) ? [...entregasPayload.entregas] : []);

  const total = list.length;
  for (const e of list) {
    const tipo = String(e.tipo_entrega || (/servic/i.test(ordenFresh.tipo_contratacion) ? 'ENTREGABLE' : 'ENTREGA')).toUpperCase();
    e.tipo_entrega = ['ENTREGA', 'ENTREGABLE', 'PRESTACION'].includes(tipo) ? tipo : 'ENTREGA';
    const { codigo, etiqueta } = resolveCodigoYEtiqueta(e, total);
    e.codigo_entrega = codigo;
    e.etiqueta_entrega = etiqueta;
    e.descripcion = String(e.descripcion || '').trim() || descAuto(e, total);
    e.tipo_dias = 'calendario';
  }

  validarCronogramaContraItems(ordenFresh, items, list);

  await run(`UPDATE orden_entregas SET estado = 'ANULADO', updated_at = NOW() WHERE orden_id = $1`, [ordenId]);

  for (const e of list) {
    const tipoOk = e.tipo_entrega;
    const f = fechasEntregaDesdeCondicion(ordenFresh, e);
    const fechaBase = f.fechaEfectiva;
    const fechaMax = f.fechaMaxima;

    const lineasRaw = Array.isArray(e.items) ? e.items : [];
    const lineas = lineasRaw.length
      ? (esCronogramaPorHitos(ordenFresh, items)
        ? normalizarLineasEntregableItemUnico(items, lineasRaw)
        : normalizarLineasEntrega(items, lineasRaw))
      : [];
    let importe = lineas.length
      ? lineas.reduce((a, li) => a + li.precio_total, 0)
      : Number(e.importe || 0);
    if (e.porcentaje != null && !(importe > 0)) {
      importe = (Number(e.porcentaje) / 100) * Number(ordenFresh.monto_total);
    }

    const { rows } = await run(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        etiqueta_entrega, codigo_entrega,
        dias_plazo, tipo_dias, evento_inicio_plazo, fecha_base, fecha_maxima,
        lugar_entrega, observaciones, porcentaje, importe, estado
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ACTIVO')
      RETURNING id
    `, [
      ordenId,
      Number(e.numero_entrega),
      tipoOk,
      e.descripcion,
      e.etiqueta_entrega || null,
      e.codigo_entrega || null,
      Number(e.dias_plazo),
      normalizeTipoDias(e.tipo_dias),
      f.condicion,
      fechaBase,
      fechaMax,
      e.lugar_entrega || null,
      e.observaciones || null,
      e.porcentaje != null ? Number(e.porcentaje) : null,
      Number(Number(importe).toFixed(2)),
    ]);

    for (const li of lineas) {
      await run(`
        INSERT INTO orden_entrega_items (
          orden_entrega_id, orden_item_id, cantidad, precio_unitario, precio_total, porcentaje
        ) VALUES ($1,$2,$3,$4,$5,$6)
      `, [
        rows[0].id,
        Number(li.orden_item_id),
        li.cantidad,
        li.precio_unitario,
        li.precio_total,
        li.porcentaje,
      ]);
    }
  }

  const nEnt = list.length;
  await run(`
    UPDATE ordenes_contratacion SET
      cronograma_version = cronograma_version + 1,
      actualizado_por = $2,
      actualizado_at = NOW()
    WHERE id = $1
  `, [ordenId, String(usuario || '').slice(0, 150)]);

  const sync = await syncChecklist(ordenId, usuario, client);

  await registerEvent({
    ordenId,
    requerimientoId: ordenFresh.requerimiento_id,
    tipo: 'CRONOGRAMA_ACTUALIZADO',
    estadoAnterior: orden.estado,
    estadoNuevo: sync.estado,
    usuario,
    rol,
    datos: { entregas: nEnt, checklist_completo: sync.checklist.completo },
    client,
  });

  return listEntregas(ordenId, client);
}

export async function guardarEntregas(
  ordenId,
  entregasPayload,
  usuario,
  rol,
  options = {},
) {
  const clientFactory = options.getClient || getClient;
  const client = await clientFactory();
  try {
    await client.query('BEGIN');
    const result = await guardarEntregasConClient(
      client,
      ordenId,
      entregasPayload,
      usuario,
      rol,
      options.deps || {},
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Conexión rota: conservar el error original.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function assertCronogramaListoParaEnvio(ordenId) {
  const { sincronizarPreciosItemsDesdeCuadro } = await import('./ordenesContratacion.js');
  const orden = await getOrdenById(ordenId);
  const itemsFisicos = await sincronizarPreciosItemsDesdeCuadro(ordenId);
  const { items } = await reconciliarItemsContractuales(orden, itemsFisicos);
  const entregas = await listarEntregas(ordenId);
  if (!entregas.length) throw httpError('Debe definir el cronograma antes de enviar', 409, 'SIN_CRONOGRAMA');

  const payload = entregas.map((e) => ({
    numero_entrega: e.numero_entrega,
    tipo_entrega: e.tipo_entrega,
    descripcion: e.descripcion,
    dias_plazo: e.dias_plazo,
    tipo_dias: e.tipo_dias,
    importe: e.importe,
    porcentaje: e.porcentaje,
    items: e.items.map((i) => ({
      orden_item_id: i.orden_item_id,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      precio_total: i.precio_total,
      porcentaje: i.porcentaje,
    })),
  }));
  validarCronogramaContraItems(orden, items, payload);
  return { orden, entregas, items };
}
