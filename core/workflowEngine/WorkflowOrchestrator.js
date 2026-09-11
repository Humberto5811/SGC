/**
 * WorkflowOrchestrator.js
 * 
 * Motor centralizado que orquesta TODAS las transiciones de workflow.
 * Es la única autoridad sobre qué transiciones son permitidas.
 * Garantiza que estados, responsables y trazabilidad se sincronizen.
 * 
 * FASE 1: Solo valida y registra (sin persistir en workflow-engine).
 * FASE 2+: Emitirá eventos canónicos.
 */

export class WorkflowOrchestrator {
  /**
   * Tabla maestra de transiciones permitidas.
   * Define qué etapa puede ir a qué otra etapa y quién es responsable.
   * 
   * Estructura:
   * {
   *   ETAPA_ORIGEN: [
   *     { destino: 'ETAPA_DESTINO', responsable: 'Cargo', modulo: 'Nombre módulo' },
   *     { destino: 'ETAPA_X', responsable: 'Cargo X', modulo: 'Módulo X', tipo: 'observacion' }
   *   ]
   * }
   */
  static TRANSICIONES_PERMITIDAS = {
    REGISTRADO: [
      {
        destino: 'EVALUACION',
        responsable: 'Evaluador de Requerimientos',
        modulo: 'Evaluación de Requerimiento',
        accion: 'derivacion',
        descripcion: 'Enviado a evaluación',
      },
    ],
    EVALUACION: [
      {
        destino: 'DEC',
        responsable: 'Especialista DEC',
        modulo: 'DEC',
        accion: 'derivacion',
        descripcion: 'Aprobado en evaluación, derivado a DEC',
      },
      {
        destino: 'REGISTRADO',
        responsable: 'Registrador',
        modulo: 'Registro de Requerimiento',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en evaluación, devuelto a registro',
      },
    ],
    DEC: [
      {
        destino: 'PROGRAMACION',
        responsable: 'Programador',
        modulo: 'Programación',
        accion: 'derivacion',
        descripcion: 'Aprobado en DEC, derivado a programación',
      },
      {
        destino: 'EVALUACION',
        responsable: 'Evaluador de Requerimientos',
        modulo: 'Evaluación de Requerimiento',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en DEC, devuelto a evaluación',
      },
    ],
    PROGRAMACION: [
      {
        destino: 'ACTOS_PREPARATORIOS',
        responsable: 'Coordinador de Contratos Menores',
        modulo: 'Coordinación CM',
        accion: 'derivacion',
        descripcion: 'Aprobado en programación, enviado a actos preparatorios',
      },
      {
        destino: 'DEC',
        responsable: 'Especialista DEC',
        modulo: 'DEC',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en programación, devuelto a DEC',
      },
    ],
    ACTOS_PREPARATORIOS: [
      {
        destino: 'INVITACIONES',
        responsable: 'Especialista en Invitaciones',
        modulo: 'Invitaciones',
        accion: 'derivacion',
        descripcion: 'Actos preparatorios completados, enviado a invitaciones',
      },
      {
        destino: 'PROGRAMACION',
        responsable: 'Programador',
        modulo: 'Programación',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en actos preparatorios, devuelto a programación',
      },
    ],
    INVITACIONES: [
      {
        destino: 'VALIDACION',
        responsable: 'Validador',
        modulo: 'Validación',
        accion: 'derivacion',
        descripcion: 'Invitaciones completadas, enviado a validación',
      },
      {
        destino: 'ACTOS_PREPARATORIOS',
        responsable: 'Coordinador de Contratos Menores',
        modulo: 'Coordinación CM',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en invitaciones, devuelto a actos preparatorios',
      },
    ],
    VALIDACION: [
      {
        destino: 'CUADRO_COMPARATIVO',
        responsable: 'Analista Cuadro Comparativo',
        modulo: 'Cuadro Comparativo',
        accion: 'derivacion',
        descripcion: 'Validación completada, enviado a cuadro comparativo',
      },
      {
        destino: 'INVITACIONES',
        responsable: 'Especialista en Invitaciones',
        modulo: 'Invitaciones',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en validación, devuelto a invitaciones',
      },
    ],
    CUADRO_COMPARATIVO: [
      {
        destino: 'CCP',
        responsable: 'Oficial de CCP',
        modulo: 'CCP',
        accion: 'derivacion',
        descripcion: 'Cuadro comparativo aprobado, enviado a CCP',
      },
      {
        destino: 'VALIDACION',
        responsable: 'Validador',
        modulo: 'Validación',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en cuadro comparativo, devuelto a validación',
      },
    ],
    CCP: [
      {
        destino: 'EJECUCION',
        responsable: 'Especialista Ejecución',
        modulo: 'Ejecución',
        accion: 'derivacion',
        descripcion: 'CCP aprobado, enviado a ejecución',
      },
      {
        destino: 'CUADRO_COMPARATIVO',
        responsable: 'Analista Cuadro Comparativo',
        modulo: 'Cuadro Comparativo',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Observado en CCP, devuelto a cuadro comparativo',
      },
    ],
    EJECUCION: [
      {
        destino: 'FINALIZADO',
        responsable: 'Sistema',
        modulo: 'Finalizado',
        accion: 'cierre',
        descripcion: 'Ejecución completada, requerimiento finalizado',
      },
      {
        destino: 'CCP',
        responsable: 'Oficial de CCP',
        modulo: 'CCP',
        accion: 'devolucion',
        tipo: 'observacion',
        descripcion: 'Problema en ejecución, devuelto a CCP',
      },
    ],
  };

  /**
   * Mapeo de etapas a estados legibles
   */
  static ETAPA_A_ESTADO = {
    REGISTRADO: 'Registrado',
    EVALUACION: 'En tramite de aprobación',
    DEC: 'En DEC',
    PROGRAMACION: 'En Programación',
    ACTOS_PREPARATORIOS: 'Programado',
    INVITACIONES: 'En Invitaciones',
    VALIDACION: 'En Validación',
    CUADRO_COMPARATIVO: 'En Cuadro Comparativo',
    CCP: 'En CCP',
    EJECUCION: 'En Ejecución',
    FINALIZADO: 'Finalizado',
  };

  /**
   * Mapeo de etapas a sub-módulos
   */
  static ETAPA_A_SUBMODULO = {
    REGISTRADO: 'Registro de Requerimiento',
    EVALUACION: 'Evaluación de Requerimiento',
    DEC: 'DEC',
    PROGRAMACION: 'Programación',
    ACTOS_PREPARATORIOS: 'Coordinación CM',
    INVITACIONES: 'Invitaciones',
    VALIDACION: 'Validación',
    CUADRO_COMPARATIVO: 'Cuadro Comparativo',
    CCP: 'CCP',
    EJECUCION: 'Ejecución',
    FINALIZADO: 'Finalizado',
  };

  constructor(queryFn, logger = console) {
    this.query = queryFn;
    this.logger = logger;
  }

  /**
   * Valida si una transición es permitida
   * @param {string} etapaOrigen
   * @param {string} etapaDestino
   * @returns {Object|null} Objeto con detalles de la transición o null si no permitida
   */
  validarTransicion(etapaOrigen, etapaDestino) {
    if (!etapaOrigen || !etapaDestino) return null;

    const transiciones = this.TRANSICIONES_PERMITIDAS[etapaOrigen] || [];
    const transicion = transiciones.find((t) => t.destino === etapaDestino);

    return transicion || null;
  }

  /**
   * Obtiene el responsable para una etapa destino
   * @param {string} etapaDestino
   * @returns {string} Nombre del responsable
   */
  obtenerResponsableDestino(etapaDestino) {
    return this.ETAPA_A_SUBMODULO[etapaDestino] || 'Sin asignar';
  }

  /**
   * Obtiene el estado legible para una etapa
   * @param {string} etapa
   * @returns {string}
   */
  obtenerEstadoDeEtapa(etapa) {
    return this.ETAPA_A_ESTADO[etapa] || etapa;
  }

  /**
   * OPERACIÓN PRINCIPAL: Derivar un requerimiento de una etapa a otra
   * Garantiza consistencia de estados mediante transacción ACID
   *
   * @param {number} requerimientoId
   * @param {string} etapaActual
   * @param {string} etapaDestino
   * @param {string} usuario - Usuario que ejecuta la acción
   * @param {Object} opciones - { motivo, observacion_id, metadata }
   * @returns {Promise<{success: boolean, error?: string, requerimiento?: Object}>}
   */
  async derivar(requerimientoId, etapaActual, etapaDestino, usuario, opciones = {}) {
    try {
      // 1. VALIDAR TRANSICIÓN
      const transicion = this.validarTransicion(etapaActual, etapaDestino);
      if (!transicion) {
        return {
          success: false,
          error: `No se puede ir de ${etapaActual} a ${etapaDestino}. Transición no permitida.`,
          validacion: false,
        };
      }

      // 2. VERIFICAR QUE REQUERIMIENTO EXISTE
      const { rows: reqRows } = await this.query(
        'SELECT id, codigo, estado_actual FROM requerimientos WHERE id = $1',
        [requerimientoId]
      );

      if (!reqRows.length) {
        return {
          success: false,
          error: `Requerimiento ${requerimientoId} no encontrado`,
        };
      }

      const req = reqRows[0];
      if (req.estado_actual && req.estado_actual !== etapaActual) {
        this.logger.warn(
          `[Orchestrator] Discrepancia detectada: etapaActual=${etapaActual}, BD=${req.estado_actual}`,
        );
      }

      // 3. OBTENER RESPONSABLE DESTINO
      const responsableDestino = transicion.responsable;
      const estadoDestino = this.obtenerEstadoDeEtapa(etapaDestino);
      const submoduloDestino = this.ETAPA_A_SUBMODULO[etapaDestino];

      // 4. ACTUALIZAR REQUERIMIENTO EN TRANSACCIÓN ACID
      const updateResult = await this.query(
        `UPDATE requerimientos
         SET
           estado_actual = $2,
           sub_modulo_actual = $3,
           responsable_actual = $4,
           fecha_estado_actual = NOW(),
           estado = $5,
           usuario_modificacion = $6,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          requerimientoId,
          etapaDestino,
          submoduloDestino,
          responsableDestino,
          estadoDestino,
          usuario,
        ]
      );

      if (!updateResult.rowCount) {
        return {
          success: false,
          error: 'No se pudo actualizar el requerimiento',
        };
      }

      const requerimientoActualizado = updateResult.rows[0];

      // 5. REGISTRAR EN TIMELINE (trazabilidad funcional)
      await this.registrarEnTimeline(requerimientoId, {
        etapaOrigen: etapaActual,
        etapaDestino,
        accion: transicion.accion,
        tipo: transicion.tipo,
        responsable: responsableDestino,
        usuario,
        motivo: opciones.motivo,
        codigo: req.codigo,
      });

      // 6. SINCRONIZAR VISTA (garantiza bandeja actualizada)
      await this.sincronizarVista(requerimientoId);

      this.logger.info(
        `[Orchestrator] ✓ Derivación exitosa: REQ#${requerimientoId} (${etapaActual} → ${etapaDestino})`,
      );

      return {
        success: true,
        requerimiento: requerimientoActualizado,
        transicion: {
          origen: etapaActual,
          destino: etapaDestino,
          responsable: responsableDestino,
          accion: transicion.accion,
        },
      };
    } catch (error) {
      this.logger.error('[Orchestrator] Error en derivar:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Registra evento en timeline para trazabilidad
   */
  async registrarEnTimeline(requerimientoId, data) {
    try {
      await this.query(
        `INSERT INTO timeline (
          requerimiento_id,
          codigo_requerimiento,
          etapa_origen,
          etapa_destino,
          accion,
          tipo_evento,
          responsable,
          usuario,
          motivo,
          fecha
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT DO NOTHING`,
        [
          requerimientoId,
          data.codigo,
          data.etapaOrigen,
          data.etapaDestino,
          data.accion,
          data.tipo || 'derivacion',
          data.responsable,
          data.usuario,
          data.motivo,
        ]
      );
    } catch (error) {
      this.logger.warn('[Timeline] Error registrando:', error.message);
    }
  }

  /**
   * Sincroniza la vista materializada para bandeja rápida y confiable
   */
  async sincronizarVista(requerimientoId) {
    try {
      const { rows } = await this.query(
        `SELECT
          id, codigo, estado_actual, sub_modulo_actual,
          responsable_actual, estado, usuario_modificacion
        FROM requerimientos
        WHERE id = $1`,
        [requerimientoId]
      );

      if (!rows.length) return;

      const row = rows[0];
      const etapa = row.estado_actual || 'REGISTRADO';
      const responsable = row.responsable_actual || 'Sin asignar';

      // Verificar si hay observación activa
      const { rows: obsRows } = await this.query(
        `SELECT id FROM observaciones
         WHERE requerimiento_id = $1
         AND estado NOT IN ('CERRADA', 'RESUELTA')
         LIMIT 1`,
        [requerimientoId]
      );

      await this.query(
        `INSERT INTO vista_requerimiento_actual (
          requerimiento_id,
          codigo_requerimiento,
          etapa_actual,
          estado_label,
          responsable_actual,
          observacion_activa,
          observacion_id,
          fecha_ingreso_etapa,
          usuario_ultima_actualizacion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
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
    } catch (error) {
      this.logger.warn('[Sincronizador] Error:', error.message);
    }
  }

  /**
   * Obtiene snapshot actual del workflow para UI
   */
  async obtenerSnapshot(requerimientoId) {
    try {
      const { rows } = await this.query(
        `SELECT v.* FROM vista_requerimiento_actual v
         WHERE v.requerimiento_id = $1`,
        [requerimientoId]
      );

      if (!rows.length) return null;

      const vista = rows[0];
      const etapa = vista.etapa_actual;
      const transiciones = this.TRANSICIONES_PERMITIDAS[etapa] || [];

      return {
        requerimientoId: vista.requerimiento_id,
        codigo: vista.codigo_requerimiento,
        etapaActual: etapa,
        estado: vista.estado_label,
        responsable: vista.responsable_actual,
        diasEnEtapa: vista.dias_en_etapa,
        observacionActiva: vista.observacion_activa,
        transicionesPermitidas: transiciones.map((t) => ({
          destino: t.destino,
          responsable: t.responsable,
          accion: t.accion,
          descripcion: t.descripcion,
        })),
        ultimaActualizacion: vista.timestamp_ultima_actualizacion,
      };
    } catch (error) {
      this.logger.error('[Orchestrator] Error obteniendo snapshot:', error);
      return null;
    }
  }
}

/**
 * Factory para crear instancia del orquestador
 * @param {Function} queryFn - Función query de la BD
 * @param {Object} logger - Logger (por defecto console)
 * @returns {WorkflowOrchestrator}
 */
export function crearWorkflowOrchestrator(queryFn, logger = console) {
  return new WorkflowOrchestrator(queryFn, logger);
}
