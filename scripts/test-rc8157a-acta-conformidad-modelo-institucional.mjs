/**
 * RC8.15.7A — Acta de Conformidad de Servicio al modelo institucional V1.
 * Usa fixture mock; NO toca OS 1105 ni BD productiva.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTA_CONFORMIDAD_SERVICIOS_TITULO,
  generateActaConformidadServiciosPdfServer,
  resolveActaConformidadServiciosFields,
} from '../server/lib/entregableConformidadPdfServer.js';
import { ACTA_LOGO_FALLBACK_DATA_URL } from '../shared/actaLogoFallbackDataUrl.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

const longDesc = 'Servicio integral de mantenimiento preventivo y correctivo de equipos '
  + 'de laboratorio clínico incluyendo calibración periódica, verificación metrológica, '
  + 'reemplazo de componentes críticos y emisión de informes técnicos detallados '
  + 'con recomendaciones operativas para continuidad del servicio asistencial.';

const mockData = {
  institucion: {
    nombre: 'Instituto Nacional de Salud',
    siglas: 'INS',
    logo_data_url: ACTA_LOGO_FALLBACK_DATA_URL,
    encabezado_linea1: 'CONTRATACIÓN DE BIENES Y SERVICIOS IGUALES O INFERIORES A OCHO (8)',
    encabezado_linea2: 'UNIDADES IMPOSITIVAS TRIBUTARIAS – UIT EN INSTITUTO NACIONAL DE SALUD',
  },
  numero_orden: '9901',
  fecha_orden: '2026-08-01',
  monto_total: 1500,
  requerimiento: 'REQ-00099',
  proveedor: 'SERVICIOS GENERALES S.A.C.',
  ruc: '20123456789',
  centro: 'Lima / Chorrillos',
  area_usuaria: 'UNIDAD DE EPIDEMIOLOGIA',
  servicio_prestado: longDesc,
  informe_productos: 'SEGUNDO ENTREGABLE',
  numero_entrega: 2,
  importe_entregable: 500,
  fecha_inicio: '2026-08-05',
  fecha_maxima: '2026-08-30',
  fecha_recepcion_mesa_partes: '2026-08-25',
  numero_expediente_sgd: 'SGD-2026-99001',
  firma_au: {
    nombres: 'Walter Vasquez',
    cargo: 'Responsable del Área Usuaria',
    unidad: 'UNIDAD DE EPIDEMIOLOGIA',
  },
  firma_director: {
    nombres: '',
    cargo: 'Director/Jefe del Centro',
    unidad: 'Lima / Chorrillos',
    pendiente: true,
  },
  version: 1,
};

console.log('\n=== RC8.15.7A — Modelo institucional Acta Conformidad Servicio ===\n');

{
  const pdf = generateActaConformidadServiciosPdfServer(mockData);
  const raw = Buffer.from(pdf.base64, 'base64').toString('latin1');
  assert.equal(pdf.mime_type, 'application/pdf');
  assert.equal(raw.slice(0, 8), '%PDF-1.4');
  assert.match(raw, /MediaBox \[0 0 595/);
  ok(true, '1. PDF válido A4');

  ok(Boolean(pdf.fields.logoDataUrl), '2. logo configurado presente en fields');
  assert.doesNotMatch(raw, /\bLOGO\b/);
  ok(true, '3. texto literal LOGO ausente del PDF');

  assert.match(pdf.fields.encabezado.linea2, /INSTITUTO NACIONAL DE SALUD/i);
  ok(true, '4. nombre institución desde configuración');

  assert.equal(ACTA_CONFORMIDAD_SERVICIOS_TITULO, 'ACTA DE CONFORMIDAD DE SERVICIO');
  assert.match(raw, /ACTA DE CONFORMIDAD DE SERVICIO/);
  ok(true, '5. título ACTA DE CONFORMIDAD DE SERVICIO');

  assert.match(raw, /ANEXO N\. 18/);
  assert.match(pdf.html, /ANEXO N\.° 18/);
  ok(true, '6. ANEXO N.° 18');

  assert.match(raw, /CONTRATO/);
  assert.match(raw, /O\/S/);
  ok(true, '7. bloque CONTRATO / O/S');

  assert.match(raw, /9901/);
  ok(true, '8. OS real en bloque O/S');

  assert.match(raw, /SERVICIOS GENERALES/);
  assert.match(raw, /- RUC 20123456789/);
  assert.doesNotMatch(raw, /\? RUC/);
  assert.match(pdf.html, /SERVICIOS GENERALES S\.A\.C\. - RUC 20123456789/);
  assert.doesNotMatch(pdf.html, /· RUC/);
  ok(true, '9. proveedor con separador - RUC (sin carácter corrupto)');

  assert.match(raw, /mantenimiento preventivo/);
  ok(true, '10. servicio prestado');

  assert.match(raw, /SEGUNDO ENTREGABLE/);
  ok(true, '11. informe/productos con etiqueta del entregable');

  assert.match(raw, /500\.00/);
  ok(true, '12. importe');

  assert.match(raw, /05\/08\/2026/);
  assert.match(raw, /30\/08\/2026/);
  assert.match(raw, /25\/08\/2026/);
  ok(true, '13. fechas contractuales y recepción');

  assert.equal(pdf.fields.penalidad, 'NO CORRESPONDE');
  assert.equal(pdf.fields.penalidad_pendiente, false);
  assert.match(raw, /NO CORRESPONDE/);
  ok(true, '14. penalidad por defecto NO CORRESPONDE');

  assert.doesNotMatch(raw, /ACTA N\./);
  assert.doesNotMatch(pdf.html, /ACTA N\.°/);
  ok(true, '15. identificador ACTA N. no se imprime');

  assert.match(raw, /Responsable del Area Usuaria|Responsable del Área Usuaria/);
  assert.match(raw, /Walter Vasquez/);
  ok(true, '16. firma AU izquierda');

  assert.match(raw, /Director\/Jefe del Centro/);
  ok(true, '17. firma Director/Jefe derecha');

  assert.match(raw, /Walter Vasquez/);
  assert.doesNotMatch(raw, /Director\/Jefe del Centro[\s\S]{0,40}Walter Vasquez/);
  ok(true, '18. nombres no hardcodeados cruzados (AU ≠ Director)');

  const fieldsLong = resolveActaConformidadServiciosFields({ ...mockData, servicio_prestado: longDesc });
  assert.ok(fieldsLong.servicio_prestado.length > 80);
  ok(true, '19. descripción larga resuelta sin truncar en fields');

  assert.match(pdf.nombre, /^ACTA-CS-9901-E2-V1\.pdf$/);
  ok(true, '20. versionado documental vigente en nombre de archivo');

  assert.doesNotMatch(raw, /N\. ENTREGABLE/);
  ok(true, '21. sin columna N. ENTREGABLE');

  assert.match(pdf.fields.texto_declarativo, /Términos de Referencia contractuales acordados/);
  ok(true, '22. texto introductorio institucional');

  const src = readFileSync('server/lib/entregableConformidadPdfServer.js', 'utf8');
  assert.match(src, /ROW_PAD/);
  assert.match(src, /row-vcenter/);
  assert.match(src, /vertical-align:\s*middle/);
  assert.match(src, /labTextH[\s\S]{0,120}valTextH/);
  ok(true, '23. filas MONTO/PROVEEDOR/SERVICIO con padding y centrado vertical');
  assert.doesNotMatch(src, /from '\.\.\/db\.js'|query\(/);
  ok(true, '24. generador continúa sin SQL');
}

console.log(`\nResultado: ${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
