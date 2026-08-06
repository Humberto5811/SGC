/**
 * Derivación Recepción de Cotizaciones → CCP (solo LOCACIÓN).
 * RC8.6A.1 — todo en una sola transacción vía transicionarExpediente + domainMutator.
 * No crea filas en cuadros_comparativos (cuadro_id = null).
 */
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';
import { normalizarTipo, TIPOS_CONTRATACION } from '../../shared/workflow/tiposContratacion.js';
import {
  resolveDestinoDesdeRecepcionCotizaciones,
  DESTINOS_RECEPCION,
} from '../../shared/workflow/destinoRecepcion.js';
import { transicionarExpediente } from './expedienteTransicion.js';
import { withTransaction } from './workflow/workflowTransaction.js';

function parseJson(val, fallback = {}) {
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

async function loadCotizacionConTipo(cotizacionId, client = null) {
  const run = (text, params) => (client ? client.query(text, params) : query(text, params));
  const { rows } = await run(`
    SELECT cot.*, p.ruc, p.razon_social,
      sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      sc.tipo AS solicitud_tipo, sc.estado AS solicitud_estado,
      (
        SELECT r.tipo FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
        ORDER BY r.id LIMIT 1
      ) AS requerimiento_tipo,
      (
        SELECT r.estado_actual FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
        ORDER BY r.id LIMIT 1
      ) AS req_estado_actual
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.id = $1
  `, [cotizacionId]);
  if (!rows.length) throw new Error('Cotización no encontrada');
  return rows[0];
}

function resolveTipoExpediente(cot) {
  return normalizarTipo(cot.solicitud_tipo || cot.requerimiento_tipo || '');
}

function yaDerivadoACcp(cot) {
  const solEst = String(cot.solicitud_estado || '').toUpperCase();
  const etapa = String(cot.req_estado_actual || '').toUpperCase();
  return solEst === 'EN_CCP' || etapa === 'CCP';
}

/**
 * Deriva expediente de locación desde Recepción a CCP.
 * Idempotente si ya está en CCP. No crea cuadro comparativo.
 * Atomicidad: dominio + estado vigente + asignación + legacy + traza en UNA tx.
 */
export async function derivarRecepcionACcp(cotizacionId, body = {}, usuarioOperador = '') {
  const cot = await loadCotizacionConTipo(cotizacionId);
  if (String(cot.estado) !== 'COTIZACION_PRESENTADA') {
    throw new Error('La cotización no está presentada');
  }

  const tipo = resolveTipoExpediente(cot);
  const destino = resolveDestinoDesdeRecepcionCotizaciones(tipo);
  if (destino !== DESTINOS_RECEPCION.CCP || tipo !== TIPOS_CONTRATACION.LOCACION) {
    throw new Error(
      'Solo expedientes de Locadores pueden derivarse a CCP desde Recepción. '
      + 'Bienes y Servicios deben ir a Validaciones.',
    );
  }

  const respId = parseInt(body.responsable_id || body.responsable_destino_id || body.responsable_ccp_id, 10);
  const respNombre = String(
    body.responsable_nombre || body.responsable_destino_nombre || body.responsable_ccp_nombre || '',
  ).trim();
  const observacion = String(body.observacion || body.observacion_derivacion || '').trim();

  if (yaDerivadoACcp(cot)) {
    return {
      ok: true,
      idempotente: true,
      ya_en_ccp: true,
      destino: DESTINOS_RECEPCION.CCP,
      origen_ccp: 'RECEPCION_COTIZACION_LOCACION',
      solicitud_id: cot.solicitud_id,
      cotizacion_id: cot.id,
      cuadro_id: null,
      responsable_id: respId || null,
      responsable_nombre: respNombre || cot.validacion_responsable || '',
    };
  }

  if (!Number.isFinite(respId) || respId <= 0) {
    throw new Error('Seleccione el usuario responsable de CCP');
  }
  if (!respNombre) {
    throw new Error('Nombre del responsable CCP es obligatorio');
  }
  if (!observacion || observacion.length < 3) {
    throw new Error('La observación es obligatoria para derivar a CCP');
  }

  const user = String(usuarioOperador || '').slice(0, 150);
  const fecha = new Date().toISOString();

  return withTransaction(async (tx) => {
    const { rows: reqRows } = await tx.query(
      `SELECT requerimiento_id FROM solicitud_requerimientos WHERE solicitud_id = $1`,
      [cot.solicitud_id],
    );
    const reqIds = [...new Set(
      reqRows.map((r) => parseInt(r.requerimiento_id, 10)).filter((n) => Number.isFinite(n) && n > 0),
    )];
    if (cot.requerimiento_id) {
      const rid = parseInt(cot.requerimiento_id, 10);
      if (Number.isFinite(rid) && !reqIds.includes(rid)) reqIds.push(rid);
    }
    if (!reqIds.length) {
      throw new Error('Solicitud sin requerimientos vinculados');
    }

    let dominioAplicado = false;
    const aplicarDominio = async (client) => {
      if (dominioAplicado) return { skipped: true };
      dominioAplicado = true;

      await client.query(`
        UPDATE solicitudes_cotizacion SET estado = 'EN_CCP', updated_at = NOW()
        WHERE id = $1 AND estado NOT IN ('CERRADA')
      `, [cot.solicitud_id]);

      const histEntry = {
        tipo: 'derivacion_ccp_desde_recepcion',
        destino: 'CCP',
        origen_ccp: 'RECEPCION_COTIZACION_LOCACION',
        responsable: respNombre,
        responsable_id: respId,
        usuario: user,
        observacion,
        fecha,
      };

      await client.query(`
        UPDATE cotizaciones_proveedor SET
          validacion_responsable = $2,
          validacion_informe = COALESCE(validacion_informe, '{}'::jsonb) || $3::jsonb,
          historial = COALESCE(historial, '[]'::jsonb) || $4::jsonb,
          updated_at = NOW()
        WHERE solicitud_id = $1
          AND estado = 'COTIZACION_PRESENTADA'
      `, [
        cot.solicitud_id,
        respNombre.slice(0, 200),
        JSON.stringify({
          derivacion_ccp: {
            responsable_id: respId,
            responsable_nombre: respNombre,
            derivado_por: user,
            derivado_at: fecha,
            observacion,
            origen: 'RECEPCION_COTIZACION_LOCACION',
          },
        }),
        JSON.stringify([histEntry]),
      ]);

      await registrarTrazaPortal({
        solicitud_id: cot.solicitud_id,
        proveedor_id: cot.proveedor_id,
        requerimiento_id: cot.requerimiento_id,
        evento: 'LOCACION_APROBADA_RECEPCION',
        detalle: `Locación derivada a CCP desde Recepción → ${respNombre}${observacion ? `: ${observacion.slice(0, 160)}` : ''}`,
        usuario: user,
      }, { client });

      return {
        solicitud_id: cot.solicitud_id,
        cotizacion_id: cot.id,
        cuadro_id: null,
        estado_solicitud: 'EN_CCP',
      };
    };

    const resultados = [];
    for (let i = 0; i < reqIds.length; i += 1) {
      const rid = reqIds[i];
      const r = await transicionarExpediente({
        requerimientoId: rid,
        evento: 'LOCACION_APROBADA_RECEPCION',
        usuarioOrigenId: null,
        usuarioDestinoId: respId,
        unidadDestino: null,
        motivo: observacion || `Locación derivada a CCP — ${respNombre}`,
        metadata: {
          client_request_id: `recepcion-ccp:${cot.solicitud_id}:${rid}:${cot.id}`,
          cotizacion_id: cot.id,
          solicitud_id: cot.solicitud_id,
          tipo_contratacion: 'LOCACION',
        },
        actorRol: user || 'SISTEMA',
        domainMutator: i === 0 ? aplicarDominio : null,
        client: tx,
      });
      resultados.push(r);
    }

    return {
      ok: true,
      idempotente: resultados.every((r) => r.idempotente),
      destino: DESTINOS_RECEPCION.CCP,
      origen_ccp: 'RECEPCION_COTIZACION_LOCACION',
      solicitud_id: cot.solicitud_id,
      cotizacion_id: cot.id,
      cuadro_id: null,
      responsable_id: respId,
      responsable_nombre: respNombre,
      requerimientos: reqIds,
      domain_results: resultados[0]?.domain_results || null,
    };
  });
}

export async function resolveTipoExpedienteCotizacion(cotizacionId) {
  const cot = await loadCotizacionConTipo(cotizacionId);
  return resolveTipoExpediente(cot);
}
