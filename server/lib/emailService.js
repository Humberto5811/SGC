// Servicio de correo — notificaciones Portal de Proveedores (SMTP configurable)
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { buildInvitacionUrl, PORTAL_PUBLIC_BASE } from './proveedorPortal.js';

dotenv.config();

let smtpTransport = null;

function isSmtpEnabled() {
  return String(process.env.SMTP_ENABLED || 'false').toLowerCase() === 'true';
}

function getSmtpConfig() {
  const config = {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || ''),
    fromEmail: String(process.env.SMTP_FROM_EMAIL || '').trim(),
    fromName: String(process.env.SMTP_FROM_NAME || '').trim(),
  };
  const required = [
    ['SMTP_HOST', config.host],
    ['SMTP_PORT', Number.isInteger(config.port) && config.port > 0],
    ['SMTP_USER', config.user],
    ['SMTP_PASS', config.pass],
    ['SMTP_FROM_EMAIL', config.fromEmail],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Configuración SMTP incompleta. Falta: ${missing.join(', ')}`);
  }
  return config;
}

function getSmtpTransport() {
  const config = getSmtpConfig();
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }
  return { transport: smtpTransport, config };
}

function safeSmtpError(error) {
  let message = String(error?.message || 'Error SMTP desconocido');
  const secrets = [
    process.env.SMTP_PASS,
    process.env.SMTP_USER,
  ].filter(Boolean);
  for (const secret of secrets) {
    message = message.split(String(secret)).join('[REDACTED]');
  }
  return message;
}

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

export async function sendMail({
  to, subject, text, html, attachments = [],
}) {
  const recipients = Array.isArray(to) ? to : [to];
  const payload = { to: recipients, subject, text, html };

  if (!isSmtpEnabled()) {
    console.log('[email:simulado]', JSON.stringify(payload, null, 2));
    return { success: true, simulated: true, messageId: `sim-${Date.now()}` };
  }

  try {
    const { transport, config } = getSmtpTransport();
    const info = await transport.sendMail({
      from: {
        name: config.fromName || config.fromEmail,
        address: config.fromEmail,
      },
      to: recipients,
      subject,
      text,
      html,
      attachments,
    });
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(`[email:smtp] Error de envío: ${safeSmtpError(error)}`);
    throw error;
  }
}

export async function verifySmtpTransport() {
  if (!isSmtpEnabled()) {
    return { success: true, simulated: true, verified: false };
  }
  try {
    const { transport } = getSmtpTransport();
    await transport.verify();
    return { success: true, simulated: false, verified: true };
  } catch (error) {
    console.error(`[email:smtp] Error de verificación: ${safeSmtpError(error)}`);
    throw error;
  }
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
