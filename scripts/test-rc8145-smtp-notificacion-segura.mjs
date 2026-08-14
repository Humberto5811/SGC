/**
 * RC8.14.5 — SMTP seguro en Notificación al Proveedor.
 * Usa un servidor SMTP local efímero; no envía correo externo ni modifica BD.
 */
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOrdenEmailAttachments,
} from '../server/lib/ordenesProveedor.js';
import {
  listarDocsNotificacion,
} from '../server/lib/ordenesContratacion.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'server/lib/ordenesProveedor.js'), 'utf8');
const ok = (condition, message) => {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
};

function createFakeSmtpServer() {
  let fail = false;
  const messages = [];
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let dataMode = false;
    let message = '';
    socket.write('220 localhost SGC test SMTP\r\n');
    socket.on('data', (chunk) => {
      if (dataMode) {
        message += chunk;
        const end = message.indexOf('\r\n.\r\n');
        if (end >= 0) {
          messages.push(message.slice(0, end));
          message = message.slice(end + 5);
          dataMode = false;
          socket.write('250 2.0.0 queued as SGC-TEST\r\n');
        }
        return;
      }
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (command.startsWith('AUTH')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (command.startsWith('MAIL FROM')) {
          socket.write(fail ? '550 5.7.1 Rejected for test\r\n' : '250 2.1.0 OK\r\n');
        } else if (command.startsWith('RCPT TO') || command === 'RSET') {
          socket.write('250 2.1.5 OK\r\n');
        } else if (command === 'DATA') {
          dataMode = true;
          message = '';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 2.0.0 Bye\r\n');
        } else if (line) {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  return {
    server,
    messages,
    setFail(value) { fail = value; },
  };
}

console.log('\n=== RC8.14.5 — SMTP seguro en Notificación al Proveedor ===\n');

const fake = createFakeSmtpServer();
await new Promise((resolve, reject) => {
  fake.server.once('error', reject);
  fake.server.listen(0, '127.0.0.1', resolve);
});
const { port } = fake.server.address();

Object.assign(process.env, {
  SMTP_ENABLED: 'true',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(port),
  SMTP_SECURE: 'false',
  SMTP_USER: 'sgc-test',
  SMTP_PASS: 'test-secret-not-logged',
  SMTP_FROM_EMAIL: 'sgc-test@example.invalid',
  SMTP_FROM_NAME: 'SGC Test',
});

try {
  const { sendMail } = await import(`../server/lib/emailService.js?rc8145=${Date.now()}`);
  const attachments = [{
    filename: 'cronograma-test.html',
    content: Buffer.from('<p>cronograma</p>', 'utf8'),
    contentType: 'text/html',
  }];

  const sent = await sendMail({
    to: 'destino@example.invalid',
    subject: '[SGC] RC8.14.5 success',
    text: 'Prueba',
    html: '<p>Prueba</p>',
    attachments,
  });
  ok(sent.success && !sent.simulated && sent.messageId, 'A. SMTP exitoso retorna confirmación real');
  ok(fake.messages.length === 1 && /cronograma-test\.html/i.test(fake.messages[0]),
    'E1. Nodemailer transmite el attachment con su nombre');
  ok(/Content-Type: text\/html/i.test(fake.messages[0]),
    'E2. Nodemailer conserva el MIME type del attachment');

  fake.setFail(true);
  let smtpError = null;
  try {
    await sendMail({
      to: 'destino@example.invalid',
      subject: '[SGC] RC8.14.5 failure',
      text: 'Prueba de error',
      html: '<p>Prueba de error</p>',
    });
  } catch (error) {
    smtpError = error;
  }
  ok(!!smtpError, 'B. fallo SMTP se propaga y no se convierte en éxito');
} finally {
  await new Promise((resolve) => fake.server.close(resolve));
}

const functionSource = source.slice(
  source.indexOf('export async function enviarOrdenProveedor'),
  source.indexOf('export async function reenviarOrdenProveedor'),
);
ok(functionSource.indexOf('sendMail({ ...mail, attachments })')
  < functionSource.indexOf('await ensureProveedorPortalAccount'),
'C1. cuenta portal se marca solo después de sendMail');
ok(/if \(!errorMsg\)[\s\S]*UPDATE ordenes_contratacion SET[\s\S]*enviado_proveedor_at = NOW\(\)/.test(functionSource),
  'C2. estado y fecha de la orden solo cambian sin error SMTP');
ok(/errorMsg \? 'ERROR' : 'ENVIADO'/.test(functionSource),
  'D1. intento fallido se registra como ERROR');
ok(/emailResult\.simulated[\s\S]*no se considera enviado/.test(functionSource),
  'D1b. una simulación no se registra como envío SMTP exitoso');
ok(/if \(errorMsg\)[\s\S]*'SMTP_ERROR'/.test(functionSource),
  'D2. tras registrar el intento, el fallo se devuelve para permitir reintento');
ok(/if \(!errorMsg\)[\s\S]*aplicarFechasInicioTrasNotificacion/.test(functionSource),
  'C3. los plazos contractuales solo se inician tras éxito');

const osAttachments = await buildOrdenEmailAttachments(2);
assert.deepEqual(
  osAttachments.map((a) => a.filename),
  ['ORDEN DE SERVICIO 1105.pdf', 'cronograma-OS-1105.html', 'Anexo_11_SC-00002-2026-INS.pdf'],
);
ok(osAttachments.every((a) => Buffer.isBuffer(a.content) && a.content.length > 0),
  'E3. OS/LOCACIÓN obtiene Orden, Cronograma y Anexo 11 con contenido');
assert.deepEqual(
  osAttachments.map((a) => a.contentType),
  ['application/pdf', 'text/html', 'application/pdf'],
);
ok(true, 'E4. OS/LOCACIÓN conserva los MIME types correctos');

const bienMeta = await listarDocsNotificacion(1);
assert.deepEqual(
  bienMeta.documentos.map((d) => d.tipo),
  ['ORDEN_FIRMADA', 'REQUERIMIENTO', 'COTIZACION', 'CRONOGRAMA'],
);
ok(true, 'F. BIEN conserva su composición documental previa');

console.log('\n=== RC8.14.5 — pruebas OK ===\n');
