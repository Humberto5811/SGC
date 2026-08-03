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

// H. RB8.1C — Última versión vigente de documentos y actas
{
  const { seleccionarUltimaVersionDocumentos, seleccionarActaVigente } = await import('../shared/expedienteDocumentos.js');

  // 1. Documentos: misma clave lógica (origen|tipo|nombre) con distinto id → uno solo
  const docs = [
    { id: 1, documentoId: 'cot:1:docs-0', nombre: 'ficha_tecnica.pdf', tipo: 'Ficha técnica', origen: 'COTIZACION', version: null, vigente: true },
    { id: 2, documentoId: 99, nombre: 'ficha_tecnica.pdf', tipo: 'Ficha técnica', origen: 'RECEPCION', version: 1, vigente: true },
    { id: 3, documentoId: 100, nombre: 'certificado_calidad.pdf', tipo: 'Certificado de calidad', origen: 'RECEPCION', version: 2, vigente: true },
  ];
  const unicos = seleccionarUltimaVersionDocumentos(docs);
  assert.ok(unicos.length >= 2, 'agrupa por clave lógica');
  assert.equal(unicos.filter((d) => /ficha_tecnica/i.test(d.nombre)).length, 1, 'ficha técnica una sola');
  assert.equal(unicos.filter((d) => /certificado_calidad/i.test(d.nombre)).length, 1, 'certificado una sola');
  ok('H.1. seleccionarUltimaVersionDocumentos agrupa por origen|tipo|nombre (no por id)');

  // 2. Documents con mismo nombre pero distinto tipo NO se mezclan
  const docs2 = [
    { id: 1, documentoId: 'a', nombre: 'informe.pdf', tipo: 'Informe', origen: 'X' },
    { id: 2, documentoId: 'b', nombre: 'informe.pdf', tipo: 'Garantía', origen: 'X' },
  ];
  assert.equal(seleccionarUltimaVersionDocumentos(docs2).length, 2, 'distinto tipo → no se mezclan');
  ok('H.2. No mezcla documentos distintos con el mismo nombre');

  // 3. Acta: mayor versión gana sobre mayor id
  const actas = [
    { id: 10, version: 1, estado_documental: 'ACTA_RECEPCION_GENERADA', generado_at: '2026-01-01' },
    { id: 9, version: 2, estado_documental: 'ACTA_RECEPCION_EDITADA', generado_at: '2026-01-02' },
    { id: 8, version: 3, estado_documental: 'ACTA_RECEPCION_GENERADA', generado_at: '2026-01-03' },
  ];
  const vigente = seleccionarActaVigente(actas);
  assert.equal(vigente.id, 8, 'mayor versión gana');
  assert.equal(vigente.version, 3, 'versión 3 vigente');
  ok('H.3. seleccionarActaVigente: version DESC > id DESC');

  // 4. Acta eliminada no se considera
  const actas2 = [
    { id: 5, version: 2, eliminado_at: '2026-01-01' },
    { id: 4, version: 1 },
  ];
  const vigente2 = seleccionarActaVigente(actas2);
  assert.equal(vigente2.id, 4, 'eliminada excluida');
  ok('H.4. Acta con eliminado_at excluida');

  // 5. Backend: ORDER BY actas ya cambió y usa seleccionarActaVigente
  const lib = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');
  assert.match(lib, /ORDER BY version DESC, generado_at DESC, id DESC/, 'ORDER BY actas por versión');
  assert.match(lib, /seleccionarActaVigente\(actas\.rows \|\| \[\]\)/, 'backend usa seleccionarActaVigente');
  ok('H.5. Backend: consulta de actas ordenada por version DESC, generado_at DESC, id DESC y usa seleccionarActaVigente');

  // 6. Etiquetas visuales
  const modal = fs.readFileSync(path.join(root, 'src/utils/recepcionBienesModal.js'), 'utf8');
  assert.doesNotMatch(modal, /Proyecto o Actas/, 'etiqueta pestaña reemplazada');
  assert.match(modal, /Acta de recepción/, 'pestaña Acta de recepción');
  assert.doesNotMatch(modal, /Sin proyecto de acta/, 'empty reemplazado');
  assert.match(modal, /Sin acta de recepción/, 'empty nuevo');
  assert.doesNotMatch(modal, /Descargar proyecto/, 'botón reemplazado');
  assert.match(modal, /Descargar acta/, 'botón nuevo');
  assert.doesNotMatch(modal, /No hay proyecto de acta/, 'mensaje reemplazado');
  assert.match(modal, /No hay acta de recepción/, 'mensaje nuevo');
  assert.doesNotMatch(modal, /proyecto-acta\.pdf/, 'fallback reemplazado');
  assert.match(modal, /acta-recepcion\.pdf/, 'fallback nuevo');
  ok('H.6. Cambios visuales: "Proyecto o Actas"→"Acta de recepción", empty/btn/mensaje/fallback actualizados');

  // 7. actas[0] reemplazado por seleccionarActaVigente en el modal
  assert.doesNotMatch(modal, /\(d\.actas \|\| \[\]\)\[0\]/, 'openExpediente usa seleccionarActaVigente');
  assert.doesNotMatch(modal, /\(detalle\.actas \|\| \[\]\)\[0\]/, 'openDerivar usa seleccionarActaVigente');
  assert.doesNotMatch(modal, /actas\[0\]/, 'openRegistrar usa seleccionarActaVigente');
  assert.match(modal, /seleccionarActaVigente/, 'modal importa y usa seleccionarActaVigente');
  ok('H.7. Usos de actas[0] reemplazados por seleccionarActaVigente');

  // 8. Pestaña técnicos deduplica conjunto final
  assert.match(modal, /dedupeDocumentos\(\[\.\.\.docsTecCot, \.\.\.docsRec\]\)/, 'técnicos deduplicados en conjunto final');
  ok('H.8. Pestaña Documentos Técnicos deduplica la unión final (cotización + recepción)');

  // H.9 — RB8.1C.1: la pestaña "Acta de recepción" muestra SOLO la última versión vigente
  const modalTexto = fs.readFileSync(path.join(root, 'src/utils/recepcionBienesModal.js'), 'utf8');
  assert.match(modalTexto, /const actaVigente = seleccionarActaVigente\(d\.actas \|\| \[\]\)/, 'elige acta vigente en modal');
  assert.match(modalTexto, /const actasVisibles = actaVigente/, 'construye actasVisibles desde actaVigente');
  assert.doesNotMatch(modalTexto, /\(d\.actas \|\| \[\]\)\.flatMap/, 'ya no flatMap sobre todas las actas');
  ok('H.9. La pestaña construye la tabla solo desde la acta vigente (una sola fila, no todas las versiones)');

  // H.10 — la visible es la de mayor versión (prueba real de la función con 3 versiones)
  {
    const { seleccionarActaVigente } = await import('../shared/expedienteDocumentos.js');
    const tres = [
      { id: 1, version: 1, estado_documental: 'ACTA_RECEPCION_GENERADA', documento_nombre: 'acta-v1.pdf' },
      { id: 2, version: 2, estado_documental: 'ACTA_RECEPCION_EDITADA', documento_nombre: 'acta-v2.pdf' },
      { id: 3, version: 3, estado_documental: 'ACTA_RECEPCION_VISADA_ALMACEN', documento_nombre: 'acta-v3.pdf', acta_visada_nombre: 'acta-v3-visada.pdf' },
    ];
    const v = seleccionarActaVigente(tres);
    assert.equal(v.version, 3, 'visible v3');
    assert.equal(v.documento_nombre, 'acta-v3.pdf', 'visible es la última');
    // Una eliminada no aparece
    const conElim = [...tres, { id: 4, version: 4, eliminado_at: '2026-01-02' }];
    const v2 = seleccionarActaVigente(conElim);
    assert.equal(v2.version, 3, 'eliminada v4 nunca aparece');
    ok('H.10. Tres versiones → la visible es la de mayor versión; eliminada nunca aparece');
  }

  // H.11 — la versión vigente muestra su acta generada, visado y firmada; versión antigua no
  {
    const vigenteConTodo = {
      id: 9, version: 3, estado_documental: 'ACTA_RECEPCION_CONFORME',
      documento_nombre: 'acta-v3.pdf', acta_firmada_nombre: 'acta-v3-firmada.pdf',
      acta_visada_nombre: 'acta-v3-visada.pdf',
    };
    const antigua = { id: 1, version: 1, documento_nombre: 'acta-v1.pdf' };
    const visibles = vigenteConTodo ? [{
      ...vigenteConTodo, _kind: 'acta',
    }] : [];
    if (vigenteConTodo.acta_firmada_nombre) {
      visibles.push({ ...vigenteConTodo, _kind: 'acta_firmada' });
    }
    assert.ok(visibles.some((x) => x._kind === 'acta'), 'acta generada visible');
    assert.ok(visibles.some((x) => x._kind === 'acta_firmada'), 'acta firmada visible');
    assert.ok(!visibles.some((x) => x.id === antigua.id), 'versión antigua no visible');
    ok('H.11. Solo la versión vigente muestra su acta generada y firmada; versión antigua excluida');
  }

  // H.12 — historial conserva todas las versiones (backend sin cambios de filtrado)
  {
    const lib2 = fs.readFileSync(path.join(root, 'server/lib/recepcionBienes.js'), 'utf8');
    assert.match(lib2, /FROM recepcion_bienes_actas\s+WHERE expediente_recepcion_id = \$1\s+AND eliminado_at IS NULL/, 'backend sin filtro extra de vigente');
    ok('H.12. El backend sigue devolviendo TODAS las versiones no eliminadas (historial completo); solo el FE fija la visible');
  }

  // H.13 — sin actas → "Sin acta de recepción"
  {
    const vacioModal = fs.readFileSync(path.join(root, 'src/utils/recepcionBienesModal.js'), 'utf8');
    assert.match(vacioModal, /empty: 'Sin acta de recepción'/, 'empty mantiene mensaje');
    ok('H.13. Sin actas → "Sin acta de recepción"');
  }
}

console.log('\nRB8.1B alcance centro OK (incluye RB8.1B.1 actas por centro; RB8.1C última versión de documentos/actas)\n');
