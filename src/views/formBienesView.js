import { requerimientoService } from '../services/requerimientoService.js';

function renderFormBienesView() {
  return `
    <h2>Registro de Requerimiento - BIENES</h2>
    <form id="formBienes">
      <div class="mb-3">
        <label>Área Usuaria *</label>
        <input id="areaBienes" class="form-control" required />
      </div>
      <div class="mb-3">
        <label>Denominación *</label>
        <input id="denominacionBienes" class="form-control" required />
      </div>
      <div class="mb-3">
        <label>Objetivo de la contratación</label>
        <textarea id="objetivoBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Finalidad de la contratación</label>
        <textarea id="finalidadBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Documentación para acreditar cumplimiento</label>
        <textarea id="documentacionBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Vigencia del producto</label>
        <input id="vigenciaBienes" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Reglamentos técnicos / Normas</label>
        <textarea id="reglamentosBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Entregas</label>
        <textarea id="entregasBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Garantía comercial</label>
        <textarea id="garantiaBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Requisitos del proveedor</label>
        <textarea id="requisitosBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Lugar de entrega</label>
        <input id="lugarEntregaBienes" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Condiciones de entrega</label>
        <textarea id="condicionesEntregaBienes" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Modalidad de pago</label>
        <input id="modalidadPagoBienes" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Condiciones de pago</label>
        <textarea id="condicionesPagoBienes" class="form-control" rows="2"></textarea>
      </div>
      <button type="submit" class="btn btn-success">Guardar requerimiento</button>
    </form>
  `;
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
      location.reload();
    });
  }
}

export { renderFormBienesView, initFormBienesView };
