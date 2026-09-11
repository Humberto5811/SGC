/**
 * sincronizador.js
 * 
 * Funciones de sincronización entre tabla requerimientos y vista_requerimiento_actual.
 * Garantiza que la vista siempre refleje el estado real del requerimiento.
 */

export async function sincronizarVista(requerimientoId, query, logger = console) {
  try {
    // 1. Obtener estado actual de la BD
    const { rows: reqRows } = await query(
      `SELECT
        id, codigo, estado_actual, sub_modulo_actual,
        responsable_actual, estado, usuario_modificacion
      FROM requerimientos
      WHERE id = $1`,
      [requerimientoId]
    );

    if (!reqRows.length) {
      logger.warn(`[Sincronizador] Requerimiento ${requerimientoId} no encontrado`);
      return false;
    }

    const row = reqRows[0];
    const etapa = row.estado_actual || 'REGISTRADO';
    const responsable = row.responsable_actual || 'Sin asignar';

    // 2. Verificar si hay observación activa
    const { rows: obsRows } = await query(
      `SELECT id FROM observaciones
       WHERE requerimiento_id = $1
       AND estado NOT IN ('CERRADA', 'RESUELTA')
       LIMIT 1`,
      [requerimientoId]
    );

    // 3. Sincronizar vista
    await query(
      `INSERT INTO vista_requerimiento_actual (
        requerimiento_id,
        codigo_requerimiento,
        etapa_actual,
        estado_label,
        responsable_actual,
        observacion_activa,
        observacion_id,
        fecha_ingreso_etapa,
        usuario_ultima_actualizacion,
        timestamp_ultima_actualizacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
      ON CONFLICT (requerimiento_id) DO UPDATE SET
        etapa_actual = $3,
        estado_label = $4,
        responsable_actual = $5,
        observacion_activa = $6,
        observacion_id = $7,
        timestamp_ultima_actualizacion = NOW(),
        usuario_ultima_actualizacion = $8`,
      [
        requerimientoId,
        row.codigo,
        etapa,
        row.estado || 'Sin estado',
        responsable,
        obsRows.length > 0,
        obsRows[0]?.id || null,
        row.usuario_modificacion || 'Sistema',
      ]
    );

    logger.info(`[Sincronizador] ✓ Vista sincronizada para REQ#${requerimientoId}`);
    return true;
  } catch (error) {
    logger.error('[Sincronizador] Error:', error.message);
    return false;
  }
}

/**
 * Verifica si hay desincronización entre requerimiento y vista
 */
export async function verificarSincronizacion(requerimientoId, query, logger = console) {
  try {
    const { rows } = await query(
      `SELECT
        r.estado_actual as estado_bd,
        r.responsable_actual as responsable_bd,
        v.etapa_actual as etapa_vista,
        v.responsable_actual as responsable_vista
      FROM requerimientos r
      LEFT JOIN vista_requerimiento_actual v ON r.id = v.requerimiento_id
      WHERE r.id = $1`,
      [requerimientoId]
    );

    if (!rows.length) return { sincronizado: false, razon: 'Requerimiento no encontrado' };

    const { estado_bd, responsable_bd, etapa_vista, responsable_vista } = rows[0];
    const sincronizado = estado_bd === etapa_vista && responsable_bd === responsable_vista;

    if (!sincronizado) {
      logger.warn(`[Sincronizador] Desincronización detectada en REQ#${requerimientoId}:`, {
        bd: { estado: estado_bd, responsable: responsable_bd },
        vista: { etapa: etapa_vista, responsable: responsable_vista },
      });
    }

    return {
      sincronizado,
      razon: sincronizado
        ? 'OK'
        : `BD(${estado_bd}/${responsable_bd}) != Vista(${etapa_vista}/${responsable_vista})`,
    };
  } catch (error) {
    logger.error('[Sincronizador] Error verificando:', error.message);
    return { sincronizado: false, razon: error.message };
  }
}

/**
 * Sincroniza todos los requerimientos (útil para mantenimiento)
 */
export async function sincronizarTodos(query, logger = console) {
  try {
    const { rows: requerimientos } = await query(
      `SELECT id FROM requerimientos WHERE estado_actual IS NOT NULL LIMIT 1000`
    );

    let sincronizados = 0;
    let errores = 0;

    for (const req of requerimientos) {
      const resultado = await sincronizarVista(req.id, query, logger);
      if (resultado) sincronizados++;
      else errores++;
    }

    logger.info(`[Sincronizador] Sincronización masiva: ${sincronizados} OK, ${errores} errores`);
    return { sincronizados, errores };
  } catch (error) {
    logger.error('[Sincronizador] Error en sincronización masiva:', error.message);
    return { sincronizados: 0, errores: 0, error: error.message };
  }
}
