/**
 * RC8.7 — API Mantenimiento Workflow SGC (catálogos + diagnóstico + reconciliación).
 * No permite edición libre de estado de expedientes; solo catálogos y reconcile controlado.
 */
import express from 'express';
import { query } from '../db.js';
import { getCatalogoEstados, getLabelEstado } from '../../shared/estadoExpedienteCatalog.js';
import { ETAPAS_LIST, getEtapaMeta } from '../../shared/workflow/etapas.js';
import { reconciliarEstadoResponsablePorEvidencia } from '../lib/reconciliarEstadoResponsablePorEvidencia.js';
import { getEstadoResponsableCanonico } from '../lib/estadoResponsableCanonico.js';

const router = express.Router();

const CATEGORIAS_VISUALES = [
  'PENDIENTE', 'EN_PROCESO', 'DERIVADO', 'OBSERVADO', 'DEVUELTO',
  'APROBADO', 'COMPLETADO', 'FINALIZADO', 'ANULADO', 'DESCONOCIDO',
];

function categoriaDeEstado(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (/ANUL/.test(c)) return 'ANULADO';
  if (/OBSERV/.test(c)) return 'OBSERVADO';
  if (/DEVUELT/.test(c)) return 'DEVUELTO';
  if (/FINALIZ|RESUELTA/.test(c)) return 'FINALIZADO';
  if (/APROBAD|VALIDADO|CONFORMIDAD_RECIBIDA/.test(c)) return 'APROBADO';
  if (/BIEN_RECIBIDO|COMPLET|CCP_REGISTRADA|RECEPCION_CONFIRMADA/.test(c)) return 'COMPLETADO';
  if (/DERIV|NOTIFIC|ENVIADA|PAGO/.test(c)) return 'DERIVADO';
  if (/PENDIENTE|REGISTRADO$/.test(c)) return 'PENDIENTE';
  return 'EN_PROCESO';
}

function isAdmin(req) {
  const rol = String(req.user?.rol || req.headers['x-user-rol'] || '').toLowerCase();
  return rol === 'admin' || rol === 'administrador';
}

/** GET /api/workflow/mantenimiento/estados */
router.get('/estados', async (_req, res, next) => {
  try {
    let rows = [];
    try {
      const r = await query(`
        SELECT codigo, label, categoria_visual, activo, orden, tooltip, icono
        FROM workflow_estados_catalogo ORDER BY orden, codigo
      `);
      rows = r.rows;
    } catch (_) { /* tabla pendiente de migración */ }

    if (!rows.length) {
      const cats = getCatalogoEstados() || [];
      rows = cats.map((e, i) => ({
        codigo: e.codigo,
        label: e.label || getLabelEstado(e.codigo) || e.codigo,
        categoria_visual: categoriaDeEstado(e.codigo),
        activo: true,
        orden: (e.prioridad || i + 1) * 10,
        tooltip: e.label || null,
        icono: null,
        fuente: 'js_catalog',
      }));
    }
    res.json({
      categorias: CATEGORIAS_VISUALES,
      estados: rows,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/workflow/mantenimiento/etapas */
router.get('/etapas', async (_req, res, next) => {
  try {
    let rows = [];
    try {
      const r = await query(`
        SELECT codigo, label, orden_proceso, modulo, submodulo, activo
        FROM workflow_etapas_catalogo ORDER BY orden_proceso, codigo
      `);
      rows = r.rows;
    } catch (_) { /* ok */ }

    if (!rows.length) {
      rows = (ETAPAS_LIST || []).map((codigo, i) => {
        const m = getEtapaMeta(codigo) || {};
        return {
          codigo,
          label: m.label || codigo,
          orden_proceso: (i + 1) * 10,
          modulo: m.submoduloCodigo || null,
          submodulo: m.submoduloLabel || null,
          activo: true,
          fuente: 'js_catalog',
        };
      });
    }
    res.json({ etapas: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/workflow/mantenimiento/reglas-responsable */
router.get('/reglas-responsable', async (_req, res, next) => {
  try {
    let rows = [];
    try {
      const r = await query(`
        SELECT * FROM workflow_reglas_responsable
        WHERE activo = TRUE ORDER BY etapa_codigo, prioridad
      `);
      rows = r.rows;
    } catch (_) { /* ok */ }

    if (!rows.length) {
      const fuentes = [
        'ASIGNACION_EXPLICITA', 'RESPONSABLE_SOLICITUD', 'RESPONSABLE_VALIDACION_AU',
        'RESPONSABLE_CCP', 'RESPONSABLE_ORDEN', 'RESPONSABLE_RECEPCION',
        'UNIDAD_DESTINO', 'PENDIENTE',
      ];
      rows = (ETAPAS_LIST || []).flatMap((etapa) => fuentes.slice(0, 3).map((tipo_fuente, i) => ({
        etapa_codigo: etapa,
        tipo_fuente,
        prioridad: (i + 1) * 10,
        permite_persona: true,
        permite_unidad: true,
        permite_pendiente: i === 2,
        requiere_permiso: false,
        submodulo_permiso: null,
        activo: true,
        fuente: 'js_seed',
      })));
    }
    res.json({
      fuentesPermitidas: [
        'ASIGNACION_EXPLICITA', 'RESPONSABLE_SOLICITUD', 'RESPONSABLE_VALIDACION_AU',
        'RESPONSABLE_CCP', 'RESPONSABLE_ORDEN', 'RESPONSABLE_RECEPCION',
        'UNIDAD_DESTINO', 'PENDIENTE',
      ],
      reglas: rows,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/workflow/mantenimiento/transiciones */
router.get('/transiciones', async (_req, res, next) => {
  try {
    res.json({
      mensaje: 'Las transiciones productivas pasan solo por transicionarExpediente().',
      edicionLibreProhibida: true,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/workflow/mantenimiento/diagnostico?codigos=REQ-00001,REQ-00002 */
router.get('/diagnostico', async (req, res, next) => {
  try {
    const raw = String(req.query.codigos || 'REQ-00001,REQ-00002');
    const codigos = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const { rows: reqs } = await query(
      `SELECT id, codigo FROM requerimientos WHERE codigo = ANY($1::text[]) ORDER BY codigo`,
      [codigos],
    );
    const ids = reqs.map((r) => r.id);
    const plan = await reconciliarEstadoResponsablePorEvidencia({
      requerimientoIds: ids,
      dryRun: true,
    });
    const resolved = await getEstadoResponsableCanonico({ requerimientoIds: ids });
    const matriz = reqs.map((r) => {
      const erv = resolved.get(r.id) || {};
      const missing = erv.canonicalMissing === true;
      const p = (plan.rows || []).find((x) => x.requerimientoId === r.id) || null;
      return {
        codigo: r.codigo,
        persistido: erv,
        canonicalMissing: missing,
        diagnostico: missing
          ? 'Sin fuente canónica — requiere reconciliación'
          : (p?.accion === 'RECONCILIAR' ? 'Inconsistente vs evidencia' : 'OK'),
        contratoCanonico: missing ? null : {
          estado: erv.estadoLabel || erv.estadoCodigo,
          etapa: erv.etapaLabel || erv.etapaCodigo,
          responsable: erv.responsableTipo === 'PERSONA'
            ? (erv.responsableNombre || erv.responsableUsername || erv.responsableUsuarioId)
            : (erv.responsableUnidad || 'Pendiente de asignación'),
          fuente: erv.responsableFuente,
          version: erv.version,
          categoria: erv.estadoCategoria,
        },
        evidencia: p ? {
          etapaPropuesta: p.etapaPropuesta,
          estadoPropuesto: p.estadoPropuesto,
          responsablePropuesto: p.responsablePropuesto,
          accion: p.accion,
        } : null,
        inconsistente: p?.accion === 'RECONCILIAR',
      };
    });
    const sinCanonico = matriz.filter((m) => m.canonicalMissing);
    res.json({
      ok: true,
      matriz,
      inconsistencias: plan.inconsistencias || [],
      sinFuenteCanonica: sinCanonico,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/workflow/mantenimiento/reconciliar { dryRun, requerimientoIds, motivo } */
router.post('/reconciliar', async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Solo admin puede reconciliar' });
    }
    const dryRun = req.body?.dryRun !== false;
    const motivo = String(req.body?.motivo || '').trim();
    if (!dryRun && !motivo) {
      return res.status(400).json({ error: 'Motivo obligatorio para aplicar' });
    }
    const ids = Array.isArray(req.body?.requerimientoIds)
      ? req.body.requerimientoIds
      : (req.body?.requerimientoId != null ? [req.body.requerimientoId] : null);

    const result = await reconciliarEstadoResponsablePorEvidencia({
      requerimientoIds: ids,
      dryRun,
      motivo,
      actor: String(req.user?.username || req.headers['x-user-name'] || 'admin'),
    });

    try {
      await query(`
        INSERT INTO workflow_reconciliacion_log (requerimiento_id, dry_run, motivo, actor, plan_json, resultado_json)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
      `, [
        ids?.[0] || null,
        dryRun,
        motivo || null,
        result.actor,
        JSON.stringify({ rows: result.rows || result.inconsistencias || [] }),
        JSON.stringify(result),
      ]);
    } catch (_) { /* log opcional si migración pendiente */ }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
