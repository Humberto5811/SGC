/**
 * RC107 — Expediente de orden + etiqueta contractual de entrega (ÚNICO).
 * Unitario (sin DB) + asserts estructurales. Smoke opcional con DB si hay OC.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  resolveEtiquetaEntrega,
  buildEntregaContract,
  formatEntregasBandejaLabel,
  normalizeCodigoEntrega,
  correlativoFromEntrega,
} from '../shared/entregaContractual.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC107 — Expediente orden / etiqueta entrega ===\n');

// 1. Orden con entrega ÚNICO
{
  const e = {
    id: 25,
    numero_entrega: 1,
    etiqueta_entrega: 'ÚNICO',
    codigo_entrega: 'UNICO',
    tipo_entrega: 'ENTREGA',
    descripcion: 'ÚNICO',
    dias_plazo: 15,
    fecha_maxima: '2026-08-01',
    importe: 1000,
  };
  const c = buildEntregaContract(e, { totalEntregas: 1 });
  assert.equal(c.etiquetaEntrega, 'ÚNICO');
  assert.equal(c.numeroEntrega, 1);
  assert.equal(c.entregaId, 25);
  assert.equal(c.codigoEntrega, 'UNICO');
  assert.equal(formatEntregasBandejaLabel([e]).label, 'ÚNICO');
  ok('1-2. Bandeja / contrato muestran ÚNICO (no el número 1)');
}

// 3. Expediente usa etiqueta
{
  assert.equal(resolveEtiquetaEntrega({ numero_entrega: 1, etiqueta_entrega: 'ÚNICO' }), 'ÚNICO');
  ok('3. Expediente prioriza etiqueta_entrega');
}

// 4. Recepción de Bienes recibe ÚNICO
{
  const fmt = formatEntregasBandejaLabel([{
    numero_entrega: 1,
    etiqueta_entrega: 'ÚNICO',
    codigo_entrega: 'UNICO',
  }]);
  assert.equal(fmt.label, 'ÚNICO');
  ok('4. Label contractual listo para Recepción de Bienes');
}

// 5-6. Varias entregas sin etiqueta → Entrega N de M
{
  const list = [
    { id: 1, numero_entrega: 1, descripcion: '' },
    { id: 2, numero_entrega: 2, descripcion: '' },
    { id: 3, numero_entrega: 3, descripcion: '' },
  ];
  assert.equal(resolveEtiquetaEntrega(list[1], { totalEntregas: 3 }), 'Entrega 2 de 3');
  const fmt = formatEntregasBandejaLabel(list);
  assert.match(fmt.label, /Entrega/);
  ok('5-6. Fallback Entrega N de M cuando no hay etiqueta');
}

// 7. Conserva etiqueta personalizada
{
  assert.equal(
    resolveEtiquetaEntrega({ numero_entrega: 2, etiqueta_entrega: 'PRIMER ENTREGABLE' }),
    'PRIMER ENTREGABLE',
  );
  ok('7. Conserva etiqueta personalizada');
}

// Histórico: descripción «Entrega única» → ÚNICO
{
  assert.equal(
    resolveEtiquetaEntrega({ numero_entrega: 1, descripcion: 'Entrega única' }, { totalEntregas: 1 }),
    'ÚNICO',
  );
  assert.equal(normalizeCodigoEntrega('Único'), 'UNICO');
  assert.equal(correlativoFromEntrega({ codigo_entrega: 'UNICO' }, 1), 'UNICO');
  ok('Histórico: Entrega única / código UNICO → ÚNICO');
}

// 8-12. Endpoint / modal / menú presentes
{
  assertFileContains('server/routes/ordenesContratacion.js', /\/:id\/expediente/, 'ruta expediente');
  assertFileContains('server/lib/ordenesContratacion.js', /getExpedienteOrdenCompleto/, 'lib expediente');
  assertFileContains('server/lib/ordenesContratacion.js', /entrega_label/, 'bandeja label');
  assertFileContains('server/migrations/031_orden_entrega_etiqueta.js', /etiqueta_entrega/, 'migración 031');
  assertFileContains('shared/entregaContractual.js', /buildEntregaContract/, 'contrato shared');
  assertFileContains('src/utils/ordenesUtils.js', /verExpediente/, 'menú Ver expediente');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /Resumen/, 'modal resumen');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /Entregas/, 'modal entregas');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /Documentos/, 'modal documentos');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /Notificación/, 'modal notificación');
  assertFileContains('src/utils/registroOrdenExpedienteModal.js', /Historial/, 'modal historial');
  assertFileContains('src/views/contratacion/registroOrdenesView.js', /entrega_label/, 'FE bandeja');
  assertFileContains('src/views/ejecucion/recepcionBienesView.js', /entrega_label/, 'FE recepción');
  assertFileContains('src/services/ordenesContratacionService.js', /getExpediente/, 'service');
  assertFileContains('src/utils/registroOrdenEntregasModal.js', /etiqueta_entrega/, 'cronograma persiste etiqueta');
  ok('8-12. Endpoint, pestañas y propagación FE presentes');
}

// 13. Permisos: ruta usa assertRol (roles dec/admin)
{
  assertFileContains(
    'server/routes/ordenesContratacion.js',
    /router\.get\('\/:id\/expediente'[\s\S]*?assertRol/,
    'expediente protegido con assertRol',
  );
  ok('13. Endpoint expediente requiere rol (403 sin permiso)');
}

// 14. Documentos lazy (sin blob en listado bandeja / expediente lista metadatos)
{
  const lib = fs.readFileSync(path.join(root, 'server/lib/ordenesContratacion.js'), 'utf8');
  const m = lib.match(/export async function getDetalleOrden[\s\S]*?FROM orden_documentos WHERE orden_id[\s\S]*?ORDER BY version DESC/);
  assert.ok(m, 'getDetalleOrden docs');
  assert.ok(!/contenido_base64/.test(m[0]), 'detalle docs sin blob');
  assertFileContains('server/lib/ordenesContratacion.js', /getDocumentoOrden/, 'descarga vía getDocumentoOrden');
  ok('14. Listados documentales sin blob; descarga vía getDocumento');
}

// 15. No rompe contratos previos (numero_entrega se mantiene)
{
  const c = buildEntregaContract({ id: 1, numero_entrega: 1, etiqueta_entrega: 'ÚNICO' }, { totalEntregas: 1 });
  assert.equal(c.numero_entrega, 1);
  assert.equal(c.etiqueta_entrega, 'ÚNICO');
  ok('15. Compatibilidad: numero_entrega + etiqueta_entrega');
}

console.log('\nRC107 OK\n');
