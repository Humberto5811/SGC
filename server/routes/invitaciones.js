// Rutas API — Invitaciones y Solicitudes de Cotización
import express from 'express';
import {
  listarBandejaInvitaciones,
  crearSolicitudCotizacion,
  getCatalogosSolicitud,
  generarCodigoSolicitud,
  buscarProveedores,
  upsertProveedor,
  agregarProveedoresInvitacion,
  enviarInvitaciones,
  getSolicitudDetalle,
  listarSolicitudesPorRequerimiento,
  getTableroControl,
  seedProveedoresDemo,
  observarInvitaciones,
  listarSolicitudesBandeja,
  actualizarSolicitudCotizacion,
  eliminarSolicitudCotizacion,
  obtenerItemsRequerimientos,
  agregarProveedorSolicitud,
  listarProveedoresSolicitud,
  enviarCorreosSolicitud,
  eliminarInvitacionProveedor,
  getHistorialProveedorInvitaciones,
  persistirInvitaciones,
  enviarCorreosInvitacion,
  registrarResultadoSmtp,
  getPrimaryRequerimientoId,
} from '../lib/invitaciones.js';
import { runWorkflowTransition, buildIdempotencyKey } from '../lib/workflow/workflowIntegration.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const soloMios = req.query.solo_mios === '1' || req.query.solo_mios === 'true';
    const usuarioNombre = req.headers['x-user-name'] || req.query.usuario || '';
    const result = await listarBandejaInvitaciones(page, pageSize, req.query, {
      soloAsignadosA: soloMios ? usuarioNombre : null,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/catalogos', (_req, res) => {
  res.json(getCatalogosSolicitud());
});

router.get('/solicitudes', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
    const data = await listarSolicitudesBandeja(page, pageSize, req.query);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/solicitudes/preview-codigo', async (_req, res, next) => {
  try {
    const data = await generarCodigoSolicitud();
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/requerimientos/items', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
    const data = await obtenerItemsRequerimientos(ids);
    res.json({ data });
  } catch (err) { next(err); }
});

router.put('/solicitudes/:id', async (req, res, next) => {
  try {
    const solicitud = await actualizarSolicitudCotizacion(req.params.id, req.body || {});
    res.json({ success: true, solicitud });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.delete('/solicitudes/:id', async (req, res, next) => {
  try {
    await eliminarSolicitudCotizacion(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/solicitudes/:id/proveedores', async (req, res, next) => {
  try {
    const data = await listarProveedoresSolicitud(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/solicitudes/:id/proveedores', async (req, res, next) => {
  try {
    const row = await agregarProveedorSolicitud(req.params.id, req.body || {});
    res.status(201).json({ success: true, invitacion: row });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/solicitudes/:id/enviar-correos', async (req, res, next) => {
  try {
    const solicitudId = parseInt(req.params.id, 10);
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const invitacionIds = req.body?.invitacion_ids || [];
    const clientRequestId = req.body?.client_request_id || null;
    // Ciclo real de este endpoint = contador_envios objetivo (se calcula antes de persistir).
    const cicloObjetivo = req.body?.ciclo_objetivo ?? null;

    // Resolver el requerimiento principal de la solicitud (el motor trabaja sobre requerimientos).
    const requerimientoId = await getPrimaryRequerimientoId(solicitudId);
    if (!requerimientoId) return res.status(400).json({ error: 'Sin requerimiento asociado' });

    // Ciclo objetivo real de la reinvitación = contador_envios actual + 1 (antes de persistir).
    const { query } = await import('../db.js');
    const { rows: scRows } = await query('SELECT contador_envios FROM solicitudes_cotizacion WHERE id = $1', [solicitudId]);
    const contadorActual = Number(scRows[0]?.contador_envios || 0);
    const contadorObjetivo = cicloObjetivo ?? (contadorActual + 1);

    // Fase 2A.3E — REINVITACION_ENVIADA (INVITACIONES → INVITACIONES).
    // Reutiliza el patrón de INVITACION_ENVIADA: domainMutator persiste con el tx del motor
    // y devuelve planCorreos; afterCommit envía correos post-COMMIT y marca SMTP.
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES',
      eventoCodigo: 'REINVITACION_ENVIADA',
      expedienteId: requerimientoId,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        solicitud_id: solicitudId,
        client_request_id: clientRequestId,
        // contador objetivo: ciclo real de la reinvitación (calculado antes de persistir).
        ciclo_observacion: `sc${solicitudId}:c${contadorObjetivo}`,
      },
      domainMutator: async (tx, { expediente_id }) => {
        // persistirInvitaciones ya selecciona solo pendientes (sqlInvitacionPendiente),
        // asocia solicitud_id y devuelve planCorreos.
        const persisted = await persistirInvitaciones(tx, {
          requerimientoId: Number(expediente_id),
          solicitud_id: solicitudId,
          invitacion_ids: invitacionIds,
          usuario,
          ip,
        }, null); // SIN correo en la transacción
        return { planCorreos: persisted.enviados, contador_envios: persisted.contador_envios, codigo: persisted.codigo, estadoNuevo: persisted.estadoNuevo };
      },
      afterCommit: async ({ resultado }) => {
        const plan = resultado?.domain_results?.planCorreos || [];
        const correo = { enviados: [], fallidos: [], pendientes: [] };
        for (const item of plan) {
          try {
            await registrarResultadoSmtp(item.id, { dispatch_key: item.dispatch_key, estado: 'PENDIENTE', intento: 1 }, null);
            correo.pendientes.push(item.id);
            await enviarCorreosInvitacion({
              proveedor: { id: item.proveedor_id, ruc: item.ruc, razon_social: item.razon_social, emails: item.proveedor_emails, correos: item.correos },
              solicitud: { codigo: resultado?.domain_results?.codigo || '', objeto: '' },
              correos: item.correos,
              credenciales: { usuario: item.ruc, clave: item.ruc },
              urlInvitacion: item.url,
              token: item.token,
            });
            await registrarResultadoSmtp(item.id, { dispatch_key: item.dispatch_key, estado: 'ENVIADO', intento: 1 }, null);
            correo.enviados.push(item.id);
          } catch (e) {
            await registrarResultadoSmtp(item.id, { dispatch_key: item.dispatch_key, estado: 'ERROR', intento: 1, error: e.message }, null);
            correo.fallidos.push(item.id);
          }
        }
        return correo;
      },
      legacyHandler: async () => {
        // Camino legacy EXACTO (flag off): mismo UPDATE solicitud_id + enviarInvitaciones.
        const resultLegacy = await enviarCorreosSolicitud(solicitudId, invitacionIds, { usuario, ip });
        return { ok: true, ...resultLegacy };
      },
    });

    if (result.evento) {
      const correoMotor = result.afterCommit?.ok ? result.afterCommit.resultado : { enviados: [], fallidos: [], pendientes: [] };
      const totalMotor = correoMotor.enviados.length + correoMotor.fallidos.length;
      res.json({
        success: true,
        enviados: correoMotor.enviados,
        total: totalMotor,
        contador_envios: result.domainResults?.contador_envios ?? 0,
        mensaje: result.mensaje ?? 'Solicitud de Cotización reinvitada (reenvío) correctamente.',
        workflow: result.workflow || undefined,
        evento: result.evento,
        correo: correoMotor,
        ...(result.afterCommit && !result.afterCommit.ok ? { advertencia_correo: result.afterCommit.error } : {}),
      });
    } else {
      // Legacy (flag off): respuesta idéntica.
      res.json({ success: true, ...result });
    }
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.delete('/solicitudes/:id/proveedores/:invitacionId', async (req, res, next) => {
  try {
    await eliminarInvitacionProveedor(req.params.invitacionId);
    res.json({ success: true });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/solicitudes/:id', async (req, res, next) => {
  try {
    const data = await getSolicitudDetalle(req.params.id);
    if (!data) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/requerimiento/:requerimientoId/solicitudes', async (req, res, next) => {
  try {
    const data = await listarSolicitudesPorRequerimiento(req.params.requerimientoId);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/tablero', async (req, res, next) => {
  try {
    const data = await getTableroControl(null);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/tablero/:solicitudId', async (req, res, next) => {
  try {
    const data = await getTableroControl(parseInt(req.params.solicitudId, 10));
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/solicitudes', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const solicitud = await crearSolicitudCotizacion(req.body || {}, usuario);
    res.status(201).json({ success: true, solicitud });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de solicitud ya existe. Actualice la página e intente de nuevo.' });
    }
    if (err.message) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/proveedores', async (req, res, next) => {
  try {
    const data = await buscarProveedores(
      req.query.search || req.query.q || '',
      req.query.limit,
      {
        ruc: req.query.ruc,
        razon_social: req.query.razon_social,
        correo: req.query.correo,
        telefono: req.query.telefono,
        rubro: req.query.rubro,
        estado: req.query.estado,
      },
    );
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/proveedores/:proveedorId/historial', async (req, res, next) => {
  try {
    const data = await getHistorialProveedorInvitaciones(req.params.proveedorId);
    if (!data) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/proveedores', async (req, res, next) => {
  try {
    const proveedor = await upsertProveedor(req.body || {});
    res.status(201).json({ success: true, proveedor });
  } catch (err) { next(err); }
});

router.post('/proveedores/seed-demo', async (_req, res, next) => {
  try {
    const n = await seedProveedoresDemo();
    res.json({ success: true, inserted: n });
  } catch (err) { next(err); }
});

router.post('/requerimiento/:requerimientoId/proveedores', async (req, res, next) => {
  try {
    const { proveedores, solicitud_id } = req.body || {};
    const data = await agregarProveedoresInvitacion(
      parseInt(req.params.requerimientoId, 10),
      proveedores || [],
      solicitud_id || null,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/requerimiento/:requerimientoId/enviar', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const requerimientoIdNum = parseInt(requerimientoId, 10);
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const solicitudId = req.body?.solicitud_id || null;
    const clientRequestId = req.body?.client_request_id || null;

    // Fase 2A.3D — INVITACION_ENVIADA (INVITACIONES → INVITACIONES).
    // Motor: domainMutator persiste con el tx; afterCommit envía correos post-COMMIT.
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES',
      eventoCodigo: 'INVITACION_ENVIADA',
      expedienteId: requerimientoIdNum,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        solicitud_id: solicitudId,
        client_request_id: clientRequestId,
        // Ciclo lógico estable: mismo solicitud + mismo client_request → replay idempotente;
        // nueva solicitud/ciclo → nuevo envío legítimo.
        ciclo_observacion: req.body?.ciclo_observacion ?? (solicitudId ? `sc${solicitudId}` : undefined),
        observacion: 'Invitación enviada — convocatoria publicada',
      },
      domainMutator: async (tx, { expediente_id }) => {
        const persisted = await persistirInvitaciones(tx, {
          requerimientoId: Number(expediente_id),
          solicitud_id: solicitudId,
          usuario,
          ip,
        }, null); // SIN correo en la transacción
        return { planCorreos: persisted.enviados, contador_envios: persisted.contador_envios, codigo: persisted.codigo, estadoNuevo: persisted.estadoNuevo };
      },
      afterCommit: async ({ resultado }) => {
        // POSCOMMIT: enviar correos del plan, marcar SMTP PENDIENTE/ENVIADO/ERROR.
        const plan = resultado?.domain_results?.planCorreos || [];
        const correo = { enviados: [], fallidos: [], pendientes: [] };
        for (const item of plan) {
          try {
            await registrarResultadoSmtp(item.id, { dispatch_key: item.dispatch_key, estado: 'PENDIENTE', intento: 1 }, null);
            correo.pendientes.push(item.id);
            await enviarCorreosInvitacion({
              proveedor: { id: item.proveedor_id, ruc: item.ruc, razon_social: item.razon_social, emails: item.proveedor_emails, correos: item.correos },
              solicitud: { codigo: resultado?.domain_results?.codigo || '', objeto: '' },
              correos: item.correos,
              credenciales: { usuario: item.ruc, clave: item.ruc },
              urlInvitacion: item.url,
              token: item.token,
            });
            await registrarResultadoSmtp(item.id, { dispatch_key: item.dispatch_key, estado: 'ENVIADO', intento: 1 }, null);
            correo.enviados.push(item.id);
          } catch (e) {
            await registrarResultadoSmtp(item.id, { dispatch_key: item.dispatch_key, estado: 'ERROR', intento: 1, error: e.message }, null);
            correo.fallidos.push(item.id);
          }
        }
        return correo;
      },
      legacyHandler: async () => {
        const r = await enviarInvitaciones(requerimientoIdNum, {
          solicitud_id: solicitudId,
          usuario,
          ip,
        });
        return { ok: true, ...r };
      },
    });

    const correoMotor = result.evento && result.afterCommit?.ok ? result.afterCommit.resultado : null;
    const totalMotor = result.evento
      ? (correoMotor ? correoMotor.enviados.length + correoMotor.fallidos.length : 0)
      : (result.total ?? 0);
    const contadorMotor = result.evento
      ? (result.domainResults?.contador_envios ?? 0)
      : (result.contador_envios ?? 0);

    const base = {
      success: true,
      enviados: result.evento ? (correoMotor ? correoMotor.enviados : []) : (result.enviados || []),
      total: totalMotor,
      contador_envios: contadorMotor,
      mensaje: result.mensaje ?? 'Solicitud de Cotización enviada correctamente.',
    };

    if (result.evento) {
      res.json({
        ...base,
        workflow: result.workflow || undefined,
        evento: result.evento,
        correo: result.afterCommit?.ok ? result.afterCommit.resultado : { enviados: [], fallidos: [], pendientes: [] },
        ...(result.afterCommit && !result.afterCommit.ok ? { advertencia_correo: result.afterCommit.error } : {}),
      });
    } else {
      // Legacy (flag off): respuesta idéntica.
      res.json({ success: true, ...result });
    }
  } catch (err) { next(err); }
});

router.put('/observar/:requerimientoId', async (req, res, next) => {
  try {
    const updated = await observarInvitaciones(req.params.requerimientoId, req.body || {});
    res.json({ success: true, requerimiento: updated });
  } catch (err) { next(err); }
});

export default router;
