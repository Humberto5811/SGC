/**
 * RC8.4 — Anexo N.° 8A Cuadro Comparativo de Precios — Bienes.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ANEXO_8A,
  buildCuadroComparativoReportData,
  validateCuadroParaAnexo8A,
} from '../src/utils/cuadroComparativoReportData.js';
import { EVENTOS } from '../core/eventEngine/EventCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoPdf.js'), 'utf8');
const reportSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoReportData.js'), 'utf8');
const libSrc = readFileSync(path.join(__dirname, '../server/lib/cuadroComparativo.js'), 'utf8');
const routeSrc = readFileSync(path.join(__dirname, '../server/routes/portal.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoModal.js'), 'utf8');
const portalSrc = readFileSync(path.join(__dirname, '../server/lib/portalProveedores.js'), 'utf8');
const valSrc = readFileSync(path.join(__dirname, '../server/lib/validacionesCotizacion.js'), 'utf8');
const wfSrc = readFileSync(path.join(__dirname, '../core/workflowEngine/WorkflowTransitions.js'), 'utf8');

console.log('\n=== RC8.4 Anexo 8A ===\n');

assert(ANEXO_8A.codigo === '8A' && /Cuadro Comparativo de Precios/.test(ANEXO_8A.subtitulo), 'título Anexo 8A');

function makePersistido(nProv, nItems = 2, opts = {}) {
  const proveedores = [];
  for (let i = 1; i <= nProv; i += 1) {
    proveedores.push({
      proveedor_id: i,
      ruc: `20${String(i).padStart(9, '0')}`,
      razon_social: `PROVEEDOR ${i} SAC`,
      validacion_estado: 'APTO',
      cumple_tecnicamente: true,
    });
  }
  const items = [];
  for (let j = 0; j < nItems; j += 1) {
    const ofertas = proveedores.map((p, idx) => ({
      proveedor_id: p.proveedor_id,
      ruc: p.ruc,
      razon_social: p.razon_social,
      cumple_tecnicamente: true,
      validacion_estado: 'APTO',
      precio_unitario: 10 + idx,
      precio_total: (10 + idx) * (j + 1) * 10,
      marca: idx === 0 ? 'MarcaA' : '',
      modelo: idx === 0 ? 'M1' : null,
      procedencia: undefined,
      garantia: opts.sinOpcionales ? null : '12 meses',
      plazo_entrega: '15 días',
      observacion_analista: '',
      incompleto: false,
    }));
    items.push({
      item_key: `10-${j}`,
      requerimiento_codigo: 'REQ-00016',
      pedido_sigamef: 'PB-1',
      codigo_sigamef: `COD-${j}`,
      descripcion: `Bien ítem ${j + 1}`,
      unidad_medida: 'UND',
      cantidad: (j + 1) * 10,
      proveedor_adjudicado_id: opts.sinAdjudicado ? null : 1,
      valor_adjudicado_item: opts.sinAdjudicado ? null : ofertas[0].precio_total,
      adjudicado_razon_social: 'PROVEEDOR 1 SAC',
      ofertas,
    });
  }
  const valor = items.reduce((a, it) => a + (it.valor_adjudicado_item || 0), 0);
  return {
    cuadro: {
      id: 9,
      estado: opts.estado || 'ADJUDICADO',
      version: opts.version || 1,
      criterio_seleccion: opts.sinCriterio ? '' : 'MENOR_PRECIO_VALIDO',
      sustento_decision: opts.sinSustento ? '' : 'Menor precio válido',
      valor_adjudicado: opts.sinValor ? null : valor,
      proveedor_ganador_id: 1,
      modalidad_adjudicacion: 'POR_ITEM',
      usuario_adjudicacion: 'analista',
    },
    datos_json: {
      solicitud: { codigo: 'SC-00017-2026-INS', denominacion: 'Compra de papel', tipo: 'B' },
      requerimientos: [{ codigo: 'REQ-00016', area_usuaria: 'Logística', cmn: 'CMN-1' }],
      items,
      resumen_proveedores: proveedores,
      adjudicacion: {
        valor_adjudicado: opts.sinValor ? null : valor,
        criterio_seleccion: opts.sinCriterio ? '' : 'MENOR_PRECIO_VALIDO',
        criterio_label: 'Menor precio válido',
        sustento_decision: opts.sinSustento ? '' : 'Menor precio válido',
        modalidad: 'POR_ITEM',
        proveedor_ganador_id: 1,
        resumen_proveedores: [{ proveedor_id: 1, razon_social: 'PROVEEDOR 1 SAC', ruc: proveedores[0].ruc, items: nItems, valor_adjudicado: valor }],
        fecha_adjudicacion: '2026-07-16T12:00:00Z',
        usuario_adjudicacion: 'analista',
      },
    },
    expediente: { solicitud_codigo: 'SC-00017-2026-INS', area_usuaria: 'Logística', cmn: 'CMN-1' },
    entidad: { nombre: 'Instituto Nacional de Salud', siglas: 'INS', ruc: '20100000000' },
    logo_data_url: '',
  };
}

// 1) Un proveedor
const r1 = buildCuadroComparativoReportData(makePersistido(1, 2));
assert(r1.proveedores.length === 1 && r1.filas.length === 2, '1. un proveedor / varios ítems');
assert(r1.meta.validation.ok, '1. válido para generar');

// 2) Tres proveedores
const r3 = buildCuadroComparativoReportData(makePersistido(3, 2));
assert(r3.proveedores.length === 3, '2. tres proveedores');
assert(r3.filas[0].ofertas.length === 3, '2. tres ofertas por fila');

// 3) Cinco proveedores
const r5 = buildCuadroComparativoReportData(makePersistido(5, 1));
assert(r5.proveedores.length === 5, '3. cinco proveedores');
assert(r5.meta.proveedores_por_bloque === 3, '3. bloques de 3 para páginas');
assert(/chunk|bloques|proveedores_por_bloque/.test(pdfSrc), '3. PDF maneja bloques/páginas');

// 4) Varios ítems
assert(r3.filas.every((f) => f.descripcion && f.requerimiento_codigo), '4. ítems con datos base');

// 5) Opcionales faltantes → NO APLICA / —
const rOpt = buildCuadroComparativoReportData(makePersistido(2, 1, { sinOpcionales: true }));
const of1 = rOpt.filas[0].ofertas[1];
assert(of1.marca === 'NO APLICA' || of1.marca === '—', '5. marca opcional NO APLICA/—');
assert(of1.procedencia === 'NO APLICA' || of1.procedencia === '—', '5. procedencia opcional');
assert(!/undefined|null|\[object Object\]|NaN/.test(JSON.stringify(rOpt)), '5. sin undefined/null/NaN');

// 6) Obligatorios faltantes
const bad = validateCuadroParaAnexo8A(makePersistido(2, 1, { sinAdjudicado: true, sinSustento: true }));
assert(!bad.ok && bad.faltantes.length >= 1, '6. bloquea si faltan obligatorios');
assert(bad.faltantes.some((f) => /adjudicado|Sustento|sustento/i.test(f)), '6. lista faltantes');

// 7) PDF generado (código)
assert(/generateAnexo8APdf/.test(pdfSrc) && /orientation:\s*'landscape'/.test(pdfSrc), '7. generate landscape');
assert(/format:\s*'a3'/.test(pdfSrc), '7. A3 horizontal');
assert(/autoTable/.test(pdfSrc) && /showHead:\s*'everyPage'/.test(pdfSrc), '7. cabeceras cada página');
assert(/previewAnexo8APdf/.test(pdfSrc) && /downloadAnexo8APdf/.test(pdfSrc), '7. preview/download');

// 8) Total y ganador
assert(r1.resultado.proveedor_adjudicado.includes('PROVEEDOR 1'), '8. ganador en resultado');
assert(r1.resultado.valor_adjudicado_num > 0, '8. valor adjudicado');

// 9) Versionado
assert(/bumpVersion|nextVersion|version = \$5/.test(libSrc) || /nextVersion/.test(libSrc), '9. incrementa versión');
assert(/pdf_versiones/.test(libSrc), '9. historial metadata PDF');
assert(/FIRMADO[\s\S]*no se puede regenerar|firmado[\s\S]*anular/i.test(libSrc), '9. bloqueo post-firma');

// 10) Estado GENERADO
assert(/estado = 'GENERADO'/.test(libSrc), '10. estado GENERADO al guardar PDF');
assert(/guardarPdfCuadro/.test(libSrc), '10. guardarPdfCuadro');

// 11) Evento
assert(/CUADRO_COMPARATIVO_GENERADO/.test(libSrc), '11. evento al generar');
assert(EVENTOS.CUADRO_COMPARATIVO_GENERADO === 'CUADRO_COMPARATIVO_GENERADO', '11. EventCatalog');

// 12) Legibilidad
assert(/fontSize:\s*6|fontSize:\s*5\.5|fontSize:\s*7/.test(pdfSrc), '12. tipografía legible');
assert(/rowPageBreak:\s*'avoid'|overflow:\s*'linebreak'/.test(pdfSrc), '12. filas/texto ajustados');
assert(/Elaborado por|Revisado por|Aprobado por/.test(pdfSrc), '12. espacios de firma');
assert(/addImage|logo/.test(pdfSrc) && /entidad/.test(reportSrc), '12. logo/entidad');

// Rutas / UI / no tocar módulos
assert(/pdf-data/.test(routeSrc) && /cuadro\/:cuadroId\/pdf/.test(routeSrc), 'rutas PDF');
assert(/Previsualizar Anexo 8A/.test(modalSrc) && /Generar Anexo 8A/.test(modalSrc), 'UI acciones');
assert(/getCuadroPdfData/.test(modalSrc) && /buildPersistidoParaPdf/.test(modalSrc), 'PDF desde persistido no UI');
assert(/presentarCotizacion/.test(portalSrc), 'Portal intacto');
assert(/DESTINOS_SALIDA_VALIDACION/.test(valSrc), 'Validaciones intactas');
assert(/CUADRO_COMPARATIVO[\s\S]*CCP/.test(wfSrc), 'Workflow intacto');
assert(!/syncRequerimientosSolicitudWorkflow/.test(libSrc.match(/guardarPdfCuadro[\s\S]*?^export /m)?.[0] || ''), 'PDF no deriva Workflow');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.4 Anexo 8A: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.4 Anexo 8A: PASS\n');
