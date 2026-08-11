/**
 * RC8.13.1 — Observación 49 (Fase 2): separación de bandejas
 * [ Registro de CCP ] [ Registro de Orden ] dentro de Registro de Órdenes.
 *
 * CCP en esta observación = Certificado de Crédito Presupuestal (NO Cuadro
 * Comparativo de Precios). El Cuadro Comparativo sigue viviendo, sin tocar,
 * en src/views/contratacion/cuadroComparativoView.js.
 *
 * IMPORTANTE — Limitación de este entorno: no hay PostgreSQL local disponible,
 * por lo que este script ejercita funciones puras y verifica por inspección de
 * código que la bandeja no duplica backend ni fuente de datos. Antes de cerrar
 * la observación, ejecutar con BD activa:
 *   node scripts/test-rc812-observacion07-registro-ordenes.mjs
 *   node scripts/test-rc8112-etapa-disponible-label.mjs
 * y validar manualmente en el navegador con una orden real BIEN/SERVICIO/LOCACIÓN.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  registroOrdenesMenuItems, splitMenuItemsPorBandeja, getOrdenEdicionAcciones,
} from '../src/utils/ordenesUtils.js';
import { resolveOrdenPlazoContractual } from '../shared/ordenCronogramaContractual.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.13.1 — Observación 49 · Registro de CCP / Registro de Orden ===\n');

const srcView = read('src/views/contratacion/registroOrdenesView.js');
const srcCcpView = read('src/views/contratacion/ccpView.js');
const srcCuadro = read('src/views/contratacion/cuadroComparativoView.js');
const srcOrdenesLib = read('server/lib/ordenesContratacion.js');
const srcUtils = read('src/utils/ordenesUtils.js');

// ---------------------------------------------------------------------------
console.log('-- 1. Existen los dos tabs --');
ok(/data-tab="\$\{TAB_CCP\}"/.test(srcView) && /data-tab="\$\{TAB_ORDEN\}"/.test(srcView),
  '1.1: registroOrdenesView.js define tabs con data-tab=${TAB_CCP} y data-tab=${TAB_ORDEN}');
ok(/const TAB_CCP = 'ccp'/.test(srcView) && /const TAB_ORDEN = 'orden'/.test(srcView),
  '1.1b: TAB_CCP resuelve a "ccp" y TAB_ORDEN a "orden"');
ok(/id="roTabs"/.test(srcView), '1.2: contenedor de tabs #roTabs presente (patrón invitacionesView.js)');
ok(/registro-de-ordenes|Registro de Órdenes/.test(srcView) && /Registro de CCP/.test(srcView)
  && /Registro de Orden/.test(srcView),
  '1.3: etiquetas visibles "Registro de CCP" / "Registro de Orden"');

// ---------------------------------------------------------------------------
console.log('\n-- 2. CCP = Certificado de Crédito Presupuestal (no Cuadro Comparativo) --');
ok(/CCP.*Certificaci[oó]n|Certificado de Cr[eé]dito Presupuestal/i.test(srcCcpView),
  '2.1: ccpView.js sigue siendo el módulo de Certificado de Crédito Presupuestal (sin renombrar)');
ok(/Cuadro Comparativo/i.test(srcCuadro),
  '2.2: cuadroComparativoView.js sigue siendo el módulo de Cuadro Comparativo, no fusionado con Registro de Órdenes');
ok(!/cuadroComparativoView|contratacionesService/.test(srcView),
  '2.3: registroOrdenesView.js NO importa el módulo de Cuadro Comparativo ni su servicio (no se mezclan conceptos)');

// ---------------------------------------------------------------------------
console.log('\n-- 3. Columnas Tab 1 — Registro de CCP --');
const ccpColsBlock = srcView.slice(srcView.indexOf('CCP_COLS'), srcView.indexOf('ORDEN_COLS'));
['CCP', 'firmado', 'Requerimiento', 'SIGAMEF', 'Descripción', 'Estado', 'Responsable', 'Acciones']
  .forEach((token) => ok(new RegExp(token).test(ccpColsBlock), `3.x: columna/campo "${token}" presente en CCP_COLS`));

// ---------------------------------------------------------------------------
console.log('\n-- 4. Columnas Tab 2 — Registro de Orden --');
const ordenColsBlock = srcView.slice(srcView.indexOf('ORDEN_COLS'), srcView.indexOf('function currentColsDef'));
['Orden', 'orden', 'proveedor', 'proveedor', 'Monto total', 'entregables', 'Plazo total', 'notificaci', 'Estado', 'Responsable', 'Acciones']
  .forEach((token) => ok(new RegExp(token).test(ordenColsBlock), `4.x: columna/campo "${token}" presente en ORDEN_COLS`));

// ---------------------------------------------------------------------------
console.log('\n-- 5/6. Fuente canónica única — sin backend/segunda fuente duplicada --');
ok(/ordenesContratacionService\.listBandeja/.test(srcView),
  '5.1: registroOrdenesView.js sigue consumiendo ordenesContratacionService.listBandeja (única fuente)');
const listBandejaCalls = (srcView.match(/ordenesContratacionService\.listBandeja\(/g) || []).length;
ok(listBandejaCalls === 1,
  `5.2: listBandeja() se invoca una sola vez en el archivo (${listBandejaCalls}) — ambos tabs reutilizan el mismo rowsCache, no hacen fetch propio`);
ok(!/fetch\(|new URL\(.*bandeja-ccp|\/ccp-bandeja/.test(srcView),
  '6.1: no se agregó un endpoint/URL paralelo para la bandeja de CCP');
ok(/router\.get\('\/bandeja'/.test(read('server/routes/ordenesContratacion.js')),
  '6.2: GET /bandeja sigue siendo el único endpoint de listado en server/routes/ordenesContratacion.js');

// ---------------------------------------------------------------------------
console.log('\n-- 7. Acciones se conservan (reutilizando registroOrdenesMenuItems) --');
const rowPrepSinFirmar = { estado: 'REGISTRO_ORDENES', tipo_contratacion: 'BIEN', codigo_ccp: 'CCP-001' };
const itemsPrep = registroOrdenesMenuItems(rowPrepSinFirmar, { canManage: true });
const { ccp: ccpActs, orden: ordenActs } = splitMenuItemsPorBandeja(itemsPrep);
ok(ccpActs.some((a) => a.act === 'adjuntarCcpFirmado'), '7.1: Tab CCP conserva "Adjuntar CCP firmado"');
ok(ccpActs.some((a) => a.act === 'editarCcp'), '7.2: Tab CCP expone "Editar CCP" (reutiliza openCcpCodigoModal existente)');
ok(ccpActs.some((a) => a.act === 'verHistorial'), '7.3: Tab CCP conserva "Ver trazabilidad" (verHistorial)');
ok(ordenActs.some((a) => a.act === 'registrarOrden'), '7.4: Tab Orden conserva "Registrar orden"');
ok(!ordenActs.some((a) => a.act === 'adjuntarCcpFirmado' || a.act === 'editarCcp'),
  '7.5: Tab Orden NO repite las acciones exclusivas de CCP (sin duplicar el mismo botón en ambos tabs)');
ok(/openCcpCodigoModal/.test(srcView) && /ccpCodigoModal\.js/.test(srcView),
  '7.6: "Editar CCP" reutiliza el modal existente src/utils/ccpCodigoModal.js (no crea uno nuevo)');

// RC8.13.2 Obs.50 reemplazó la regla original: "Editar CCP" ya no queda siempre
// deshabilitado — ver scripts/test-rc8132-observacion50-registro-ordenes.mjs (sección B)
// para la regla controlada vigente (editable hasta antes de notificar la orden).
const editarCcpItem = ccpActs.find((a) => a.act === 'editarCcp');
ok(editarCcpItem?.disabled === false,
  '7.7: "Editar CCP" está presente y habilitado cuando hay código CCP (regla controlada RC8.13.2 Obs.50)');

const rowFirmada = { estado: 'ORDEN_NOTIFICADA', orden_id: 9, tipo_contratacion: 'SERVICIO' };
const itemsFirmada = registroOrdenesMenuItems(rowFirmada, { canManage: true });
ok(itemsFirmada.some((a) => a.act === 'verExpediente') && itemsFirmada.some((a) => a.act === 'verHistorial'),
  '7.8: estados posteriores (orden notificada) siguen ofreciendo Ver expediente / Ver historial en ambos tabs');

// ---------------------------------------------------------------------------
console.log('\n-- 8. Cantidad de entregables = COUNT(orden_entregas), no orden_entrega_items --');
ok(/row\.entregas_count = fmt\.count/.test(srcOrdenesLib),
  '8.1: entregas_count proviene de formatEntregasBandejaLabel(list).count, no de un JOIN con orden_entrega_items');
ok(/FROM orden_entregas\s+WHERE orden_id = ANY/.test(srcOrdenesLib),
  '8.2: la consulta que alimenta ese conteo es sobre orden_entregas (real), no orden_entrega_items');
ok(!/orden_entrega_items[\s\S]{0,80}entregas_count/.test(srcOrdenesLib),
  '8.3: no se calcula entregas_count a partir de orden_entrega_items (evita el "2 → 4")');
ok(/row\.entregas_count/.test(srcView) && /Cant\.<br>entregables/.test(srcView),
  '8.4: la columna "Cantidad entregables" del Tab Orden usa row.entregas_count');

// ---------------------------------------------------------------------------
console.log('\n-- 9. Plazo total orden = regla contractual RC8.12 (máximo, no suma) --');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 30 }, { dias_plazo: 60 }]) === 60,
  '9.1: E1=30 / E2=60 → plazo total = 60 (no 90, no 30)');
ok(/row\.plazo_total_orden = resolveOrdenPlazoContractual\(list\)/.test(srcOrdenesLib),
  '9.2: server/lib/ordenesContratacion.js calcula plazo_total_orden reutilizando resolveOrdenPlazoContractual (RC8.12), no una regla nueva');
ok(/row\.plazo_total_orden_label/.test(srcView),
  '9.3: la columna "Plazo total orden" del Tab Orden usa row.plazo_total_orden_label');

// ---------------------------------------------------------------------------
console.log('\n-- 10. BIEN / SERVICIO / LOCACIÓN sin regresión estructural --');
['BIEN', 'SERVICIO', 'LOCACION'].forEach((tipo) => {
  const row = { estado: 'REGISTRO_ORDENES', tipo_contratacion: tipo, codigo_ccp: 'CCP-XX' };
  const items = registroOrdenesMenuItems(row, { canManage: true });
  const split = splitMenuItemsPorBandeja(items);
  ok(split.ccp.length > 0 && split.orden.length > 0,
    `10.x: tipo_contratacion=${tipo} produce acciones no vacías en ambos tabs (sin hardcode de tipo)`);
});
ok(!/tipo_contratacion === 'BIEN'|tipo_contratacion === 'SERVICIO'|tipo_contratacion === 'LOCACION'/.test(srcView),
  '10.4: registroOrdenesView.js no hardcodea el tipo de contratación (delega en registroOrdenesMenuItems/esServicioTipo)');

// Regresión RC8.12 — getOrdenEdicionAcciones sigue funcionando sin cambios de contrato.
const accionesPrep = getOrdenEdicionAcciones(
  { estado: 'REGISTRO_ORDENES', orden_id: 55, ccp_firmado_id: 9, tipo_contratacion: 'BIEN' },
  { canManage: true },
);
ok(accionesPrep.some((a) => a.act === 'editarOrden'),
  '10.5: getOrdenEdicionAcciones (RC8.12) sigue exponiendo "Editar orden" en preparación — sin regresión');

console.log('\n=== RC8.13.1 Observación 49 — funciones puras + inspección de código OK ===');
console.log('Recordatorio: validar manualmente en navegador (dec/registro-ordenes) con datos reales antes de cerrar la observación.\n');
