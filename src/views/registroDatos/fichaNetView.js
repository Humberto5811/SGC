// =====================================================
// Ficha NET — Vista CRUD con Import/Export Excel masivo
// y generación de reporte PDF (modelo FICHANET24) por registro.
// El logo y los datos de la entidad se cargan automáticamente desde
// los submódulos Logotipos y Datos de la Entidad.
// =====================================================
import { api } from '../../services/apiService.js';
import { createCrudView } from './crudViewFactory.js';
import { escapeHtml as esc } from '../../utils/escapeHtml.js';

// Campos del formulario CRUD (alta/edición). Nombres = columnas de la tabla.
const FIELDS = [
  { name: 'idfichanet', label: 'ID Ficha NET', col: 4 },
  { name: 'idcartcodigosiga', label: 'Código MEF', col: 4 },
  { name: 'idcartcod', label: 'ID Código Artículo', col: 4 },
  { name: 'dscartnombre', label: 'Nombre', type: 'textarea', rows: 2, col: 12, required: true },
  { name: 'dscclasdescripcion', label: 'Otra(s) Denominación(es)', type: 'textarea', rows: 2, col: 12 },
  { name: 'dscartcaracteristica', label: 'Característica', type: 'textarea', rows: 3, col: 12 },
  { name: 'dscartdocumentos', label: 'Documentos', type: 'textarea', rows: 2, col: 12 },
  { name: 'dscartpresentacion', label: 'Forma de Presentación', col: 6 },
  { name: 'dspesomolecular', label: 'Peso Molecular', col: 6 },
  { name: 'dsporcentajepureza', label: 'Porcentaje Pureza', col: 6 },
  { name: 'dsformula', label: 'Fórmula', col: 6 },
  { name: 'dsdensidad', label: 'Densidad', col: 6 },
  { name: 'dsph', label: 'PH', col: 6 },
  { name: 'dstemperatura', label: 'Temperatura de Almacenamiento', col: 6 },
  { name: 'dscartfechavencimiento', label: 'Vigencia', col: 6 },
  { name: 'idclase', label: 'ID Clase', col: 3 },
  { name: 'dsclase', label: 'Clase de Artículo', col: 9 },
  { name: 'idsubclase', label: 'ID Sub Clase', col: 3 },
  { name: 'dssubclase', label: 'Sub Clase de Artículo', col: 9 },
  { name: 'dscartobservaciones', label: 'Observación', type: 'textarea', rows: 2, col: 12 },
  { name: 'stcartestado', label: 'Estado', col: 4 },
  { name: 'dafechacreacion', label: 'Fecha creación', col: 4 },
  { name: 'dsusuariocrea', label: 'Usuario', col: 4 },
  { name: 'nu_version', label: 'N° Versión', col: 4 },
];

// Columnas visibles en la tabla.
const COLUMNS = [
  { name: 'idfichanet', label: 'ID', width: '70px' },
  { name: 'idcartcodigosiga', label: 'Código MEF', width: '130px' },
  { name: 'dscartnombre', label: 'Nombre' },
  { name: 'dsclase', label: 'Clase', width: '160px' },
  { name: 'dscartpresentacion', label: 'Presentación', width: '120px' },
  { name: 'stcartestado', label: 'Estado', width: '70px' },
];

// ---- Caché del encabezado (logo + entidad) para no recargar en cada impresión.
let headerCache = null;
async function loadHeader() {
  if (headerCache) return headerCache;
  let entidad = {};
  let logo = '';
  try { entidad = await api.get('/entidad') || {}; } catch (_) { /* opcional */ }
  try {
    const resp = await api.list('logotipos', { page: 1, pageSize: 100, search: '' });
    const logos = resp.data || [];
    const pick = logos.find((l) => /principal/i.test(l.tipo || '') && (l.data_url || ''))
      || logos.find((l) => (l.estado || 'Activo') !== 'Inactivo' && (l.data_url || ''))
      || logos.find((l) => l.data_url);
    if (pick) logo = pick.data_url || '';
  } catch (_) { /* opcional */ }
  headerCache = { entidad, logo };
  return headerCache;
}

function fmtNow() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Bloque de campo con recuadro (etiqueta arriba, valor en caja).
function fieldBox(label, value, minH) {
  const h = minH ? ` style="min-height:${minH};"` : '';
  return `<div class="fn-field">
    <div class="fn-label">${esc(label)}</div>
    <div class="fn-box"${h}>${esc(value)}</div>
  </div>`;
}

function buildReportHTML(item, header) {
  const { entidad, logo } = header;
  const entidadNombre = (entidad && entidad.nombre) ? entidad.nombre : 'INSTITUTO NACIONAL DE SALUD';
  const logoImg = logo
    ? `<img src="${logo}" alt="logo" style="max-height:70px;max-width:140px;object-fit:contain;">`
    : '';

  const two = (l1, v1, l2, v2) => `<div class="fn-row2">
    <div class="fn-col">${fieldBox(l1, v1)}</div>
    <div class="fn-col">${fieldBox(l2, v2)}</div>
  </div>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
  <title>Ficha NET ${esc(item.idfichanet || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0; padding:18px 26px; font-size:12px; }
    .fn-header { display:flex; align-items:center; border:1px solid #000; margin-bottom:14px; }
    .fn-header .logo { width:170px; border-right:1px solid #000; padding:8px; text-align:center; }
    .fn-header .title { flex:1; text-align:center; padding:8px; }
    .fn-header .title h1 { font-size:15px; margin:0 0 6px; letter-spacing:.5px; }
    .fn-header .title h2 { font-size:13px; margin:0; }
    .fn-field { margin-bottom:10px; }
    .fn-label { font-weight:bold; font-size:12px; margin-bottom:2px; }
    .fn-box { border:1px solid #000; padding:5px 7px; min-height:24px; white-space:pre-wrap; word-break:break-word; }
    .fn-box.small { display:inline-block; min-width:240px; min-height:20px; }
    .fn-row2 { display:flex; gap:18px; }
    .fn-col { flex:1; }
    .fn-footer { display:flex; justify-content:space-between; align-items:flex-end;
      margin-top:26px; padding-top:8px; border-top:1px solid #000; font-size:11px; }
    .fn-footer span.k { font-weight:bold; }
    @media print { body { padding:10px 18px; } button { display:none; } }
    .fn-print-bar { text-align:center; margin-bottom:14px; }
    .fn-print-bar button { padding:8px 18px; font-size:13px; cursor:pointer; }
  </style></head><body>
  <div class="fn-print-bar"><button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button></div>

  <div class="fn-header">
    <div class="logo">${logoImg}</div>
    <div class="title"><h1>REGISTRO FICHA NET</h1><h2>${esc(entidadNombre)}</h2></div>
  </div>

  <div class="fn-field"><div class="fn-label">Clase de Artículo</div>
    <div class="fn-box small">${esc(item.dsclase)}</div></div>
  <div class="fn-field"><div class="fn-label">Sub Clase de Artículo</div>
    <div class="fn-box small">${esc(item.dssubclase)}</div></div>
  <div class="fn-field"><div class="fn-label">ID</div>
    <div class="fn-box small">${esc(item.idfichanet)}</div></div>
  <div class="fn-field"><div class="fn-label">Código MEF</div>
    <div class="fn-box small">${esc(item.idcartcodigosiga)}</div></div>

  ${fieldBox('Nombre', item.dscartnombre)}
  ${fieldBox('Otra(s) Denominación(es)', item.dscclasdescripcion)}
  ${fieldBox('Característica', item.dscartcaracteristica, '70px')}
  ${fieldBox('Documentos', item.dscartdocumentos)}

  ${two('Forma de Presentación', item.dscartpresentacion, 'Peso Molecular', item.dspesomolecular)}
  ${two('Porcentaje Pureza', item.dsporcentajepureza, 'Fórmula', item.dsformula)}
  ${two('Densidad', item.dsdensidad, 'PH', item.dsph)}

  ${fieldBox('Temperatura de Almacenamiento', item.dstemperatura, '50px')}
  ${fieldBox('Vigencia', item.dscartfechavencimiento, '50px')}
  ${fieldBox('Observación', item.dscartobservaciones, '60px')}

  <div class="fn-footer">
    <div><span class="k">Fecha creación:</span> ${esc(item.dafechacreacion)}</div>
    <div><span class="k">Usuario:</span> ${esc(item.dsusuariocrea)}</div>
    <div><span class="k">N° Versión:</span> ${esc(item.nu_version)}</div>
    <div><span class="k">Fecha de impresión:</span> ${fmtNow()}</div>
  </div>
  </body></html>`;
}

async function printFichaNet(item) {
  const win = window.open('', '_blank');
  if (!win) { alert('Permita las ventanas emergentes para generar el PDF.'); return; }
  win.document.write('<p style="font-family:Arial;padding:20px;">Generando reporte…</p>');
  try {
    const header = await loadHeader();
    const html = buildReportHTML(item, header);
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (e) {
    win.document.body.innerHTML = '<p style="font-family:Arial;color:red;padding:20px;">Error al generar el reporte: ' + esc(e.message) + '</p>';
  }
}

const view = createCrudView({
  resource: 'fichanet',
  title: 'Ficha NET',
  icon: 'bi-file-earmark-medical',
  subtitle: 'Registro de Fichas NET — importar/exportar, CRUD y reporte PDF',
  fields: FIELDS,
  columns: COLUMNS,
  excel: true,
  importPath: '/fichanet/import',
  onPrint: printFichaNet,
  printTitle: 'Generar PDF Ficha NET',
});

export const renderFichaNetView = view.render;
export const initFichaNetView = view.init;
