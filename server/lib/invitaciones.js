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
import { prepararInvitacionPortal } from './proveedorPortal.js';
import { normalizeCronogramaRow } from './cronogramaDatetime.js';

export { listarBandejaInvitaciones, SUBMODULO_INVITACIONES };

const ESTADOS_INVITACION_ENVIADA = ['ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA'];

function esEstadoInvitacionEnviada(estado) {
  return ESTADOS_INVITACION_ENVIADA.includes(String(estado || '').toUpperCase());
}

function sqlInvitacionPendiente(alias = 'ip') {
  return `UPPER(COALESCE(${alias}.estado, 'PENDIENTE')) NOT IN ('${ESTADOS_INVITACION_ENVIADA.join("','")}')`;
}

const DOCS_SOLICITADOS_OPTS = [
  'Declaración de compromiso de canje',
  'Anexo A',
  'Anexo B',
  'Carta de reposición por vencimiento',
  'Anexo 09',
  'Anexo 10',
  'Otros documentos',
];

const REQUISITOS_TECNICOS_BIENES = [
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
  'RNP vigente',
  'Consulta RUC vigente',
  'Certificado de Análisis',
];

const REQUISITOS_TECNICOS_OPTS = REQUISITOS_TECNICOS_BIENES;

/** Catálogos dinámicos por tipo de contratación (extensible a Licitaciones / Concursos). */
export const CATALOGOS_POR_TIPO = {
  Bienes: {
    docs_solicitados: DOCS_SOLICITADOS_OPTS,
    requisitos_tecnicos: REQUISITOS_TECNICOS_BIENES,
  },
  Servicios: {
    docs_solicitados: ['Anexo 09', 'Anexo 10', 'Otros documentos'],
    requisitos_tecnicos: [
      'Experiencia de ventas',
      'Registro Nacional de Proveedores (RNP) vigente',
      'Consulta RUC activo',
      'Curriculum Vitae del personal',
      'Seguros',
      'Permisos',
      'Certificaciones',
      'Otros documentos',
    ],
  },
  Locadores: {
    docs_solicitados: [
      'Anexo 09', 'Anexo 10', 'Anexo 12', 'Anexo 13', 'Anexo 14', 'Anexo 15', 'Anexo 16', 'Otros documentos',
    ],
    requisitos_tecnicos: [
      'Formación Académica',
      'Experiencia General',
      'Experiencia Específica',
      'Serum',
      'Colegiado y habilitado',
      'Capacitación',
      'Registro Nacional de Proveedores vigente',
      'Consulta RUC activo',
      'Suspensión de Cuarta Categoría',
      'Curriculum Vitae documentado',
      'Seguros',
      'Otros documentos',
    ],
  },
};

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
    catalogos_por_tipo: CATALOGOS_POR_TIPO,
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
    SELECT r.id, r.codigo, r.tipo, r.denominacion, r.payload, r.cmn, r.responsable,
      COALESCE(paq.codigo_paquete, '') AS codigo_paquete,
      COALESCE(ped.pedidos_sigamef, '') AS pedidos_sigamef,
      COALESCE(c.nombre, '') AS catalogo_centro_nombre,
      COALESCE(c.codigo, '') AS catalogo_centro_codigo,
      COALESCE(ped.pedido_centro, '') AS pedido_centro
    FROM requerimientos r
    LEFT JOIN areas a ON r.area = a.nombre OR a.codigo = r.area
    LEFT JOIN centros c ON a.centro_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        string_agg(DISTINCT COALESCE(NULLIF(TRIM(p.pedido_sigamef), ''), CONCAT(UPPER(LEFT(COALESCE(p.tipo, 'PB'), 2)), '-', p.nro_pedido)), ', ') AS pedidos_sigamef,
        MAX(NULLIF(TRIM(p.centro), '')) AS pedido_centro
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

  const { resolveCentroDisplay } = await import('./centroDisplay.js');
  const items = [];
  for (const r of rows) {
    const payload = parsePayload(r);
    const centro = resolveCentroDisplay(r);
    const rawItems = r.tipo === 'servicios' ? (payload.servicioItems || [])
      : r.tipo === 'locacion' ? (payload.locadorItems || [])
        : (payload.items || []);
    if (Array.isArray(rawItems) && rawItems.length) {
      rawItems.forEach((it, idx) => {
        items.push({
          requerimiento_id: r.id,
          requerimiento_codigo: r.codigo,
          paquete: r.codigo_paquete || '',
          centro,
          centro_nombre: centro,
          pedido_sigamef: r.pedidos_sigamef || '',
          codigo_sigamef: it.item_bien || it.codigo || '',
          descripcion: it.nombre_item || it.descripcion || r.denominacion || '',
          cantidad: it.cantidad || it.cant || 1,
          unidad_medida: it.unidad_medida || it.um || (
            r.tipo === 'servicios' || r.tipo === 'locacion' ? 'SERVICIO' : 'UND'
          ),
          um: it.unidad_medida || it.um || (
            r.tipo === 'servicios' || r.tipo === 'locacion' ? 'SERVICIO' : 'UND'
          ),
          item_index: idx,
          documentos: Object.entries(it.documentos_anexos || {}).map(([tipo, d]) => ({
            documento: tipo,
            nombre: d?.nombre || d?.archivo || tipo,
            mime_type: d?.mime_type,
            contenido_base64: d?.contenido_base64 || '',
            fuente: `Anexo SC — ${tipo}`,
          })),
        });
      });
    } else {
      items.push({
        requerimiento_id: r.id,
        requerimiento_codigo: r.codigo,
        paquete: r.codigo_paquete || '',
        centro,
        centro_nombre: centro,
        pedido_sigamef: r.pedidos_sigamef || '',
        codigo_sigamef: '',
        descripcion: r.denominacion || '',
        cantidad: 1,
        unidad_medida: r.tipo === 'servicios' || r.tipo === 'locacion' ? 'SERVICIO' : 'UND',
        um: r.tipo === 'servicios' || r.tipo === 'locacion' ? 'SERVICIO' : 'UND',
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
    await appendHistorialInvitacion(reqId, {
      tipo: 'solicitud_creada',
      usuario,
      codigo,
      solicitud_id: solicitud.id,
    });
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

async function appendHistorialInvitacion(requerimientoId, entry) {
  const { rows } = await query('SELECT payload FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) return;
  let payload = parsePayload(rows[0]);
  if (!Array.isArray(payload.historial_invitaciones)) payload.historial_invitaciones = [];
  payload.historial_invitaciones.push({ ...entry, fecha: entry.fecha || new Date().toISOString() });
  await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
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
    etapaEjecutor: String(row.estado_actual || 'ACTOS_PREPARATORIOS').toUpperCase(),
    etapaDestino: 'INVITACIONES',
  });
}

import {
  buscarProveedoresMaestro,
  upsertProveedorLegacy,
} from './proveedoresMaestro.js';

export async function buscarProveedores(search = '', limit = 50, filters = {}) {
  return buscarProveedoresMaestro({
    search,
    ruc: filters.ruc,
    razon_social: filters.razon_social,
    correo: filters.correo,
    telefono: filters.telefono,
    rubro: filters.rubro,
    estado: filters.estado || 'Activo',
  }, limit);
}

export async function upsertProveedor(data = {}, opts = {}) {
  return upsertProveedorLegacy(data, opts);
}

function generarClaveTemporal(ruc) {
  return String(ruc || '').replace(/\D/g, '').slice(0, 11);
}

export async function agregarProveedoresInvitacion(requerimientoId, proveedores = [], solicitudId = null) {
  const results = [];
  for (const p of proveedores) {
    const prov = p.id ? (await query('SELECT * FROM proveedores WHERE id = $1', [p.id])).rows[0] : await upsertProveedor(p);
    if (!prov) continue;
    const correos = (Array.isArray(p.correos) && p.correos.length)
      ? p.correos
      : (p.correo ? [p.correo] : (prov.correo ? [prov.correo] : (Array.isArray(prov.emails) ? prov.emails : [])));

    // N° Inv. secuencial por solicitud+proveedor (reinvitación = nuevo registro).
    const { rows: nroRows } = await query(`
      SELECT COALESCE(MAX(nro_invitacion), 0) + 1 AS next_nro
      FROM invitacion_proveedores
      WHERE proveedor_id = $1
        AND (
          ($2::int IS NOT NULL AND solicitud_id = $2)
          OR ($2::int IS NULL AND requerimiento_id = $3)
        )
    `, [prov.id, solicitudId, requerimientoId]);
    const nroInv = nroRows[0]?.next_nro || 1;

    const { rows } = await query(`
      INSERT INTO invitacion_proveedores (
        solicitud_id, requerimiento_id, proveedor_id, correos, estado, nro_invitacion, historial
      ) VALUES (
        $1, $2, $3, $4::jsonb, 'PENDIENTE', $5,
        $6::jsonb
      )
      RETURNING *
    `, [
      solicitudId, requerimientoId, prov.id, JSON.stringify(correos), nroInv,
      JSON.stringify([{
        tipo: 'alta',
        fecha: new Date().toISOString(),
        nro_invitacion: nroInv,
        reinvitacion: nroInv > 1,
      }]),
    ]);
    results.push({ ...rows[0], proveedor: prov });
  }
  return results;
}

/**
 * Fase 2A.3A — envío de correos de invitación (responsabilidad única).
 * No modifica BD. Devuelve resultado o lanza error (el orquestador propaga).
 */
export async function enviarCorreosInvitacion({ proveedor, solicitud, correos, credenciales, urlInvitacion, token }) {
  await enviarInvitacionProveedorEmail({
    proveedor,
    solicitud: solicitud || { codigo: '', objeto: '' },
    correos,
    credenciales,
    urlInvitacion,
    token,
  });
  return { enviado: true };
}

/**
 * Fase 2A.3C — registra el resultado SMTP en invitacion_proveedores.historial (JSONB).
 * Sin migración: solo append a historial. NO cambia invitacion_proveedores.estado
 * (eso rompería sqlInvitacionPendiente). Usa pool si no hay client.
 */
export async function registrarResultadoSmtp(invitacionId, { dispatch_key, estado, intento = 1, error = null }, client = null) {
  const entry = {
    tipo: 'smtp',
    dispatch_key,
    estado, // PENDIENTE | ENVIADO | ERROR
    intento: Number(intento) || 1,
    fecha: new Date().toISOString(),
    ...(error ? { error: String(error) } : {}),
  };
  const run = client && typeof client.query === 'function' ? client.query.bind(client) : query;
  await run(
    `UPDATE invitacion_proveedores SET historial = historial || $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [invitacionId, JSON.stringify([entry])],
  );
  return entry;
}

/** Ejecuta SQL con client de transacción si se provee; si no, usa el pool. */
function runDb(client, text, params) {
  return client && typeof client.query === 'function'
    ? client.query(text, params)
    : query(text, params);
}

/**
 * Fase 2A.3A — persistencia SQL de invitaciones (responsabilidad única).
 * - UPDATE invitacion_proveedores / proveedores / solicitudes_cotizacion /
 *   payload.historial_invitaciones + trazabilidad SQL.
 * - NO envía correos salvo que se provea onEmail (orquestación compatible con el
 *   comportamiento actual cuando se pasa enviarCorreosInvitacion).
 * - NO llama registrarMovimiento ni executeTransition.
 * - Acepta client opcional para poder ejecutarse dentro del tx del Workflow Engine.
 */
export async function persistirInvitaciones(client, { requerimientoId, solicitud_id, invitacion_ids, usuario, ip } = {}, onEmail = null) {
  let idFilter = '';
  const params = [requerimientoId];
  if (invitacion_ids?.length) {
    const ph = invitacion_ids.map((_, i) => `$${params.length + i + 1}`).join(', ');
    params.push(...invitacion_ids.map(Number));
    idFilter = ` AND ip.id IN (${ph})`;
  }
  const invRes = await runDb(client, `
    SELECT ip.*, p.ruc, p.razon_social, p.emails AS proveedor_emails
    FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id
    WHERE ip.requerimiento_id = $1 AND ${sqlInvitacionPendiente('ip')} ${idFilter}
  `, params);
  const invRows = invRes.rows;
  if (!invRows.length) throw new Error('No hay proveedores pendientes de invitación');

  let solicitud = null;
  if (solicitud_id) {
    solicitud = (await runDb(client, 'SELECT * FROM solicitudes_cotizacion WHERE id = $1', [solicitud_id])).rows[0];
  } else {
    solicitud = (await runDb(client, `
      SELECT sc.* FROM solicitudes_cotizacion sc
      JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
      WHERE sr.requerimiento_id = $1 ORDER BY sc.id DESC LIMIT 1
    `, [requerimientoId])).rows[0];
  }

  const enviados = [];
  const solicitudDigest = solicitud || { codigo: '', objeto: '' };
  for (const inv of invRows) {
    const clave = generarClaveTemporal(inv.ruc);
    const correos = (Array.isArray(inv.correos) && inv.correos.length) ? inv.correos : inv.proveedor_emails || [];

    const portalPrep = await prepararInvitacionPortal(inv.id, {
      id: inv.proveedor_id,
      ruc: inv.ruc,
      razon_social: inv.razon_social,
      telefono: inv.telefono,
      emails: correos,
    });

    await runDb(client, `
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
      JSON.stringify([{
        tipo: 'envio',
        fecha: new Date().toISOString(),
        usuario,
        correos,
        token: portalPrep.token,
        url: portalPrep.url,
        smtp_pendiente: true,
      }]),
    ]);

    if (typeof onEmail === 'function') {
      await onEmail({
        proveedor: inv,
        solicitud: solicitudDigest,
        correos,
        credenciales: { usuario: inv.ruc, clave },
        urlInvitacion: portalPrep.url,
        token: portalPrep.token,
      });
    }

    await registrarTrazaPortal({
      solicitud_id: solicitud?.id,
      proveedor_id: inv.proveedor_id,
      requerimiento_id: requerimientoId,
      evento: 'CORREO_ENVIADO',
      detalle: `Invitación enviada a RUC ${inv.ruc}`,
      usuario,
      ip,
    });

    await runDb(client, `
      UPDATE proveedores SET
        cantidad_invitaciones = COALESCE(cantidad_invitaciones, 0) + 1,
        ultima_invitacion = NOW(),
        ultima_participacion = NOW(),
        historial = historial || $2::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `, [
      inv.proveedor_id,
      JSON.stringify([{
        usuario: usuario || 'Sistema',
        accion: 'Invitación enviada',
        detalle: solicitud?.codigo ? `Convocatoria ${solicitud.codigo}` : 'Invitación enviada',
        fecha: new Date().toISOString().slice(0, 10),
        hora: new Date().toTimeString().slice(0, 8),
      }]),
    ]);

    const dispatchKey = `env:${requerimientoId}:${inv.id}:${solicitud?.id || 'n'}:${usuario || 'sis'}`;
    enviados.push({
      id: inv.id,
      proveedor_id: inv.proveedor_id,
      solicitud_id: solicitud?.id || null,
      requerimiento_id: requerimientoId,
      ruc: inv.ruc,
      razon_social: inv.razon_social,
      proveedor_emails: inv.proveedor_emails || [],
      correos,
      url: portalPrep.url,
      token: portalPrep.token,
      dispatch_key: dispatchKey,
    });
  }

  let contadorEnvios = 0;
  let codigo = '';
  let estadoNuevo = '';
  if (solicitud) {
    const updSol = (await runDb(client, `
      UPDATE solicitudes_cotizacion SET
        contador_envios = COALESCE(contador_envios, 0) + 1,
        estado = CASE WHEN estado = 'BORRADOR' THEN 'PUBLICADA' ELSE estado END,
        fecha_publicacion = COALESCE(fecha_publicacion, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING contador_envios, codigo
    `, [solicitud.id])).rows;
    contadorEnvios = updSol[0]?.contador_envios || 1;
    codigo = updSol[0]?.codigo || solicitud.codigo;
    estadoNuevo = `Sol.Cot. Enviada (${contadorEnvios})`;

    const reqRows = (await runDb(client, 'SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId])).rows;
    if (reqRows.length) {
      const payload = parsePayload(reqRows[0]);
      if (!Array.isArray(payload.historial_invitaciones)) payload.historial_invitaciones = [];
      payload.historial_invitaciones.push({
        tipo: 'convocatoria_enviada',
        usuario: usuario || SUBMODULO_INVITACIONES,
        fecha: new Date().toISOString(),
        contador: contadorEnvios,
        codigo,
        estado: estadoNuevo,
        proveedores: enviados.length,
        ip: ip || '',
      });
      await runDb(client, 'UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
    }

    await registrarTrazaPortal({
      solicitud_id: solicitud.id,
      requerimiento_id: requerimientoId,
      evento: 'CONVOCATORIA_ENVIADA',
      detalle: `${estadoNuevo} — ${codigo}`,
      usuario: usuario || SUBMODULO_INVITACIONES,
      ip: ip || '',
    });

    contadorEnvios = (await runDb(client, 'SELECT contador_envios FROM solicitudes_cotizacion WHERE id = $1', [solicitud.id])).rows[0]?.contador_envios || contadorEnvios;
  }

  return {
    enviados,
    total: enviados.length,
    contador_envios: contadorEnvios,
    codigo,
    estadoNuevo,
    solicitud,
    requerimientoId,
  };
}

/**
 * Fase 2A.3A — orquestador: persistencia → correo → respuesta.
 * Conserva EXACTAMENTE la respuesta anterior y el orden de escrituras.
 * Con flag WORKFLOW_ENGINE_INVITACIONES off, el flujo es idéntico al legacy.
 */
export async function enviarInvitaciones(requerimientoId, { solicitud_id, invitacion_ids, usuario, ip } = {}) {
  const persisted = await persistirInvitaciones(null, { requerimientoId, solicitud_id, invitacion_ids, usuario, ip }, enviarCorreosInvitacion);

  if (persisted.solicitud) {
    await registrarMovimiento({
      requerimientoId,
      estadoNuevo: persisted.estadoNuevo,
      usuario: usuario || SUBMODULO_INVITACIONES,
      accion: 'invitacion_enviada',
      observacion: `${persisted.estadoNuevo} — ${persisted.codigo} (${persisted.enviados.length} proveedor${persisted.enviados.length === 1 ? '' : 'es'})`,
      responsable: SUBMODULO_INVITACIONES,
      etapaEjecutor: 'INVITACIONES',
    });
  }

  return {
    enviados: persisted.enviados,
    total: persisted.total,
    contador_envios: persisted.contador_envios,
    mensaje: persisted.solicitud ? 'Solicitud de Cotización enviada correctamente.' : '',
  };
}

export async function getHistorialProveedorInvitaciones(proveedorId) {
  const { rows: prov } = await query(`
    SELECT id, ruc, razon_social, cantidad_invitaciones, cantidad_cotizaciones,
      ultima_invitacion, ultima_cotizacion, ultima_participacion, historial
    FROM proveedores WHERE id = $1
  `, [proveedorId]);
  if (!prov.length) return null;
  const { rows: invs } = await query(`
    SELECT ip.*, sc.codigo AS convocatoria
    FROM invitacion_proveedores ip
    LEFT JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1
    ORDER BY ip.fecha_envio DESC NULLS LAST, ip.id DESC
    LIMIT 50
  `, [proveedorId]);
  const { rows: cots } = await query(`
    SELECT cp.*, sc.codigo AS convocatoria
    FROM cotizaciones_proveedor cp
    JOIN solicitudes_cotizacion sc ON sc.id = cp.solicitud_id
    WHERE cp.proveedor_id = $1 AND cp.estado = 'COTIZACION_PRESENTADA'
    ORDER BY cp.fecha_presentacion DESC NULLS LAST
    LIMIT 20
  `, [proveedorId]);
  return {
    proveedor: prov[0],
    invitaciones: invs,
    cotizaciones: cots,
    resumen: {
      cantidad_invitaciones: prov[0].cantidad_invitaciones || 0,
      cantidad_cotizaciones: prov[0].cantidad_cotizaciones || cots.length,
      ultima_invitacion: prov[0].ultima_invitacion,
      ultima_cotizacion: prov[0].ultima_cotizacion || cots[0]?.fecha_presentacion,
    },
  };
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
  return { solicitud: normalizeCronogramaRow(solicitud), requerimientos: reqs.rows, invitados: invitados.rows };
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
      to_char(sc.cotizaciones_fin, 'YYYY-MM-DD"T"HH24:MI') AS fecha_culminacion,
      (SELECT sr.requerimiento_id FROM solicitud_requerimientos sr WHERE sr.solicitud_id = sc.id ORDER BY sr.requerimiento_id LIMIT 1) AS requerimiento_id,
      (SELECT r.codigo FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = sc.id ORDER BY sr.requerimiento_id LIMIT 1) AS requerimiento_codigo,
      COALESCE(sc.contador_envios, 0)::int AS contador_envios,
      CASE
        WHEN COALESCE(sc.contador_envios, 0) > 0 THEN 'Sol.Cot. Enviada (' || sc.contador_envios || ')'
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
    ORDER BY sc.anio DESC, sc.correlativo DESC, sc.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  return {
    data: rows.map(normalizeCronogramaRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPrimaryRequerimientoId(solicitudId) {
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
  const provId = proveedorData.proveedor_id || proveedorData.id;
  const entry = provId
    ? { id: provId, correos: correos.length ? correos : undefined }
    : {
      ruc: proveedorData.ruc,
      razon_social: proveedorData.proveedor || proveedorData.razon_social,
      telefono: proveedorData.telefono,
      correo: correos[0] || '',
      correos,
      persona_contacto: proveedorData.persona_contacto || '',
      rubro: proveedorData.rubro || '',
    };
  const results = await agregarProveedoresInvitacion(requerimientoId, [entry], solicitudId);
  return results[0];
}

export async function listarProveedoresSolicitud(solicitudId) {
  const { rows } = await query(`
    SELECT ip.id AS invitacion_id, ip.solicitud_id, ip.requerimiento_id, ip.proveedor_id,
      ip.estado, ip.correos, ip.fecha_envio, ip.nro_invitacion, ip.historial, ip.created_at,
      p.ruc, p.razon_social, p.telefono, p.correo, p.persona_contacto, p.rubro,
      p.emails AS proveedor_emails, p.cantidad_invitaciones, p.cantidad_cotizaciones,
      p.ultima_invitacion, p.ultima_cotizacion
    FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id
    WHERE ip.solicitud_id = $1
       OR (
         ip.solicitud_id IS NULL
         AND ip.requerimiento_id IN (
           SELECT sr.requerimiento_id FROM solicitud_requerimientos sr WHERE sr.solicitud_id = $1
         )
       )
    ORDER BY ip.proveedor_id ASC, ip.nro_invitacion ASC NULLS LAST, ip.id ASC
  `, [solicitudId]);
  return rows.map((r) => ({
    ...r,
    id: r.invitacion_id,
    proveedor_id: r.proveedor_id,
    nro_invitacion: r.nro_invitacion ?? 1,
    estado_envio: esEstadoInvitacionEnviada(r.estado) ? 'Enviado' : 'Pendiente',
    correo_display: (Array.isArray(r.correos) && r.correos.length ? r.correos : (r.correo ? [r.correo] : r.proveedor_emails || [])).join('; '),
    persona_contacto: r.persona_contacto || '',
    cantidad_invitaciones_proveedor: r.cantidad_invitaciones ?? 0,
    cantidad_cotizaciones_proveedor: r.cantidad_cotizaciones ?? 0,
    fecha_invitacion: r.fecha_envio,
  }));
}

export async function enviarCorreosSolicitud(solicitudId, invitacionIds = [], { usuario, ip } = {}) {
  const requerimientoId = await getPrimaryRequerimientoId(solicitudId);
  if (!requerimientoId) throw new Error('Sin requerimiento asociado');
  const ids = (invitacionIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const params = [solicitudId];
  let idFilter = '';
  if (ids.length) {
    const ph = ids.map((_, i) => `$${params.length + i + 1}`).join(', ');
    params.push(...ids);
    idFilter = ` AND ip.id IN (${ph})`;
  }
  const perteneceSolicitud = `(
    ip.solicitud_id = $1
    OR (
      ip.solicitud_id IS NULL
      AND ip.requerimiento_id IN (
        SELECT sr.requerimiento_id FROM solicitud_requerimientos sr WHERE sr.solicitud_id = $1
      )
    )
  )`;
  const { rows: pending } = await query(`
    SELECT ip.id FROM invitacion_proveedores ip
    WHERE ${perteneceSolicitud} AND ${sqlInvitacionPendiente('ip')} ${idFilter}
  `, params);
  if (!pending.length) throw new Error('No hay proveedores pendientes seleccionados');
  const pendingIds = pending.map((p) => p.id);
  await query(
    `UPDATE invitacion_proveedores SET solicitud_id = $1, updated_at = NOW()
     WHERE id = ANY($2::int[]) AND solicitud_id IS NULL`,
    [solicitudId, pendingIds],
  );
  const result = await enviarInvitaciones(requerimientoId, {
    solicitud_id: solicitudId,
    invitacion_ids: pendingIds,
    usuario,
    ip,
  });
  return result;
}

export async function eliminarInvitacionProveedor(invitacionId) {
  const { rows } = await query(
    `DELETE FROM invitacion_proveedores ip WHERE ip.id = $1 AND ${sqlInvitacionPendiente('ip')} RETURNING ip.id`,
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
  const { procesarAccionObservacion } = await import('./observacionesWorkflow.js');
  const { formatObservacionTraza, resolveEstadoFromDestino, resolveResponsableFromDestino, submoduloLabelToEtapa } = await import('./observacionDestino.js');
  const {
    motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo,
    accion, observacion_id, observacion_padre_id, observacionPadreId,
  } = body || {};

  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');

  const accionObs = procesarAccionObservacion(loaded.payload, {
    accion, observacion_id, origen_submodulo: origen_submodulo || SUBMODULO_INVITACIONES, usuario,
  });
  if (accionObs) {
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);
    const { enrichRequerimientoRow } = await import('./trazabilidad.js');
    return enrichRequerimientoRow((await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId])).rows[0]);
  }

  if (!motivo) throw new Error('Motivo requerido');

  appendObservacion(loaded.payload, {
    motivo,
    gerente: usuario || SUBMODULO_INVITACIONES,
    origen: 'INVITACIONES',
    origen_submodulo: origen_submodulo || SUBMODULO_INVITACIONES,
    destino_submodulo: destino_submodulo || '',
    destino_etapa: destino_etapa || '',
    destino_persona: destino_persona || '',
    observacion_padre_id: observacion_padre_id || observacionPadreId || null,
  });
  await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);

  const etapaDestObs = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'REGISTRADO').toUpperCase();
  const estadoNuevo = resolveEstadoFromDestino(destino_submodulo, destino_etapa) || 'Observado Invitaciones';
  const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDestObs);

  return registrarMovimiento({
    requerimientoId,
    estadoNuevo,
    usuario: usuario || SUBMODULO_INVITACIONES,
    accion: 'observado',
    observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
    responsable,
    etapaEjecutor: 'INVITACIONES',
    etapaDestinoEvento: etapaDestObs,
  });
}
