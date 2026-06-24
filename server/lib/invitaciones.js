// Lógica de negocio — Invitaciones, Solicitudes de Cotización y Portal de Proveedores
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db.js';
import {
  registrarMovimiento,
  ETAPAS,
} from './trazabilidad.js';
import { enviarInvitacionProveedorEmail } from './emailService.js';
import { listarBandejaInvitaciones, SUBMODULO_INVITACIONES } from './invitacionesBandeja.js';

export { listarBandejaInvitaciones, SUBMODULO_INVITACIONES };

const DOCS_SOLICITADOS_OPTS = [
  'Declaración de compromiso de canje',
  'Anexo A',
  'Anexo B',
  'Carta de reposición por vencimiento',
  'Anexo 09',
  'Anexo 10',
  'Otros documentos',
];

const REQUISITOS_TECNICOS_OPTS = [
  'Precio',
  'Garantía del producto',
  'Plazo de entrega',
  'Certificado de Buenas Prácticas de Transporte',
  'Certificado de Buenas Prácticas de Almacenamiento',
  'Certificado de Buenas Prácticas de Manufactura',
  'Registro Sanitario',
  'Registro de Bien Controlado SUNAT',
  'Ficha Técnica',
  'Hoja de Seguridad',
  'Certificado de Conformidad',
  'Certificado de Calidad',
  'Certificado de Análisis',
];

const TIPOS_OPTS = ['Bienes', 'Servicios', 'Locadores'];
const TIPOS_EVALUACION_OPTS = ['Por paquete de ítems', 'Por relación de ítems'];

const LUGARES_RAPIDOS = [
  { id: '1', label: 'Lima / Chorrillos', region: 'Lima', provincia: 'Lima', distrito: 'Chorrillos' },
  { id: '2', label: 'Lima / Jesús María', region: 'Lima', provincia: 'Lima', distrito: 'Jesús María' },
  { id: '3', label: 'Loreto / Iquitos', region: 'Loreto', provincia: 'Maynas', distrito: 'Iquitos' },
  { id: '4', label: 'Otro', region: '', provincia: '', distrito: '', otro: true },
];

export function getCatalogosSolicitud() {
  return {
    docs_solicitados: DOCS_SOLICITADOS_OPTS,
    requisitos_tecnicos: REQUISITOS_TECNICOS_OPTS,
    tipos: TIPOS_OPTS,
    tipos_evaluacion: TIPOS_EVALUACION_OPTS,
    lugares_rapidos: LUGARES_RAPIDOS,
    validacion_cronograma: 'v2-consulta-dentro-cotizacion',
  };
}

function mapTipoRequerimiento(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'servicios') return 'Servicios';
  if (t === 'locacion') return 'Locadores';
  return 'Bienes';
}

async function getSiglaEntidad() {
  const { rows } = await query('SELECT siglas FROM entidad ORDER BY id LIMIT 1');
  return String(rows[0]?.siglas || 'INS').trim() || 'INS';
}

async function nextCorrelativoSolicitud(anio) {
  const { rows } = await query(
    'SELECT COALESCE(MAX(correlativo), 0) + 1 AS n FROM solicitudes_cotizacion WHERE anio = $1',
    [anio],
  );
  return rows[0].n;
}

export async function generarCodigoSolicitud(anio = new Date().getFullYear()) {
  const sigla = await getSiglaEntidad();
  const correlativo = await nextCorrelativoSolicitud(anio);
  const codigo = `SC-${String(correlativo).padStart(5, '0')}-${anio}-${sigla}`;
  return { codigo, anio, correlativo, sigla_entidad: sigla };
}

function parsePayload(row) {
  try { return JSON.parse(row?.payload || '{}'); } catch (_) { return {}; }
}

async function loadRequerimientos(ids) {
  if (!ids?.length) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `SELECT id, codigo, cmn, denominacion, area, tipo, payload, estado, estado_actual, responsable_actual
     FROM requerimientos WHERE id IN (${placeholders})`,
    ids,
  );
  return rows;
}

function buildDatosAutomaticos(requerimientos) {
  if (!requerimientos.length) return {};
  const first = requerimientos[0];
  const payload = parsePayload(first);
  const tipos = [...new Set(requerimientos.map((r) => mapTipoRequerimiento(r.tipo)))];
  return {
    tipo: tipos.length === 1 ? tipos[0] : tipos[0],
    area_usuaria: first.area || '',
    cmn: first.cmn || '',
    denominacion: first.denominacion || '',
  };
}

export async function obtenerItemsRequerimientos(requerimientoIds) {
  if (!requerimientoIds?.length) return [];
  const placeholders = requerimientoIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(`
    SELECT r.id, r.codigo, r.tipo, r.denominacion, r.payload,
      COALESCE(paq.codigo_paquete, '') AS codigo_paquete,
      COALESCE(ped.pedidos_sigamef, '') AS pedidos_sigamef
    FROM requerimientos r
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT COALESCE(NULLIF(TRIM(p.codigo_pedido), ''), CONCAT('PED-', p.nro_pedido)), ', ') AS pedidos_sigamef
      FROM requerimiento_pedidos rp
      JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
      WHERE rp.requerimiento_id = r.id
    ) ped ON TRUE
    LEFT JOIN LATERAL (
      SELECT pp.codigo_paquete FROM paquete_requerimientos pr
      JOIN paquetes_programacion pp ON pp.id = pr.paquete_id
      WHERE pr.requerimiento_id = r.id ORDER BY pp.id DESC LIMIT 1
    ) paq ON TRUE
    WHERE r.id IN (${placeholders})
  `, requerimientoIds);

  const items = [];
  for (const r of rows) {
    const payload = parsePayload(r);
    const rawItems = r.tipo === 'servicios' ? (payload.servicioItems || [])
      : r.tipo === 'locacion' ? (payload.locadorItems || [])
        : (payload.items || []);
    if (Array.isArray(rawItems) && rawItems.length) {
      rawItems.forEach((it, idx) => {
        items.push({
          requerimiento_id: r.id,
          requerimiento_codigo: r.codigo,
          paquete: r.codigo_paquete || '',
          pedido_sigamef: r.pedidos_sigamef || '',
          codigo_sigamef: it.item_bien || it.codigo || '',
          descripcion: it.nombre_item || it.descripcion || r.denominacion || '',
          cantidad: it.cantidad || it.cant || 1,
          item_index: idx,
          documentos: [],
        });
      });
    } else {
      items.push({
        requerimiento_id: r.id,
        requerimiento_codigo: r.codigo,
        paquete: r.codigo_paquete || '',
        pedido_sigamef: r.pedidos_sigamef || '',
        codigo_sigamef: '',
        descripcion: r.denominacion || '',
        cantidad: 1,
        item_index: 0,
        documentos: [],
      });
    }
  }
  return items;
}

export async function crearSolicitudCotizacion(body = {}, usuario = '') {
  const requerimientoIds = [...new Set((body.requerimiento_ids || []).map(Number).filter(Boolean))];
  if (!requerimientoIds.length) throw new Error('Seleccione al menos un requerimiento');

  const requerimientos = await loadRequerimientos(requerimientoIds);
  if (requerimientos.length !== requerimientoIds.length) throw new Error('Uno o más requerimientos no existen');

  validarCronograma(body);
  if (!body.tipo_evaluacion) throw new Error('El tipo de evaluación es obligatorio');

  const anio = body.anio || new Date().getFullYear();
  const auto = buildDatosAutomaticos(requerimientos);
  const detalleItems = body.detalle_items || await obtenerItemsRequerimientos(requerimientoIds);
  const lugares = body.lugares_entrega_item || detalleItems.map((it) => ({
    ...it,
    region: '', provincia: '', distrito: '',
  }));

  const { rows } = await query(`
    WITH next_corr AS (
      SELECT COALESCE(MAX(correlativo), 0) + 1 AS n FROM solicitudes_cotizacion WHERE anio = $1
    ),
    sig AS (
      SELECT COALESCE(
        (SELECT NULLIF(TRIM(siglas), '') FROM entidad ORDER BY id LIMIT 1),
        'INS'
      ) AS sigla
    )
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, sigla_entidad, estado, tipo, objeto, area_usuaria, cmn, denominacion,
      tipo_evaluacion, consultas_inicio, consultas_fin, cotizaciones_inicio, cotizaciones_fin,
      lugar_entrega, docs_convocatoria, docs_solicitados, requisitos_tecnicos,
      detalle_items, lugares_entrega_item, responsable, created_by
    )
    SELECT
      'SC-' || LPAD(next_corr.n::text, 5, '0') || '-' || $1::text || '-' || sig.sigla,
      $1, next_corr.n, sig.sigla, 'BORRADOR',
      $2, '', $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17, $18
    FROM next_corr, sig
    RETURNING *
  `, [
    anio,
    body.tipo || auto.tipo,
    body.area_usuaria || auto.area_usuaria,
    body.cmn || auto.cmn,
    body.denominacion || auto.denominacion,
    body.tipo_evaluacion,
    body.consultas_inicio || null,
    body.consultas_fin || null,
    body.cotizaciones_inicio || null,
    body.cotizaciones_fin || null,
    body.lugar_entrega || '',
    JSON.stringify(body.docs_convocatoria || []),
    JSON.stringify(body.docs_solicitados || []),
    JSON.stringify(body.requisitos_tecnicos || []),
    JSON.stringify(detalleItems),
    JSON.stringify(lugares),
    body.responsable || requerimientos[0].responsable_actual || ETAPAS.INVITACIONES.responsable,
    usuario,
  ]);

  const solicitud = rows[0];
  if (!solicitud) throw new Error('No se pudo generar la solicitud de cotización');
  const codigo = solicitud.codigo;
  for (const reqId of requerimientoIds) {
    await query(
      'INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [solicitud.id, reqId],
    );
    await ensureInvitacionesEtapa(reqId, usuario);
    await registrarTrazaPortal({
      solicitud_id: solicitud.id,
      requerimiento_id: reqId,
      evento: 'SOLICITUD_CREADA',
      detalle: `Solicitud ${codigo} creada`,
      usuario,
    });
  }

  return solicitud;
}

function validarCronograma(body) {
  const ci = body.consultas_inicio ? new Date(body.consultas_inicio).getTime() : null;
  const cf = body.consultas_fin ? new Date(body.consultas_fin).getTime() : null;
  const ti = body.cotizaciones_inicio ? new Date(body.cotizaciones_inicio).getTime() : null;
  const tf = body.cotizaciones_fin ? new Date(body.cotizaciones_fin).getTime() : null;
  const msg = 'Consulta fuera de plazo';
  if ([ci, cf, ti, tf].some((t) => t != null && Number.isNaN(t))) throw new Error(msg);
  if (ci && cf && cf < ci) throw new Error(msg);
  if (ti && tf && tf < ti) throw new Error(msg);
  // Las consultas deben estar dentro del plazo de cotización: [ti, tf]
  if (ci && ti && ci < ti) throw new Error(msg);
  if (cf && tf && cf > tf) throw new Error(msg);
}

async function ensureInvitacionesEtapa(requerimientoId, usuario) {
  const { rows } = await query('SELECT id, estado, estado_actual, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) return;
  const row = rows[0];
  if (String(row.estado_actual || '').toUpperCase() === 'INVITACIONES') return;

  let payload = parsePayload(row);
  if (!Array.isArray(payload.historial_invitaciones)) payload.historial_invitaciones = [];
  payload.historial_invitaciones.push({ tipo: 'ingreso_invitaciones', usuario, fecha: new Date().toISOString() });
  await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

  await registrarMovimiento({
    requerimientoId,
    estadoNuevo: row.estado === 'En Invitaciones' ? row.estado : 'En Invitaciones',
    usuario: usuario || SUBMODULO_INVITACIONES,
    accion: 'derivado',
    observacion: 'Expediente en bandeja Invitaciones',
    responsable: row.responsable_actual || ETAPAS.INVITACIONES.responsable,
  });
}

export async function buscarProveedores(search = '', limit = 50) {
  const params = [];
  let where = 'WHERE activo = TRUE';
  if (String(search || '').trim()) {
    params.push(`%${String(search).trim()}%`);
    where += ` AND (ruc ILIKE $${params.length} OR razon_social ILIKE $${params.length})`;
  }
  params.push(Math.min(limit, 100));
  const { rows } = await query(
    `SELECT id, ruc, razon_social, telefono, emails, rnp_estado FROM proveedores ${where}
     ORDER BY razon_social ASC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function upsertProveedor(data = {}) {
  const ruc = String(data.ruc || '').replace(/\D/g, '').slice(0, 11);
  if (ruc.length < 8) throw new Error('RUC inválido');
  const emails = Array.isArray(data.emails) ? data.emails : (data.correo ? [data.correo] : []);
  const { rows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, telefono, emails, rnp_estado)
    VALUES ($1, $2, $3, $4::jsonb, $5)
    ON CONFLICT (ruc) DO UPDATE SET
      razon_social = EXCLUDED.razon_social,
      telefono = EXCLUDED.telefono,
      emails = EXCLUDED.emails,
      updated_at = NOW()
    RETURNING *
  `, [ruc, data.razon_social || `Proveedor ${ruc}`, data.telefono || '', JSON.stringify(emails), data.rnp_estado || 'VIGENTE']);
  return rows[0];
}

function generarClaveTemporal() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function agregarProveedoresInvitacion(requerimientoId, proveedores = [], solicitudId = null) {
  const results = [];
  for (const p of proveedores) {
    const prov = p.id ? (await query('SELECT * FROM proveedores WHERE id = $1', [p.id])).rows[0] : await upsertProveedor(p);
    if (!prov) continue;
    const correos = Array.isArray(p.correos) ? p.correos : (Array.isArray(prov.emails) ? prov.emails : []);
    const { rows } = await query(`
      INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, correos, estado)
      VALUES ($1, $2, $3, $4::jsonb, 'PENDIENTE')
      ON CONFLICT (requerimiento_id, proveedor_id) DO UPDATE SET
        solicitud_id = COALESCE(EXCLUDED.solicitud_id, invitacion_proveedores.solicitud_id),
        correos = EXCLUDED.correos,
        updated_at = NOW()
      RETURNING *
    `, [solicitudId, requerimientoId, prov.id, JSON.stringify(correos)]);
    results.push({ ...rows[0], proveedor: prov });
  }
  return results;
}

export async function enviarInvitaciones(requerimientoId, { solicitud_id, invitacion_ids, usuario, ip } = {}) {
  let idFilter = '';
  const params = [requerimientoId];
  if (invitacion_ids?.length) {
    const ph = invitacion_ids.map((_, i) => `$${params.length + i + 1}`).join(', ');
    params.push(...invitacion_ids.map(Number));
    idFilter = ` AND ip.id IN (${ph})`;
  }
  const { rows: invRows } = await query(`
    SELECT ip.*, p.ruc, p.razon_social, p.emails AS proveedor_emails
    FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id
    WHERE ip.requerimiento_id = $1 AND ip.estado = 'PENDIENTE' ${idFilter}
  `, params);

  if (!invRows.length) throw new Error('No hay proveedores pendientes de invitación');

  let solicitud = null;
  if (solicitud_id) {
    solicitud = (await query('SELECT * FROM solicitudes_cotizacion WHERE id = $1', [solicitud_id])).rows[0];
  } else {
    solicitud = (await query(`
      SELECT sc.* FROM solicitudes_cotizacion sc
      JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
      WHERE sr.requerimiento_id = $1 ORDER BY sc.id DESC LIMIT 1
    `, [requerimientoId])).rows[0];
  }

  const enviados = [];
  for (const inv of invRows) {
    const clave = generarClaveTemporal();
    const hash = await bcrypt.hash(clave, 10);
    const correos = (Array.isArray(inv.correos) && inv.correos.length) ? inv.correos : inv.proveedor_emails || [];

    await query(`
      INSERT INTO proveedor_acceso (proveedor_id, password_hash, debe_cambiar_password, clave_temporal, clave_temporal_expira)
      VALUES ($1, $2, TRUE, $3, NOW() + INTERVAL '30 days')
      ON CONFLICT (proveedor_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        debe_cambiar_password = TRUE,
        clave_temporal = EXCLUDED.clave_temporal,
        clave_temporal_expira = EXCLUDED.clave_temporal_expira,
        updated_at = NOW()
    `, [inv.proveedor_id, hash, clave]);

    await query(`
      UPDATE invitacion_proveedores SET
        estado = 'ENVIADA',
        fecha_envio = NOW(),
        usuario_portal = $2,
        clave_temporal = $3,
        solicitud_id = COALESCE($4, solicitud_id),
        historial = historial || $5::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `, [
      inv.id,
      inv.ruc,
      clave,
      solicitud?.id || null,
      JSON.stringify([{ tipo: 'envio', fecha: new Date().toISOString(), usuario, correos }]),
    ]);

    await enviarInvitacionProveedorEmail({
      proveedor: inv,
      solicitud: solicitud || { codigo: '', objeto: '' },
      correos,
      credenciales: { usuario: inv.ruc, clave },
    });

    await registrarTrazaPortal({
      solicitud_id: solicitud?.id,
      proveedor_id: inv.proveedor_id,
      requerimiento_id: requerimientoId,
      evento: 'CORREO_ENVIADO',
      detalle: `Invitación enviada a RUC ${inv.ruc}`,
      usuario,
      ip,
    });

    enviados.push({ ruc: inv.ruc, correos });
  }

  if (solicitud && solicitud.estado === 'BORRADOR') {
    await query(`UPDATE solicitudes_cotizacion SET estado = 'PUBLICADA', fecha_publicacion = NOW() WHERE id = $1`, [solicitud.id]);
  }

  return { enviados, total: enviados.length };
}

export async function getSolicitudDetalle(solicitudId) {
  const { rows } = await query('SELECT * FROM solicitudes_cotizacion WHERE id = $1', [solicitudId]);
  if (!rows.length) return null;
  const solicitud = rows[0];
  const reqs = await query(`
    SELECT r.id, r.codigo, r.denominacion, r.area, r.cmn, r.estado, r.estado_actual, r.payload
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = $1
  `, [solicitudId]);
  const invitados = await query(`
    SELECT ip.*, p.ruc, p.razon_social, p.telefono, p.emails
    FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id
    WHERE ip.solicitud_id = $1 OR ip.requerimiento_id IN (SELECT requerimiento_id FROM solicitud_requerimientos WHERE solicitud_id = $1)
  `, [solicitudId]);
  return { solicitud, requerimientos: reqs.rows, invitados: invitados.rows };
}

export async function listarSolicitudesPorRequerimiento(requerimientoId) {
  const { rows } = await query(`
    SELECT sc.* FROM solicitudes_cotizacion sc
    JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
    WHERE sr.requerimiento_id = $1
    ORDER BY sc.id DESC
  `, [requerimientoId]);
  return rows;
}

export async function registrarTrazaPortal(entry) {
  await query(`
    INSERT INTO trazabilidad_portal (solicitud_id, proveedor_id, requerimiento_id, evento, detalle, usuario, ip)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    entry.solicitud_id || null,
    entry.proveedor_id || null,
    entry.requerimiento_id || null,
    entry.evento,
    entry.detalle || '',
    entry.usuario || '',
    entry.ip || '',
  ]);
}

export async function getTableroControl(solicitudId) {
  const base = solicitudId ? 'WHERE solicitud_id = $1' : '';
  const params = solicitudId ? [solicitudId] : [];
  const inv = await query(`SELECT COUNT(*) FILTER (WHERE estado = 'ENVIADA') AS enviadas,
    COUNT(*) FILTER (WHERE fecha_apertura_correo IS NOT NULL) AS abiertas FROM invitacion_proveedores ${base}`, params);
  const cons = await query(`SELECT COUNT(*) AS recibidas,
    COUNT(*) FILTER (WHERE estado = 'PENDIENTE') AS pendientes,
    COUNT(*) FILTER (WHERE estado = 'RESPONDIDA') AS respondidas FROM consultas_proveedor ${base}`, params);
  const obs = await query(`SELECT COUNT(*) AS recibidas FROM observaciones_proveedor ${base}`, params);
  const cot = await query(`SELECT COUNT(*) AS recibidas,
    COUNT(*) FILTER (WHERE estado = 'COTIZACION_PRESENTADA') AS presentadas,
    COUNT(*) FILTER (WHERE validacion_estado = 'APTO') AS aptas,
    COUNT(*) FILTER (WHERE validacion_estado = 'NO_APTO') AS no_aptas,
    COUNT(*) FILTER (WHERE validacion_estado = 'OBSERVADO') AS observadas
    FROM cotizaciones_proveedor ${base}`, params);
  return {
    invitaciones_enviadas: Number(inv.rows[0]?.enviadas || 0),
    correos_abiertos: Number(inv.rows[0]?.abiertas || 0),
    consultas_recibidas: Number(cons.rows[0]?.recibidas || 0),
    consultas_pendientes: Number(cons.rows[0]?.pendientes || 0),
    consultas_respondidas: Number(cons.rows[0]?.respondidas || 0),
    observaciones_recibidas: Number(obs.rows[0]?.recibidas || 0),
    cotizaciones_recibidas: Number(cot.rows[0]?.recibidas || 0),
    cotizaciones_presentadas: Number(cot.rows[0]?.presentadas || 0),
    cotizaciones_aptas: Number(cot.rows[0]?.aptas || 0),
    cotizaciones_observadas: Number(cot.rows[0]?.observadas || 0),
    cotizaciones_no_aptas: Number(cot.rows[0]?.no_aptas || 0),
  };
}

/** Seed de proveedores demo si la tabla está vacía. */
export async function seedProveedoresDemo() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM proveedores');
  if (rows[0].n > 0) return 0;
  const demo = [
    { ruc: '20100070970', razon_social: 'SUPERMERCADOS PERUANOS S.A.', emails: ['cotizaciones@plazavea.com.pe'] },
    { ruc: '20511321768', razon_social: 'FARMACIAS DEL PACIFICO S.A.C.', emails: ['licitaciones@farmacias.com'] },
    { ruc: '20100128056', razon_social: 'PROVEEDOR DEMO SAC', emails: ['demo@proveedor.pe'] },
  ];
  for (const p of demo) await upsertProveedor(p);
  return demo.length;
}

export async function listarSolicitudesBandeja(page, pageSize, queryParams = {}) {
  const offset = (page - 1) * pageSize;
  const params = [];
  let where = 'WHERE 1=1';
  if (queryParams.estado) {
    params.push(queryParams.estado);
    where += ` AND sc.estado = $${params.length}`;
  }
  if (queryParams.search) {
    params.push(`%${queryParams.search}%`);
    where += ` AND (sc.codigo ILIKE $${params.length} OR sc.denominacion ILIKE $${params.length})`;
  }

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM solicitudes_cotizacion sc ${where}`, params);
  const total = countRes.rows[0].total;

  params.push(pageSize, offset);
  const { rows } = await query(`
    SELECT sc.*,
      COALESCE(inv_stats.proveedores, 0)::int AS cantidad_proveedores,
      COALESCE(inv_stats.enviados, 0)::int AS proveedores_enviados,
      COALESCE(cot_stats.cotizaciones, 0)::int AS cotizaciones_recibidas,
      COALESCE(sc.denominacion, sc.objeto, '') AS descripcion_contratacion,
      sc.cotizaciones_fin AS fecha_culminacion,
      (SELECT sr.requerimiento_id FROM solicitud_requerimientos sr WHERE sr.solicitud_id = sc.id ORDER BY sr.requerimiento_id LIMIT 1) AS requerimiento_id,
      CASE
        WHEN COALESCE(inv_stats.proveedores, 0) = 0 THEN 'Sin invitar'
        WHEN COALESCE(inv_stats.enviados, 0) >= COALESCE(inv_stats.proveedores, 0) AND inv_stats.proveedores > 0 THEN 'Enviado'
        WHEN COALESCE(inv_stats.enviados, 0) > 0 THEN 'Parcial'
        ELSE 'Pendiente'
      END AS estado_invitacion
    FROM solicitudes_cotizacion sc
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS proveedores,
        COUNT(*) FILTER (WHERE ip.estado IN ('ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA'))::int AS enviados
      FROM invitacion_proveedores ip WHERE ip.solicitud_id = sc.id
    ) inv_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cotizaciones FROM cotizaciones_proveedor cp
      WHERE cp.solicitud_id = sc.id AND cp.estado = 'COTIZACION_PRESENTADA'
    ) cot_stats ON TRUE
    ${where}
    ORDER BY sc.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  return {
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function getPrimaryRequerimientoId(solicitudId) {
  const { rows } = await query(
    'SELECT requerimiento_id FROM solicitud_requerimientos WHERE solicitud_id = $1 ORDER BY requerimiento_id LIMIT 1',
    [solicitudId],
  );
  return rows[0]?.requerimiento_id || null;
}

export async function actualizarSolicitudCotizacion(solicitudId, body = {}) {
  if (body.consultas_inicio || body.consultas_fin || body.cotizaciones_inicio || body.cotizaciones_fin) {
    validarCronograma(body);
  }
  const fields = [];
  const params = [solicitudId];
  const setField = (col, val, json = false) => {
    params.push(json ? JSON.stringify(val) : val);
    fields.push(`${col} = $${params.length}${json ? '::jsonb' : ''}`);
  };
  if (body.detalle_items != null) setField('detalle_items', body.detalle_items, true);
  if (body.lugares_entrega_item != null) setField('lugares_entrega_item', body.lugares_entrega_item, true);
  if (body.docs_solicitados != null) setField('docs_solicitados', body.docs_solicitados, true);
  if (body.requisitos_tecnicos != null) setField('requisitos_tecnicos', body.requisitos_tecnicos, true);
  if (body.tipo_evaluacion != null) setField('tipo_evaluacion', body.tipo_evaluacion);
  if (body.tipo != null) setField('tipo', body.tipo);
  if (body.denominacion != null) setField('denominacion', body.denominacion);
  if (body.cmn != null) setField('cmn', body.cmn);
  if (body.area_usuaria != null) setField('area_usuaria', body.area_usuaria);
  if (body.consultas_inicio != null) setField('consultas_inicio', body.consultas_inicio || null);
  if (body.consultas_fin != null) setField('consultas_fin', body.consultas_fin || null);
  if (body.cotizaciones_inicio != null) setField('cotizaciones_inicio', body.cotizaciones_inicio || null);
  if (body.cotizaciones_fin != null) setField('cotizaciones_fin', body.cotizaciones_fin || null);
  if (body.estado != null) setField('estado', body.estado);
  if (!fields.length) throw new Error('Sin datos para actualizar');
  fields.push('updated_at = NOW()');
  const { rows } = await query(
    `UPDATE solicitudes_cotizacion SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  );
  if (!rows.length) throw new Error('Solicitud no encontrada');
  return rows[0];
}

export async function eliminarSolicitudCotizacion(solicitudId) {
  const { rowCount } = await query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [solicitudId]);
  if (!rowCount) throw new Error('Solicitud no encontrada');
  return { success: true };
}

export async function agregarProveedorSolicitud(solicitudId, proveedorData) {
  const requerimientoId = await getPrimaryRequerimientoId(solicitudId);
  if (!requerimientoId) throw new Error('La solicitud no tiene requerimientos asociados');
  const correos = String(proveedorData.correo || proveedorData.correos || '')
    .split(';').map((e) => e.trim()).filter(Boolean);
  const results = await agregarProveedoresInvitacion(requerimientoId, [{
    ruc: proveedorData.ruc,
    razon_social: proveedorData.proveedor || proveedorData.razon_social,
    telefono: proveedorData.telefono,
    correos,
  }], solicitudId);
  return results[0];
}

export async function listarProveedoresSolicitud(solicitudId) {
  const { rows } = await query(`
    SELECT ip.*, p.ruc, p.razon_social, p.telefono, p.emails AS proveedor_emails
    FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id
    WHERE ip.solicitud_id = $1
    ORDER BY ip.id ASC
  `, [solicitudId]);
  return rows.map((r) => ({
    ...r,
    estado_envio: ['ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA'].includes(String(r.estado || '').toUpperCase())
      ? 'Enviado' : 'Pendiente',
    correo_display: (Array.isArray(r.correos) && r.correos.length ? r.correos : r.proveedor_emails || []).join('; '),
  }));
}

export async function enviarCorreosSolicitud(solicitudId, invitacionIds = [], { usuario, ip } = {}) {
  const requerimientoId = await getPrimaryRequerimientoId(solicitudId);
  if (!requerimientoId) throw new Error('Sin requerimiento asociado');
  const params = [solicitudId];
  let idFilter = '';
  if (invitacionIds?.length) {
    const ph = invitacionIds.map((_, i) => `$${params.length + i + 1}`).join(', ');
    params.push(...invitacionIds.map(Number));
    idFilter = ` AND ip.id IN (${ph})`;
  }
  const { rows: pending } = await query(`
    SELECT ip.id FROM invitacion_proveedores ip
    WHERE ip.solicitud_id = $1 AND ip.estado = 'PENDIENTE' ${idFilter}
  `, params);
  if (!pending.length) throw new Error('No hay proveedores pendientes seleccionados');
  const result = await enviarInvitaciones(requerimientoId, {
    solicitud_id: solicitudId,
    invitacion_ids: pending.map((p) => p.id),
    usuario,
    ip,
  });
  return result;
}

export async function eliminarInvitacionProveedor(invitacionId) {
  const { rows } = await query(
    `DELETE FROM invitacion_proveedores WHERE id = $1 AND estado = 'PENDIENTE' RETURNING id`,
    [invitacionId],
  );
  if (!rows.length) throw new Error('No se puede eliminar: invitación no encontrada o ya enviada');
  return { success: true };
}

async function loadReqPayload(requerimientoId) {
  const { rows } = await query('SELECT id, codigo, estado, estado_actual, payload, responsable_actual FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) return null;
  let payload = {};
  try { payload = JSON.parse(rows[0].payload || '{}'); } catch (_) {}
  return { row: rows[0], payload };
}

export async function observarInvitaciones(requerimientoId, body) {
  const { appendObservacion } = await import('./observacionesExpediente.js');
  const { formatObservacionTraza, resolveEstadoFromDestino, resolveResponsableFromDestino, submoduloLabelToEtapa } = await import('./observacionDestino.js');
  const { motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo } = body || {};
  if (!motivo) throw new Error('Motivo requerido');

  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');

  appendObservacion(loaded.payload, {
    motivo,
    gerente: usuario || SUBMODULO_INVITACIONES,
    origen: 'INVITACIONES',
    origen_submodulo: origen_submodulo || SUBMODULO_INVITACIONES,
    destino_submodulo: destino_submodulo || '',
    destino_etapa: destino_etapa || '',
    destino_persona: destino_persona || '',
  });
  await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);

  const etapaDest = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'INVITACIONES').toUpperCase();
  const estadoNuevo = resolveEstadoFromDestino(destino_submodulo, destino_etapa) || 'Observado Invitaciones';
  const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDest);

  return registrarMovimiento({
    requerimientoId,
    estadoNuevo,
    usuario: usuario || SUBMODULO_INVITACIONES,
    accion: 'observado',
    observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
    responsable,
  });
}
