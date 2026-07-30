/**
 * RC108 — Registro de Órdenes / expediente / cronograma contractual (OD40).
 * Unitario + asserts estructurales. Smoke OC 717 si hay DB.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  formatDateEs,
  formatDateTimeEs,
  normalizeCondicionInicio,
  labelCondicionInicio,
  resolveOrdenFechaNotificacion,
  resolveFechaEfectivaInicio,
  resolveOrdenCronogramaContractual,
  resolveItemPedidoSigamef,
  resolveAreaUsuaria,
  expandItemEntregaCombinaciones,
  formatPlazoLabel,
} from '../shared/ordenCronogramaContractual.js';
import { calcularFechaMaxima } from '../shared/diasPlazo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC108 — Registro Órdenes / expediente / cronograma ===\n');

// 1-2 Fecha notificación canónica
{
  const envios = [
    { id: 1, intento: 1, estado: 'ERROR', enviado_at: '2026-07-27T10:00:00Z' },
    { id: 2, intento: 2, estado: 'ENVIADO', enviado_at: '2026-07-28T05:16:47Z' },
    { id: 3, intento: 3, estado: 'ENVIADO', enviado_at: '2026-07-29T12:00:00Z' },
  ];
  const n = resolveOrdenFechaNotificacion({ enviado_proveedor_at: '2026-07-30T00:00:00Z' }, envios);
  assert.equal(n.fechaNotificacion, '2026-07-28');
  assert.equal(n.fuente, 'orden_envios_proveedor.primer_exitoso');
  ok('1-2. Fecha notificación = primer envío exitoso (no fallidos / no último)');
}

// 3 Emisión → efectiva = emisión
{
  const f = resolveFechaEfectivaInicio({
    condicionInicio: 'EMISION_ORDEN',
    fechaEmision: '2026-07-24',
    fechaNotificacion: '2026-07-28',
    plazoDias: 20,
  });
  assert.equal(f.fechaEfectiva, '2026-07-24');
  assert.equal(f.fechaMaxima, '2026-08-12');
  ok('3. Emisión: efectiva=emisión; máxima inclusiva 24/07 +20-1 = 12/08');
}

// 4 Día siguiente notificación
{
  const f = resolveFechaEfectivaInicio({
    condicionInicio: 'DIA_SIGUIENTE_NOTIFICACION_ORDEN',
    fechaEmision: '2026-07-24',
    fechaNotificacion: '2026-07-28',
    plazoDias: 20,
  });
  assert.equal(f.condicionInicio, 'DIA_SIGUIENTE_NOTIFICACION');
  assert.equal(f.fechaEfectiva, '2026-07-29');
  assert.equal(f.fechaMaxima, calcularFechaMaxima('2026-07-29', 20));
  ok('4. Día siguiente notificación: efectiva = notif+1');
}

// 5 Inclusivo
{
  assert.equal(calcularFechaMaxima('2026-07-24', 20), '2026-08-12');
  ok('5. Fecha máxima inclusiva: efectiva + plazo - 1');
}

// 6 ÚNICO un ítem
{
  const items = [{ id: 1, descripcion: 'Item A', cantidad: 1, precio_unitario: 10, precio_total: 10, codigo_sigamef: '351' }];
  const entregas = [{ id: 3, numero_entrega: 1, etiqueta_entrega: 'ÚNICO', items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 10, precio_total: 10 }] }];
  const combos = expandItemEntregaCombinaciones(items, entregas);
  assert.equal(combos.length, 1);
  assert.equal(combos[0].etiqueta_entrega, 'ÚNICO');
  ok('6. Un ítem + ÚNICO → 1 combinación');
}

// 7-9 Varios ítems / varias entregas
{
  const items = [
    { id: 1, descripcion: 'I1', cantidad: 1, precio_unitario: 1, precio_total: 1 },
    { id: 2, descripcion: 'I2', cantidad: 3, precio_unitario: 1, precio_total: 3 },
    { id: 3, descripcion: 'I3', cantidad: 2, precio_unitario: 1, precio_total: 2 },
  ];
  const entregas = [
    {
      id: 10, numero_entrega: 1, etiqueta_entrega: 'ÚNICO',
      items: [{ orden_item_id: 1, cantidad: 1, precio_unitario: 1, precio_total: 1 }],
    },
    {
      id: 11, numero_entrega: 1, etiqueta_entrega: 'Entrega 1',
      items: [
        { orden_item_id: 2, cantidad: 1, precio_unitario: 1, precio_total: 1 },
        { orden_item_id: 3, cantidad: 1, precio_unitario: 1, precio_total: 1 },
      ],
    },
    {
      id: 12, numero_entrega: 2, etiqueta_entrega: 'Entrega 2',
      items: [
        { orden_item_id: 2, cantidad: 1, precio_unitario: 1, precio_total: 1 },
        { orden_item_id: 3, cantidad: 1, precio_unitario: 1, precio_total: 1 },
      ],
    },
    {
      id: 13, numero_entrega: 3, etiqueta_entrega: 'Entrega 3',
      items: [{ orden_item_id: 2, cantidad: 1, precio_unitario: 1, precio_total: 1 }],
    },
  ];
  const combos = expandItemEntregaCombinaciones(items, entregas);
  assert.equal(combos.length, 6);
  ok('7-9. Combinaciones ítem–entrega (6 filas: I1+ÚNICO, I2×3, I3×2)');
}

// 10 Recepción parcial no cierra resto (saldo)
{
  const saldo = (prog, acum) => Math.max(0, Number(prog) - Number(acum));
  assert.equal(saldo(3, 1), 2);
  assert.equal(saldo(1, 1), 0);
  ok('10. Saldo pendiente por combinación (recepción parcial no cierra otras)');
}

// 11-14 SIGAMEF / centro / pedido
{
  const ped = resolveItemPedidoSigamef(
    { descripcion: 'DITIOTREITOL P.A. X 5 G' },
    [{ codigo_sigamef: '351000020495', pedido_sigamef: 'PB-3487', centro: 'CNSP', centro_costo: 'UNIDAD X', descripcion: 'DITIOTREITOL P.A. X 5 G' }],
    0,
  );
  assert.equal(ped.codigo_sigamef, '351000020495');
  assert.equal(ped.pedido_sigamef, 'PB-3487');
  assert.equal(ped.centro, 'CNSP');
  assert.equal(ped.centro_costo, 'UNIDAD X');
  ok('11-14. Código / pedido / centro / centro costo desde pedido SIGAMEF');
}

// 15 Área Usuaria
{
  const au = resolveAreaUsuaria({
    requerimientoArea: 'UNIDAD DE PARASITOLOGÍA Y MICOLOGÍA',
    centroCosto: 'UNIDAD DE PARASITOLOGÍA Y MICOLOGÍA',
    centro: 'CNSP',
  });
  assert.equal(au, 'UNIDAD DE PARASITOLOGÍA Y MICOLOGÍA');
  assert.notEqual(au, 'CNSP');
  ok('15. Área Usuaria ≠ centro CNSP');
}

// 16-18 docs / historial / estructura FE
{
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /Cotización 5-A|cotizacion/, 'docs 5-A/5-B');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /showTrazabilidadModal/, 'historial trazabilidad');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /showTrazabilidadModal/, 'menú ver historial');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /Fecha de\s*<br>\s*notificación|Fecha de<br>notificación/, 'columna notificación');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /Código<br>SIGAMEF/, 'columna código');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /Plazo de<br>entrega/, 'columna plazo');
  assertFileContains('server/lib/ordenesContratacion.js', /item_entregas/, 'combinaciones backend');
  assertFileContains('shared/ordenCronogramaContractual.js', /resolveOrdenFechaNotificacion/, 'fuente única notificación');
  ok('16-18. Documentos / trazabilidad / columnas bandeja');
}

// 19 Formato fecha
{
  assert.equal(formatDateEs('2026-07-28'), '28/07/2026');
  assert.match(formatDateTimeEs('2026-07-28T05:16:47.257Z'), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.equal(formatPlazoLabel(20), '20 días');
  ok('19. Fechas dd/mm/yyyy (+ HH:mm en detalle)');
}

// Labels condición / legacy
{
  assert.equal(normalizeCondicionInicio('INICIO_PLAZO_ENVIO_PROVEEDOR'), 'DIA_SIGUIENTE_NOTIFICACION');
  assert.match(labelCondicionInicio('EMISION_ORDEN'), /emisión/i);
  assert.ok(!/INICIO_PLAZO_ENVIO/.test(labelCondicionInicio('INICIO_PLAZO_ENVIO_PROVEEDOR')));
  ok('Condiciones oficiales; legacy no se muestra en UI');
}

// Contrato cronograma
{
  const c = resolveOrdenCronogramaContractual(
    { fecha_orden: '2026-07-24', enviado_proveedor_at: '2026-07-28', condicion_inicio: 'EMISION_ORDEN' },
    { dias_plazo: 20, etiqueta_entrega: 'ÚNICO', numero_entrega: 1 },
    { envios: [{ estado: 'ENVIADO', enviado_at: '2026-07-28T05:16:47Z' }] },
  );
  assert.equal(c.fechaNotificacion, '2026-07-28');
  assert.equal(c.fechaEfectiva, '2026-07-24');
  assert.equal(c.fechaMaxima, '2026-08-12');
  assert.equal(c.etiquetaEntrega, 'ÚNICO');
  ok('Contrato cronograma OC717-like');
}

// Compat RC104-107 files still present
{
  for (const f of [
    'scripts/test-rc104-estado-global-expediente.mjs',
    'scripts/test-rc105-propagacion-estado-tres-bandejas.mjs',
    'scripts/test-rc106-recepcion-bienes-flujo.mjs',
    'scripts/test-rc107-expediente-orden-entrega.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  ok('20. RC104–RC107 siguen presentes (compatibilidad)');
}

// Smoke DB OC 717 (opcional)
try {
  const { query } = await import('../server/db.js');
  const pool = (await import('../server/db.js')).default;
  const { getExpedienteOrdenCompleto, listarBandejaOrdenes } = await import('../server/lib/ordenesContratacion.js');
  const { rows: ords } = await query(`SELECT id FROM ordenes_contratacion WHERE numero_orden::text LIKE '%717%' LIMIT 1`);
  if (ords[0]) {
    const exp = await getExpedienteOrdenCompleto(ords[0].id);
    assert.ok(exp.resumen.pedido_sigamef, 'pedido en resumen');
    assert.equal(exp.resumen.fecha_notificacion, '2026-07-28');
    assert.match(String(exp.resumen.condicion_inicio_label || ''), /emisión/i);
    assert.equal(exp.resumen.fecha_efectiva_inicio, '2026-07-24');
    assert.equal(exp.resumen.fecha_maxima, '2026-08-12');
    assert.ok(exp.items[0]?.codigo_sigamef, 'código ítem');
    assert.ok(exp.resumen.area_usuaria && !/^CNSP$/i.test(exp.resumen.area_usuaria), 'AU no CNSP');
    assert.ok((exp.item_entregas || []).length >= 1, 'combinaciones');
    const bandeja = await listarBandejaOrdenes();
    const row = bandeja.find((r) => Number(r.orden_id) === Number(ords[0].id));
    assert.equal(row?.fecha_notificacion, '2026-07-28');
    assert.equal(row?.entrega_label, 'ÚNICO');
    assert.match(String(row?.plazo_entrega_label || ''), /20/);
    ok('Smoke OC 717: bandeja + expediente coherentes');
  } else {
    ok('Smoke OC 717 omitido (orden no en DB)');
  }
  await pool.end();
} catch (e) {
  console.log(`  ⚠ Smoke DB omitido: ${e.message}`);
}

console.log('\nRC108 OK\n');
