// Servicio de correo — notificaciones Portal de Proveedores (SMTP configurable)
import dotenv from 'dotenv';
import { buildInvitacionUrl, PORTAL_PUBLIC_BASE } from './proveedorPortal.js';

dotenv.config();

const SMTP_ENABLED = String(process.env.SMTP_ENABLED || 'false').toLowerCase() === 'true';

export function getPortalBaseUrl() {
  return String(process.env.PORTAL_BASE_URL || 'http://localhost:5173/#/proveedor/login').replace(/\/$/, '');
}

export { PORTAL_PUBLIC_BASE, buildInvitacionUrl };

export function buildInvitacionEmailContent({ proveedor, solicitud, credenciales, urlInvitacion, token }) {
  const portalLoginUrl = getPortalBaseUrl();
  const urlToken = urlInvitacion || (token ? buildInvitacionUrl(token) : portalLoginUrl);
  return {
    subject: `[SGC] Invitación a cotizar — ${solicitud.codigo || ''}`,
    text: [
      `Estimado proveedor ${proveedor.razon_social || proveedor.ruc}:`,
      '',
      `Convocatoria: ${solicitud.codigo || ''}`,
      `Objeto: ${solicitud.objeto || solicitud.denominacion || ''}`,
      `Consultas: ${formatRange(solicitud.consultas_inicio, solicitud.consultas_fin)}`,
      `Cotizaciones: ${formatRange(solicitud.cotizaciones_inicio, solicitud.cotizaciones_fin)}`,
      '',
      'Acceso directo a la invitación (preparado para futuro envío SMTP):',
      urlToken,
      '',
      'Portal de Proveedores:',
      portalLoginUrl,
      '',
      `Usuario portal: ${credenciales.usuario}`,
      `Contraseña temporal: ${credenciales.clave}`,
      '',
      'Debe cambiar su contraseña en el primer ingreso.',
      '',
      '[SMTP no habilitado — correo simulado en consola del servidor]',
    ].join('\n'),
    html: `<p>Convocatoria <strong>${solicitud.codigo || ''}</strong></p>
<p>Enlace de invitación: <a href="${urlToken}">${urlToken}</a></p>
<p>Portal: <a href="${portalLoginUrl}">${portalLoginUrl}</a></p>
<p>Usuario: <strong>${credenciales.usuario}</strong><br>Clave temporal: <strong>${credenciales.clave}</strong></p>`,
    meta: { urlInvitacion: urlToken, token, smtpReady: true, smtpSent: false },
  };
}

function formatRange(inicio, fin) {
  if (!inicio && !fin) return '—';
  const f = (d) => (d ? new Date(d).toLocaleString('es-PE') : '—');
  return `${f(inicio)} — ${f(fin)}`;
}

export async function sendMail({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  const payload = { to: recipients, subject, text, html };

  if (!SMTP_ENABLED) {
    console.log('[email:simulado]', JSON.stringify(payload, null, 2));
    return { success: true, simulated: true, messageId: `sim-${Date.now()}` };
  }

  console.warn('[email] SMTP_ENABLED=true pero transporte no configurado; simulando envío.');
  console.log('[email:simulado]', JSON.stringify(payload, null, 2));
  return { success: true, simulated: true, messageId: `sim-${Date.now()}` };
}

export async function enviarInvitacionProveedorEmail(opts) {
  const content = buildInvitacionEmailContent(opts);
  const correos = opts.correos || opts.proveedor?.emails || [];
  const result = await sendMail({ to: correos, ...content });
  return { ...result, ...content.meta };
}

export async function enviarNotificacionAmpliacionPlazo({ solicitud, proveedores, motivo, nuevaFecha }) {
  const portalUrl = getPortalBaseUrl();
  const text = [
    `Se amplió el cronograma de la convocatoria ${solicitud.codigo}.`,
    `Nueva fecha límite: ${new Date(nuevaFecha).toLocaleString('es-PE')}`,
    `Motivo: ${motivo}`,
    `Portal: ${portalUrl}`,
  ].join('\n');
  const correos = proveedores.flatMap((p) => (Array.isArray(p.emails) ? p.emails : []));
  return sendMail({
    to: correos.length ? correos : ['sin-correo@localhost'],
    subject: `[SGC] Ampliación de plazo — ${solicitud.codigo}`,
    text,
  });
}
