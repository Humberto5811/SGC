// Rutas públicas y protegidas — Portal de Proveedores
import express from 'express';
import {
  portalLogin,
  portalChangePassword,
  requirePortalProveedor,
  listMisInvitaciones,
  getDocumentosConvocatoria,
  registrarConsulta,
  listConsultasProveedor,
  listAbsolucionesPublicas,
  registrarObservacion,
  presentarCotizacion,
  guardarBorradorCotizacion,
  listMisCotizaciones,
  getEstadoParticipacion,
  resolverInvitacionToken,
  listarConsultasBandeja,
  responderConsultaAnalista,
  listarRecepcionCotizaciones,
  listarValidacionesBandeja,
  validarCotizacion,
  ampliarPlazo,
} from '../lib/portalProveedores.js';
import {
  listarValidacionesPendientesDerivacion,
  listarValidacionesAsignadas,
  listarValidacionesExpedientes,
  getPreviewDerivacionValidacion,
  derivarValidacionCotizacion,
  devolverValidacionAAreaUsuaria,
  getValidacionTrabajoDetalle,
  guardarValidacionParcial,
  enviarValidacionUsuario,
  listUsuariosDerivacionValidacion,
  getSubmodulosValidacion,
  listarProveedoresSolicitudValidacion,
  getDestinosSalidaPorResultado,
  resolverPdfValidacionFirmada,
} from '../lib/validacionesCotizacion.js';
import { buildRetornoInvalidasDomainMutator } from '../lib/workflow/validacionesAgregadas.js';
import { runWorkflowTransition } from '../lib/workflow/workflowIntegration.js';
import { getPrimaryRequerimientoId } from '../lib/invitaciones.js';
import {
  listarCuadroComparativo,
  listarCuadroComparativoExpedientes,
  getCuadroComparativoExpediente,
  obtenerDetalleCuadro,
  crearOBuscarBorrador,
  guardarBorradorCuadro,
  guardarAdjudicacionCuadro,
  listarVersionesCuadro,
  obtenerDatosPdfCuadro,
  guardarPdfCuadro,
  resolverPdfCuadro,
  adjuntarPdfFirmadoCuadro,
  eliminarPdfFirmadoCuadro,
  resolverPdfFirmadoCuadro,
  adjuntarPdfFirmadoDecCuadro,
  eliminarPdfFirmadoDecCuadro,
  resolverPdfFirmadoDecCuadro,
  derivarCuadroACcp,
  transitarRevisionCuadro,
  filtrarBandejaPorRolRevision,
} from '../lib/cuadroComparativo.js';
import {
  getSolicitudDetalleProveedor,
  getCotizacionWorkspace,
  resolverDocumentoPortal,
  registrarDocumentoTraza,
  getCotizacionRecepcionDetalle,
  resolverDocumentoCotizacionAnalista,
} from '../lib/portalDocumentos.js';

function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim();
}

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { ruc, password } = req.body || {};
    const proveedor = await portalLogin(ruc, password, req);
    res.json({ success: true, proveedor });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

router.get('/invitacion/:token', async (req, res, next) => {
  try {
    const data = await resolverInvitacionToken(req.params.token);
    res.json({ success: true, invitacion: data });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/cambiar-password', requirePortalProveedor, async (req, res, next) => {
  try {
    await portalChangePassword(req.portalProveedor.id, req.body || {});
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/mis-invitaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listMisInvitaciones(req.portalProveedor.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/documentos', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getDocumentosConvocatoria(req.portalProveedor.id, req.params.id);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/detalle', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getSolicitudDetalleProveedor(req.portalProveedor.id, req.params.id);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/cotizacion-workspace', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getCotizacionWorkspace(req.portalProveedor.id, req.params.id);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/documento/:ref/ver', requirePortalProveedor, async (req, res, next) => {
  try {
    const adj = await resolverDocumentoPortal(req.portalProveedor.id, req.params.id, req.params.ref);
    await registrarDocumentoTraza({
      solicitudId: parseInt(req.params.id, 10),
      proveedorId: req.portalProveedor.id,
      documentoRef: req.params.ref,
      evento: 'documento_visualizado',
      usuario: req.portalProveedor.ruc,
      ip: clientIp(req),
    });
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adj.nombre_archivo || 'documento.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/documento/:ref/descargar', requirePortalProveedor, async (req, res, next) => {
  try {
    const adj = await resolverDocumentoPortal(req.portalProveedor.id, req.params.id, req.params.ref);
    await registrarDocumentoTraza({
      solicitudId: parseInt(req.params.id, 10),
      proveedorId: req.portalProveedor.id,
      documentoRef: req.params.ref,
      evento: 'documento_descargado',
      usuario: req.portalProveedor.ruc,
      ip: clientIp(req),
    });
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(adj.nombre_archivo || 'documento.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/absoluciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listAbsolucionesPublicas(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/consultas', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listConsultasProveedor(req.portalProveedor.id, req.query.solicitud_id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/consultas', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await registrarConsulta(req.portalProveedor.id, req.body, req);
    res.status(201).json({ success: true, consulta: row });
  } catch (err) { next(err); }
});

router.post('/observaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await registrarObservacion(req.portalProveedor.id, req.body, req);
    res.status(201).json({ success: true, observacion: row });
  } catch (err) { next(err); }
});

router.post('/cotizaciones/borrador', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await guardarBorradorCotizacion(req.portalProveedor.id, req.body, req);
    res.json({ success: true, cotizacion: row });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.post('/cotizaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await presentarCotizacion(req.portalProveedor.id, req.body, req);
    res.status(201).json({ success: true, cotizacion: row });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

/** Subida de un archivo de cotización (fuera del JSON de borrador). */
router.post('/cotizaciones/:solicitudId/adjuntos', requirePortalProveedor, async (req, res, next) => {
  try {
    const { uploadCotizacionPortalAdjunto } = await import('../lib/portalCotizacionAdjuntos.js');
    const adjunto = await uploadCotizacionPortalAdjunto(
      req.portalProveedor.id,
      parseInt(req.params.solicitudId, 10),
      req.body,
    );
    res.status(201).json({ success: true, adjunto });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.get('/cotizaciones/:solicitudId/adjuntos/:adjuntoId', requirePortalProveedor, async (req, res, next) => {
  try {
    const { getCotizacionPortalAdjunto } = await import('../lib/portalCotizacionAdjuntos.js');
    const adj = await getCotizacionPortalAdjunto(
      req.portalProveedor.id,
      parseInt(req.params.solicitudId, 10),
      parseInt(req.params.adjuntoId, 10),
    );
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const disposition = (req.query.download === '1') ? 'attachment' : 'inline';
    res.setHeader('Content-Type', adj.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${adj.nombre_archivo || 'documento'}"`);
    res.send(buf);
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.get('/cotizaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listMisCotizaciones(req.portalProveedor.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/estado-participacion', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getEstadoParticipacion(req.portalProveedor.id);
    res.json(data);
  } catch (err) { next(err); }
});

// ——— Órdenes recibidas (Registro de Órdenes / Contrataciones) ———
router.get('/ordenes', requirePortalProveedor, async (req, res, next) => {
  try {
    const { listarOrdenesPortalProveedor } = await import('../lib/ordenesProveedor.js');
    const data = await listarOrdenesPortalProveedor(req.portalProveedor.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/ordenes/:id', requirePortalProveedor, async (req, res, next) => {
  try {
    const { getOrdenPortalParaProveedor } = await import('../lib/ordenesProveedor.js');
    const data = await getOrdenPortalParaProveedor(req.params.id, req.portalProveedor.id);
    res.json({ data });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.get('/ordenes/:id/documentos/:documentoId', requirePortalProveedor, async (req, res, next) => {
  try {
    const { descargarDocumentoPortal } = await import('../lib/ordenesProveedor.js');
    const doc = await descargarDocumentoPortal(req.params.id, req.portalProveedor.id, req.params.documentoId);
    const buf = Buffer.from(doc.contenido_base64, 'base64');
    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.nombre_archivo || 'orden.pdf'}"`);
    res.send(buf);
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.post('/ordenes/:id/confirmar-recepcion', requirePortalProveedor, async (req, res, next) => {
  try {
    const { confirmarRecepcionDesdeSesion } = await import('../lib/ordenesProveedor.js');
    const data = await confirmarRecepcionDesdeSesion(req.params.id, req.portalProveedor.id, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    res.json({ data });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.get('/orden/:token', async (req, res, next) => {
  try {
    const { getOrdenPortalPorToken } = await import('../lib/ordenesProveedor.js');
    const data = await getOrdenPortalPorToken(req.params.token);
    res.json({ success: true, data });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    next(err);
  }
});

router.post('/orden/:token/confirmar-recepcion', async (req, res, next) => {
  try {
    const { confirmarRecepcionOrden } = await import('../lib/ordenesProveedor.js');
    const data = await confirmarRecepcionOrden(req.params.token, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    next(err);
  }
});

export default router;

export const portalAnalistaRouter = express.Router();

portalAnalistaRouter.get('/consultas', async (req, res, next) => {
  try {
    const data = await listarConsultasBandeja(req.query);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/consultas/:id/responder', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const row = await responderConsultaAnalista(req.params.id, req.body, usuario);
    res.json({ success: true, consulta: row });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones', async (req, res, next) => {
  try {
    const data = await listarRecepcionCotizaciones(req.query);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones/:id', async (req, res, next) => {
  try {
    const data = await getCotizacionRecepcionDetalle(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones/:id/documento/:ref/ver', async (req, res, next) => {
  try {
    const adj = await resolverDocumentoCotizacionAnalista(req.params.id, req.params.ref);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adj.nombre_archivo || 'documento.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones/:id/documento/:ref/descargar', async (req, res, next) => {
  try {
    const adj = await resolverDocumentoCotizacionAnalista(req.params.id, req.params.ref);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(adj.nombre_archivo || 'documento')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones', async (_req, res, next) => {
  try {
    const data = await listarValidacionesPendientesDerivacion();
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/pendientes-derivacion', async (_req, res, next) => {
  try {
    const data = await listarValidacionesPendientesDerivacion();
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/expedientes', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.query.admin || '') === '1';
    const data = await listarValidacionesExpedientes(usuario, userId, { esAdmin, soloAsignadas: !esAdmin });
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/asignadas', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const data = await listarValidacionesAsignadas(usuario, userId);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/submodulos', async (_req, res, next) => {
  try {
    res.json({ data: getSubmodulosValidacion() });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/usuarios', async (req, res, next) => {
  try {
    const data = await listUsuariosDerivacionValidacion(req.query.submodulo, req.query.search);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/destinos-salida', async (req, res, next) => {
  try {
    const data = getDestinosSalidaPorResultado(req.query.resultado, req.query.cumple);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/solicitud/:solicitudId/proveedores', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.query.admin || '') === '1';
    const data = await listarProveedoresSolicitudValidacion(
      req.params.solicitudId,
      usuario,
      userId,
      { esAdmin },
    );
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/:id/preview-derivacion', async (req, res, next) => {
  try {
    const data = await getPreviewDerivacionValidacion(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/validaciones/:id/derivar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });
    const row = await derivarValidacionCotizacion(req.params.id, req.body, usuario);
    res.json({
      success: true,
      cotizacion: row,
      idempotente: !!row?.idempotente,
      ok: true,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/obligatoria|obligatorios|no está presentada|ya fue|ya está|no permitido/i.test(msg)) {
      return res.status(409).json({ error: msg });
    }
    next(err);
  }
});

portalAnalistaRouter.post('/validaciones/:id/devolver', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });
    const row = await devolverValidacionAAreaUsuaria(req.params.id, req.body, usuario);
    res.json({
      success: true,
      cotizacion: row,
      idempotente: !!row?.idempotente,
      ok: true,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/obligatoria|Solo se puede|responsable|no permitido/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    if (/permiso|No tiene/i.test(msg)) {
      return res.status(403).json({ error: msg });
    }
    if (/ya está|ya fue/i.test(msg)) {
      return res.status(409).json({ error: msg });
    }
    next(err);
  }
});

// Fase 2A.4B — devolución AGREGADA de Validaciones a Invitaciones.
// Ruta nueva separada del endpoint individual (:id/devolver) para NO confundir
// reapertura individual con retorno agregado. Trabaja con la solicitud.
portalAnalistaRouter.post('/validaciones/solicitudes/:solicitudId/devolver-todas-invalidas', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });
    const solicitudId = parseInt(req.params.solicitudId, 10);
    if (!solicitudId) return res.status(400).json({ error: 'solicitudId inválido' });

    // Resolver requerimiento principal (el motor trabaja sobre requerimientos).
    const requerimientoId = await getPrimaryRequerimientoId(solicitudId);
    if (!requerimientoId) return res.status(400).json({ error: 'Sin requerimiento asociado' });

    // Política: como la capacidad agregada no existía en legacy (solo reapertura individual),
    // con WORKFLOW_ENGINE_VALIDACIONES=false esta ruta nueva responde feature disabled (503)
    // sin escrituras; el endpoint individual :id/devolver queda intacto.
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_VALIDACIONES',
      eventoCodigo: 'COTIZACIONES_INVALIDAS_DEVUELTAS',
      expedienteId: requerimientoId,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        solicitud_id: solicitudId,
        client_request_id: req.body?.client_request_id || null,
        observacion: 'Todas las cotizaciones fueron declaradas NO_APTO',
      },
      domainMutator: buildRetornoInvalidasDomainMutator({
        solicitudId,
        usuario,
        observacion: req.body?.observacion || '',
      }),
      legacyHandler: async () => {
        // Política recomendada: la acción agregada no existía en legacy.
        const err = new Error('WORKFLOW_FEATURE_DISABLED:WORKFLOW_ENGINE_VALIDACIONES');
        err.code = 'WORKFLOW_FEATURE_DISABLED';
        err.status = 503;
        throw err;
      },
    });

    const resVal = result.domainResults || {};
    res.json({
      success: true,
      mensaje: 'El expediente fue devuelto a Invitaciones porque todas las cotizaciones fueron declaradas no aptas.',
      workflow: result.workflow || undefined,
      evento: result.evento,
      resultado_validacion: {
        total_consideradas: resVal.total_consideradas ?? null,
        total_evaluadas: resVal.total_evaluadas ?? null,
        aptas: resVal.aptas ?? null,
        no_aptas: resVal.no_aptas ?? null,
        pendientes: resVal.pendientes ?? null,
        todas_no_aptas: resVal.todas_no_aptas ?? null,
      },
      acciones_pendientes: {
        requiere_reinvitacion: true,
        reinvitacion_creada: false,
        correo_enviado: false,
      },
    });
  } catch (err) {
    const msg = String(err?.message || '');
    const code = err?.code || '';
    if (/VALIDACIONES_|WORKFLOW_STAGE|TIPO_CONTRATACION|WORKFLOW_FEATURE/i.test(code)) {
      return res.status(409).json({ error: msg, code });
    }
    if (err?.status === 503 || code === 'WORKFLOW_FEATURE_DISABLED' || code === 'WORKFLOW_WRITE_DISABLED') {
      return res.status(503).json({ error: msg, code });
    }
    next(err);
  }
});

portalAnalistaRouter.get('/validaciones/:id/trabajo', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.query.admin || '') === '1';
    const data = await getValidacionTrabajoDetalle(req.params.id, usuario, userId, { esAdmin });
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/validaciones/:id/guardar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.body?.admin || '') === '1';
    const row = await guardarValidacionParcial(req.params.id, req.body, usuario, userId, { esAdmin });
    res.json({ success: true, cotizacion: row });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/validaciones/:id/enviar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.body?.admin || '') === '1';
    const row = await enviarValidacionUsuario(req.params.id, req.body, usuario, userId, { esAdmin });
    res.json({
      success: true,
      ok: row?.ok !== false,
      cotizacion: row,
      estado: row?.estado || row?.validacion_estado,
      destino: row?.destino || row?.destino_salida,
      responsable: row?.responsable,
      workflow: row?.workflow,
    });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/:id/pdf-validacion', async (req, res, next) => {
  try {
    const adj = await resolverPdfValidacionFirmada(req.params.id);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(adj.nombre_archivo || 'validacion.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/validaciones/:id', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const row = await validarCotizacion(req.params.id, req.body, usuario);
    res.json({ success: true, cotizacion: row });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/solicitud/:id/ampliar-plazo', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const result = await ampliarPlazo(req.params.id, req.body, usuario);
    res.json(result);
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo', async (_req, res, next) => {
  try {
    const data = await listarCuadroComparativo();
    res.json({ data });
  } catch (err) { next(err); }
});

/** RC8.1 / RC8.4 — bandeja por Solicitud; filtrada por rol de revisión */
portalAnalistaRouter.get('/cuadro-comparativo/expedientes', async (req, res) => {
  try {
    const all = await listarCuadroComparativoExpedientes();
    // RC8.5-B1 — rol operativo solo desde cabeceras de sesión (no query libre)
    const userCtx = {
      cargo: req.headers['x-user-cargo'] || '',
      rol: req.headers['x-user-rol'] || '',
      permisos: (() => {
        try { return JSON.parse(req.headers['x-user-permisos'] || '{}'); } catch (_) { return {}; }
      })(),
    };
    const filtrado = filtrarBandejaPorRolRevision(all, userCtx);
    res.json({ data: filtrado.data, meta: { rol_revision: filtrado.rol } });
  } catch (err) {
    console.error('[cuadro-comparativo/expedientes]', err?.stack || err);
    res.status(500).json({
      error: 'No se pudo cargar la bandeja de Cuadro Comparativo',
      code: 'CUADRO_LIST_ERROR',
    });
  }
});

portalAnalistaRouter.get('/cuadro-comparativo/expedientes/:solicitudId', async (req, res, next) => {
  try {
    const data = await getCuadroComparativoExpediente(req.params.solicitudId);
    res.json({ data });
  } catch (err) { next(err); }
});

/** RC8.2 — matriz Bienes + borrador */
portalAnalistaRouter.get('/cuadro-comparativo/:solicitudId/detalle', async (req, res, next) => {
  try {
    const data = await obtenerDetalleCuadro(req.params.solicitudId);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/cuadro-comparativo/:solicitudId/borrador', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await crearOBuscarBorrador(req.params.solicitudId, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/cuadro-comparativo/:cuadroId/borrador', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await guardarBorradorCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) {
    if (err?.code === 'CONFLICT_VERSION' || err?.status === 409) {
      res.status(409).json({ error: err.message, code: 'CONFLICT_VERSION' });
      return;
    }
    next(err);
  }
});

portalAnalistaRouter.put('/cuadro-comparativo/:cuadroId/adjudicacion', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await guardarAdjudicacionCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data, derivado_ccp: false });
  } catch (err) {
    if (err?.code === 'CONFLICT_VERSION' || err?.status === 409) {
      res.status(409).json({ error: err.message, code: 'CONFLICT_VERSION' });
      return;
    }
    if (err?.code === 'ADJUDICACION_INVALIDA') {
      res.status(400).json({ error: err.message, code: err.code, errors: err.errors || [] });
      return;
    }
    next(err);
  }
});

portalAnalistaRouter.get('/cuadro-comparativo/:solicitudId/versiones', async (req, res, next) => {
  try {
    const data = await listarVersionesCuadro(req.params.solicitudId);
    res.json({ data });
  } catch (err) { next(err); }
});

/** RC8.4 — Anexo 8A PDF */
portalAnalistaRouter.get('/cuadro-comparativo/cuadro/:cuadroId/pdf-data', async (req, res, next) => {
  try {
    const data = await obtenerDatosPdfCuadro(req.params.cuadroId);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/cuadro-comparativo/cuadro/:cuadroId/pdf', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await guardarPdfCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo/cuadro/:cuadroId/pdf', async (req, res, next) => {
  try {
    const adj = await resolverPdfCuadro(req.params.cuadroId);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(adj.nombre_archivo || 'Anexo_08A.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

/** RC8.5 — PDF firmado + derivación a CCP */
portalAnalistaRouter.post('/cuadro-comparativo/cuadro/:cuadroId/firmado', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await adjuntarPdfFirmadoCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.delete('/cuadro-comparativo/cuadro/:cuadroId/firmado', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.query?.usuario || '';
    const data = await eliminarPdfFirmadoCuadro(req.params.cuadroId, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo/cuadro/:cuadroId/firmado', async (req, res, next) => {
  try {
    const adj = await resolverPdfFirmadoCuadro(req.params.cuadroId);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(adj.nombre_archivo || 'Anexo_08A_firmado.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

/** RC8.6 — PDF firmado por el DEC */
portalAnalistaRouter.post('/cuadro-comparativo/cuadro/:cuadroId/firmado-dec', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await adjuntarPdfFirmadoDecCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.delete('/cuadro-comparativo/cuadro/:cuadroId/firmado-dec', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.query?.usuario || '';
    const data = await eliminarPdfFirmadoDecCuadro(req.params.cuadroId, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo/cuadro/:cuadroId/firmado-dec', async (req, res, next) => {
  try {
    const adj = await resolverPdfFirmadoDecCuadro(req.params.cuadroId);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(adj.nombre_archivo || 'Anexo_08A_firmado_DEC.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/cuadro-comparativo/cuadro/:cuadroId/derivar-ccp', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await derivarCuadroACcp(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** RC8.4 — Revisión: Derivar Coordinador / Aprobar-Observar Coordinador-DEC / Generar CCP */
portalAnalistaRouter.post('/cuadro-comparativo/cuadro/:cuadroId/revision', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    // RC8.5-B1 — no elevar privilegios con body.cargo/body.rol del navegador
    // RC8.5-G — actuar_como solo body (ignorar query); validado en lib (solo Admin)
    const userCtx = {
      cargo: req.headers['x-user-cargo'] || '',
      rol: req.headers['x-user-rol'] || '',
      permisos: (() => {
        try { return JSON.parse(req.headers['x-user-permisos'] || '{}'); } catch (_) { return {}; }
      })(),
    };
    const body = { ...(req.body || {}) };
    // No elevar privilegios ni tomar contexto de prueba desde query/cargo del body
    delete body.cargo;
    delete body.rol;
    delete body.permisos;
    // actuar_como solo body autenticado; querystring se ignora siempre
    const data = await transitarRevisionCuadro(req.params.cuadroId, body, usuario, userCtx);
    res.json({ success: true, data });
  } catch (err) {
    if (err?.code === 'ADMIN_ACTUAR_COMO_FORBIDDEN') {
      return res.status(403).json({ error: err.message, detail: err.message });
    }
    next(err);
  }
});
