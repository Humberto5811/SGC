import { requerimientoService } from '../services/requerimientoService.js';

function renderFormLocacionView() {
  return `
    <h2>Registro de Requerimiento - LOCACIÓN</h2>
    <form id="formLocacion">
      <div class="mb-3">
        <label>Área Usuaria *</label>
        <input id="areaLocacion" class="form-control" required />
      </div>
      <div class="mb-3">
        <label>Denominación *</label>
        <input id="denominacionLocacion" class="form-control" required />
      </div>
      <div class="mb-3">
        <label>Objetivo de la locación</label>
        <textarea id="objetivoLocacion" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Finalidad de la locación</label>
        <textarea id="finalidadLocacion" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Duración del contrato</label>
        <input id="duracionLocacion" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Requisitos del locador</label>
        <textarea id="requisitosLocacion" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Lugar de prestación</label>
        <input id="lugarLocacion" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Condiciones de prestación</label>
        <textarea id="condicionesLocacion" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Modalidad de pago</label>
        <input id="modalidadPagoLocacion" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Condiciones de pago</label>
        <textarea id="condicionesPagoLocacion" class="form-control" rows="2"></textarea>
      </div>
      <button type="submit" class="btn btn-success">Guardar requerimiento</button>
    </form>
  `;
}

function initFormLocacionView() {
  const form = document.getElementById('formLocacion');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const record = {
        tipo: 'LOCACION',
        area: form.areaLocacion.value,
        denominacion: form.denominacionLocacion.value,
        objetivo: form.objetivoLocacion.value,
        finalidad: form.finalidadLocacion.value,
        duracion: form.duracionLocacion.value,
        requisitosProveedor: form.requisitosLocacion.value,
        lugarPrestacion: form.lugarLocacion.value,
        condicionesPrestacion: form.condicionesLocacion.value,
        modalidadPago: form.modalidadPagoLocacion.value,
        condicionesPago: form.condicionesPagoLocacion.value,
      };
      requerimientoService.create(record);
      location.reload();
    });
  }
}

export { renderFormLocacionView, initFormLocacionView };
