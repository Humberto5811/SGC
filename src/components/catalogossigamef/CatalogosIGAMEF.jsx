// Componente Catálogos IGAMEF - Versión JavaScript Puro (sin React)
let currentPage = 1;
const itemsPerPage = 10;
let allCatalogos = [];

export function renderCatalogosIGAMEF() {
  return `
    <div class="catalogos-igamef-container">
      <div class="catalogos-header">
        <h1><i class="bi bi-table"></i> Catálogos IGAMEF</h1>
        <button id="btnNuevoCatalogo" class="btn btn-primary">
          <i class="bi bi-plus-circle"></i> Nuevo Catálogo
        </button>
      </div>

      <div class="catalogos-filtros">
        <div class="filtro-busqueda">
          <input type="text" id="searchInput" placeholder="Buscar por código o nombre..." class="form-control">
          <i class="bi bi-search"></i>
        </div>
        <div class="filtro-estado">
          <select id="filtroEstado" class="form-control">
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
      </div>

      <div class="catalogos-table-container">
        <div class="loading-spinner" id="loadingSpinner" style="display: none;">
          <div class="spinner"></div>
          <p>Cargando catálogos...</p>
        </div>
        <div id="catalogosContent"></div>
      </div>

      <div class="pagination-container" id="paginationContainer"></div>
    </div>

    <!-- Modal para crear/editar -->
    <div id="catalogoModal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modalTitle">Nuevo Catálogo</h3>
          <button class="modal-close">&times;</button>
        </div>
        <form id="catalogoForm">
          <input type="hidden" id="catalogoId">
          <div class="form-group">
            <label>Código *</label>
            <input type="text" id="codigo" required class="form-control">
          </div>
          <div class="form-group">
            <label>Nombre *</label>
            <input type="text" id="nombre" required class="form-control">
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea id="descripcion" rows="3" class="form-control"></textarea>
          </div>
          <div class="form-group">
            <label>Orden</label>
            <input type="number" id="orden" value="0" class="form-control">
          </div>
          <div class="form-group" id="activoGroup" style="display: none;">
            <label>
              <input type="checkbox" id="activo"> Activo
            </label>
          </div>
          <div class="modal-buttons">
            <button type="button" class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export async function initCatalogosIGAMEF() {
  await cargarCatalogos();
  configurarEventos();
}

async function cargarCatalogos() {
  const loadingSpinner = document.getElementById('loadingSpinner');
  const catalogosContent = document.getElementById('catalogosContent');
  
  if (loadingSpinner) loadingSpinner.style.display = 'flex';
  if (catalogosContent) catalogosContent.innerHTML = '';
  
  try {
    const response = await fetch('/api/catalogos-igamef');
    const result = await response.json();
    
    if (result.success) {
      allCatalogos = result.data;
      filtrarYMostrarCatalogos();
    } else {
      mostrarError('Error al cargar catálogos: ' + result.error);
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarError('Error de conexión al servidor');
  } finally {
    if (loadingSpinner) loadingSpinner.style.display = 'none';
  }
}

function filtrarYMostrarCatalogos() {
  const searchText = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const filtroEstado = document.getElementById('filtroEstado')?.value || 'todos';
  
  let catalogosFiltrados = allCatalogos.filter(catalogo => {
    // Filtro de búsqueda
    const matchesSearch = catalogo.codigo.toLowerCase().includes(searchText) || 
                         catalogo.nombre.toLowerCase().includes(searchText);
    
    // Filtro de estado
    let matchesEstado = true;
    if (filtroEstado === 'activos') matchesEstado = catalogo.activo === true;
    if (filtroEstado === 'inactivos') matchesEstado = catalogo.activo === false;
    
    return matchesSearch && matchesEstado;
  });
  
  // Ordenar
  catalogosFiltrados.sort((a, b) => a.orden - b.orden);
  
  // Paginación
  const totalPages = Math.ceil(catalogosFiltrados.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = 1;
  const start = (currentPage - 1) * itemsPerPage;
  const paginatedCatalogos = catalogosFiltrados.slice(start, start + itemsPerPage);
  
  // Renderizar tabla
  renderTablaCatalogos(paginatedCatalogos);
  renderPaginacion(totalPages);
}

function renderTablaCatalogos(catalogos) {
  const container = document.getElementById('catalogosContent');
  if (!container) return;
  
  if (catalogos.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info">
        <i class="bi bi-info-circle"></i> No hay catálogos registrados
      </div>
    `;
    return;
  }
  
  let html = `
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Nombre</th>
          <th>Descripción</th>
          <th>Orden</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  for (const catalogo of catalogos) {
    html += `
      <tr>
        <td><strong>${escapeHtml(catalogo.codigo)}</strong></td>
        <td>${escapeHtml(catalogo.nombre)}</td>
        <td>${escapeHtml(catalogo.descripcion || '-')}</td>
        <td class="text-center">${catalogo.orden}</td>
        <td>
          <span class="badge ${catalogo.activo ? 'badge-success' : 'badge-danger'}">
            ${catalogo.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td class="actions">
          <button class="btn-icon btn-edit" data-id="${catalogo.id}" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn-icon btn-toggle" data-id="${catalogo.id}" data-activo="${catalogo.activo}" title="${catalogo.activo ? 'Desactivar' : 'Activar'}">
            <i class="bi bi-${catalogo.activo ? 'toggle-on' : 'toggle-off'}"></i>
          </button>
          <button class="btn-icon btn-delete" data-id="${catalogo.id}" title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }
  
  html += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = html;
  
  // Asignar eventos a los botones
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => editarCatalogo(parseInt(btn.dataset.id)));
  });
  
  document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleEstadoCatalogo(parseInt(btn.dataset.id), btn.dataset.activo === 'true'));
  });
  
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => eliminarCatalogo(parseInt(btn.dataset.id)));
  });
}

function renderPaginacion(totalPages) {
  const container = document.getElementById('paginationContainer');
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }
  
  let html = '<div class="pagination">';
  
  // Botón anterior
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">«</button>`;
  
  // Números de página
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span class="page-dots">...</span>';
    }
  }
  
  // Botón siguiente
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">»</button>`;
  html += '</div>';
  
  container.innerHTML = html;
  
  // Asignar eventos de paginación
  document.querySelectorAll('.page-btn').forEach(btn => {
    if (!btn.disabled) {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page);
        if (!isNaN(page)) {
          currentPage = page;
          filtrarYMostrarCatalogos();
        }
      });
    }
  });
}

function configurarEventos() {
  // Botón nuevo catálogo
  const btnNuevo = document.getElementById('btnNuevoCatalogo');
  if (btnNuevo) {
    btnNuevo.addEventListener('click', () => abrirModal());
  }
  
  // Búsqueda
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      filtrarYMostrarCatalogos();
    });
  }
  
  // Filtro de estado
  const filtroEstado = document.getElementById('filtroEstado');
  if (filtroEstado) {
    filtroEstado.addEventListener('change', () => {
      currentPage = 1;
      filtrarYMostrarCatalogos();
    });
  }
  
  // Modal - cerrar
  const modal = document.getElementById('catalogoModal');
  const closeBtn = document.querySelector('.modal-close');
  const cancelBtn = document.getElementById('btnCancelar');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => cerrarModal());
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => cerrarModal());
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cerrarModal();
    });
  }
  
  // Formulario
  const form = document.getElementById('catalogoForm');
  if (form) {
    form.addEventListener('submit', guardarCatalogo);
  }
}

function abrirModal(catalogo = null) {
  const modal = document.getElementById('catalogoModal');
  const modalTitle = document.getElementById('modalTitle');
  const catalogoId = document.getElementById('catalogoId');
  const codigo = document.getElementById('codigo');
  const nombre = document.getElementById('nombre');
  const descripcion = document.getElementById('descripcion');
  const orden = document.getElementById('orden');
  const activoGroup = document.getElementById('activoGroup');
  const activo = document.getElementById('activo');
  
  if (!modal) return;
  
  if (catalogo) {
    // Modo edición
    if (modalTitle) modalTitle.textContent = 'Editar Catálogo';
    if (catalogoId) catalogoId.value = catalogo.id;
    if (codigo) codigo.value = catalogo.codigo;
    if (nombre) nombre.value = catalogo.nombre;
    if (descripcion) descripcion.value = catalogo.descripcion || '';
    if (orden) orden.value = catalogo.orden;
    if (activoGroup) activoGroup.style.display = 'block';
    if (activo) activo.checked = catalogo.activo;
  } else {
    // Modo nuevo
    if (modalTitle) modalTitle.textContent = 'Nuevo Catálogo';
    if (catalogoId) catalogoId.value = '';
    if (codigo) codigo.value = '';
    if (nombre) nombre.value = '';
    if (descripcion) descripcion.value = '';
    if (orden) orden.value = '0';
    if (activoGroup) activoGroup.style.display = 'none';
    if (activo) activo.checked = true;
  }
  
  modal.style.display = 'flex';
}

function cerrarModal() {
  const modal = document.getElementById('catalogoModal');
  if (modal) modal.style.display = 'none';
}

async function guardarCatalogo(e) {
  e.preventDefault();
  
  const id = document.getElementById('catalogoId')?.value;
  const codigo = document.getElementById('codigo')?.value;
  const nombre = document.getElementById('nombre')?.value;
  const descripcion = document.getElementById('descripcion')?.value;
  const orden = parseInt(document.getElementById('orden')?.value) || 0;
  const activo = document.getElementById('activo')?.checked || false;
  
  const data = { codigo, nombre, descripcion, orden };
  const url = id ? `/api/catalogos-igamef/${id}` : '/api/catalogos-igamef';
  const method = id ? 'PUT' : 'POST';
  
  if (id && activo !== undefined) {
    data.activo = activo;
  }
  
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      cerrarModal();
      await cargarCatalogos();
      mostrarMensaje(id ? 'Catálogo actualizado' : 'Catálogo creado', 'success');
    } else {
      mostrarMensaje('Error: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarMensaje('Error de conexión', 'error');
  }
}

async function editarCatalogo(id) {
  try {
    const response = await fetch(`/api/catalogos-igamef/${id}`);
    const result = await response.json();
    
    if (result.success) {
      abrirModal(result.data);
    } else {
      mostrarMensaje('Error al cargar el catálogo', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarMensaje('Error de conexión', 'error');
  }
}

async function toggleEstadoCatalogo(id, estadoActual) {
  try {
    const response = await fetch(`/api/catalogos-igamef/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !estadoActual })
    });
    
    const result = await response.json();
    
    if (result.success) {
      await cargarCatalogos();
      mostrarMensaje(`Catálogo ${!estadoActual ? 'activado' : 'desactivado'}`, 'success');
    } else {
      mostrarMensaje('Error: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarMensaje('Error de conexión', 'error');
  }
}

async function eliminarCatalogo(id) {
  if (!confirm('¿Estás seguro de eliminar este catálogo? Esta acción no se puede deshacer.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/catalogos-igamef/${id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      await cargarCatalogos();
      mostrarMensaje('Catálogo eliminado', 'success');
    } else {
      mostrarMensaje('Error: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    mostrarMensaje('Error de conexión', 'error');
  }
}

function mostrarMensaje(mensaje, tipo) {
  // Crear elemento de mensaje flotante
  const toast = document.createElement('div');
  toast.className = `toast-message toast-${tipo}`;
  toast.innerHTML = `
    <i class="bi bi-${tipo === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i>
    <span>${mensaje}</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function mostrarError(mensaje) {
  const container = document.getElementById('catalogosContent');
  if (container) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle"></i> ${mensaje}
      </div>
    `;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}