/**
 * Observación 45 — Locadores en RO + estado recepción + responsable al derivar.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import {
  extractItemsDesdePropuestaEconomica,
  listarBandejaOrdenes,
} from '../server/lib/ordenesContratacion.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { renderBadgeEstadoRecepcionHtml } from '../src/utils/recepcionCotizacionUtils.js';
import { query } from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== Observación 45 — REQ-00002 Locadores / RO / estado ===\n');

const ordSrc = read('server/lib/ordenesContratacion.js');
const ccpSrc = read('server/lib/ccpCertificacion.js');
const vigenteSrc = read('shared/estadoExpedienteVigente.js');
const recepSrc = read('src/utils/recepcionCotizacionUtils.js');
const recepView = read('src/views/contratacion/recepcionCotizacionesView.js');

ok(/RECEPCION_COTIZACION_LOCACION/.test(ordSrc), '1: RO bandeja incluye fuente Locación');
ok(/extractItemsDesdePropuestaEconomica/.test(ordSrc), '2: extractor ítems desde propuesta económica');
ok(/usuarioDestinoId/.test(ccpSrc) && /etapa_codigo[\s\S]{0,40}CCP/.test(ccpSrc),
  '3: derivar CCP→RO preserva analista CCP');
ok(/solEst === 'EN_ORDEN'/.test(vigenteSrc), '4: EN_ORDEN → REGISTRO_ORDENES en resolvedor');
ok(/enRegistroOrdenes/.test(recepSrc), '5: badge recepción respeta etapa RO fuente única');
ok(/estado_responsable_vigente\?\.etapaLabel/.test(recepView),
  '6: subtítulo recepción prioriza etapaLabel vigente');

// RC8.12 Obs.07 punto 4 — actualizado: ÍTEM ≠ ENTREGABLE. Antes de RC8.12 este
// assert exigía `items.length === 2` (uno por entregable), codificando como
// esperado el bug reportado en Observación 07 (ítems duplicados con datos de
// entregable). La regla correcta es un único ítem contractual agregado con el
// monto total, sin importar cuántos entregables tenga la cotización.
const items = extractItemsDesdePropuestaEconomica({
  monto: 14000,
  precio_total: 14000,
  entregables_cotizados: [
    { nombre: 'E1', precio: 7000, cantidad: 1 },
    { nombre: 'E2', precio: 7000, cantidad: 1 },
  ],
}, { denominacion: 'Servicio X' });
ok(items.length === 1 && items[0].precio_total === 14000 && items[0].descripcion === 'Servicio X',
  '7: ítem único agregado desde entregables_cotizados (RC8.12)');

const vEnOrden = resolveEstadoExpedienteVigente({
  codigo_ccp: '2200',
  ccp_activo: true,
  solicitud_estado: 'EN_ORDEN',
});
ok(vEnOrden.codigo === 'REGISTRO_ORDENES', `8: evidencia EN_ORDEN+ccp → REGISTRO_ORDENES (got ${vEnOrden.codigo})`);

const vSoloCcp = resolveEstadoExpedienteVigente({
  codigo_ccp: '2200',
  ccp_activo: true,
  solicitud_estado: 'EN_CCP',
});
ok(vSoloCcp.codigo === 'CCP_REGISTRADA', '9: sin EN_ORDEN sigue CCP_REGISTRADA');

const badgeHtml = renderBadgeEstadoRecepcionHtml({
  estado_recepcion_codigo: 'CCP_REGISTRADA',
  estado_recepcion_label: 'CCP registrada',
  codigo_ccp: '2200',
  ccp_activo: true,
  solicitud_estado: 'EN_ORDEN',
  estado_responsable_vigente: {
    estadoCodigo: 'REGISTRO_ORDEN',
    estadoLabel: 'Registro de órdenes',
    etapaCodigo: 'REGISTRO_ORDEN',
    etapaLabel: 'Registro de Orden',
    responsableTipo: 'PERSONA',
    responsableUsername: 'jcrisostomo',
    responsableNombre: 'CRISOSTOMO REYNA JUAN ULISES',
  },
});
ok(/Registro de [oó]rdenes/i.test(badgeHtml) && !/CCP registrada/i.test(badgeHtml),
  '10: badge recepción muestra Registro de órdenes (no CCP registrada)');

const adapted = adaptEstadoResponsable({
  estado_responsable_vigente: {
    estadoCodigo: 'REGISTRO_ORDEN',
    estadoLabel: 'Registro de Orden',
    etapaCodigo: 'REGISTRO_ORDEN',
    etapaLabel: 'Registro de Orden',
    responsableTipo: 'PERSONA',
    responsableUsername: 'jcrisostomo',
    responsableNombre: 'CRISOSTOMO REYNA JUAN ULISES',
  },
});
ok(adapted.responsableDisplay.includes('CRISOSTOMO') || adapted.responsableDisplay === 'jcrisostomo',
  '11: adapt muestra persona jcrisostomo');

const { rows: req2 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00002'`);
ok(!!req2[0], '12: REQ-00002 existe');

const bandeja = await listarBandejaOrdenes();
const row2 = bandeja.find((r) => r.requerimiento_codigo === 'REQ-00002');
ok(!!row2, '13: REQ-00002 aparece en bandeja Registro de Órdenes');
if (row2) {
  ok(Number(row2.precio_total) > 0, `14: monto RO > 0 (${row2.precio_total})`);
  ok(row2.origen_orden === 'RECEPCION_COTIZACION_LOCACION', '15: origen locación');
}

const { rows: vig } = await query(`
  SELECT responsable_tipo, responsable_usuario_id, etapa_codigo
  FROM expediente_estado_vigente WHERE requerimiento_id = $1
`, [req2[0].id]);
console.log('  · vigente REQ-00002:', vig[0]);

console.log('\n=== Observación 45 OK ===\n');
process.exit(0);
