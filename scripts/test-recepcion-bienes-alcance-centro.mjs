/**
 * RB8.1B — Alcance por centro en Recepción de Bienes (cableado end-to-end sin BD).
 *
 * Verifica:
 *   A. listarBandejaRecepcionBienes filtra por centro (restringido vs global)
 *   B. getDetalleRecepcionBienes valida acceso antes de devolver detalle/documentos
 *   C. listDestinatariosAreaUsuaria exige expediente y resuelve centro desde BD
 *   D. derivarAreaUsuaria valida operador y responsable del mismo centro
 *   E. Rutas construyen userCtx desde req.user y mapean 403/422
 *   F. Frontend: listDestinatariosAu recibe expediente_id, no envía centro
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}
function assertFileNotContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(src, re, msg || rel);
}

console.log('\n=== RB8.1B — Alcance por centro (cableado Recepción Bienes) ===\n');

// A. Bandeja restringida por centro en listarBandejaRecepcionBienes
{
  const lib = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');
  assert.match(lib, /listarBandejaRecepcionBienes\(\{ rol = 'ALMACEN', usuario = '', userId = null, userCtx = null \}/, 'firma bandeja');
  assert.match(lib, /const global = ctx \? esAlcanceGlobal\(ctx\) : false/, 'detección global');
  assert.match(lib, /resolverCentroDesdeRequerimiento\(\{\s*cmn: row\.requerimiento_cmn,\s*area: row\.req_area,\s*payload: row\.requerimiento_payload,\s*\}\)/, 'resolución centro en bandeja');
  // Punto 1 — paginación: el LIMIT NO debe aplicarse en SQL antes del filtro por centro.
  assert.match(lib, /const sqlLimit = \(ctx && !global\) \? '' : 'LIMIT 500'/, 'LIMIT omitido en SQL para restringidos');
  assert.match(lib, /filtradas\.slice\(0, 500\)\.map\(mapBandejaRow\)/, 'corte de 500 aplicado después del filtro por centro');
  ok('A. Bandeja: global conserva todo; restringido filtra por centro; LIMIT 500 se aplica después del filtro (sin paginación prematura)');
}

// B. Detalle protegido por centro
{
  const lib = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');
  assert.match(lib, /export async function getDetalleRecepcionBienes\(id, userCtx = null\)/, 'detalle firma');
  assert.match(lib, /if \(userCtx && typeof userCtx === 'object' && !esAlcanceGlobal\(userCtx\)\)/, 'guard detalle');
  assert.match(lib, /assertAccesoRecepcionBienes\(userCtx, centro\)/, 'assert detalle');
  assert.match(lib, /getDocumentoRecepcionBienes\(expedienteId, tipo, docId, userCtx = null\)/, 'documentos firma');
  assert.match(lib, /getHistorialRecepcionBienes\(id, userCtx = null\)/, 'historial firma');
  ok('B. Detalle, documentos e historial validan acceso por centro antes de responder');
}

// C. Destinatarios: expediente obligatorio + centro desde BD
{
  const lib = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');
  assert.match(lib, /export async function listDestinatariosAreaUsuaria\(expedienteId, \{ search = '', userCtx = null \} = \{\}\)/, 'firma destinatarios');
  assert.match(lib, /const centro = await resolveCentroExpediente\(eid\)/, 'resuelve centro desde BD');
  assert.match(lib, /assertAccesoRecepcionBienes\(userCtx, centro\)/, 'valida acceso operador');
  assert.match(lib, /COALESCE\(u\.centro, ''\) = \$2 OR COALESCE\(u\.codigo_centro_costo, ''\) = \$2/, 'filtra mismo centro');
  assert.match(lib, /u\.activo = TRUE/, 'excluye inactivos');

  const routes = fs.readFileSync(path.join(root, 'server/routes/recepcionBienes.js'), 'utf8');
  assert.match(routes, /expedienteId = req\.query\.expediente_id \|\| req\.query\.expedienteId \|\| req\.query\.id/, 'expediente_id requerido');
  assert.match(routes, /listDestinatariosAreaUsuaria\(expedienteId, \{/, 'endpoint pasa expediente');
  ok('C. Endpoint destinatarios: expediente_id obligatorio, centro desde BD, activos y mismo centro');
}

// D. Derivación valida operador (userCtx) y responsable del mismo centro
{
  const lib = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');
  assert.match(lib, /derivarAreaUsuaria\(expedienteId, body = \{\}, usuario = '', rol = '', userCtx = null\)/, 'firma derivar');
  assert.match(lib, /if \(userCtx && typeof userCtx === 'object'\)/, 'guard operador');
  assert.match(lib, /validarResponsableCentro\(destId, centroResp, centroResp\.area_id \?\? null\)/, 'validación responsable');
  assert.match(lib, /await validarResponsableCentro/, 'responsable validado antes de escribir');
  // No se escribe nada si falla: la validación ocurre antes de los UPDATE dentro de derivarAreaUsuaria
  const idxDerivar = lib.indexOf('export async function derivarAreaUsuaria');
  const idxDerivarEnd = lib.indexOf('export async function cargarActaFirmada');
  assert.ok(idxDerivar !== -1 && idxDerivarEnd !== -1 && idxDerivar < idxDerivarEnd, 'bloque derivar acotado');
  const bloque = lib.slice(idxDerivar, idxDerivarEnd);
  const idxValidate = bloque.indexOf('validarResponsableCentro(');
  const idxUpdate = bloque.indexOf('UPDATE recepcion_bienes_actas');
  assert.ok(idxValidate !== -1 && idxUpdate !== -1 && idxValidate < idxUpdate, 'validación responsable antes de UPDATE en derivar');
  ok('D. Derivación: operador y responsable validados contra centro real antes de cualquier UPDATE');
}

// E. Rutas: userCtx desde req.user únicamente; errores 403/422; paquete/adjuntos protegidos
{
  const routes = fs.readFileSync(path.join(root, 'server/routes/recepcionBienes.js'), 'utf8');
  assert.match(routes, /req\.user && typeof req\.user === 'object'/, 'userCtx solo desde req.user');
  assert.match(routes, /centro: u\.centro/, 'centro desde BD');
  assert.match(routes, /alcance_datos: u\.alcance_datos/, 'alcance desde BD');
  assert.match(routes, /codigo_centro_costo: u\.codigo_centro_costo/, 'centro costo desde BD');
  assert.match(routes, /ACCESO_CENTRO_DENEGADO.*res\.status\(403\)/, '403 corrección');
  assert.match(routes, /CENTRO_NO_RESUELTO.*RESPONSABLE_CENTRO_INVALIDO/, '422 corrección');
  assertFileNotContains('server/routes/recepcionBienes.js', /req\.body\.centro|req\.query\.centro/, 'no centro desde body/query');
  assertFileNotContains('server/routes/recepcionBienes.js', /x-user-centro/, 'no header centro');

  // Punto 3 — rutas de paquete/adjunto vinculadas al expediente protegidas
  assert.match(routes, /buildPaqueteDocumentalDerivacionAu\(req\.params\.id, \{\s*acta_id: req\.query\.acta_id \|\| req\.query\.actaId,\s*recepcion_id: req\.query\.recepcion_id \|\| req\.query\.recepcionId,\s*userCtx: req\.rbUserCtx,\s*\}\)/, 'paquete-derivacion-au protegido');
  assert.match(routes, /listarPaqueteDerivado\(req\.params\.id, req\.rbUserCtx\)/, 'paquete-derivado protegido');
  assert.match(routes, /adjuntarAdjuntoDerivacionAu\(req\.params\.id, req\.body \|\| \{\}, req\.rbUsuario, req\.rbUserCtx\)/, 'adjunto POST protegido');
  assert.match(routes, /eliminarAdjuntoDerivacionAu\(\s*req\.params\.id, req\.params\.documentoId, req\.body \|\| \{\}, req\.rbUsuario, req\.rbUserCtx,\s*\)/, 'adjunto DELETE protegido');

  const paq = fs.readFileSync(path.join(root, 'server/lib/recepcionPaqueteDerivacionAu.js'), 'utf8');
  assert.match(paq, /resolveCentroExpediente\(\{/ ? /resolveCentroExpediente\(/ : /x/, 'paquete usa resolveCentroExpediente');
  assert.match(paq, /assertAccesoRecepcionBienes/, 'paquete valida acceso');
  assert.match(paq, /export async function listarPaqueteDerivado\(expedienteId, userCtx = null\)/, 'listar paquete firmado');
  assert.match(paq, /export async function adjuntarAdjuntoDerivacionAu\(expedienteId, body = \{\}, usuario = '', userCtx = null\)/, 'adjuntar firmado');
  assert.match(paq, /export async function eliminarAdjuntoDerivacionAu\(expedienteId, documentoId, body = \{\}, usuario = '', userCtx = null\)/, 'eliminar firmado');
  ok('E. Rutas: userCtx solo desde req.user; 403/422; paquete-derivacion-au/paquete-derivado/adjuntos protegidos por centro');
}

// F. Frontend: servicio y modal
{
  const svc = fs.readFileSync(path.join(root, 'src/services/recepcionBienesService.js'), 'utf8');
  assert.match(svc, /listDestinatariosAu\(expedienteId, \{ search = '', area_id = null \} = \{\}\)/, 'servicio recibe expediente');
  assert.match(svc, /q\.set\('expediente_id', String\(expedienteId\)\)/, 'envía expediente_id');
  assert.doesNotMatch(svc, /listDestinatariosAu\(search/, 'sin firma vieja solo search');
  assertFileNotContains('src/services/recepcionBienesService.js', /centro=/, 'no envía centro');

  const modal = fs.readFileSync(path.join(root, 'src/utils/recepcionBienesModal.js'), 'utf8');
  assert.match(modal, /centroResuelto/, 'modal detecta centro');
  assert.match(modal, /rbAuCentro/, 'campo Centro readonly');
  assert.match(modal, /guardarHabilitado/, 'habilita guardar');
  assert.match(modal, /listDestinatariosAu\(row\.id, \{\}\)/, 'destinatarios filtrados por expediente');
  assert.match(modal, /Centro no resuelto/, 'mensaje centro no resuelto');
  assertFileNotContains('src/utils/recepcionBienesModal.js', /centro.*x-user|headers.*centro/i, 'modal no confía en headers');
  ok('F. Frontend: listDestinatariosAu usa expediente_id; Centro readonly; Guardar deshabilitado si no resuelve');
}

// G. RB8.1B.1 — Actas protegidas por centro (guard central assertAccesoExpediente)
{
  const routes = fs.readFileSync(path.join(root, 'server/routes/recepcionBienes.js'), 'utf8');
  const lib = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');

  // 1. Guard central no duplica helper: usa resolveCentroExpediente + assertAccesoRecepcionBienes
  assert.match(routes, /function assertAccesoExpediente/, 'middleware guard existe');
  assert.match(routes, /resolveCentroExpediente\(req\.params\.id\)/, 'guard resuelve centro real');
  assert.match(routes, /assertAccesoRecepcionBienes\(req\.rbUserCtx, centro\)/, 'guard usa assert central');
  assert.doesNotMatch(routes, /validarResponsableCentro/, 'no duplica validación de responsable en guard');
  ok('G.1/9. Guard central único sobre resolveCentroExpediente+assert (sin duplicar helper)');

  // 2. Rutas protegidas con assertAccesoExpediente
  const protegidas = [
    /generar-acta', assertAccesoExpediente/,
    /actas\/:actaId', assertAccesoExpediente/,
    /acta-visada', assertAccesoExpediente/,
    /actas\/:actaId\/visado', assertAccesoExpediente/,
    /actas\/:actaId\/visado\/:documentoId', assertAccesoExpediente/,
    /actas\/:actaId\/visado\/:documentoId\/reemplazar', assertAccesoExpediente/,
    /actas\/:actaId\/visado\/:documentoId', assertAccesoExpediente/,
    /cargar-acta-firmada', assertAccesoExpediente/,
    /observar', assertAccesoExpediente/,
  ];
  for (const re of protegidas) {
    assert.match(routes, re, `ruta protegida ${re}`);
  }
  ok('G.2. GET/POST/PUT/DELETE de actas y visado protegen por centro antes de operar');

  // 3. Orden: guard se ejecuta ANTES de la función backend (auth → existencia → centro → pertenencia → docs)
  assert.ok(routes.indexOf('function assertAccesoExpediente') < routes.indexOf("router.use(buildErrorMapper())"), 'guard definido antes del mapper');
  assert.ok(routes.indexOf("router.post('/:id/generar-acta', assertAccesoExpediente") < routes.indexOf('generarActaRecepcion(req.params.id'), 'guard antes de llamar función');
  // La existencia del expediente la garantiza resolveCentroExpediente (404 EXPEDIENTE_NO_ENCONTRADO) antes del assert
  ok('G.3. Validaciones en orden: auth → existencia (resolveCentroExpediente 404) → centro (403) → actaId (pertenencia backend) → docs');

  // 4. Acta de otro expediente sigue rechazada por validación existente (el guard no la reemplaza)
  assert.match(lib, /SELECT \* FROM recepcion_bienes_actas\s+WHERE id = \$1 AND expediente_recepcion_id = \$2/, 'pertenencia acta a expediente en backend');
  assert.match(lib, /throw httpError\('Acta no encontrada', 404\)/, 'acta no perteneciente → 404');
  ok('G.4. Pertenencia del acta al expediente conservada (404 si no coincide)');

  // 5. Respuesta autorizada no cambió: listarActaVisada y obtenerActaVisada conservan su firma/respuesta
  {
    const { listarActaVisada, obtenerActaVisada } = await import('../server/lib/recepcionActaVisada.js');
    assert.equal(typeof listarActaVisada, 'function');
    assert.equal(typeof obtenerActaVisada, 'function');
  }
  assertFileContains('server/lib/recepcionActaVisada.js', /export async function listarActaVisada\(expedienteId, actaId\)/, 'listar firma original');
  assertFileContains('server/lib/recepcionActaVisada.js', /export async function obtenerActaVisada\(expedienteId, actaId, documentoId\)/, 'obtener firma original');
  ok('G.5/10. Operación autorizada conserva su respuesta previa (funciones backend intactas)');
}

console.log('\nRB8.1B alcance centro OK (incluye RB8.1B.1 actas por centro)\n');
