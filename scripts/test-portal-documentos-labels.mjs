/**
 * Labels de documentos solicitados en Portal Proveedores (sin extensión/nombre físico).
 *
 *   node scripts/test-portal-documentos-labels.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  documentoFuncionalLabel,
  documentoFisicoNombre,
  cleanDocumentoFuncionalTitle,
  FORMATOS_PERMITIDOS_AYUDA,
} from '../src/utils/proveedorDocumentos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log('Portal documentos — labels funcionales\n');

// A. Anexo 09 + base Word
{
  const d = {
    documento: 'Anexo 09',
    archivo: 'ANEXOS LOCADORES 9. (1).docx',
  };
  assert.equal(documentoFuncionalLabel(d), 'Anexo 09');
  assert.ok(!documentoFuncionalLabel(d).includes('.docx'));
  assert.ok(!documentoFuncionalLabel(d).includes('ANEXOS'));
  assert.equal(documentoFisicoNombre(d), 'ANEXOS LOCADORES 9. (1).docx');
  ok('A. UI solo “Anexo 09”; físico conserva .docx');
}

// B. PDF físico
{
  const d = { documento: 'Anexo 09', archivo: 'plantilla_anexo09.pdf' };
  assert.equal(documentoFuncionalLabel(d), 'Anexo 09');
  assert.equal(documentoFisicoNombre(d), 'plantilla_anexo09.pdf');
  ok('B. Archivo PDF → título sigue “Anexo 09”');
}

// C. DOCX físico
{
  const d = { documento: 'Anexo 10', archivo: 'ANEXOS LOCADORES 10 .docx' };
  assert.equal(documentoFuncionalLabel(d), 'Anexo 10');
  assert.equal(documentoFisicoNombre(d), 'ANEXOS LOCADORES 10 .docx');
  ok('C. Archivo DOCX → título sigue “Anexo 10”');
}

// D. Descarga conserva nombre físico (data-name en lista)
{
  const docsSrc = fs.readFileSync(path.join(root, 'src/utils/proveedorDocumentos.js'), 'utf8');
  assert.match(docsSrc, /data-name="\$\{esc\(fisico\)\}"/);
  const portalSrc = fs.readFileSync(path.join(root, 'server/lib/portalDocumentos.js'), 'utf8');
  assert.match(portalSrc, /etiqueta/);
  assert.match(portalSrc, /archivo: fisico/);
  ok('D. Descarga usa nombre físico (data-name / archivo)');
}

// E. Sin adjunto — copy en vista
{
  const view = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(view, /Sin archivo adjunto/);
  assert.match(view, /documentoFuncionalLabel/);
  assert.ok(!view.includes("${d.documento || 'Documento'}${d.archivo ? ` (${d.archivo})` : ''}"));
  assert.ok(!view.includes('(${d.archivo})'));
  ok('E. Sin adjunto muestra “Sin archivo adjunto”; sin concat archivo');
}

// Título contaminado con (archivo.docx)
{
  assert.equal(
    cleanDocumentoFuncionalTitle('Anexo 12 (ANEXOS LOCADORES 12.docx)'),
    'Anexo 12',
  );
  ok('Limpieza de título contaminado con (archivo.ext)');
}

// Ayuda formatos
{
  assert.equal(FORMATOS_PERMITIDOS_AYUDA, 'Formatos permitidos: PDF, DOC o DOCX');
  const view = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(view, /FORMATOS_PERMITIDOS_AYUDA/);
  assert.match(view, /\.pdf,\.doc,\.docx/);
  ok('Formatos PDF/DOC/DOCX permitidos + ayuda visible');
}

// J. Sin regresiones multitipo (mismo componente docs)
{
  const view = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(view, /renderStep2|docs_solicitados/);
  assert.match(view, /normalizeTipoCotizacion|getCotizacionConfig/);
  ok('J. Mismo flujo docs para Bienes / Servicios / Locación');
}

console.log('\nOK — test-portal-documentos-labels\n');
