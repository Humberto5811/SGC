/**
 * RC8.6C — Reconciliación controlada de responsables existentes.
 * dryRun=true por defecto. No altera estados ni etapas ni tablas de dominio.
 */
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import {
  getEstadoVigenteForUpdate,
  getAsignacionActivaForUpdate,
  cerrarAsignacionActiva,
  crearAsignacion,
  actualizarResponsableVigente,
} from './expedienteEstadoPersistido.js';
import {
  resolveAsignacionRealExistente,
  ORIGEN_RECONCILIACION,
  esAsignacionPersonaValida,
  esEstadoPendienteSinPersona,
} from './resolveAsignacionRealExistente.js';

function runner(client) {
  if (client?.query) return (text, params) => client.query(text, params);
  return async (text, params) => {
    const { query } = await import('../db.js');
    return query(text, params);
  };
}

function labelActual(estado, asig) {
  if (esAsignacionPersonaValida(asig) || (estado?.responsable_tipo === 'PERSONA' && estado?.responsable_usuario_id)) {
    return `usuario#${asig?.usuario_id || estado.responsable_usuario_id}`;
  }
  if (estado?.responsable_tipo === 'UNIDAD' && estado?.responsable_unidad) {
    return `UNIDAD:${estado.responsable_unidad}`;
  }
  return 'Pendiente';
}

function labelEncontrado(resolved) {
  if (!resolved) return '—';
  if (resolved.usuarioId) return resolved.username || resolved.nombre || `usuario#${resolved.usuarioId}`;
  if (resolved.unidad) return `UNIDAD:${resolved.unidad}`;
  return '—';
}

/**
 * @returns {Promise<{ dryRun: boolean, rows: Array, summary: object }>}
 */
export async function reconciliarAsignacionesExistentes({
  requerimientoIds = null,
  dryRun = true,
  force = false,
  client = null,
} = {}) {
  const run = runner(client);
  let ids = Array.isArray(requerimientoIds)
    ? [...new Set(requerimientoIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
    : null;

  if (!ids) {
    const { rows } = await run(
      `SELECT e.requerimiento_id AS id
       FROM expediente_estado_vigente e
       WHERE e.responsable_tipo = 'PENDIENTE'
          OR e.responsable_usuario_id IS NULL
       ORDER BY e.requerimiento_id`,
    );
    ids = rows.map((r) => Number(r.id));
  }

  const out = [];
  const summary = {
    total: ids.length,
    asignar: 0,
    unidad: 0,
    mantener: 0,
    sinEvidencia: 0,
    aplicados: 0,
  };

  for (const rid of ids) {
    const { rows: reqRows } = await run(
      `SELECT id, codigo, estado, estado_actual, sub_modulo_actual, responsable_actual
       FROM requerimientos WHERE id = $1`,
      [rid],
    );
    const req = reqRows[0];
    if (!req) {
      out.push({
        requerimientoId: rid,
        codigo: `ID-${rid}`,
        etapa: '—',
        responsableActual: '—',
        responsableEncontrado: '—',
        fuente: '—',
        accion: 'OMITIR_NO_EXISTE',
      });
      continue;
    }

    const { rows: estRows } = await run(
      `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
      [rid],
    );
    const estado = estRows[0] || null;
    const { rows: asigRows } = await run(
      `SELECT * FROM expediente_asignaciones
       WHERE requerimiento_id = $1 AND activo = TRUE
       ORDER BY id DESC LIMIT 1`,
      [rid],
    );
    const asig = asigRows[0] || null;

    const etapaCodigo = String(estado?.etapa_codigo || req.estado_actual || '').toUpperCase();
    const estadoCodigo = String(estado?.estado_codigo || req.estado || '').trim();

    const actualLabel = labelActual(estado, asig);

    // No reemplazar asignación PERSONA activa válida (salvo force).
    if (!force && esAsignacionPersonaValida(asig) && !esEstadoPendienteSinPersona(estado)) {
      summary.mantener += 1;
      out.push({
        requerimientoId: rid,
        codigo: req.codigo,
        etapa: etapaCodigo || estado?.etapa_label || '—',
        estado: estadoCodigo,
        responsableActual: actualLabel,
        responsableEncontrado: actualLabel,
        fuente: estado?.responsable_fuente || asig.origen_asignacion || 'asignacion_activa',
        accion: 'MANTENER',
        resolved: null,
      });
      continue;
    }

    // Solo completar PENDIENTE / sin usuario (salvo force).
    if (!force && !esEstadoPendienteSinPersona(estado) && esAsignacionPersonaValida(asig)) {
      summary.mantener += 1;
      out.push({
        requerimientoId: rid,
        codigo: req.codigo,
        etapa: etapaCodigo,
        estado: estadoCodigo,
        responsableActual: actualLabel,
        responsableEncontrado: actualLabel,
        fuente: estado?.responsable_fuente || '—',
        accion: 'MANTENER',
        resolved: null,
      });
      continue;
    }

    const resolved = await resolveAsignacionRealExistente({
      requerimientoId: rid,
      etapaCodigo,
      estadoCodigo,
      client,
    });

    if (!resolved) {
      summary.sinEvidencia += 1;
      out.push({
        requerimientoId: rid,
        codigo: req.codigo,
        etapa: etapaCodigo,
        estado: estadoCodigo,
        responsableActual: actualLabel,
        responsableEncontrado: '—',
        fuente: 'sin_evidencia',
        accion: 'MANTENER_PENDIENTE',
        resolved: null,
      });
      continue;
    }

    const esPersona = resolved.usuarioId != null;
    const accion = esPersona ? 'ASIGNAR' : 'ASIGNAR_UNIDAD';
    if (esPersona) summary.asignar += 1;
    else summary.unidad += 1;

    const rowPlan = {
      requerimientoId: rid,
      codigo: req.codigo,
      etapa: etapaCodigo,
      estado: estadoCodigo,
      responsableActual: actualLabel,
      responsableEncontrado: labelEncontrado(resolved),
      fuente: resolved.fuente,
      accion,
      resolved,
      estadoAntes: estado ? {
        estado_codigo: estado.estado_codigo,
        etapa_codigo: estado.etapa_codigo,
        version: estado.version,
        responsable_tipo: estado.responsable_tipo,
        responsable_usuario_id: estado.responsable_usuario_id,
      } : null,
    };

    if (dryRun) {
      out.push(rowPlan);
      continue;
    }

    // ── APPLY ──
    const ownTx = !client;
    const db = ownTx ? await (await import('../db.js')).getClient() : client;
    try {
      if (ownTx) await db.query('BEGIN');

      await getEstadoVigenteForUpdate(db, rid);
      const activa = await getAsignacionActivaForUpdate(db, rid);

      if (esAsignacionPersonaValida(activa) && !force) {
        // Carrera: alguien asignó entre plan y apply
        if (ownTx) await db.query('ROLLBACK');
        rowPlan.accion = 'MANTENER';
        summary.asignar -= esPersona ? 1 : 0;
        summary.unidad -= esPersona ? 0 : 1;
        summary.mantener += 1;
        out.push(rowPlan);
        continue;
      }

      if (activa) {
        // Cerrar solo si no es persona válida o force / pendiente
        await cerrarAsignacionActiva(db, rid);
      }

      const tipo = esPersona ? TIPO_RESPONSABLE.PERSONA : TIPO_RESPONSABLE.UNIDAD;
      await crearAsignacion(db, {
        requerimientoId: rid,
        etapaCodigo: etapaCodigo || 'REGISTRO',
        usuarioId: resolved.usuarioId,
        unidadCodigo: resolved.unidad,
        tipoResponsable: tipo,
        origenAsignacion: ORIGEN_RECONCILIACION,
        asignadoPor: 'rc86c_reconciliacion',
        motivo: `fuente=${resolved.fuente}; evidencia=${resolved.evidenciaId ?? ''}`,
      });

      const updated = await actualizarResponsableVigente(db, {
        requerimientoId: rid,
        responsableTipo: tipo,
        responsableUsuarioId: resolved.usuarioId,
        responsableUnidad: resolved.unidad,
        responsableFuente: resolved.fuente,
        actualizadoPor: 'rc86c_reconciliacion',
        metadataPatch: {
          reconciliacion_rc86c: {
            fuente: resolved.fuente,
            evidenciaId: resolved.evidenciaId,
            at: new Date().toISOString(),
          },
        },
      });

      // Sync legacy responsable_actual (persona id/username) sin tocar estado_actual etapa
      // syncLegacyRequerimiento SÍ escribe estado_actual — evitar cambiar etapa.
      // Actualizamos solo responsable_actual.
      const legacy = esPersona
        ? String(resolved.username || resolved.usuarioId)
        : String(resolved.unidad || 'Pendiente de asignación');
      await db.query(
        `UPDATE requerimientos SET responsable_actual = $2, updated_at = NOW() WHERE id = $1`,
        [rid, legacy],
      );

      if (ownTx) await db.query('COMMIT');

      rowPlan.accion = `${accion}_APLICADO`;
      rowPlan.versionNueva = updated?.version ?? null;
      rowPlan.estadoDespues = updated ? {
        estado_codigo: updated.estado_codigo,
        etapa_codigo: updated.etapa_codigo,
        version: updated.version,
        responsable_tipo: updated.responsable_tipo,
        responsable_usuario_id: updated.responsable_usuario_id,
      } : null;
      summary.aplicados += 1;
      out.push(rowPlan);
    } catch (err) {
      if (ownTx) {
        try { await db.query('ROLLBACK'); } catch (_) { /* ok */ }
      }
      rowPlan.accion = 'ERROR';
      rowPlan.error = err.message;
      out.push(rowPlan);
      throw err;
    } finally {
      if (ownTx) db.release();
    }
  }

  return { dryRun: !!dryRun, force: !!force, rows: out, summary };
}

export default { reconciliarAsignacionesExistentes };
