// Servicio de correo — notificaciones Portal de Proveedores (SMTP configurable)
import dotenv from 'dotenv';

dotenv.config();

const SMTP_ENABLED = String(process.env.SMTP_ENABLED || 'false').toLowerCase() === 'true';

export function getPortalBaseUrl() {
  return String(process.env.PORTAL_BASE_URL || 'http://localhost:5173/#/portal-proveedores').replace(/\/$/, '');
}

export function buildInvitacionEmailContent({ proveedor, solicitud, credenciales }) {
  const portalUrl = getPortalBaseUrl();
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
      'Acceda al Portal de Proveedores SGC (no responda este correo con documentos):',
      portalUrl,
      '',
      `Usuario: ${credenciales.usuario}`,
      `Contraseña temporal: ${credenciales.clave}`,
      '',
      'Debe cambiar su contraseña en el primer ingreso.',
    ].join('\n'),
    html: `<p>Convocatoria <strong>${solicitud.codigo || ''}</strong></p>
<p><a href="${portalUrl}">${portalUrl}</a></p>
<p>Usuario: <strong>${credenciales.usuario}</strong><br>Clave temporal: <strong>${credenciales.clave}</strong></p>`,
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

  // Integración SMTP real (nodemailer) pendiente de credenciales en .env
  console.warn('[email] SMTP_ENABLED=true pero transporte no configurado; simulando envío.');
  console.log('[email:simulado]', JSON.stringify(payload, null, 2));
  return { success: true, simulated: true, messageId: `sim-${Date.now()}` };
}

export async function enviarInvitacionProveedorEmail(opts) {
  const content = buildInvitacionEmailContent(opts);
  const correos = opts.correos || opts.proveedor?.emails || [];
  return sendMail({ to: correos, ...content });
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
