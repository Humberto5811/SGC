// Fase 2A.3A — verificación del refactor de invitaciones.
// SIN BD real: comprueba estructura del archivo y contratos exportados.
import { readFile } from 'node:fs/promises';
import { assert, summarize } from './workflowTestUtils.mjs';
import * as invitaciones from '../server/lib/invitaciones.js';

async function run() {
  const src = await readFile(new URL('../server/lib/invitaciones.js', import.meta.url), 'utf8');

  // 1. Responsabilidades extraídas.
  assert(typeof invitaciones.persistirInvitaciones === 'function', 'R1. persistirInvitaciones exportada');
  assert(typeof invitaciones.enviarCorreosInvitacion === 'function', 'R2. enviarCorreosInvitacion exportada');
  assert(typeof invitaciones.enviarInvitaciones === 'function', 'R3. enviarInvitaciones (orquestador) exportada');
  assert(typeof invitaciones.enviarCorreosSolicitud === 'function', 'R4. enviarCorreosSolicitud exportada');

  // 2. persistirInvitaciones acepta client + opts + onEmail (por firma real).
  // (JS length no cuenta params tras el primer default; validamos por firma.)
  assert(/persistirInvitaciones\(client, \{/.test(src), 'R5. persistirInvitaciones(client, opts, onEmail)');

  // 3. persistirInvitaciones usa runDb(client,...) — acepta tx opcional.
  assert(src.includes('function runDb(client'), 'R6. runDb(client, ...) definido');
  assert(/const invRes = await runDb\(client/.test(src), 'R7. lectura de invitaciones vía runDb(client)');

  // 4. persistirInvitaciones NO llama enviarInvitacionProveedorEmail ni executeTransition.
  const persistBlock = src.split('export async function persistirInvitaciones')[1]?.split('export async function enviarInvitaciones(')[0] || '';
  assert(persistBlock.length > 500, 'R8. bloque persistirInvitaciones presente');
  const block = src.slice(
    src.indexOf('export async function persistirInvitaciones'),
    src.indexOf('export async function enviarInvitaciones('),
  );
  assert(!block.includes('enviarInvitacionProveedorEmail('), 'R9. persistir NO envía correo directo');
  assert(!block.includes('executeTransition'), 'R10. persistir NO llama executeTransition');
  assert(block.includes('typeof onEmail === \'function\''), 'R11. onEmail es callback opcional');

  // 5. Orquestador: enviarInvitaciones persiste luego registra movimiento (legacy intacto).
  assert(src.includes('await persistirInvitaciones(null, { requerimientoId'), 'R12. orquestador usa persistirInvitaciones sin client');
  assert(src.includes('enviarCorreosInvitacion'), 'R13. onEmail = enviarCorreosInvitacion en el orquestador');
  assert(src.includes('registrarMovimiento({'), 'R14. orquestador conserva registrarMovimiento legacy');

  // 6. enviarCorreosSolicitud reutiliza enviarInvitaciones (no duplica lógica).
  const correosBlock = src.slice(src.indexOf('export async function enviarCorreosSolicitud'), src.indexOf('export async function eliminarInvitacionProveedor'));
  assert(correosBlock.includes('await enviarInvitaciones(requerimientoId'), 'R15. enviarCorreosSolicitud delega en enviarInvitaciones (reutiliza persistir)');

  // 7. Respuesta compatible (forma exacta anterior, sin depender de indentación).
  const respuestaBlock = src.slice(
    src.indexOf('enviados: persisted.enviados'),
    src.indexOf('export async function getHistorialProveedorInvitaciones'),
  );
  assert(respuestaBlock.includes('enviados: persisted.enviados'), 'R16. respuesta conserva enviados');
  assert(respuestaBlock.includes('contador_envios: persisted.contador_envios'), 'R17. respuesta conserva contador_envios');
  assert(respuestaBlock.includes('mensaje: persisted.solicitud ?'), 'R18. respuesta conserva mensaje');
}

run().then(() => summarize('test-invitaciones-refactor')).catch((e) => { console.error(e); process.exitCode = 1; });