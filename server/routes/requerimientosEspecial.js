// Rutas personalizadas para requerimientos (más allá de CRUD básico)
import express from 'express';
import { query } from '../db.js';
import {
  TRAZA_EXTRA_SELECT,
  enrichRequerimientoRow,
  enrichRequerimientoRowsWithCcp,
  registrarSubsanacionDerivacion,
  obtenerTrazabilidad,
  buildListFilters,
  ETAPAS,
} from '../lib/trazabilidad.js';
import {
  emitirObservacion,
  registrarSubsanacionObservacion,
  procesarAccionObservacion,
  autoCerrarObservacionesEmisorAlContinuar,
} from '../lib/observacionesWorkflow.js';
import {
  ejecutarRegistroDerivar,
  ejecutarRegistroSubsanar,
  esOrigenRegistro,
} from '../lib/registroMigrationFacade.js';
import { runWorkflowTransition, buildObservacionDomainMutator } from '../lib/workflow/workflowIntegration.js';
import {
  resolveUserDataScope,
  buildRequerimientoScopeSql,
  assertCanAccessRequirement,
  canAccessRequirement,
} from '../lib/userDataScope.js';
import { listarAreasAutorizadasUsuario } from '../lib/areasAutorizadasUsuario.js';
import { assertAccesoRegistroOrdenes } from '../lib/accesoRegistroOrdenes.js';
import { resolveResponsablePersonaDisplay } from '../lib/usuarioDisplay.js';
import {
  eliminarRequerimientoInicial,
  MSG_REQUERIMIENTO_NO_ELIMINABLE,
} from '../lib/eliminarRequerimiento.js';

const router = express.Router();

const BASE_FROM = `
  FROM requerimientos r
  LEFT JOIN areas a ON r.area = a.nombre OR UPPER(TRIM(COALESCE(a.codigo,''))) = UPPER(TRIM(COALESCE(r.area,'')))
  LEFT JOIN centros c ON a.centro_id = c.id
`;

function authUserId(req) {
  return req.user?.id || req.headers['x-user-id'] || null;
}

async function guardRequirementAccess(req, res, next) {
  try {
    const reqId = req.params.requerimientoId || req.params.id;
    if (!reqId) return next();
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    await assertCanAccessRequirement(userId, reqId, String(req.method || 'GET'));
    return next();
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        code: err.code || 'REQUERIMIENTO_FUERA_DE_ALCANCE',
        error: err.message,
        message: err.message,
      });
    }
    return next(err);
  }
}

// GET /api/requerimientos/mi-alcance — diagnóstico UX (no seguridad)
router.get('/mi-alcance', async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const scope = await resolveUserDataScope({
      userId,
      moduleCode: 'REGISTRO_REQUERIMIENTO',
    });
    res.json({
      ok: true,
      scopeType: scope.scopeType,
      isInstitutional: scope.isInstitutional,
      skipOrgFilter: scope.skipOrgFilter,
      centroIds: scope.centroIds,
      centroCodigos: scope.centroCodigos,
      centroCostoIds: scope.centroCostoIds,
      centroCostoCodigos: scope.centroCostoCodigos,
      areaIds: scope.areaIds,
    });
  } catch (err) { next(err); }
});

// GET /api/requerimientos/areas-alcance — áreas permitidas para crear/filtrar
router.get('/areas-alcance', async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const q = String(req.query.q || req.query.search || '').trim();
    const centroId = req.query.centroId || req.query.centro_id || null;
    const result = await listarAreasAutorizadasUsuario(
      { userId },
      { q, limit: 50, centroId },
    );
    res.json({
      data: result.data,
      scopeType: result.scopeType,
    });
  } catch (err) { next(err); }
});

// GET /api/requerimientos/listar-con-detalles
router.get('/listar-con-detalles', async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '100', 10)));
    const offset = (page - 1) * pageSize;
    const { whereExtra, params: filterParams } = buildListFilters(req.query);

    const scope = await resolveUserDataScope({
      userId,
      moduleCode: 'REGISTRO_REQUERIMIENTO',
      actionCode: 'VER',
    });
    // Intersección: filtros UI ∩ alcance real (nunca confiar solo en query)
    const scopeSql = buildRequerimientoScopeSql(scope, filterParams.length + 1);

    let where = 'WHERE 1=1';
    const params = [...filterParams];
    if (whereExtra) where += ` AND ${whereExtra}`;
    where += scopeSql.clause;
    params.push(...scopeSql.params);

    const countSql = `SELECT COUNT(*)::int AS total ${BASE_FROM} ${where}`;
    const countResult = await query(countSql, params);
    const total = countResult.rows[0].total;

    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const dataSql = `
      SELECT
        r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado,
        r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
        COALESCE(c.nombre, c.codigo, a.responsable, '') AS centro_nombre,
        c.id AS centro_id,
        a.id AS area_id,
        a.codigo AS centro_costo_codigo,
        ${TRAZA_EXTRA_SELECT}
      ${BASE_FROM}
      ${where}
      ORDER BY r.created_at DESC NULLS LAST, r.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await query(dataSql, params);
    const roleLabels = Object.values(ETAPAS).map((v) => v.responsable);
    const rows = (await enrichRequerimientoRowsWithCcp(result.rows || [])).map((row) => {
      // Columna Responsable: persona creadora, no el rol de etapa ("Usuario AU")
      const persona = resolveResponsablePersonaDisplay(row, roleLabels);
      return {
        ...row,
        responsable_actual: persona,
        responsableActual: persona,
      };
    });

    res.json({
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      etapas: Object.entries(ETAPAS).map(([k, v]) => ({ codigo: k, label: v.label })),
      alcance: {
        scopeType: scope.scopeType,
        isInstitutional: scope.isInstitutional,
        skipOrgFilter: !!scope.skipOrgFilter,
      },
    });
  } catch (err) {
    console.error('[requerimientos/listar-con-detalles] Error:', err);
    next(err);
  }
});

/**
 * RC8.14 Obs.51 — Guard de trazabilidad: acepta alcance organizacional (el mismo de
 * guardRequirementAccess, sin cambios) O acceso vigente a Registro de Órdenes
 * (server/lib/accesoRegistroOrdenes.js, reutilizado sin modificar), lo que exista
 * primero. Causa raíz del "No tiene autorización...": el resto de endpoints de
 * Registro de Órdenes (server/routes/ordenesContratacion.js → requireRo) ya usan
 * assertAccesoRegistroOrdenes — un sistema de autorización propio de RO (modo
 * GLOBAL/ASIGNACION), independiente del alcance organizacional por área/centro que
 * usa este archivo. Un usuario con acceso legítimo a Registro de Órdenes puede
 * gestionar una orden cuya área/centro no esté dentro de su alcance organizacional
 * — por eso el botón "Trazabilidad" fallaba aunque el usuario sí podía ver y operar
 * la orden. No se otorga acceso global nuevo: solo se reconoce, para esta consulta
 * de solo lectura, una autorización que el usuario YA tiene y que otros endpoints
 * de RO ya aceptan.
 */
async function guardRequirementAccessOrRoAcceso(req, res, next) {
  try {
    const reqId = req.params.requerimientoId || req.params.id;
    if (!reqId) return next();
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const orgScope = await canAccessRequirement(userId, reqId, String(req.method || 'GET'));
    if (orgScope.ok) return next();

    try {
      await assertAccesoRegistroOrdenes({
        usuarioId: userId,
        actividad: 'VER',
        requerimientoId: reqId,
        userRow: req.user || null,
      });
      return next();
    } catch (_) {
      throw orgScope.error;
    }
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        code: err.code || 'REQUERIMIENTO_FUERA_DE_ALCANCE',
        error: err.message,
        message: err.message,
      });
    }
    return next(err);
  }
}

// Guard de alcance en operaciones por id (especiales)
router.use('/:requerimientoId/trazabilidad', guardRequirementAccessOrRoAcceso);
router.use('/:requerimientoId/solicitar-aprobacion', guardRequirementAccess);
router.use('/:requerimientoId/observar', guardRequirementAccess);
router.use('/:requerimientoId/subsanar', guardRequirementAccess);
router.use('/:requerimientoId/aprobar-evaluacion', guardRequirementAccess);

// GET /api/requerimientos/:id/trazabilidad
router.get('/:requerimientoId/trazabilidad', async (req, res, next) => {
  try {
    const data = await obtenerTrazabilidad(req.params.requerimientoId);
    if (!data) return res.status(404).json({ error: 'Requerimiento no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/solicitar-aprobacion
router.put('/:requerimientoId/solicitar-aprobacion', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};
    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck?.rowCount) {
      return res.status(404).json({ success: false, error: 'Requerimiento no encontrado' });
    }

    // Fase 1A — transición B: REGISTRO → EVALUACION
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
      eventoCodigo: 'REQUERIMIENTO_ENVIADO_EVALUACION',
      expedienteId: requerimientoId,
      req,
      metadata: { tipo_contratacion: req.body?.tipo_contratacion || 'BIEN' },
      legacyHandler: async () => {
        let payload = {};
        try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
        if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
        payload.historial_evaluacion.push({
          tipo: 'derivacion',
          usuario: usuario || 'Usuario AU',
          fecha: new Date().toISOString(),
          observacion: 'Solicitud de aprobación enviada a evaluación',
        });
        await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

        const updated = await ejecutarRegistroDerivar({
          requerimientoId,
          usuario: usuario || 'Usuario AU',
          legacyExecutor: async () => {
            const { transicionarExpediente } = await import('../lib/expedienteTransicion.js');
            const tr = await transicionarExpediente({
              requerimientoId,
              evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
              unidadDestino: ETAPAS.EVALUACION.responsable,
              motivo: 'Solicitud de aprobación enviada a evaluación',
              metadata: {
                client_request_id: req.body?.client_request_id || `reg-derivar:${requerimientoId}`,
                via: 'requerimientos/derivar:legacy',
              },
              actorRol: usuario || 'Usuario AU',
            });
            return tr.expediente;
          },
        });

        if (!updated) {
          return { ok: false, error: 'Transición no permitida por Workflow Engine' };
        }
        return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } };
      },
    });

    if (result.ok !== true) {
      return res.status(result.error ? 409 : 200).json({ success: false, error: result.error || 'Transición no permitida' });
    }

    if (result.evento) {
      // Camino motor: respuesta compatible con contrato workflow + evento.
      return res.json({
        success: true,
        requerimiento: {
          id: result.data?.id ?? Number(requerimientoId),
          codigo: result.data?.codigo ?? null,
          estado: result.data?.estado ?? null,
        },
        workflow: result.workflow || undefined,
        evento: result.evento,
      });
    }
    // Camino legacy: resultado exacto anterior.
    return res.json({ success: true, requerimiento: result.requerimiento });
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/observar
router.put('/:requerimientoId/observar', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      motivo, usuario, destino_submodulo, destino_etapa, destino_persona,
      origen_submodulo, accion, observacion_id, observacion_padre_id, observacionPadreId,
    } = req.body || {};

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}

    const accionObs = procesarAccionObservacion(payload, {
      accion, observacion_id, origen_submodulo: origen_submodulo || 'Evaluación de Requerimiento',
      moduloOrigen: origen_submodulo, usuario,
    });
    if (accionObs) {
      await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
      const updated = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
      return res.json({ success: true, requerimiento: enrichRequerimientoRow(updated.rows[0]) });
    }

    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo de observación requerido' });

    // Fase 1A.2 — transición D: observación de evaluación (NO cambia ubicación).
    // Idempotencia estable: client_request_id si llega; si no, fallback
    // expediente+evento+actor+motivo_hash+ciclo (sin timestamp aleatorio).
    const responsableSubsanacion = destino_persona || req.body?.responsable_subsanacion || '';
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
      eventoCodigo: 'EVALUACION_OBSERVADA',
      expedienteId: requerimientoId,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        client_request_id: req.body?.client_request_id || null,
        motivo,
        ciclo_observacion: req.body?.ciclo_observacion ?? null,
        // responsable de subsanación: actualiza responsable_actual sin mover etapa.
        responsable_destino: responsableSubsanacion,
      },
      // En el camino motor, el domainMutator ejecuta DENTRO de la misma transacción:
      //  1. inserta workflow_observaciones;
      //  2. actualiza payload.observaciones + payload.historial_evaluacion (compat,
      //     reutilizando emitirObservacion como función pura sobre el objeto en memoria);
      //  3. persiste el payload con el mismo tx.
      // workflow_eventos + historial_movimientos + expediente comparten la transacción:
      // si algo falla → ROLLBACK completo.
      domainMutator: buildObservacionDomainMutator({
        motivo,
        usuarioEmisor: usuario || (req.user && (req.user.username || req.user.dni)) || 'SISTEMA',
        responsableSubsanacion,
        destinoSubmodulo: destino_submodulo || 'Registro de Requerimiento',
        destinoEtapa: destino_etapa || 'REGISTRADO',
        destinoPersona,
        origenSubmodulo: origen_submodulo || 'Evaluación de Requerimiento',
        documentos: req.body?.documentos_subsanacion || [],
        origen: 'EVALUACION',
      }),
      legacyHandler: async () => {
        let payload = {};
        try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}

        if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
        payload.historial_evaluacion.push({
          tipo: 'observacion',
          motivo,
          usuario: usuario || '',
          fecha: new Date().toISOString(),
        });

        emitirObservacion(payload, {
          motivo,
          gerente: usuario || 'Gerente',
          origen: 'GERENTE',
          origen_submodulo: origen_submodulo || 'Evaluación de Requerimiento',
          destino_submodulo: destino_submodulo || 'Registro de Requerimiento',
          destino_etapa: destino_etapa || 'REGISTRADO',
          destino_persona: destino_persona || '',
          observacion_padre_id: observacion_padre_id || observacionPadreId || null,
        });

        await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

        const { transicionarExpediente } = await import('../lib/expedienteTransicion.js');
        const tr = await transicionarExpediente({
          requerimientoId,
          evento: 'EVALUACION_OBSERVADA',
          unidadDestino: ETAPAS.REGISTRADO?.responsable || ETAPAS.REGISTRO?.responsable || 'Usuario AU',
          motivo,
          metadata: {
            client_request_id: req.body?.client_request_id || `eval-obs:${requerimientoId}`,
            via: 'requerimientos/observar:legacy',
          },
          actorRol: usuario || 'Gerente',
        });
        const updated = tr.expediente;

        return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } };
      },
    });

    if (result.ok !== true) {
      return res.status(409).json({ success: false, error: result.error || 'Transición no permitida' });
    }

    if (result.evento) {
      return res.json({
        success: true,
        requerimiento: {
          id: result.data?.id ?? Number(requerimientoId),
          codigo: result.data?.codigo ?? null,
          estado: result.data?.estado ?? null,
        },
        workflow: result.workflow || undefined,
        evento: result.evento,
      });
    }
    return res.json({ success: true, requerimiento: result.requerimiento });
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/subsanar
router.put('/:requerimientoId/subsanar', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      respuesta, usuario, origen_submodulo, destino_submodulo, destino_etapa, destino_persona,
      observacion_id,
    } = req.body || {};
    if (!respuesta) return res.status(400).json({ success: false, error: 'Subsanación requerida' });

    const reqCheck = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    const rowBefore = enrichRequerimientoRow(reqCheck.rows[0]);
    const subsArgs = {
      observacion_id,
      respuesta,
      origen_submodulo: origen_submodulo || 'Registro de Requerimiento',
      usuario: usuario || 'Usuario AU',
    };

    let updated;
    if (esOrigenRegistro(origen_submodulo)) {
      registrarSubsanacionObservacion(JSON.parse(JSON.stringify(payload)), subsArgs);
      updated = await ejecutarRegistroSubsanar({
        requerimientoId,
        row: rowBefore,
        usuario: usuario || 'Usuario AU',
        legacyExecutor: async () => {
          const { destinoSubmodulo, destinoEtapa, destinoPersona } = registrarSubsanacionObservacion(payload, subsArgs);
          await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
          return registrarSubsanacionDerivacion({
            requerimientoId,
            usuario: usuario || 'Usuario AU',
            textoSubsanacion: respuesta,
            origenSubmodulo: origen_submodulo || 'Registro de Requerimiento',
            destinoSubmodulo: destinoSubmodulo || destino_submodulo || '',
            destinoEtapa: destinoEtapa || destino_etapa || '',
            destinoPersona: destinoPersona || destino_persona || '',
          });
        },
      });
      if (!updated) {
        return res.status(409).json({
          success: false,
          error: 'No se puede continuar con la validación del workflow.',
        });
      }
    } else {
      const { destinoSubmodulo, destinoEtapa, destinoPersona } = registrarSubsanacionObservacion(payload, subsArgs);
      await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
      updated = await registrarSubsanacionDerivacion({
        requerimientoId,
        usuario: usuario || 'Usuario AU',
        textoSubsanacion: respuesta,
        origenSubmodulo: origen_submodulo || 'Registro de Requerimiento',
        destinoSubmodulo: destinoSubmodulo || destino_submodulo || '',
        destinoEtapa: destinoEtapa || destino_etapa || '',
        destinoPersona: destinoPersona || destino_persona || '',
      });
    }

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/aprobar-evaluacion
router.put('/:requerimientoId/aprobar-evaluacion', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    // Fase 1A — transición C: EVALUACION → DEC
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
      eventoCodigo: 'EVALUACION_APROBADA',
      expedienteId: requerimientoId,
      req,
      metadata: { tipo_contratacion: req.body?.tipo_contratacion || 'BIEN' },
      legacyHandler: async () => {
        let payload = {};
        try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
        if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
        payload.historial_evaluacion.push({
          tipo: 'aprobacion',
          usuario: usuario || '',
          fecha: new Date().toISOString(),
        });
        autoCerrarObservacionesEmisorAlContinuar(payload, 'Evaluación de Requerimiento', usuario || 'Gerente');
        await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

        const { transicionarExpediente } = await import('../lib/expedienteTransicion.js');
        const tr = await transicionarExpediente({
          requerimientoId,
          evento: 'EVALUACION_APROBADA',
          unidadDestino: ETAPAS.DEC.responsable,
          motivo: 'Aprobado en evaluación — derivado a DEC',
          metadata: {
            client_request_id: req.body?.client_request_id || `eval-aprobar:${requerimientoId}`,
            via: 'requerimientos/aprobar-evaluacion:legacy',
          },
          actorRol: usuario || 'Gerente',
        });
        const updated = tr.expediente;

        return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } };
      },
    });

    if (result.ok !== true) {
      return res.status(result.error ? 409 : 200).json({ success: false, error: result.error || 'Transición no permitida' });
    }

    if (result.evento) {
      return res.json({
        success: true,
        requerimiento: {
          id: result.data?.id ?? Number(requerimientoId),
          codigo: result.data?.codigo ?? null,
          estado: result.data?.estado ?? null,
        },
        workflow: result.workflow || undefined,
        evento: result.evento,
      });
    }
    return res.json({ success: true, requerimiento: result.requerimiento });
  } catch (err) { next(err); }
});

// DELETE /api/requerimientos/:id — RC8.15.6G-8D1 (prioridad sobre CRUD genérico)
router.delete('/:id', guardRequirementAccess, async (req, res, next) => {
  try {
    const result = await eliminarRequerimientoInicial(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: err.message, message: err.message, code: err.code || 'NOT_FOUND' });
    }
    if (err.status === 409 || err.code === 'REQUERIMIENTO_NO_ELIMINABLE') {
      return res.status(409).json({
        error: err.message || MSG_REQUERIMIENTO_NO_ELIMINABLE,
        message: err.message || MSG_REQUERIMIENTO_NO_ELIMINABLE,
        code: err.code || 'REQUERIMIENTO_NO_ELIMINABLE',
      });
    }
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, message: err.message, code: err.code });
    }
    return next(err);
  }
});

export default router;
