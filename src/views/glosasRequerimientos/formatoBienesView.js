// Formato Bienes — documento estructurado según el modelo (Glosas de Requerimientos).
// Renderiza las secciones desde el literal c) y demás correlativos, con campos
// editables, la tabla dinámica de entregables (numeral 14.1) con totalizador y
// los botones Editar / Grabar. Persiste contra /api/glosas-bienes.
import { authService } from '../../services/authService.js';
import { glosasBienesService } from '../../services/glosasBienesService.js';

// ---- Definición del documento (orden y estructura igual al modelo) ----
// key: 'numero' o 'lit:<literal>' para casar con el registro del backend.
const MODELO = [
  { key: 'lit:c', literal: 'c', titulo: 'Documentación para acreditar cumplimiento de características técnicas, experiencia del postor y personal clave:', type: 'textarea' },
  { key: 'lit:d', literal: 'd', titulo: 'Vigencia del producto:', type: 'text' },
  { key: '5', numero: '5', titulo: 'REGLAMENTOS TÉCNICOS, NORMAS METROLÓGICAS Y/O SANITARIAS, REGLAMENTOS Y DEMÁS NORMAS', helper: '(De corresponder, señalar reglamentos técnicos, normas metrológicas y/o sanitarias, reglamentos y demás normas que regulan el objeto de la contratación con carácter obligatorio)', type: 'textarea' },
  { key: '6', numero: '6', titulo: 'ACONDICIONAMIENTO, MONTAJE O INSTALACIÓN', helper: '(De corresponder, indicar en caso se requiera instalación)', type: 'textarea' },
  { key: '7', numero: '7', titulo: 'ENTREGAS', helper: '(De corresponder, detallar el número de entregas, el contenido de cada entrega, los plazos de ENTREGA y condiciones relevantes para cumplir con cada entrega)', type: 'textarea' },
  { key: '8', numero: '8', titulo: 'GARANTÍA COMERCIAL:', helper: '(Indicar el alcance y condiciones de la garantía, así como el periodo e inicio del cómputo de esta.)', type: 'textarea' },
  { key: '9', numero: '9', titulo: 'PRESTACIONES ACCESORIAS', helper: '(De corresponder, de acuerdo con las características de los bienes requeridos puede considerarse prestaciones accesorias)', type: 'textarea' },
  { key: '10', numero: '10', titulo: 'REQUISITOS DEL PROVEEDOR', helper: '(De corresponder, se puede detallar la experiencia requerida al proveedor y en caso de que la adquisición demande otras prestaciones que requieran de personal se debe detallar la cantidad mínima de personal y el perfil de estos)', type: 'textarea' },
  { key: '11', numero: '11', titulo: 'LUGAR DE ENTREGA Y CONDICIONES DE ENTREGA', type: 'heading' },
  { key: '11.1', numero: '11.1', titulo: 'LUGAR DE ENTREGA', helper: '(El lugar puede variar, conforme a la necesidad del usuario)', default: 'Los bienes serán entregados en el Almacén Central del Instituto Nacional de Salud, sito en Defensores del Morro N°2268 - Chorrillos.\nHorario de Atención: lunes a viernes de 8:00 hrs. a 16:00 hrs.', type: 'textarea' },
  { key: '11.2', numero: '11.2', titulo: 'CONDICIONES DE ENTREGA', default: 'El contratista debe acompañar al momento de la entrega del bien, la siguiente documentación:\n• Orden de compra-guía de internamiento (copia).\n• Guía de remisión, indicando el número de lote y la cantidad entregada del lote (destinatario + SUNAT + 02 copias adicionales).\n• Declaración Jurada de Responsabilidad por vicios ocultos (ver Anexo - B), de corresponder.\n• Copia de la Declaración Jurada de compromiso de canje por vencimiento de producto, de corresponder.\n• Documentos requeridos en el literal b).', type: 'textarea' },
  { key: '12', numero: '12', titulo: 'RESPONSABILIDAD POR VICIOS OCULTOS', default: 'La recepción conforme de la prestación por parte de LA ENTIDAD CONTRATANTE no enerva su derecho a reclamar posteriormente por defectos o vicios ocultos, conforme a lo dispuesto por los artículos 69 de la Ley N° 32069, Ley General de Contrataciones Públicas y 144 de su Reglamento aprobado por Decreto Supremo N° 009-2025-EF y sus modificatorias.\nEl plazo máximo de responsabilidad del contratista es de un (01) año contado a partir de la conformidad otorgada por LA ENTIDAD CONTRATANTE.', type: 'textarea' },
  { key: '13', numero: '13', titulo: 'OTRAS CLÁUSULAS', type: 'heading' },
  { key: '13.1', numero: '13.1', titulo: 'CLÁUSULA ANTICORRUPCIÓN Y ANTISOBORNO:', default: 'A la suscripción de este contrato, EL CONTRATISTA declara y garantiza no haber ofrecido, negociado, prometido o efectuado ningún pago o entrega de cualquier beneficio o incentivo ilegal, de manera directa o indirecta, a los evaluadores del proceso de contratación o cualquier servidor de la entidad contratante. Asimismo, EL CONTRATISTA se obliga a mantener una conducta proba e íntegra durante la vigencia del contrato.', type: 'textarea' },
  { key: '13.2', numero: '13.2', titulo: 'CLÁUSULA SOLUCIÓN DE CONTROVERSIAS CONTRACTUALES:', default: 'Las controversias que surjan entre las partes durante la ejecución del contrato se resuelven mediante CONCILIACIÓN, según el acuerdo de las partes, conforme a lo señalado en el artículo 82 de la Ley N° 32069, sin perjuicio de recurrir al arbitraje. Las controversias sobre nulidad del contrato solo pueden ser sometidas a arbitraje.', type: 'textarea' },
  { key: '13.3', numero: '13.3', titulo: 'CLÁUSULA RESOLUCIÓN DEL CONTRATO POR INCUMPLIMIENTO:', default: 'En el caso de la resolución por incumplimiento del contratista, la entidad contratante debe haber otorgado previamente un plazo de subsanación, salvo que el incumplimiento no pueda ser revertido.', type: 'textarea' },
  { key: '13.4', numero: '13.4', titulo: 'CLÁUSULA GESTIÓN DE RIESGOS:', default: 'LAS PARTES realizan la gestión de riesgos de acuerdo con lo establecido en el presente contrato y los documentos que lo conforman, a fin de tomar decisiones informadas durante la ejecución contractual, considerando la finalidad pública de la contratación.', type: 'textarea' },
  { key: '13.5', numero: '13.5', titulo: 'CLÁUSULA DE CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL:', default: 'El contratista se compromete a mantener en reserva y a no revelar a terceros, sin previa autorización escrita del INS, toda información que le sea suministrada y/o sea obtenida en el ejercicio de las actividades a desarrollarse. Los documentos técnicos, estudios, informes y demás que se deriven de las prestaciones contratadas serán de exclusiva propiedad del INS.', type: 'textarea' },
  { key: '13.6', numero: '13.6', titulo: 'CAUSALES DE RESOLUCIÓN DE CONTRATO', default: 'Se resuelve el contrato en los siguientes casos:\na) Cuando el/la contratista incumpla injustificadamente obligaciones contractuales, legales o reglamentarias, pese a haber sido requerido para ello.\nb) Cuando el/la contratista acumule el monto máximo de la penalidad por mora o por otras penalidades.\nc) Cuando el/la contratista paralice o reduzca injustificadamente la cantidad entregada del bien.\nd) Por incumplimiento de la cláusula anticorrupción y antisoborno.\ne) Por la presentación de documentación falsa o inexacta durante la ejecución contractual.\nf) Por caso fortuito o fuerza mayor que imposibilite de manera definitiva la continuación de la entrega del bien.', type: 'textarea' },
  { key: '14', numero: '14', titulo: 'ENTREGA DEL BIEN, MODALIDAD Y CONDICIONES DE PAGO', type: 'heading' },
  { key: '14.1', numero: '14.1', titulo: 'PLAZO DE ENTREGA DEL BIEN', intro: 'El plazo de entrega del bien es de XX días calendarios, contados desde el día siguiente de notificada la orden de compra. (Contemplar aquí el plazo total de entrega del bien; precisar si es un único entregable o, en su defecto, detallar en cuántas entregas parciales se dará). De corresponder entregas parciales, detallar así:', type: 'plazo' },
  { key: '14.2', numero: '14.2', titulo: 'MODALIDAD DE PAGO', default: 'Suma alzada, precios unitarios y/o esquema mixto según corresponda.', type: 'textarea' },
  { key: '14.3', numero: '14.3', titulo: 'CONDICIONES DE PAGO', default: 'Pago periódico / único, conforme a lo establecido en el numeral 14.1 y considerando la oferta económica del proveedor adjudicado. El pago se realiza posterior a la conformidad del bien.\n\nDOCUMENTACIÓN OBLIGATORIA PARA EL PAGO:\n• Comprobante de pago.\n• Guía de remisión.\n• Documento que sustente la Garantía comercial, de corresponder.\n• Formato CCI enlazado al RUC.\n• SCTR (de corresponder, cuando el bien incluya instalación).', type: 'textarea' },
  { key: '14.4', numero: '14.4', titulo: 'CONFORMIDAD DE RECEPCIÓN DEL BIEN', default: 'La recepción del bien se verificará con sello y firma del responsable de almacén, y la conformidad será otorgada por el usuario y el director general; en caso de investigaciones será otorgada por el Investigador Principal o coinvestigador del proyecto de investigación.', type: 'textarea' },
  { key: '15', numero: '15', titulo: 'PENALIDAD', default: 'En caso de retraso injustificado en la ejecución de las prestaciones objeto del contrato, la entidad contratante aplica al proveedor una penalidad por cada día de atraso que le sea imputable, hasta por un monto máximo equivalente al 10% del monto de la contratación o ítem correspondiente.\n\nPenalidad diaria = (0.10 x Monto de la contratación o ítem) / (F x Plazo en días del entregable), con F = 0.40.\n\nUna vez que se llega al monto máximo de la penalidad por mora, la entidad contratante puede optar por resolver el contrato.', type: 'textarea' },
  { key: '16', numero: '16', titulo: 'OTRAS PENALIDADES (OPCIONAL)', helper: '(De acuerdo al tipo de contratación las áreas usuarias pueden establecer otras penalidades distintas a la mora, las cuales deben ser objetivas, razonables y proporcionales con el objeto de la contratación)', type: 'textarea' },
  { key: '17', numero: '17', titulo: 'OTROS', type: 'textarea' },
  { key: '18', numero: '18', titulo: 'FIRMAS', type: 'firmas' },
];

let state = {
  byKey: {},     // key -> registro del backend ({ id, contenido, entregas, ... })
  editing: false,
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function keyOf(g) {
  if (g.numero) return String(g.numero);
  if (g.literal) return 'lit:' + g.literal;
  return 'id:' + g.id;
}

function rotulo(item) {
  if (item.literal) return `${item.literal}) ${item.titulo}`;
  if (item.numero) return `${item.numero}. ${item.titulo}`;
  return item.titulo;
}

function contenidoDe(item) {
  const g = state.byKey[item.key];
  const val = g && g.contenido != null ? g.contenido : '';
  return val !== '' ? val : (item.default || '');
}

function totalCantidad(entregas) {
  return (entregas || []).reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
}

// ---------- Render ----------
function buildView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-box"></i> Formato Bienes</h3>
          <p class="text-muted mb-0">Glosas de Requerimientos — Especificaciones Técnicas del Bien</p>
        </div>
        <div class="btn-group">
          <button id="fbEdit" class="btn btn-primary"><i class="bi bi-pencil-square"></i> Editar</button>
          <button id="fbSave" class="btn btn-success" disabled><i class="bi bi-save"></i> Grabar</button>
        </div>
      </div>
      <div id="fbMsg"></div>
      <div id="fbBody"></div>
    </div>
  `;
}

function renderSection(item) {
  if (item.type === 'heading') {
    return `<h5 class="mt-4 mb-2 fw-bold text-primary border-bottom pb-1">${esc(rotulo(item))}</h5>`;
  }
  if (item.type === 'plazo') return renderPlazo(item);
  if (item.type === 'firmas') return renderFirmas(item);

  const ro = state.editing ? '' : 'disabled';
  const val = contenidoDe(item);
  const helper = item.helper ? `<div class="form-text fst-italic text-secondary mb-1">${esc(item.helper)}</div>` : '';
  const field = item.type === 'text'
    ? `<input ${ro} class="form-control" data-key="${item.key}" type="text" value="${esc(val)}" />`
    : `<textarea ${ro} class="form-control" data-key="${item.key}" rows="3">${esc(val)}</textarea>`;
  return `
    <div class="mb-3">
      <label class="form-label fw-semibold">${esc(rotulo(item))}</label>
      ${helper}
      ${field}
    </div>
  `;
}

function renderPlazo(item) {
  const ro = state.editing ? '' : 'disabled';
  const g = state.byKey[item.key] || {};
  const entregas = g.entregas && g.entregas.length ? g.entregas
    : [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  const introVal = (g.contenido != null && g.contenido !== '') ? g.contenido : (item.intro || '');

  const rows = entregas.map((e, i) => `
    <tr>
      <td class="text-center align-middle">${i + 1}</td>
      <td><input ${ro} class="form-control form-control-sm fb-ent" data-i="${i}" data-f="cantidad" type="number" min="0" step="any" value="${esc(e.cantidad ?? 0)}" /></td>
      <td><input ${ro} class="form-control form-control-sm fb-ent" data-i="${i}" data-f="plazo" type="text" value="${esc(e.plazo || '')}" /></td>
      <td><input ${ro} class="form-control form-control-sm fb-ent" data-i="${i}" data-f="condicion" type="text" value="${esc(e.condicion || '')}" /></td>
      <td class="text-center align-middle">
        <button type="button" class="btn btn-sm btn-outline-danger fb-del" data-i="${i}" ${ro || entregas.length <= 1 ? 'disabled' : ''} title="Eliminar entregable"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');

  return `
    <h5 class="mt-4 mb-2 fw-bold text-primary border-bottom pb-1">${esc(rotulo(item))}</h5>
    <textarea ${ro} class="form-control mb-2" data-key="${item.key}" rows="3">${esc(introVal)}</textarea>
    <div class="table-responsive">
      <table class="table table-bordered align-middle mb-2" id="fbPlazoTable">
        <thead class="table-light">
          <tr>
            <th style="width:90px" class="text-center">N° Entrega</th>
            <th>Cantidad a entregar</th>
            <th>Plazo de Entrega</th>
            <th>Condición de entrega</th>
            <th style="width:60px" class="text-center">Acción</th>
          </tr>
        </thead>
        <tbody id="fbPlazoBody">${rows}</tbody>
        <tfoot>
          <tr class="table-secondary fw-bold">
            <td class="text-end">TOTAL</td>
            <td id="fbTotal">${totalCantidad(entregas)}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button type="button" id="fbAddRow" class="btn btn-sm btn-outline-primary" ${ro}><i class="bi bi-plus-lg"></i> Agregar entregable</button>
  `;
}

function renderFirmas() {
  return `
    <div class="row mt-5 mb-4 text-center">
      <div class="col-6">
        <div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div>
        <div class="small mt-1">FIRMA DEL SUB DIRECTOR Y/O<br>JEFE DE UNIDAD</div>
      </div>
      <div class="col-6">
        <div style="border-top:1px solid #333; width:80%; margin:0 auto;"></div>
        <div class="small mt-1">FIRMA DEL JEFE Y/O<br>DIRECTOR GENERAL</div>
      </div>
    </div>
  `;
}

function renderBody() {
  const body = document.getElementById('fbBody');
  if (!body) return;
  body.innerHTML = `<div class="card"><div class="card-body">${MODELO.map(renderSection).join('')}</div></div>`;
  attachDynamic();
}

function setMsg(type, text) {
  const el = document.getElementById('fbMsg');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${esc(text)}<button type="button" class="btn-close" onclick="this.parentElement.remove()"></button></div>`;
}

// ---------- Entregables (14.1) dinámico ----------
function plazoItem() { return MODELO.find((m) => m.type === 'plazo'); }
function plazoState() {
  const item = plazoItem();
  let g = state.byKey[item.key];
  if (!g) { g = state.byKey[item.key] = { entregas: [] }; }
  if (!Array.isArray(g.entregas) || !g.entregas.length) {
    g.entregas = [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }];
  }
  return g;
}

function refreshTotal() {
  const g = plazoState();
  const el = document.getElementById('fbTotal');
  if (el) el.textContent = totalCantidad(g.entregas);
}

function attachDynamic() {
  const addBtn = document.getElementById('fbAddRow');
  if (addBtn) addBtn.onclick = () => {
    const g = plazoState();
    g.entregas.push({ numero_entrega: g.entregas.length + 1, cantidad: 0, plazo: '', condicion: '' });
    renderBody();
  };
  document.querySelectorAll('.fb-del').forEach((btn) => {
    btn.onclick = () => {
      const g = plazoState();
      const i = Number(btn.dataset.i);
      if (g.entregas.length <= 1) return;
      g.entregas.splice(i, 1);
      renderBody();
    };
  });
  document.querySelectorAll('.fb-ent').forEach((inp) => {
    inp.oninput = () => {
      const g = plazoState();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      if (!g.entregas[i]) g.entregas[i] = { numero_entrega: i + 1, cantidad: 0, plazo: '', condicion: '' };
      g.entregas[i][f] = f === 'cantidad' ? (Number(inp.value) || 0) : inp.value;
      if (f === 'cantidad') refreshTotal();
    };
  });
}

// ---------- Carga / Guardado ----------
async function load() {
  try {
    const resp = await glosasBienesService.getAll();
    state.byKey = {};
    (resp.data || []).forEach((g) => { state.byKey[keyOf(g)] = g; });
    renderBody();
  } catch (e) {
    setMsg('danger', `Error al cargar el formato: ${e.message}`);
  }
}

function collectInputs() {
  // Lee los textarea/input de contenido al estado antes de guardar.
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (!state.byKey[key]) state.byKey[key] = {};
    state.byKey[key].contenido = el.value;
  });
}

function toggleEdit(on) {
  state.editing = on;
  const save = document.getElementById('fbSave');
  const edit = document.getElementById('fbEdit');
  if (save) save.disabled = !on;
  if (edit) edit.disabled = on;
  renderBody();
}

async function save() {
  if (!state.editing) return;
  collectInputs();
  setMsg('info', 'Guardando cambios…');
  const user = authService.getCurrentUser();
  const usuario = (user && (user.dni || user.nombre)) || 'sistema';
  const plazoKey = plazoItem().key;

  try {
    const items = MODELO.filter((m) => m.type !== 'heading' && m.type !== 'firmas');
    for (const item of items) {
      const g = state.byKey[item.key];
      if (!g || !g.id) continue; // solo persiste secciones existentes en el backend
      const payload = { contenido: g.contenido || '', usuario_modificacion: usuario };
      if (item.key === plazoKey) {
        payload.entregas = (g.entregas || []).map((e, idx) => ({
          numero_entrega: idx + 1,
          entregable: e.entregable || '',
          cantidad: Number(e.cantidad) || 0,
          plazo: e.plazo || '',
          condicion: e.condicion || '',
        }));
      }
      await glosasBienesService.update(g.id, payload);
    }
    setMsg('success', 'Formato guardado correctamente.');
    state.editing = false;
    const edit = document.getElementById('fbEdit');
    const saveBtn = document.getElementById('fbSave');
    if (edit) edit.disabled = false;
    if (saveBtn) saveBtn.disabled = true;
    await load();
  } catch (e) {
    setMsg('danger', `Error al guardar: ${e.message}`);
  }
}

export function renderFormatoBienesView() {
  return buildView();
}

export function initFormatoBienesView() {
  const btnEdit = document.getElementById('fbEdit');
  const btnSave = document.getElementById('fbSave');
  if (btnEdit) btnEdit.onclick = () => toggleEdit(true);
  if (btnSave) btnSave.onclick = () => save();
  load();
}
