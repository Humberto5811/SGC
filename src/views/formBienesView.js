import { requerimientoService } from '../services/requerimientoService.js';
import { glosasBienesService } from '../services/glosasBienesService.js';

const FIELD_MAP = {
  'Objetivo de la contratación': 'objetivoBienes',
  'Finalidad de la contratación': 'finalidadBienes',
  'Documentación para acreditar cumplimiento': 'documentacionBienes',
  'Vigencia del producto': 'vigenciaBienes',
  'Reglamentos técnicos / Normas': 'reglamentosBienes',
  'Plazo de entrega': 'entregasBienes',
  'Garantía comercial': 'garantiaBienes',
  'Requisitos del proveedor': 'requisitosBienes',
  'Lugar de entrega': 'lugarEntregaBienes',
  'Condiciones de entrega': 'condicionesEntregaBienes',
  'Modalidad de pago': 'modalidadPagoBienes',
  'Condiciones de pago': 'condicionesPagoBienes'
};

function renderFormBienesView() {
  return `
    <div class="container mt-4">
      <h2>Registro de Requerimiento - BIENES</h2>
      <form id="formBienes" class="mt-4">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Área Usuaria *</label>
            <input id="areaBienes" class="form-control" required />
          </div>
          <div class="col-md-6">
            <label class="form-label">Denominación *</label>
            <input id="denominacionBienes" class="form-control" required />
          </div>
          <div class="col-12">
            <label class="form-label">Objetivo de la contratación</label>
            <textarea id="objetivoBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Finalidad de la contratación</label>
            <textarea id="finalidadBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Documentación para acreditar cumplimiento</label>
            <textarea id="documentacionBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label">Vigencia del producto</label>
            <input id="vigenciaBienes" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Reglamentos técnicos / Normas</label>
            <textarea id="reglamentosBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Entregas</label>
            <textarea id="entregasBienes" class="form-control" rows="3"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Garantía comercial</label>
            <textarea id="garantiaBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Requisitos del proveedor</label>
            <textarea id="requisitosBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label">Lugar de entrega</label>
            <input id="lugarEntregaBienes" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Condiciones de entrega</label>
            <textarea id="condicionesEntregaBienes" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label">Modalidad de pago</label>
            <input id="modalidadPagoBienes" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Condiciones de pago</label>
            <textarea id="condicionesPagoBienes" class="form-control" rows="2"></textarea>
          </div>
        </div>
        <div class="mt-4">
          <button type="submit" class="btn btn-success">Guardar requerimiento</button>
        </div>
      </form>
            <div id="glosasBienesPanel" class="mt-4"></div>
    </div>
  `;
}

async function loadGlosasToForm() {
  try {
    const response = await glosasBienesService.getAll();
    const glosas = response.data || [];
    // Rellenar campos mapeados (si existen)
    glosas.forEach((glosa) => {
      const fieldId = FIELD_MAP[glosa.titulo];
      if (!fieldId) return;
      const field = document.getElementById(fieldId);
      if (!field) return;
      field.value = glosa.contenido || '';
    });

    // Renderizar panel informativo con todas las glosas (reutilización)
    const panel = document.getElementById('glosasBienesPanel');
    if (!panel) return;
    panel.innerHTML = '';
    glosas.forEach((glosa) => {
      const label = (glosa.literal ? glosa.literal + ') ' : (glosa.numero ? glosa.numero + ' ' : '')) + glosa.titulo;
      if (glosa.numero === '14.1') {
        // Render tabla dinámica resumen (solo lectura)
        const rows = (glosa.entregas || []).map((e, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${e.entregable || '-'}</td>
            <td>${Number(e.cantidad) || 0}</td>
            <td>${e.plazo || '-'}</td>
            <td>${e.condicion || '-'}</td>
          </tr>
        `).join('');
        const total = (glosa.entregas || []).reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
        panel.insertAdjacentHTML('beforeend', `
          <div class="card mb-3">
            <div class="card-header"><strong>${label}</strong></div>
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-sm table-bordered">
                  <thead><tr><th>N°</th><th>Entregable</th><th>Cantidad</th><th>Plazo</th><th>Condición</th></tr></thead>
                  <tbody>${rows || '<tr><td colspan="5">Sin entregas</td></tr>'}</tbody>
                  <tfoot><tr><th colspan="2">Total</th><th>${total}</th><th colspan="2"></th></tr></tfoot>
                </table>
              </div>
            </div>
          </div>
        `);
      } else {
        panel.insertAdjacentHTML('beforeend', `
          <div class="mb-2">
            <label class="form-label"><strong>${label}</strong></label>
            <div class="form-control-plaintext">${(glosa.contenido || '-').replace(/\n/g, '<br/>')}</div>
          </div>
        `);
      }
    });
  } catch (error) {
    console.warn('No se pudieron cargar las glosas de bienes:', error.message);
  }
}

function initFormBienesView() {
  const form = document.getElementById('formBienes');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const record = {
        tipo: 'BIENES',
        area: form.areaBienes.value,
        denominacion: form.denominacionBienes.value,
        objetivo: form.objetivoBienes.value,
        finalidad: form.finalidadBienes.value,
        documentacion: form.documentacionBienes.value,
        vigencia: form.vigenciaBienes.value,
        reglamentos: form.reglamentosBienes.value,
        entregas: form.entregasBienes.value,
        garantia: form.garantiaBienes.value,
        requisitosProveedor: form.requisitosBienes.value,
        lugarEntrega: form.lugarEntregaBienes.value,
        condicionesEntrega: form.condicionesEntregaBienes.value,
        modalidadPago: form.modalidadPagoBienes.value,
        condicionesPago: form.condicionesPagoBienes.value,
      };
      requerimientoService.create(record);
      setTimeout(() => {
        setMessage('success', 'Requerimiento guardado localmente.');
      }, 0);
    });
    loadGlosasToForm();
  }
}

function setMessage(type, text) {
  const existing = document.getElementById('formBienesMessage');
  if (existing) existing.remove();
  const form = document.getElementById('formBienes');
  if (!form) return;
  form.insertAdjacentHTML('beforebegin', `
    <div id="formBienesMessage" class="alert alert-${type} mt-3">${text}</div>
  `);
}

export { renderFormBienesView, initFormBienesView };
