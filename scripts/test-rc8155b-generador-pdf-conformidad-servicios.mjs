/**
 * RC8.15.5B — Generador PDF del Acta de Conformidad de Servicios.
 * Valida: PDF válido, título de Servicios, sin título de Bienes, campos clave
 * (orden, proveedor, entregable, fecha recepción, expediente SGD, importe) y
 * responsable/conclusión opcionales. Usa datos mock; NO toca BD.
 */
import assert from 'node:assert/strict';
import {
  ACTA_CONFORMIDAD_SERVICIOS_TITULO,
  generateActaConformidadServiciosPdfServer,
} from '../server/lib/entregableConformidadPdfServer.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (msg === undefined) { msg = cond; cond = true; }
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.15.5B — Generador PDF Acta de Conformidad de Servicios ===\n');

const dataConforme = {
  numero_orden: '1105',
  fecha_orden: '2026-08-01',
  requerimiento: 'REQ-00010',
  proveedor: 'SERVICIOS GENERALES S.A.C.',
  ruc: '20123456789',
  centro: 'Lima / Chorrillos',
  area_usuaria: 'UNIDAD DE EPIDEMIOLOGIA',
  objeto_servicio: 'Servicio de mantenimiento preventivo de equipos de laboratorio',
  numero_entrega: 2,
  denominacion: 'Entregable 2 — Informe de mantenimiento',
  plazo: '30 días calendario',
  fecha_maxima: '2026-08-30',
  fecha_recepcion_mesa_partes: '2026-08-25',
  numero_expediente_sgd: 'SGD-2026-12345',
  cantidad: 1,
  precio_unitario: 500,
  importe_entregable: 500,
  responsable: 'Ing. Maria Torres',
  fecha_emision: '2026-08-26',
  conclusion: 'Se otorga conformidad al entregable presentado por cumplir lo requerido.',
  version: 1,
};

{
  const pdf = generateActaConformidadServiciosPdfServer(dataConforme);
  assert.equal(pdf.mime_type, 'application/pdf');
  assert.ok(pdf.base64.length > 200);
  const raw = Buffer.from(pdf.base64, 'base64').toString('latin1');
  assert.equal(raw.slice(0, 8), '%PDF-1.4');
  assert.match(raw, /MediaBox \[0 0 595/);
  ok('1. Genera PDF A4 válido');

  assert.match(raw, /ACTA DE CONFORMIDAD DE SERVICIOS/);
  ok('2. Título correcto de Servicios');

  assert.doesNotMatch(raw, /ACTA DE RECEPCION Y CONFORMIDAD DE BIENES/);
  ok('3. No contiene título de Bienes');

  assert.match(raw, /1105/);
  ok('4. Incluye N.° orden');

  assert.match(raw, /SERVICIOS GENERALES/);
  ok('5. Incluye proveedor');

  assert.equal(pdf.fields.numero_entrega, 2);
  assert.match(raw, /ENTREGABLE/);
  ok('6. Incluye N.° entregable');

  assert.match(raw, /MESA DE PARTES/);
  assert.match(raw, /25\/08\/2026/);
  ok('7. Incluye fecha recepción Mesa de Partes');

  assert.match(raw, /SGD-2026-12345/);
  ok('8. Incluye expediente SGD');

  assert.match(raw, /500\.00/);
  assert.match(raw, /IMPORTE DEL ENTREGABLE/);
  ok('9. Incluye importe');

  assert.match(raw, /Maria Torres/);
  assert.match(raw, /CONCLUSION/);
  assert.match(raw, /cumplir lo requerido/);
  ok('10. Incluye responsable y conclusión cuando se proporcionan');

  assert.equal(ACTA_CONFORMIDAD_SERVICIOS_TITULO, 'ACTA DE CONFORMIDAD DE SERVICIOS');
  ok('11. Constante de título de Servicios');
}

{
  const dataMinima = {
    numero_orden: '1105',
    fecha_orden: '2026-08-01',
    proveedor: 'X S.A.C.',
    ruc: '20123456789',
    numero_entrega: 1,
    importe_entregable: 100,
  };
  const pdf = generateActaConformidadServiciosPdfServer(dataMinima);
  assert.equal(pdf.fields.tiene_responsable, false);
  assert.equal(pdf.fields.tiene_conclusion, false);
  const raw = Buffer.from(pdf.base64, 'base64').toString('latin1');
  assert.doesNotMatch(raw, /CONCLUSION/);
  ok('12. Sin responsable/conclusión no los renderiza');
}

{
  const pdf = generateActaConformidadServiciosPdfServer(dataConforme);
  assert.match(pdf.html, /ACTA DE CONFORMIDAD DE SERVICIOS/);
  assert.doesNotMatch(pdf.html, /ACTA DE RECEPCIÓN Y CONFORMIDAD DE BIENES/);
  assert.match(pdf.nombre, /^ACTA-CS-1105-E2-V1\.pdf$/);
  ok('13. HTML de vista previa y nombre de archivo coherentes');
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
