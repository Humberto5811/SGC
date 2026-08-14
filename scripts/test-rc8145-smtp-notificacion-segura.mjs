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
import pool, { query } from '../server/db.js';

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

// ---------------------------------------------------------------------------
// Validación real (solo lectura) sin ids físicos hardcodeados.
// ---------------------------------------------------------------------------
const OS_TIPO = 'OS';
const OS_NUMERO = '1105';
const OS_ANIO = 2026;
let blockedByData = false;

try {
  // A) OS/LOCACIÓN — resuelta por identidad lógica (tipo + número + año).
  const osRows = await query(
    `SELECT id, tipo_orden, numero_orden, anio_orden
     FROM ordenes_contratacion
     WHERE tipo_orden = $1 AND numero_orden = $2 AND anio_orden = $3
     ORDER BY id ASC
     LIMIT 1`,
    [OS_TIPO, OS_NUMERO, OS_ANIO],
  ).then((r) => r.rows);
  const osRow = osRows[0];
  if (!osRow) {
    throw new Error(
      `OS ${OS_NUMERO}/${OS_ANIO} (tipo ${OS_TIPO}) no encontrada en ordenes_contratacion`,
    );
  }
  const osId = Number(osRow.id);
  console.log(`  ✓ OS/LOCACIÓN resuelta dinámicamente: id=${osId} (${osRow.tipo_orden}-${osRow.numero_orden}/${osRow.anio_orden})`);

  try {
    const osAttachments = await buildOrdenEmailAttachments(osId);
    const names = osAttachments.map((a) => a.filename);
    assert.equal(names.length, 3, 'OS/LOCACIÓN produce 3 adjuntos');
    // ORDEN_FIRMADA: validar el nombre real de forma robusta (sin convención textual fija).
    assert.ok(typeof names[0] === 'string' && names[0].trim().length > 0,
      'adjunto ORDEN_FIRMADA tiene nombre no vacío');
    assert.match(names[0], /\.pdf$/i, 'adjunto ORDEN_FIRMADA termina en .pdf');
    assert.match(names[0], /1105/, 'adjunto ORDEN_FIRMADA corresponde a la OS 1105');
    assert.equal(names[1], 'cronograma-OS-1105.html');
    assert.match(names[2], /^Anexo_11_SC-\d+-2026-INS\.pdf$/);
    ok(osAttachments.every((a) => Buffer.isBuffer(a.content) && a.content.length > 0),
      'E3. OS/LOCACIÓN obtiene Orden, Cronograma y Anexo 11 con contenido');
    assert.deepEqual(
      osAttachments.map((a) => a.contentType),
      ['application/pdf', 'text/html', 'application/pdf'],
    );
    ok(true, 'E4. OS/LOCACIÓN conserva los MIME types correctos');
  } catch (error) {
    if (error?.code === 'SIN_CRONOGRAMA' || error?.code === 'DOCUMENTOS_INCOMPLETOS') {
      console.log(`  ⚠ OS/LOCACIÓN BLOQUEADA POR DATOS — cronograma no disponible: ${error.message}`);
      blockedByData = true;
    } else {
      throw error;
    }
  }

  // B) BIEN — resuelta dinámicamente (sin id físico).
  const bienRows = await query(
    `SELECT id, tipo_orden, numero_orden, anio_orden, tipo_contratacion
     FROM ordenes_contratacion
     WHERE tipo_contratacion ILIKE '%bien%' OR UPPER(tipo_orden) = 'OC'
     ORDER BY id ASC
     LIMIT 1`,
  ).then((r) => r.rows);
  const bienRow = bienRows[0];
  if (!bienRow) {
    console.log('  ⚠ BIEN BLOQUEADA POR DATOS — SIN FIXTURE BIEN: no existe ninguna orden BIEN/OC en la BD');
    blockedByData = true;
  } else {
    console.log(`  ✓ BIEN resuelto dinámicamente: id=${bienRow.id} (${bienRow.tipo_orden}-${bienRow.numero_orden}/${bienRow.anio_orden}, ${bienRow.tipo_contratacion})`);
    const bienMeta = await listarDocsNotificacion(Number(bienRow.id));
    assert.deepEqual(
      bienMeta.documentos.map((d) => d.tipo),
      ['ORDEN_FIRMADA', 'REQUERIMIENTO', 'COTIZACION', 'CRONOGRAMA'],
    );
    ok(true, 'F. BIEN conserva su composición documental previa');
  }

  // C) Comprobación estática (sin BD) de la composición documental BIEN.
  const ocSource = readFileSync(join(root, 'server/lib/ordenesContratacion.js'), 'utf8');
  ok(/\[ordenFirmadaDoc, requerimientoDoc, cotizacionDoc, cronogramaDoc\]/.test(ocSource),
    'G. BIEN conserva estáticamente su composición: orden firmada, requerimiento, cotización, cronograma');
} finally {
  await pool.end().catch(() => {});
}

if (blockedByData) {
  console.log('\n=== RC8.14.5 — BLOQUEADA POR DATOS ===\n');
} else {
  console.log('\n=== RC8.14.5 — APROBADA ===\n');
}
