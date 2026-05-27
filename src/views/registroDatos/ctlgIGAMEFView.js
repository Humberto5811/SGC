// Vista de Catálogos IGAMEF - Almacenamiento Local
const STORAGE_KEY = 'catalogos_igamef';

function inicializarDatos() {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (!guardado) {
    const datosIniciales = [
      { id: 1, codigo: 'CAT001', nombre: 'Materiales de Oficina', descripcion: 'Papelería, útiles y consumibles', orden: 1, activo: true, createdAt: new Date().toISOString() },
      { id: 2, codigo: 'CAT002', nombre: 'Equipos de Cómputo', descripcion: 'Computadoras, impresoras y periféricos', orden: 2, activo: true, createdAt: new Date().toISOString() },
      { id: 3, codigo: 'CAT003', nombre: 'Mobiliario', descripcion: 'Escritorios, sillas y archiveros', orden: 3, activo: true, createdAt: new Date().toISOString() },
      { id: 4, codigo: 'CAT004', nombre: 'Servicios Profesionales', descripcion: 'Consultorías y asesorías', orden: 4, activo: false, createdAt: new Date().toISOString() }
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datosIniciales));
  }
}

function obtenerCatalogos() {
  const guardado = localStorage.getItem(STORAGE_KEY);
  return guardado ? JSON.parse(guardado) : [];
}

function guardarCatalogos(catalogos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogos));
}

function obtenerNuevoId(catalogos) {
  return catalogos.length > 0 ? Math.max(...catalogos.map(c => c.id)) + 1 : 1;
}

export async function renderCatalogosIGAMEFView() {
  return `
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h2><i class="bi bi-table"></i> Catálogos IGAMEF</h2>
        <button id="btnNuevoCatalogo" class="btn btn-primary">
          <i class="bi bi-plus-circle"></i> Nuevo Catálogo
        </button>
      </div>
      <div class="card-body">
        <div class="alert alert-info alert-dismissible fade show">
          <i class="bi bi-info-circle"></i>
          Los datos se guardan automáticamente en tu navegador.
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
        <div class="table-responsive">
          <table class="table table-striped table-hover">
            <thead class="table-dark">
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Descripción</th>
                <th style="width: 80px">Orden</th>
                <th style="width: 100px">Estado</th>
                <th style="width: 150px">Acciones</th>
              </tr>
            </thead>
            <tbody id="tablaCatalogos">
              <tr><td colspan="6" class="text-center">Cargando...</td</tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function initCatalogosIGAMEFView() {
  console.log('✅ Catálogos IGAMEF inicializado');
  inicializarDatos();
  mostrarTabla();
  
  const btnNuevo = document.getElementById('btnNuevoCatalogo');
  if (btnNuevo) {
    btnNuevo.onclick = () => mostrarFormulario();
  }
}

function mostrarTabla() {
  const tbody = document.getElementById('tablaCatalogos');
  if (!tbody) return;
  
  const catalogos = obtenerCatalogos();
  catalogos.sort((a, b) => a.orden - b.orden);
  
  if (catalogos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay catálogos registrados</td></tr>';
    return;
  }
  
  let html = '';
  for (const cat of catalogos) {
    html += `
      <tr>
        <td><strong>${escapeHtml(cat.codigo)}</strong></td>
        <td>${escapeHtml(cat.nombre)}</td>
        <td>${escapeHtml(cat.descripcion || '-')}</td>
        <td class="text-center">${cat.orden}</td>
        <td>
          <span class="badge ${cat.activo ? 'bg-success' : 'bg-secondary'}">
            ${cat.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-warning me-1 btn-editar" data-id="${cat.id}" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm ${cat.activo ? 'btn-outline-secondary' : 'btn-outline-success'} me-1 btn-toggle" 
                  data-id="${cat.id}" data-activo="${cat.activo}" 
                  title="${cat.activo ? 'Desactivar' : 'Activar'}">
            <i class="bi bi-${cat.activo ? 'toggle-off' : 'toggle-on'}"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-eliminar" data-id="${cat.id}" title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
  
  document.querySelectorAll('.btn-editar').forEach(btn => {
    btn.onclick = () => editarCatalogo(parseInt(btn.dataset.id));
  });
  document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.onclick = () => toggleEstado(parseInt(btn.dataset.id), btn.dataset.activo === 'true');
  });
  document.querySelectorAll('.btn-eliminar').forEach(btn => {
    btn.onclick = () => eliminarCatalogo(parseInt(btn.dataset.id));
  });
}

function mostrarFormulario(catalogo = null) {
  const esEdicion = catalogo !== null;
  const titulo = esEdicion ? 'Editar Catálogo' : 'Nuevo Catálogo';
  
  const modalHtml = `
    <div class="modal fade" id="modalCatalogo" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">${titulo}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="formCatalogo">
              <input type="hidden" id="catalogoId" value="${catalogo ? catalogo.id : ''}">
              <div class="mb-3">
                <label class="form-label fw-bold">Código *</label>
                <input type="text" class="form-control" id="codigo" value="${catalogo ? escapeHtml(catalogo.codigo) : ''}" required placeholder="Ej: CAT001">
              </div>
              <div class="mb-3">
                <label class="form-label fw-bold">Nombre *</label>
                <input type="text" class="form-control" id="nombre" value="${catalogo ? escapeHtml(catalogo.nombre) : ''}" required placeholder="Nombre del catálogo">
              </div>
              <div class="mb-3">
                <label class="form-label fw-bold">Descripción</label>
                <textarea class="form-control" id="descripcion" rows="3" placeholder="Descripción opcional">${catalogo ? escapeHtml(catalogo.descripcion || '') : ''}</textarea>
              </div>
              <div class="mb-3">
                <label class="form-label fw-bold">Orden</label>
                <input type="number" class="form-control" id="orden" value="${catalogo ? catalogo.orden : 0}" placeholder="Número de orden">
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="btnGuardar">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const modalExistente = document.getElementById('modalCatalogo');
  if (modalExistente) modalExistente.remove();
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById('modalCatalogo'));
  modal.show();
  
  document.getElementById('btnGuardar').onclick = () => guardarCatalogo(modal);
}

function guardarCatalogo(modal) {
  const id = document.getElementById('catalogoId').value;
  const catalogos = obtenerCatalogos();
  const ahora = new Date().toISOString();
  
  const datos = {
    codigo: document.getElementById('codigo').value.trim(),
    nombre: document.getElementById('nombre').value.trim(),
    descripcion: document.getElementById('descripcion').value.trim(),
    orden: parseInt(document.getElementById('orden').value) || 0,
    updatedAt: ahora
  };
  
  if (!datos.codigo || !datos.nombre) {
    mostrarAlerta('Código y nombre son requeridos', 'danger');
    return;
  }
  
  if (id) {
    const index = catalogos.findIndex(c => c.id === parseInt(id));
    if (index !== -1) {
      datos.id = parseInt(id);
      datos.activo = catalogos[index].activo;
      datos.createdAt = catalogos[index].createdAt;
      catalogos[index] = datos;
    }
  } else {
    datos.id = obtenerNuevoId(catalogos);
    datos.activo = true;
    datos.createdAt = ahora;
    catalogos.push(datos);
  }
  
  guardarCatalogos(catalogos);
  modal.hide();
  mostrarTabla();
  mostrarAlerta('Guardado exitosamente', 'success');
}

function editarCatalogo(id) {
  const catalogos = obtenerCatalogos();
  const catalogo = catalogos.find(c => c.id === id);
  if (catalogo) mostrarFormulario(catalogo);
}

function toggleEstado(id, estadoActual) {
  const catalogos = obtenerCatalogos();
  const catalogo = catalogos.find(c => c.id === id);
  if (catalogo) {
    catalogo.activo = !estadoActual;
    catalogo.updatedAt = new Date().toISOString();
    guardarCatalogos(catalogos);
    mostrarTabla();
    mostrarAlerta(`Catálogo ${!estadoActual ? 'activado' : 'desactivado'}`, 'success');
  }
}

function eliminarCatalogo(id) {
  if (!confirm('¿Estás seguro de eliminar este catálogo?')) return;
  
  let catalogos = obtenerCatalogos();
  catalogos = catalogos.filter(c => c.id !== id);
  guardarCatalogos(catalogos);
  mostrarTabla();
  mostrarAlerta('Eliminado exitosamente', 'success');
}

function mostrarAlerta(mensaje, tipo) {
  const alerta = document.createElement('div');
  alerta.className = `alert alert-${tipo} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
  alerta.style.zIndex = '9999';
  alerta.innerHTML = `
    ${mensaje}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.body.appendChild(alerta);
  setTimeout(() => alerta.remove(), 3000);
}

function escapeHtml(texto) {
  if (!texto) return '';
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}