/**
 * RC8.12 — Corrección integral Observación 07 (Registro de Órdenes → Ver expediente).
 *
 * Cubre, con datos sintéticos (sin depender de BD), las reglas generales corregidas:
 *   A. Ítems ≠ Entregable — extractItemsDesdePropuestaEconomica agrega un solo ítem.
 *   B. Plazo de entrega del resumen = máximo entre entregables (no el primero, no la suma).
 *   C. Fecha efectiva de inicio no se enmascara por un evento_inicio_plazo no-canónico.
 *   D. Importes de entregables: cantidad × PU = Total en cada línea, suma = total del ítem.
 *   E. Documentos: plantillas de invitación no se confunden con documentos presentados.
 *   F. Regresión: BIEN / caso de una sola entrega no cambia.
 *
 * IMPORTANTE — Limitación de este entorno: no hay PostgreSQL local disponible aquí, por lo
 * que este script solo ejercita funciones puras (sin `query()`/BD). Antes de cerrar la
 * Observación 07, ejecutar en un entorno con BD activa:
 *   node scripts/test-rc8105-entregables-registro-ordenes.mjs
 *   node scripts/test-rc811-bootstrap-canonico.mjs
 *   node scripts/test-rc8111-apply-controlado.mjs
 *   node scripts/test-rc8112-etapa-disponible-label.mjs
 *   node scripts/test-observacion45-locacion-registro-ordenes.mjs   (incluye BD)
 * y validar contra una orden real de SERVICIO/LOCACIÓN con N entregables que:
 *   - "Ítems" muestre una sola fila por ítem real;
 *   - "Entregas" muestre exactamente N filas, sin duplicados físicos en orden_entrega_items;
 *   - "Documentos" no incluya plantillas de invitación.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractItemsDesdePropuestaEconomica } from '../server/lib/ordenesContratacion.js';
import {
  resolveOrdenPlazoContractual,
  resolveOrdenCronogramaContractual,
  resolveOrdenEntregaItemLinea,
  normalizeCondicionInicio,
} from '../shared/ordenCronogramaContractual.js';
import { buildDocumentosConvocatoria, resolveAdjuntosPlantillaInvitacion } from '../server/lib/portalDocumentos.js';
import { registroOrdenesMenuItems, getOrdenEdicionAcciones } from '../src/utils/ordenesUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.12 — Observación 07 · Registro de Órdenes / Ver expediente ===\n');

// ---------------------------------------------------------------------------
console.log('-- A. Ítems ≠ Entregable --');

const casoA2 = extractItemsDesdePropuestaEconomica({
  monto: 14000,
  precio_total: 14000,
  entregables_cotizados: [
    { nombre: 'Primer entregable', precio: 7000, cantidad: 1 },
    { nombre: 'Segundo entregable', precio: 7000, cantidad: 1 },
  ],
}, { denominacion: 'Servicio de mantenimiento X' });
ok(casoA2.length === 1, 'A1: 2 entregables cotizados → 1 solo ítem agregado (no 2)');
ok(casoA2[0].precio_total === 14000 && casoA2[0].precio_unitario === 14000,
  'A2: el ítem agregado conserva el monto total (14000), sin dividir');
ok(casoA2[0].descripcion === 'Servicio de mantenimiento X',
  'A3: la descripción es la denominación real del servicio, no la del entregable');
ok(casoA2[0].cantidad === 1, 'A4: cantidad del ítem agregado = 1 (unidad de servicio)');

// Generaliza a N=3 (no hardcode a 2 entregables)
const casoA3 = extractItemsDesdePropuestaEconomica({
  entregables_cotizados: [
    { nombre: 'E1', precio: 5000, cantidad: 1 },
    { nombre: 'E2', precio: 5000, cantidad: 1 },
    { nombre: 'E3', precio: 4000, cantidad: 1 },
  ],
}, { denominacion: 'Servicio Y' });
ok(casoA3.length === 1 && casoA3[0].precio_total === 14000,
  'A5: N=3 entregables → 1 ítem agregado con la suma exacta (14000)');

// Cuando SÍ existe una lista real de ítems, se preserva sin cambios (no se agrega).
const casoAReal = extractItemsDesdePropuestaEconomica({
  items: [
    { descripcion: 'Ítem real 1', cantidad: 2, precio_unitario: 100 },
    { descripcion: 'Ítem real 2', cantidad: 1, precio_unitario: 500 },
  ],
});
ok(casoAReal.length === 2, 'A6: con eco.items real, se preservan los ítems tal cual (no se agregan)');

// ---------------------------------------------------------------------------
console.log('\n-- B. Plazo de entrega = máximo entre entregables --');

ok(resolveOrdenPlazoContractual([{ dias_plazo: 30 }, { dias_plazo: 60 }]) === 60,
  'B1: 30/60 → 60 (no 30 del primero, no 90 de la suma)');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 60 }, { dias_plazo: 30 }]) === 60,
  'B2: orden invertido (60/30) → sigue siendo 60 (no depende del orden de filas)');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 10 }, { dias_plazo: 20 }, { dias_plazo: 15 }]) === 20,
  'B3: generaliza a N=3 entregables → toma el máximo (20)');
ok(resolveOrdenPlazoContractual([{ dias_plazo: 45 }]) === 45,
  'B4: 1 sola entrega (caso BIEN típico) → su propio plazo, sin cambios');
ok(resolveOrdenPlazoContractual([]) === null, 'B5: sin entregas → null (no inventa un plazo)');

// ---------------------------------------------------------------------------
console.log('\n-- C. Fecha efectiva de inicio no se enmascara --');

const ordenNotif = { fecha_orden: '2026-01-01', condicion_inicio: 'DIA_SIGUIENTE_NOTIFICACION' };
const entregaConPlaceholder = { evento_inicio_plazo: 'INICIO_PLAZO_FECHA_ORDEN', dias_plazo: 30 };
const envios = [{ estado: 'ENVIADO', enviado_at: '2026-01-05T10:00:00Z' }];

const cronConNotif = resolveOrdenCronogramaContractual(ordenNotif, entregaConPlaceholder, { envios, totalEntregas: 1 });
ok(cronConNotif.condicionInicio === 'DIA_SIGUIENTE_NOTIFICACION',
  'C1: un evento_inicio_plazo no-canónico en la entrega no enmascara la regla real de la orden');
ok(cronConNotif.fechaEfectiva === '2026-01-06',
  'C2: con notificación presente, calcula fecha efectiva (día siguiente), no default a EMISION_ORDEN');

const cronSinNotif = resolveOrdenCronogramaContractual(ordenNotif, entregaConPlaceholder, { envios: [], totalEntregas: 1 });
ok(cronSinNotif.condicionInicio === 'DIA_SIGUIENTE_NOTIFICACION',
  'C3: sin notificación, la condición sigue resolviendo correctamente (no cae a EMISION_ORDEN)');
ok(cronSinNotif.fechaEfectiva == null && !!cronSinNotif.pendienteMotivo,
  'C4: sin notificación, permanece "Pendiente" con motivo explícito (no inventa una fecha)');

ok(normalizeCondicionInicio('INICIO_PLAZO_FECHA_ORDEN') === null,
  'C5: el placeholder legacy sigue sin normalizar a ningún código canónico (confirma la causa raíz)');

// ---------------------------------------------------------------------------
console.log('\n-- D. Importes de entregables consistentes --');

const itemReal = { cantidad: 1, precio_unitario: 14000, precio_total: 14000 };
const linea1 = resolveOrdenEntregaItemLinea(itemReal, 2);
ok(linea1.precio_unitario === 7000 && linea1.precio_total === 7000,
  'D1: con 2 entregables, cada línea queda en PU=7000 = Total=7000 (no PU=7000/Total=3500)');
ok(Number((linea1.precio_total * 2).toFixed(2)) === 14000,
  'D2: la suma de Total entre los 2 entregables reconstruye el total real del ítem (14000)');

// N que no divide exacto (14000/3, 14000/4, 14000/5) puede dejar un redondeo de
// centésimas por línea — se tolera hasta 1 centavo por línea (N × 0.01), nunca más.
const lineasN = [3, 4, 5].map((n) => resolveOrdenEntregaItemLinea(itemReal, n));
lineasN.forEach((l, i) => {
  const n = i + 3;
  const diff = Math.abs(Number((l.precio_total * n).toFixed(2)) - 14000);
  ok(diff <= 0.01 * n, `D3: generaliza a N=${n} entregables → suma dentro de redondeo aceptable (diff=${diff.toFixed(2)})`);
});

const lineaUnica = resolveOrdenEntregaItemLinea(itemReal, 1);
ok(lineaUnica.precio_unitario === 14000 && lineaUnica.precio_total === 14000,
  'D4: con 1 sola entrega (BIEN típico) es un no-op — no cambia el importe original');

// ---------------------------------------------------------------------------
console.log('\n-- E. Documentos: plantilla de invitación ≠ documento presentado --');

const solicitudDoc = {
  docs_solicitados: [{ archivo: 'plantilla-anexo09.docx', documento: 'Anexo 09' }],
  docs_convocatoria: [],
  requisitos_tecnicos: [],
};
const adjuntosMapDoc = {
  10: [
    { id: 1, nombre_archivo: 'plantilla-anexo09.docx', mime_type: 'application/msword' },
    { id: 2, nombre_archivo: 'sustento-tecnico-requerimiento.pdf', mime_type: 'application/pdf' },
  ],
};
const plantillaIds = new Set(resolveAdjuntosPlantillaInvitacion(solicitudDoc, [10], adjuntosMapDoc));
ok(plantillaIds.has(1), 'E1: el adjunto referenciado en docs_solicitados de la invitación se identifica como plantilla');
ok(!plantillaIds.has(2), 'E2: el adjunto de sustento técnico (no referenciado en docs_solicitados) NO se marca como plantilla');

// buildDocumentosConvocatoria (portal proveedor) sigue devolviendo AMBOS adjuntos —
// no se tocó su comportamiento; el filtro nuevo es una función aparte.
const docsConvocatoria = buildDocumentosConvocatoria(solicitudDoc, [10], adjuntosMapDoc);
ok(docsConvocatoria.length === 2,
  'E3: buildDocumentosConvocatoria (portal proveedor) sin regresión — sigue listando ambos adjuntos');

const srcOrdenes = read('server/lib/ordenesContratacion.js');
ok(/resolveAdjuntosPlantillaInvitacion/.test(srcOrdenes) && !/nombre_archivo\.toLowerCase\(\)\.includes/.test(srcOrdenes),
  'E4: getExpedienteOrdenCompleto reutiliza resolveAdjuntosPlantillaInvitacion (no inventa un filtro por nombre)');

// ---------------------------------------------------------------------------
console.log('\n-- F. Regresión (BIEN / SERVICIO / LOCACIÓN / RC8.11.x) --');

ok(/extractItemsDesdePropuestaEconomica\(row\.propuesta_economica/.test(srcOrdenes)
  && /TIPOS_CONTRATACION\.LOCACION/.test(srcOrdenes),
  'F1: extractItemsDesdePropuestaEconomica sigue usándose solo en el flujo LOCACIÓN sin cuadro (BIEN/SERVICIO con cuadro no se tocan)');

const rowPreparacion = {
  estado: 'REGISTRO_ORDENES', orden_id: 55, ccp_firmado_id: 9, tipo_contratacion: 'BIEN',
};
const accionesPrep = getOrdenEdicionAcciones(rowPreparacion, { canManage: true });
ok(accionesPrep.some((a) => a.act === 'editarOrden'),
  'F2: en preparación (antes de notificar) sigue ofreciendo "Editar orden" — sin regresión de RC8.10.4');

const rowNotificada = { estado: 'ORDEN_NOTIFICADA', orden_id: 55, ccp_firmado_id: 9, tipo_contratacion: 'SERVICIO' };
const accionesNotif = getOrdenEdicionAcciones(rowNotificada, { canManage: true });
ok(accionesNotif.length === 0,
  'F3: una orden ya notificada (etapa cerrada/histórica) no ofrece acciones de edición');
ok(registroOrdenesMenuItems(rowNotificada, { canManage: true }).some((a) => a.act === 'verExpediente'),
  'F4: "Ver expediente" sigue disponible aunque no haya edición — no se rompe el menú Acciones');

const srcRc8112 = read('src/ui/workflow/getEtapaDisplayLabel.js');
ok(/esEtapaValida/.test(srcRc8112), 'F5: RC8.11.2 (etiqueta canónica de etapa) permanece intacto');

console.log('\n=== RC8.12 Observación 07 — funciones puras OK ===');
console.log('Recordatorio: ejecutar la suite con BD (ver cabecera de este archivo) antes de cerrar la observación.\n');
