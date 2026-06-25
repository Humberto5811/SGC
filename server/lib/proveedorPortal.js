// Entidad proveedor_portal — acceso externo separado del SGC interno
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db.js';

export const PORTAL_PUBLIC_BASE = String(
  process.env.PORTAL_PUBLIC_URL || 'https://sgc.ins.gob.pe/proveedor',
).replace(/\/$/, '');

export function buildInvitacionUrl(token) {
  return `${PORTAL_PUBLIC_BASE}/invitacion/${token}`;
}

export function generarTokenAcceso() {
  return crypto.randomBytes(24).toString('hex');
}

function primaryEmail(emails) {
  if (Array.isArray(emails) && emails.length) return String(emails[0]);
  return '';
}

/** Crea o actualiza cuenta portal del proveedor (usuario = RUC, clave temporal = RUC). */
export async function ensureProveedorPortalAccount(proveedor, { passwordTemporal, estadoInvitacion, fechaEnvio } = {}) {
  const ruc = String(proveedor.ruc || '').replace(/\D/g, '').slice(0, 11);
  const clave = String(passwordTemporal || ruc);
  const hash = await bcrypt.hash(clave, 10);
  const correo = primaryEmail(proveedor.emails) || proveedor.correo || '';

  const { rows } = await query(`
    INSERT INTO proveedor_portal (
      proveedor_id, ruc, razon_social, correo, telefono,
      usuario, usuario_portal, password_temporal, password_hash,
      primer_ingreso, estado, fecha_ultimo_envio, estado_invitacion
    ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, TRUE, 'ACTIVO', $9, $10)
    ON CONFLICT (proveedor_id) DO UPDATE SET
      razon_social = EXCLUDED.razon_social,
      correo = EXCLUDED.correo,
      telefono = EXCLUDED.telefono,
      usuario = EXCLUDED.usuario,
      usuario_portal = EXCLUDED.usuario_portal,
      password_temporal = EXCLUDED.password_temporal,
      password_hash = EXCLUDED.password_hash,
      primer_ingreso = TRUE,
      estado = 'ACTIVO',
      fecha_ultimo_envio = COALESCE(EXCLUDED.fecha_ultimo_envio, proveedor_portal.fecha_ultimo_envio),
      estado_invitacion = COALESCE(EXCLUDED.estado_invitacion, proveedor_portal.estado_invitacion),
      updated_at = NOW()
    RETURNING *
  `, [
    proveedor.id,
    ruc,
    proveedor.razon_social || '',
    correo,
    proveedor.telefono || '',
    ruc,
    clave,
    hash,
    fechaEnvio || new Date(),
    estadoInvitacion || 'ENVIADA',
  ]);

  // Mantener compatibilidad con proveedor_acceso existente
  await query(`
    INSERT INTO proveedor_acceso (proveedor_id, password_hash, debe_cambiar_password, clave_temporal, clave_temporal_expira)
    VALUES ($1, $2, TRUE, $3, NOW() + INTERVAL '30 days')
    ON CONFLICT (proveedor_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      debe_cambiar_password = TRUE,
      clave_temporal = EXCLUDED.clave_temporal,
      clave_temporal_expira = EXCLUDED.clave_temporal_expira,
      updated_at = NOW()
  `, [proveedor.id, hash, clave]);

  return rows[0];
}

/** Prepara token y URL únicos por invitación (sin envío SMTP). */
export async function prepararInvitacionPortal(invitacionId, proveedor) {
  const token = generarTokenAcceso();
  const url = buildInvitacionUrl(token);
  const now = new Date();

  await ensureProveedorPortalAccount(proveedor, {
    passwordTemporal: proveedor.ruc,
    estadoInvitacion: 'ENVIADA',
    fechaEnvio: now,
  });

  const { rows } = await query(`
    UPDATE invitacion_proveedores SET
      token_acceso = $2,
      url_invitacion = $3,
      fecha_ultimo_envio = $4,
      estado_invitacion = 'ENVIADA',
      usuario_portal = $5,
      clave_temporal = $5,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [invitacionId, token, url, now, proveedor.ruc]);

  return { invitacion: rows[0], token, url };
}

export async function getPortalAccountByRuc(ruc) {
  const rucNorm = String(ruc || '').replace(/\D/g, '').slice(0, 11);
  const { rows } = await query(`
    SELECT pp.*, p.activo AS proveedor_activo, p.emails
    FROM proveedor_portal pp
    JOIN proveedores p ON p.id = pp.proveedor_id
    WHERE pp.ruc = $1 AND pp.estado = 'ACTIVO' AND p.activo = TRUE
  `, [rucNorm]);
  return rows[0] || null;
}

export async function getInvitacionByToken(token) {
  if (!token) return null;
  const { rows } = await query(`
    SELECT ip.*, p.ruc, p.razon_social, p.telefono, p.emails,
      sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto
    FROM invitacion_proveedores ip
    JOIN proveedores p ON p.id = ip.proveedor_id
    LEFT JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.token_acceso = $1
  `, [token]);
  return rows[0] || null;
}

export async function marcarPasswordCambiada(proveedorId, nuevaHash) {
  await query(`
    UPDATE proveedor_portal SET
      password_hash = $2,
      password_temporal = NULL,
      primer_ingreso = FALSE,
      updated_at = NOW()
    WHERE proveedor_id = $1
  `, [proveedorId, nuevaHash]);
}
