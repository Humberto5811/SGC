// Rutas personalizadas para requerimientos (más allá de CRUD básico)
import express from 'express';
import { query } from '../db.js';
import {
  TRAZA_EXTRA_SELECT,
  enrichRequerimientoRow,
  enrichRequerimientoRowsWithCcp,
  registrarMovimiento,
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
} from '../lib/userDataScope.js';
import { resolveResponsablePersonaDisplay } from '../lib/usuarioDisplay.js';

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
    const scope = await resolveUserDataScope({ userId, moduleCode: 'REGISTRO_REQUERIMIENTO' });
    const q = String(req.query.q || req.query.search || '').trim();
    const params = [];
    let where = 'WHERE 1=1';

    if (!scope.skipOrgFilter && !scope.isInstitutional) {
      if (scope.scopeType === 'CENTRO') {
        if (scope.centroIds?.length) {
          params.push(scope.centroIds);
          where += ` AND a.centro_id = ANY($${params.length}::int[])`;
        } else {
          return res.json({ data: [], scopeType: scope.scopeType });
        }
      } else {
        const parts = [];
        if (scope.areaIds?.length) {
          params.push(scope.areaIds);
          parts.push(`a.id = ANY($${params.length}::int[])`);
        }
        if (scope.centroCostoCodigos?.length) {
          params.push(scope.centroCostoCodigos);
          parts.push(`UPPER(TRIM(a.codigo)) = ANY($${params.length}::text[])`);
        }
        if (!parts.length) return res.json({ data: [], scopeType: scope.scopeType });
        where += ` AND (${parts.join(' OR ')})`;
      }
    }

    if (q.length >= 2) {
      params.push(`%${q}%`);
      const i = params.length;
      where += ` AND (a.codigo ILIKE $${i} OR a.nombre ILIKE $${i} OR a.responsable ILIKE $${i} OR c.codigo ILIKE $${i})`;
    }

    params.push(50);
    const { rows } = await query(`
      SELECT a.id, a.codigo, a.nombre, a.responsable,
             c.id AS centro_id, COALESCE(c.codigo, '') AS centro, COALESCE(c.nombre, '') AS centro_nombre,
             COALESCE(a.codigo, '') AS codigo_centro_costo
      FROM areas a
      LEFT JOIN centros c ON a.centro_id = c.id
      ${where}
      ORDER BY a.nombre ASC
      LIMIT $${params.length}
    `, params);
    res.json({ data: rows, scopeType: scope.scopeType });
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

// Guard de alcance en operaciones por id (especiales)
router.use('/:requerimientoId/trazabilidad', guardRequirementAccess);
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
          legacyExecutor: () => registrarMovimiento({
            requerimientoId,
            estadoNuevo: 'En tramite de aprobación',
            usuario: usuario || 'Usuario AU',
            accion: 'derivado',
            observacion: 'Solicitud de aprobación enviada a evaluación',
            responsable: ETAPAS.EVALUACION.responsable,
            etapaEjecutor: 'REGISTRADO',
            etapaDestino: 'EVALUACION',
          }),
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

        const updated = await registrarMovimiento({
          requerimientoId,
          estadoNuevo: 'Observado',
          usuario: usuario || 'Gerente',
          accion: 'observado',
          observacion: motivo,
          responsable: ETAPAS.REGISTRADO.responsable,
          etapaEjecutor: 'EVALUACION',
          etapaDestinoEvento: 'REGISTRADO',
        });

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

        const updated = await registrarMovimiento({
          requerimientoId,
          estadoNuevo: 'Aprobado',
          usuario: usuario || 'Gerente',
          accion: 'aprobado',
          observacion: 'Aprobado en evaluación — derivado a DEC',
          responsable: ETAPAS.DEC.responsable,
          etapaEjecutor: 'EVALUACION',
          etapaDestino: 'DEC',
        });

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

export default router;
