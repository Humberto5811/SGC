/**
 * Prueba manual del transporte SMTP real (Brevo).
 *
 * Uso:
 *   SMTP_TEST_TO=destino@dominio node scripts/test-smtp-brevo.mjs
 */
import { sendMail, verifySmtpTransport } from '../server/lib/emailService.js';

const enabled = String(process.env.SMTP_ENABLED || 'false').toLowerCase() === 'true';
const testTo = String(process.env.SMTP_TEST_TO || '').trim();
const safeError = (error) => {
  const secret = String(process.env.SMTP_PASS || '');
  const message = String(error?.message || 'error desconocido');
  return secret ? message.split(secret).join('[REDACTED]') : message;
};

if (!enabled) {
  console.error('Prueba abortada: SMTP_ENABLED debe ser true para verificar un transporte real.');
  process.exit(1);
}

if (!testTo) {
  console.error('Prueba abortada: falta SMTP_TEST_TO con el destinatario de prueba.');
  process.exit(1);
}

try {
  console.log('Verificando conexión SMTP...');
  const verification = await verifySmtpTransport();
  if (!verification.verified || verification.simulated) {
    throw new Error('El transporte SMTP no quedó verificado como conexión real.');
  }
  console.log('Conexión SMTP verificada.');

  const result = await sendMail({
    to: testTo,
    subject: '[SGC] Prueba de configuración SMTP',
    text: 'Esta es una prueba técnica del Sistema de Gestión de Contrataciones.',
    html: '<p>Esta es una prueba técnica del <strong>Sistema de Gestión de Contrataciones</strong>.</p>',
  });

  if (!result.success || result.simulated) {
    throw new Error('El servicio no confirmó un envío SMTP real.');
  }
  console.log(`Correo de prueba enviado. messageId: ${result.messageId}`);
} catch (error) {
  console.error(`Prueba SMTP fallida: ${safeError(error)}`);
  process.exit(1);
}
