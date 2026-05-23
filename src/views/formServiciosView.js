import { requerimientoService } from '../services/requerimientoService.js';

function renderFormServiciosView() {
  return `
    <h2>Registro de Requerimiento - SERVICIOS</h2>
    <form id="formServicios">
      <div class="mb-3">
        <label>Área Usuaria *</label>
        <input id="areaServicios" class="form-control" required />
      </div>
      <div class="mb-3">
        <label>Denominación *</label>
        <input id="denominacionServicios" class="form-control" required />
      </div>
      <div class="mb-3">
        <label>Objetivo del servicio</label>
        <textarea id="objetivoServicios" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Alcance del servicio</label>
        <textarea id="alcanceServicios" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Entregables</label>
        <textarea id="entregablesServicios" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Duración del servicio</label>
        <input id="duracionServicios" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Requisitos del proveedor</label>
        <textarea id="requisitosServicios" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Lugar de prestación</label>
        <input id="lugarServicios" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Condiciones de prestación</label>
        <textarea id="condicionesServicios" class="form-control" rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label>Modalidad de pago</label>
        <input id="modalidadPagoServicios" class="form-control" />
      </div>
      <div class="mb-3">
        <label>Condiciones de pago</label>
        <textarea id="condicionesPagoServicios" class="form-control" rows="2"></textarea>
      </div>
      <button type="submit" class="btn btn-success">Guardar requerimiento</button>
    </form>
  `;
}

function initFormServiciosView() {
  const form = document.getElementById('formServicios');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const record = {
        tipo: 'SERVICIOS',
        area: form.areaServicios.value,
        denominacion: form.denominacionServicios.value,
        objetivo: form.objetivoServicios.value,
        alcance: form.alcanceServicios.value,
        entregables: form.entregablesServicios.value,
        duracion: form.duracionServicios.value,
        requisitosProveedor: form.requisitosServicios.value,
        lugarPrestacion: form.lugarServicios.value,
        condicionesPrestacion: form.condicionesServicios.value,
        modalidadPago: form.modalidadPagoServicios.value,
        condicionesPago: form.condicionesPagoServicios.value,
      };
      requerimientoService.create(record);
      location.reload();
    });
  }
}

export { renderFormServiciosView, initFormServiciosView };
