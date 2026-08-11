/**
 * RC8.13.2 — Observación 50 (corrección integral Registro de CCP / Registro de Orden /
 * Ver expediente / Entregables), sobre la base de RC8.12 + RC8.13.1 (Obs.49).
 *
 * IMPORTANTE — Limitación de este entorno: no hay PostgreSQL local disponible, por lo
 * que este script ejercita funciones puras y verifica por inspección de código los
 * cambios que requieren BD (assertCcpEditableDesdeOrden, resolverLugarEntrega,
 * sincronizarPreciosItemsDesdeCuadro). Antes de cerrar la observación, validar con BD
 * activa: editar un CCP en preparación vs. ya notificado, un lugar de entrega con y sin
 * datos geográficos, y un cronograma de 2 entregables reales guardado desde la UI.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  registroOrdenesMenuItems, splitMenuItemsPorBandeja, getOrdenEdicionAcciones,
} from '../src/utils/ordenesUtils.js';
import {
  resolveOrdenPlazoContractual, resolveOrdenEntregaItemLinea,
} from '../shared/ordenCronogramaContractual.js';
import { getOrdenChecklistRules, evaluarDistribucion } from '../shared/expedienteChecklist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.13.2 — Observación 50 · Registro de CCP / Orden / Expediente / Entregables ===\n');

const srcView = read('src/views/contratacion/registroOrdenesView.js');
const srcUtils = read('src/utils/ordenesUtils.js');
const srcCcpCert = read('server/lib/ccpCertificacion.js');
const srcOrdenesLib = read('server/lib/ordenesContratacion.js');
const srcEntregasModal = read('src/utils/registroOrdenEntregasModal.js');
const srcExpModal = read('src/utils/registroOrdenExpedienteModal.js');
const srcOrdenModal = read('src/utils/registroOrdenModal.js');

// ---------------------------------------------------------------------------
console.log('-- A. UI bandejas (Registro de CCP / Registro de Orden) --');
const cssBlock = srcView.slice(srcView.indexOf('const RO_BANDEJA_CSS'), srcView.indexOf('export function renderRegistroOrdenesView'));
const theadBlock = cssBlock.slice(cssBlock.indexOf('thead th'), cssBlock.indexOf('tbody td'));
const tbodyBlock = cssBlock.slice(cssBlock.indexOf('tbody td'), cssBlock.indexOf('.ro-wrap'));
ok(/text-align:\s*center/.test(theadBlock), 'A1: encabezados centrados (thead th text-align:center)');
ok(/text-align:\s*center/.test(tbodyBlock), 'A2: valores centrados (tbody td text-align:center)');
ok(/font-family:\s*Arial/.test(cssBlock) && /font-size:\s*9px/.test(cssBlock),
  'A3: Arial 9px aplicado en la tabla de Registro de Órdenes');
ok(cssBlock.includes('#${VIEW_ID}'),
  'A4: el CSS está scoped al contenedor de Registro de Órdenes (template ${VIEW_ID}, no global)');

// ---------------------------------------------------------------------------
console.log('\n-- B. Editar CCP — regla controlada --');
const rowPrep = { estado: 'REGISTRO_ORDENES', tipo_contratacion: 'SERVICIO', codigo_ccp: 'CCP-100' };
const itemsPrep = registroOrdenesMenuItems(rowPrep, { canManage: true });
const editarCcpPrep = splitMenuItemsPorBandeja(itemsPrep).ccp.find((a) => a.act === 'editarCcp');
ok(editarCcpPrep && editarCcpPrep.disabled === false,
  'B1: "Editar CCP" está HABILITADO en preparación (antes de notificar) cuando existe código CCP');

const rowSinCodigo = { estado: 'REGISTRO_ORDENES', tipo_contratacion: 'BIEN', codigo_ccp: '' };
const editarCcpSinCodigo = splitMenuItemsPorBandeja(
  registroOrdenesMenuItems(rowSinCodigo, { canManage: true }),
).ccp.find((a) => a.act === 'editarCcp');
ok(editarCcpSinCodigo && editarCcpSinCodigo.disabled === true,
  'B2: "Editar CCP" sigue deshabilitado si no hay código CCP registrado (protección intacta)');

const rowNotificada = { estado: 'ORDEN_NOTIFICADA', orden_id: 9, tipo_contratacion: 'SERVICIO', codigo_ccp: 'CCP-100' };
const itemsNotificada = registroOrdenesMenuItems(rowNotificada, { canManage: true });
ok(!itemsNotificada.some((a) => a.act === 'editarCcp'),
  'B3: en ORDEN_NOTIFICADA (o posterior) "Editar CCP" ni siquiera aparece en el menú — bloqueado por diseño');

ok(/assertCcpEditableDesdeOrden/.test(srcCcpCert) && /ESTADOS_CCP_EDITABLE_EN_ORDEN/.test(srcCcpCert),
  'B4: existe la regla controlada assertCcpEditableDesdeOrden en server/lib/ccpCertificacion.js');
ok(/await assertCcpEditableDesdeOrden\(id\);/.test(srcCcpCert),
  'B5: editarCodigoCcp usa la regla controlada (no assertTramiteCcpOperativo, más estricta)');
ok(
  (srcCcpCert.match(/await assertTramiteCcpOperativo\(id\);/g) || []).length === 2,
  'B6: registrarCodigoCcp y anularCodigoCcp SIGUEN usando assertTramiteCcpOperativo sin cambios — protección original no eliminada, solo acotada para editar',
);
ok(/ORDEN_NOTIFICADA en adelante/.test(srcCcpCert) || /notificada al proveedor/.test(srcCcpCert),
  'B7: la regla documenta explícitamente hasta qué estado se puede editar (antes de notificar al proveedor)');

// ---------------------------------------------------------------------------
console.log('\n-- C. Lugar de entrega — prioridad geográfica sobre centro --');
const fnSrc = srcOrdenesLib.slice(
  srcOrdenesLib.indexOf('function formatLugarDesdeItem'),
  srcOrdenesLib.indexOf('export async function getDetalleOrden'),
);
ok(/centroFallback = \{ lugar: centros\.join/.test(fnSrc),
  'C1: el centro organizacional se guarda como candidato de reserva (centroFallback), no se retorna de inmediato');
ok(/return centroFallback;/.test(fnSrc),
  'C2: centroFallback solo se retorna al final, tras intentar cotización y requerimiento/TDR');
const ordenCentro = fnSrc.indexOf('if (proveedorId)');
const ordenCentroFallback = fnSrc.indexOf('centroFallback = {');
ok(ordenCentroFallback > -1 && ordenCentro > ordenCentroFallback,
  'C3: la cotización del proveedor (paso 3) se evalúa DESPUÉS de capturar el fallback de centro, nunca antes');
ok(/formatLugarDesdeItem\(it\)\)\.filter\(Boolean\)/.test(fnSrc),
  'C4: la extracción de región/provincia/distrito ya no mezcla centro_nombre en el mismo paso (formatLugarDesdeItem puro)');
ok(/return \{ lugar: null, fuente: null \};/.test(fnSrc),
  'C5: sin ninguna fuente (ni siquiera centro), sigue devolviendo null explícito — no inventa un valor');

// ---------------------------------------------------------------------------
console.log('\n-- D. Pestaña Ítem — sin duplicación --');
const itTab = srcExpModal.slice(srcExpModal.indexOf('id="roExpIt"'), srcExpModal.indexOf('id="roExpEnt"'));
ok(/\(data\.items \|\| \[\]\)\.map/.test(itTab),
  'D1: la pestaña Ítem itera data.items (una fila por ítem real de orden_items)');
ok(!/item_entregas|combos|expandItemEntregaCombinaciones/.test(itTab),
  'D2: la pestaña Ítem NO usa combinaciones ítem×entrega ni item_entregas');
['Código SIGAMEF', 'Descripción', 'U.M.', 'Cant.', 'P.U.', 'Total', 'Específica', 'Centro', 'Centro de costo', 'Pedido SIGAMEF']
  .forEach((col) => ok(itTab.includes(col), `D3: columna "${col}" presente en la pestaña Ítem`));

// ---------------------------------------------------------------------------
console.log('\n-- E. Pestaña Entregas — exactamente N filas + totalizador en tabla --');
const entTab = srcExpModal.slice(srcExpModal.indexOf('id="roExpEnt"'), srcExpModal.indexOf('id="roExpDoc"'));
ok(/entregasTab\.length/.test(entTab) && /entregasTab\.map/.test(entTab),
  'E1: la pestaña Entregas del expediente itera data.entregas (una fila por orden_entregas real)');
ok(!/item_entregas/.test(entTab),
  'E2: la pestaña Entregas ya NO consume item_entregas (combinaciones ítem×entrega)');
ok(/const entregasTab = data\.entregas \|\| \[\];/.test(srcExpModal),
  'E3: entregasTab se declara explícitamente como data.entregas, no como combos');
ok(/expandItemEntregaCombinaciones/.test(srcOrdenesLib),
  'E4: expandItemEntregaCombinaciones NO se eliminó del backend (sigue existiendo, sin tocar su lógica)');
ok(/item_entregas: combinaciones/.test(srcOrdenesLib),
  'E5: getExpedienteOrdenCompleto sigue devolviendo item_entregas por compatibilidad (no se rompió el contrato del backend)');

ok(!/id="roResumenDist"/.test(srcEntregasModal),
  'E6: #roResumenDist fue eliminado del markup de "Configurar entregables" (no hay resumen inferior separado)');
ok(!/fw-semibold mb-1 small">Resumen de distribución/.test(srcEntregasModal),
  'E7: ya no se renderiza el título "Resumen de distribución" como HTML del modal');
ok(/id="roEntregasFoot"/.test(srcEntregasModal) && /<tfoot id="roEntregasFoot">/.test(srcEntregasModal),
  'E8: existe un <tfoot id="roEntregasFoot"> dentro de la misma tabla de Entregables');
ok(/footEl\.innerHTML = `<tr class="fw-semibold">/.test(srcEntregasModal) && /TOTAL/.test(srcEntregasModal),
  'E9: el totalizador TOTAL se pinta dentro del tfoot de la tabla (no en un bloque aparte)');
ok(/function calcTotales\(\)/.test(srcEntregasModal) && /function buildChecklist\(\)/.test(srcEntregasModal)
  && /function renderChecklist\(\)/.test(srcEntregasModal),
  'E10: calcTotales/buildChecklist/renderChecklist se preservaron (cálculo de negocio intacto)');
ok(/renderChecklist\(\);\s*\}\s*$/m.test(srcEntregasModal.slice(srcEntregasModal.indexOf('function renderResumen'), srcEntregasModal.indexOf('function renderResumen') + 700)),
  'E11: renderResumen sigue invocando renderChecklist() tras pintar el totalizador (cronogramaValido no se pierde)');

// ---------------------------------------------------------------------------
console.log('\n-- F. Configurar entregables --');
ok(/'Ítem', 'Cantidad', 'Precio unitario', 'Precio total', 'Tipo de entrega', 'Entrega',/.test(srcEntregasModal),
  'F1: COL_HEADERS conserva ítem/cantidad/PU/total/tipo/entrega');
ok(/'Plazo ofertado por el proveedor', 'Plazo aplicable', 'Inicio de actividad',/.test(srcEntregasModal),
  'F2: COL_HEADERS conserva plazo ofertado/aplicable/inicio de actividad');
ok(/'Fecha del evento', 'Fecha efectiva de inicio', 'Fecha máxima de entrega',/.test(srcEntregasModal),
  'F3: COL_HEADERS conserva fecha del evento/efectiva/máxima');
ok(/'Lugar de entrega', 'Acciones',/.test(srcEntregasModal),
  'F4: COL_HEADERS conserva lugar de entrega y acciones');
ok(/needsManual\(e\.condicion_inicio\)[\s\S]{0,80}ro-ini-manual/.test(srcEntregasModal),
  'F5: la fecha del evento es editable (input) cuando la condición de inicio lo exige (needsManual)');
ok(/ro-cant[\s\S]{0,160}\$\{e\.correlativo === 'UNICO' \? 'readonly' : ''\}/.test(srcEntregasModal),
  'F6: la cantidad es editable salvo en el caso ÚNICO (N=1), donde no aplica distribución');
ok(/class="form-control form-control-sm ro-lugar"/.test(srcEntregasModal),
  'F7: el lugar de entrega es editable por fila (input .ro-lugar)');

// ---------------------------------------------------------------------------
console.log('\n-- G. Adjuntar orden firmada --');
ok(/const saved = resp\?\.data \|\| resp;/.test(srcOrdenModal) && /saved\?\.documento\?\.id/.test(srcOrdenModal),
  'G1: el modal valida que el backend confirme el id del documento persistido antes de continuar');
ok(/El servidor no confirmó el guardado del documento/.test(srcOrdenModal),
  'G2: si la confirmación falla, se muestra error explícito');
const adjuntarBlock = srcOrdenModal.slice(
  srcOrdenModal.indexOf('#roOrdPdfSave\').onclick'),
  srcOrdenModal.indexOf('#roOrdPdfSave\').onclick') + 1400,
);
const idxThrow = adjuntarBlock.indexOf('El servidor no confirmó');
const idxOnDone = adjuntarBlock.indexOf('onDone?.()');
ok(idxThrow > -1 && idxOnDone > -1 && idxThrow < idxOnDone,
  'G3: la validación de persistencia ocurre ANTES de cerrar el modal y llamar onDone (abrir Validación del expediente)');

// ---------------------------------------------------------------------------
console.log('\n-- H. Checklist / Notificar proveedor --');
const rulesServicio = getOrdenChecklistRules('SERVICIO');
ok(!rulesServicio.some((r) => r.id === 'cantidades'),
  'H1: LOCACION/SERVICIO siguen sin exigir "Cantidades distribuidas" (RC8.10.4, sin regresión)');
const rulesBien = getOrdenChecklistRules('BIEN');
ok(rulesBien.some((r) => r.id === 'cantidades'),
  'H2: BIEN sigue exigiendo "Cantidades distribuidas" (sin regresión)');

ok(/precio_total = ROUND\(\(ei\.precio_total \* \$2::numeric \/ \$3::numeric\), 2\)/.test(srcOrdenesLib)
  && /precio_unitario = ROUND\(\(ei\.precio_unitario \* \$2::numeric \/ \$3::numeric\), 4\)/.test(srcOrdenesLib),
  'H3: sincronizarPreciosItemsDesdeCuadro reescala proporcionalmente (× nuevo_pu/pu_anterior) en vez de recalcular cantidad×PU completo');
ok(/COUNT\(\*\) FROM orden_entregas e2 WHERE e2\.orden_id = \$3 AND e2\.estado <> 'ANULADO'\) = 1/.test(srcOrdenesLib),
  'H4: el recálculo directo cantidad×PU completo solo se permite cuando hay una única entrega activa (N=1, caso BIEN típico)');

// Reproduce en JS puro el bug corregido: N=2 entregas, cantidad completa repetida por
// línea (comportamiento de creación RC8.12), PU dividido — la suma YA reconciliaba
// correctamente antes de tocar sincronizarPreciosItemsDesdeCuadro; se verifica que
// sigue así (ver D1/D2 de test-rc812-observacion07-registro-ordenes.mjs).
const itemDup = { cantidad: 1, precio_unitario: 14000, precio_total: 14000 };
const l1 = resolveOrdenEntregaItemLinea(itemDup, 2);
const l2 = resolveOrdenEntregaItemLinea(itemDup, 2);
const snapshotOk = evaluarDistribucion({
  tipo: 'servicio',
  monto_total: 14000,
  entregas_count: 2,
  items: [{ id: 1, cantidad: 1, precio_unitario: 14000, precio_total: 14000 }],
  entrega_items: [
    { orden_item_id: 1, cantidad: 1, precio_total: l1.precio_total },
    { orden_item_id: 1, cantidad: 1, precio_total: l2.precio_total },
  ],
});
ok(snapshotOk.importes_ok === true,
  'H5: con PU/Total divididos correctamente (RC8.12) entre 2 entregables, "Importes validados" reconcilia (no falla por diseño)');
// Simula EXACTAMENTE el bug que corrige H3/H4: cantidad completa recalculada contra
// el PU COMPLETO en cada línea (comportamiento previo del cascade de sincronización).
const snapshotBug = evaluarDistribucion({
  tipo: 'servicio',
  monto_total: 14000,
  entregas_count: 2,
  items: [{ id: 1, cantidad: 1, precio_unitario: 14000, precio_total: 14000 }],
  entrega_items: [
    { orden_item_id: 1, cantidad: 1, precio_total: 14000 },
    { orden_item_id: 1, cantidad: 1, precio_total: 14000 },
  ],
});
ok(snapshotBug.importes_ok === false,
  'H6: se confirma que el patrón corregido (cantidad×PU completo por línea, N=2) SÍ produce el error reportado — validando el diagnóstico');

// ---------------------------------------------------------------------------
console.log('\n-- I. Regresión RC8.12 / RC8.13.1 / BIEN-SERVICIO-LOCACIÓN --');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 30 }, { dias_plazo: 60 }]) === 60,
  'I1: resolveOrdenPlazoContractual (RC8.12) sin regresión — sigue devolviendo el máximo');
const accionesPrep = getOrdenEdicionAcciones(
  { estado: 'REGISTRO_ORDENES', orden_id: 55, ccp_firmado_id: 9, tipo_contratacion: 'BIEN' },
  { canManage: true },
);
ok(accionesPrep.some((a) => a.act === 'editarOrden'),
  'I2: getOrdenEdicionAcciones (RC8.12) sigue exponiendo "Editar orden" en preparación');
['BIEN', 'SERVICIO', 'LOCACION'].forEach((tipo) => {
  const row = { estado: 'REGISTRO_ORDENES', tipo_contratacion: tipo, codigo_ccp: 'CCP-XX' };
  const split = splitMenuItemsPorBandeja(registroOrdenesMenuItems(row, { canManage: true }));
  ok(split.ccp.length > 0 && split.orden.length > 0,
    `I3.${tipo}: tabs CCP/Orden siguen produciendo acciones no vacías para tipo_contratacion=${tipo}`);
});
ok(/ordenesContratacionService\.listBandeja\(/.test(srcView)
  && (srcView.match(/ordenesContratacionService\.listBandeja\(/g) || []).length === 1,
  'I4: sigue existiendo una única fuente GET /bandeja (RC8.13.1 no se rompió)');
ok(/data-tab="\$\{TAB_CCP\}"/.test(srcView) && /data-tab="\$\{TAB_ORDEN\}"/.test(srcView),
  'I5: los tabs Registro de CCP / Registro de Orden (RC8.13.1) siguen presentes');
ok(!/recepcionBienes\.js/.test(srcExpModal.match(/import.*from.*/g)?.join('') || ''),
  'I6: registroOrdenExpedienteModal.js no importa/depende de recepcionBienes.js (no se tocó Recepción de Bienes)');

console.log('\n=== RC8.13.2 Observación 50 — funciones puras + inspección de código OK ===');
console.log('Recordatorio: validar manualmente en navegador (dec/registro-ordenes) con BD activa antes de cerrar la observación —');
console.log('en particular: editar CCP en preparación vs. notificada, lugar de entrega con datos geográficos reales,');
console.log('y guardar un cronograma de 2 entregables reales verificando que el checklist de importes quede en verde.\n');
