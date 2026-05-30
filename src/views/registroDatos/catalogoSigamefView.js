// =====================================================
// Catálogo SIGAMEF - Vista con CRUD e Import/Export Excel
// Conectado al backend (PostgreSQL) con paginación y búsqueda server-side.
// =====================================================
import { api } from '../../services/apiService.js';

const PAGE_SIZE = 50;

let pageRows = [];        // filas de la página actual (desde la API)
let currentPage = 1;
let totalRecords = 0;
let totalPages = 1;
let searchTerm = '';
let editingId = null;
let loadError = '';

async function fetchPage() {
  try {
    const resp = await api.list('catalogo', { page: currentPage, pageSize: PAGE_SIZE, search: searchTerm });
    pageRows = resp.data || [];
    totalRecords = resp.total || 0;
    totalPages = resp.totalPages || 1;
    if (currentPage > totalPages) { currentPage = totalPages; }
    loadError = '';
  } catch (e) {
    console.error('Error al cargar catálogo desde la API:', e);
    pageRows = [];
    totalRecords = 0;
    totalPages = 1;
    loadError = e.message || 'No se pudo conectar con el servidor.';
  }
}

function getTotalPages() {
  return Math.max(1, totalPages);
}

function checkIcon(val) {
  return val ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-secondary"></i>';
}

function renderTableRows() {
  if (loadError) {
    return `<tr><td colspan="10" class="text-center text-danger py-4">
      <i class="bi bi-exclamation-triangle"></i> ${loadError}<br>
      <small class="text-muted">Verifique que el servidor backend esté corriendo (npm run server).</small>
    </td></tr>`;
  }
  if (pageRows.length === 0) {
    return `<tr><td colspan="10" class="text-center text-muted py-4">No se encontraron registros</td></tr>`;
  }
  return pageRows.map((item) => {
    const precio = parseFloat(item.precio_unitario) || 0;
    return `<tr>
      <td class="small">${item.tipo_bien || ''}</td>
      <td class="small fw-bold">${item.item_bien || ''}</td>
      <td class="small">${item.nombre_item || ''}</td>
      <td class="small">${item.unidad_medida || ''}</td>
      <td class="small text-end">${precio.toFixed(2)}</td>
      <td class="text-center">${checkIcon(item.ficha_tecnica)}</td>
      <td class="text-center">${checkIcon(item.acuerdo_marco)}</td>
      <td class="text-center">${checkIcon(item.producto_controlado)}</td>
      <td class="text-center">${checkIcon(item.ficha_homologada)}</td>
      <td class="text-center" style="white-space:nowrap;">
        <button class="btn btn-sm btn-outline-primary me-1 btn-catalogo-edit" data-id="${item.id}" title="Editar">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger btn-catalogo-delete" data-id="${item.id}" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderPagination() {
  const totalPages = getTotalPages();
  if (totalPages <= 1) return '';

  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  let pages = '';
  if (startPage > 1) {
    pages += `<li class="page-item"><a class="page-link btn-catalogo-page" data-page="1" href="#">1</a></li>`;
    if (startPage > 2) pages += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
  }
  for (let i = startPage; i <= endPage; i++) {
    pages += `<li class="page-item ${i === currentPage ? 'active' : ''}">
      <a class="page-link btn-catalogo-page" data-page="${i}" href="#">${i}</a>
    </li>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pages += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    pages += `<li class="page-item"><a class="page-link btn-catalogo-page" data-page="${totalPages}" href="#">${totalPages}</a></li>`;
  }

  return `
    <nav aria-label="Paginación catálogo">
      <ul class="pagination pagination-sm justify-content-center mb-0">
        <li class="page-item ${currentPage <= 1 ? 'disabled' : ''}">
          <a class="page-link btn-catalogo-page" data-page="${currentPage - 1}" href="#">&laquo;</a>
        </li>
        ${pages}
        <li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}">
          <a class="page-link btn-catalogo-page" data-page="${currentPage + 1}" href="#">&raquo;</a>
        </li>
      </ul>
    </nav>`;
}

function renderModal() {
  return `
    <div class="modal fade" id="catalogoModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title" id="catalogoModalTitle">Nuevo Registro</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="catalogoForm">
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-bold">Tipo Bien</label>
                  <select class="form-select" id="modal_tipo_bien" required>
                    <option value="B">B - Bien</option>
                    <option value="S">S - Servicio</option>
                  </select>
                </div>
                <div class="col-md-8">
                  <label class="form-label fw-bold">Código Item</label>
                  <input type="text" class="form-control" id="modal_item_bien" required placeholder="Ej: 020500010032">
                </div>
                <div class="col-12">
                  <label class="form-label fw-bold">Descripción del Item</label>
                  <input type="text" class="form-control" id="modal_nombre_item" required placeholder="Descripción del bien o servicio">
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold">Unidad de Medida</label>
                  <input type="text" class="form-control" id="modal_unidad_medida" required placeholder="Ej: UNIDAD, KG, LITRO">
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold">Precio Unitario</label>
                  <input type="number" class="form-control" id="modal_precio_unitario" step="0.01" min="0" value="0">
                </div>
                <div class="col-12"><hr class="my-1"></div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="modal_ficha_tecnica">
                    <label class="form-check-label" for="modal_ficha_tecnica">Ficha Técnica</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="modal_acuerdo_marco">
                    <label class="form-check-label" for="modal_acuerdo_marco">Acuerdo Marco</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="modal_producto_controlado">
                    <label class="form-check-label" for="modal_producto_controlado">Producto Controlado</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="modal_ficha_homologada">
                    <label class="form-check-label" for="modal_ficha_homologada">Ficha Homologada</label>
                  </div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="btnSaveCatalogo">
              <i class="bi bi-save"></i> Guardar
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal fade" id="deleteConfirmModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-sm">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title">Confirmar Eliminación</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p>¿Está seguro de eliminar este registro?</p>
            <p class="fw-bold" id="deleteItemName"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger" id="btnConfirmDelete">
              <i class="bi bi-trash"></i> Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCatalogoSigamefView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2><i class="bi bi-book"></i> Catálogo SIGAMEF</h2>
          <p>Gestión del catálogo de bienes y servicios SIGAMEF</p>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-success" id="btnNuevoItem">
                <i class="bi bi-plus-circle"></i> Nuevo
              </button>
              <label class="btn btn-outline-primary mb-0" for="btnImportExcel" style="cursor:pointer;">
                <i class="bi bi-file-earmark-arrow-up"></i> Importar Excel
              </label>
              <input type="file" id="btnImportExcel" accept=".xlsx,.xls" style="display:none;">
              <button class="btn btn-outline-success" id="btnExportExcel">
                <i class="bi bi-file-earmark-arrow-down"></i> Exportar Excel
              </button>
            </div>
            <div class="d-flex gap-2 align-items-center">
              <span class="badge bg-info text-dark" id="totalRegistros">0 registros</span>
              <input type="text" class="form-control form-control-sm" id="searchCatalogo" placeholder="Buscar..." style="width:220px;">
              <button class="btn btn-sm btn-outline-secondary" id="btnClearSearch" title="Limpiar búsqueda">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-bordered table-sm mb-0" id="tablaCatalogo">
              <thead class="table-dark">
                <tr>
                  <th style="width:60px;">Tipo</th>
                  <th style="width:140px;">Código Item</th>
                  <th>Descripción del Item</th>
                  <th style="width:100px;">Und. Medida</th>
                  <th style="width:100px;" class="text-end">Precio Unit.</th>
                  <th style="width:55px;" class="text-center" title="Ficha Técnica">F.T.</th>
                  <th style="width:55px;" class="text-center" title="Acuerdo Marco">A.M.</th>
                  <th style="width:55px;" class="text-center" title="Producto Controlado">P.C.</th>
                  <th style="width:55px;" class="text-center" title="Ficha Homologada">F.H.</th>
                  <th style="width:90px;" class="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody id="catalogoBody">
                <tr><td colspan="10" class="text-center text-muted py-4">Cargando datos...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
          <small class="text-muted" id="paginationInfo">Mostrando 0 de 0</small>
          <div id="paginationContainer"></div>
        </div>
      </div>

      ${renderModal()}
    </div>
  `;
}

function renderTable() {
  const tbody = document.getElementById('catalogoBody');
  const pagContainer = document.getElementById('paginationContainer');
  const pagInfo = document.getElementById('paginationInfo');
  const totalBadge = document.getElementById('totalRegistros');

  if (!tbody) return;

  tbody.innerHTML = renderTableRows();
  if (pagContainer) pagContainer.innerHTML = renderPagination();

  const start = totalRecords > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(start + pageRows.length - 1, totalRecords);
  if (pagInfo) pagInfo.textContent = `Mostrando ${start}-${end < 0 ? 0 : end} de ${totalRecords}`;
  if (totalBadge) totalBadge.textContent = `${totalRecords} registros`;
}

// Carga la página desde el servidor y luego repinta la tabla.
async function refreshTable() {
  await fetchPage();
  renderTable();
}

function openAddModal() {
  editingId = null;
  const title = document.getElementById('catalogoModalTitle');
  if (title) title.textContent = 'Nuevo Registro';

  document.getElementById('modal_tipo_bien').value = 'B';
  document.getElementById('modal_item_bien').value = '';
  document.getElementById('modal_nombre_item').value = '';
  document.getElementById('modal_unidad_medida').value = '';
  document.getElementById('modal_precio_unitario').value = '0';
  document.getElementById('modal_ficha_tecnica').checked = false;
  document.getElementById('modal_acuerdo_marco').checked = false;
  document.getElementById('modal_producto_controlado').checked = false;
  document.getElementById('modal_ficha_homologada').checked = false;

  const modal = new bootstrap.Modal(document.getElementById('catalogoModal'));
  modal.show();
}

function openEditModal(id) {
  editingId = id;
  const item = pageRows.find((r) => String(r.id) === String(id));
  if (!item) return;

  const title = document.getElementById('catalogoModalTitle');
  if (title) title.textContent = 'Editar Registro';

  document.getElementById('modal_tipo_bien').value = item.tipo_bien || 'B';
  document.getElementById('modal_item_bien').value = item.item_bien || '';
  document.getElementById('modal_nombre_item').value = item.nombre_item || '';
  document.getElementById('modal_unidad_medida').value = item.unidad_medida || '';
  document.getElementById('modal_precio_unitario').value = item.precio_unitario || 0;
  document.getElementById('modal_ficha_tecnica').checked = !!item.ficha_tecnica;
  document.getElementById('modal_acuerdo_marco').checked = !!item.acuerdo_marco;
  document.getElementById('modal_producto_controlado').checked = !!item.producto_controlado;
  document.getElementById('modal_ficha_homologada').checked = !!item.ficha_homologada;

  const modal = new bootstrap.Modal(document.getElementById('catalogoModal'));
  modal.show();
}

async function saveItem() {
  const itemBien = document.getElementById('modal_item_bien').value.trim();
  const nombreItem = document.getElementById('modal_nombre_item').value.trim();

  if (!itemBien || !nombreItem) {
    alert('El código del item y la descripción son obligatorios.');
    return;
  }

  const record = {
    tipo_bien: document.getElementById('modal_tipo_bien').value,
    item_bien: itemBien,
    nombre_item: nombreItem,
    unidad_medida: document.getElementById('modal_unidad_medida').value.trim(),
    precio_unitario: parseFloat(document.getElementById('modal_precio_unitario').value) || 0,
    ficha_tecnica: document.getElementById('modal_ficha_tecnica').checked,
    acuerdo_marco: document.getElementById('modal_acuerdo_marco').checked,
    producto_controlado: document.getElementById('modal_producto_controlado').checked,
    ficha_homologada: document.getElementById('modal_ficha_homologada').checked
  };

  const btnSave = document.getElementById('btnSaveCatalogo');
  if (btnSave) btnSave.disabled = true;
  try {
    if (editingId != null) {
      await api.update('catalogo', editingId, record);
    } else {
      await api.create('catalogo', record);
    }
    await refreshTable();
    const modalEl = document.getElementById('catalogoModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  } catch (e) {
    alert('Error al guardar: ' + e.message);
  } finally {
    if (btnSave) btnSave.disabled = false;
  }
}

function deleteItem(id) {
  const item = pageRows.find((r) => String(r.id) === String(id));
  if (!item) return;

  const nameEl = document.getElementById('deleteItemName');
  if (nameEl) nameEl.textContent = `${item.item_bien} - ${item.nombre_item}`;

  const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
  modal.show();

  const btnConfirm = document.getElementById('btnConfirmDelete');
  const newBtn = btnConfirm.cloneNode(true);
  btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
  newBtn.addEventListener('click', async () => {
    try {
      await api.remove('catalogo', id);
      await refreshTable();
    } catch (e) {
      alert('Error al eliminar: ' + e.message);
    }
    const modalInstance = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
    if (modalInstance) modalInstance.hide();
  });
}

function importExcel(file) {
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      let sheetName = workbook.SheetNames[0];
      if (workbook.SheetNames.length > 1) {
        const sheet2 = workbook.SheetNames[1];
        const ws2 = workbook.Sheets[sheet2];
        const headers2 = XLSX.utils.sheet_to_json(ws2, { header: 1 })[0] || [];
        const headerNames = headers2.map(h => String(h).toLowerCase());
        if (headerNames.includes('ficha_tecnica') || headerNames.includes('acuerdo_marco')) {
          sheetName = sheet2;
        }
      }

      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (jsonData.length < 2) {
        alert('El archivo no contiene datos suficientes.');
        return;
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim());
      const colMap = {};
      const fieldMappings = {
        'tipo_bien': ['tipo_bien', 'tipo'],
        'item_bien': ['item_bien', 'codigo', 'código', 'codigo_item'],
        'nombre_item': ['nombre_item', 'descripcion', 'descripción', 'descripcion del item', 'descripción del item'],
        'unidad_medida': ['unidad_medida', 'unidad de medida', 'und_medida', 'unidad'],
        'precio_unitario': ['precio_unitario', 'precio unitario', 'precio'],
        'ficha_tecnica': ['ficha_tecnica', 'ficha tecnica', 'ficha técnica'],
        'acuerdo_marco': ['acuerdo_marco', 'acuerdo marco'],
        'producto_controlado': ['producto_controlado', 'producto controlado'],
        'ficha_homologada': ['ficha_homologada', 'ficha homologada']
      };

      for (const [field, aliases] of Object.entries(fieldMappings)) {
        for (let i = 0; i < headers.length; i++) {
          if (aliases.includes(headers[i])) {
            colMap[field] = i;
            break;
          }
        }
      }

      const imported = [];
      for (let r = 1; r < jsonData.length; r++) {
        const row = jsonData[r];
        if (!row || row.length === 0) continue;

        const code = colMap.item_bien !== undefined ? String(row[colMap.item_bien] || '') : '';
        const name = colMap.nombre_item !== undefined ? String(row[colMap.nombre_item] || '') : '';
        if (!code && !name) continue;

        const toBool = (val) => {
          if (val === true || val === 1 || val === '1' || val === 'SI' || val === 'Sí' || val === 'si' || val === 'X' || val === 'x') return true;
          return false;
        };

        imported.push({
          tipo_bien: colMap.tipo_bien !== undefined ? String(row[colMap.tipo_bien] || 'B') : 'B',
          item_bien: code,
          nombre_item: name,
          unidad_medida: colMap.unidad_medida !== undefined ? String(row[colMap.unidad_medida] || '') : '',
          precio_unitario: colMap.precio_unitario !== undefined ? (parseFloat(row[colMap.precio_unitario]) || 0) : 0,
          ficha_tecnica: colMap.ficha_tecnica !== undefined ? toBool(row[colMap.ficha_tecnica]) : false,
          acuerdo_marco: colMap.acuerdo_marco !== undefined ? toBool(row[colMap.acuerdo_marco]) : false,
          producto_controlado: colMap.producto_controlado !== undefined ? toBool(row[colMap.producto_controlado]) : false,
          ficha_homologada: colMap.ficha_homologada !== undefined ? toBool(row[colMap.ficha_homologada]) : false
        });
      }

      if (imported.length === 0) {
        alert('No se encontraron registros válidos en el archivo.');
        return;
      }

      const mode = totalRecords > 0
        ? (confirm(`Se encontraron ${imported.length} registros.\n\nPresione ACEPTAR para REEMPLAZAR los datos actuales (${totalRecords} registros).\nPresione CANCELAR para AGREGAR los registros al catálogo existente.`) ? 'replace' : 'append')
        : 'replace';

      try {
        const resp = await api.post('/catalogo/import', { rows: imported, mode });
        searchTerm = '';
        currentPage = 1;
        const searchInput = document.getElementById('searchCatalogo');
        if (searchInput) searchInput.value = '';
        await refreshTable();
        alert(`Importación exitosa: ${resp.inserted} registros ${mode === 'replace' ? 'cargados' : 'agregados'}.`);
      } catch (apiErr) {
        console.error('Error al enviar importación al servidor:', apiErr);
        alert('Error al guardar la importación en el servidor: ' + apiErr.message);
      }
    } catch (err) {
      console.error('Error al importar Excel:', err);
      alert('Error al procesar el archivo Excel. Verifique el formato.');
    }
  };
  reader.readAsArrayBuffer(file);
}

// Descarga todas las filas desde la API (en lotes) para exportar a Excel.
async function exportExcel() {
  const btnExport = document.getElementById('btnExportExcel');
  if (btnExport) { btnExport.disabled = true; }
  try {
    const all = [];
    const big = 5000;
    let page = 1;
    let pages = 1;
    do {
      const resp = await api.list('catalogo', { page, pageSize: big, search: searchTerm });
      all.push(...(resp.data || []));
      pages = resp.totalPages || 1;
      page += 1;
    } while (page <= pages);

    if (all.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const exportData = all.map(item => ({
      'tipo_bien': item.tipo_bien || '',
      'item_bien': item.item_bien || '',
      'nombre_item': item.nombre_item || '',
      'unidad_medida': item.unidad_medida || '',
      'precio_unitario': parseFloat(item.precio_unitario) || 0,
      'ficha_tecnica': item.ficha_tecnica ? 1 : 0,
      'acuerdo_marco': item.acuerdo_marco ? 1 : 0,
      'producto_controlado': item.producto_controlado ? 1 : 0,
      'ficha_homologada': item.ficha_homologada ? 1 : 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 10 }, { wch: 16 }, { wch: 60 }, { wch: 15 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo SIGAMEF');
    XLSX.writeFile(wb, `catalogo_sigamef_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    alert('Error al exportar: ' + e.message);
  } finally {
    if (btnExport) { btnExport.disabled = false; }
  }
}

let searchTimeout = null;

function initCatalogoSigamefView() {
  currentPage = 1;
  searchTerm = '';
  refreshTable();

  // Nuevo registro
  const btnNuevo = document.getElementById('btnNuevoItem');
  if (btnNuevo) btnNuevo.addEventListener('click', openAddModal);

  // Guardar registro (modal)
  const btnSave = document.getElementById('btnSaveCatalogo');
  if (btnSave) btnSave.addEventListener('click', saveItem);

  // Importar Excel
  const btnImport = document.getElementById('btnImportExcel');
  if (btnImport) {
    btnImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importExcel(file);
        e.target.value = '';
      }
    });
  }

  // Exportar Excel
  const btnExport = document.getElementById('btnExportExcel');
  if (btnExport) btnExport.addEventListener('click', exportExcel);

  // Búsqueda con debounce (consulta al servidor)
  const searchInput = document.getElementById('searchCatalogo');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchTerm = searchInput.value.trim();
        currentPage = 1;
        refreshTable();
      }, 350);
    });
  }

  // Limpiar búsqueda
  const btnClear = document.getElementById('btnClearSearch');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      const input = document.getElementById('searchCatalogo');
      if (input) input.value = '';
      searchTerm = '';
      currentPage = 1;
      refreshTable();
    });
  }

  // Delegación de eventos para botones de tabla y paginación
  document.removeEventListener('click', handleTableClick);
  document.addEventListener('click', handleTableClick);
}

function handleTableClick(e) {
  const editBtn = e.target.closest('.btn-catalogo-edit');
  if (editBtn) {
    e.preventDefault();
    openEditModal(editBtn.dataset.id);
    return;
  }

  const deleteBtn = e.target.closest('.btn-catalogo-delete');
  if (deleteBtn) {
    e.preventDefault();
    deleteItem(deleteBtn.dataset.id);
    return;
  }

  const pageBtn = e.target.closest('.btn-catalogo-page');
  if (pageBtn) {
    e.preventDefault();
    const page = parseInt(pageBtn.dataset.page, 10);
    if (page >= 1 && page <= getTotalPages()) {
      currentPage = page;
      refreshTable();
    }
    return;
  }
}

export { renderCatalogoSigamefView, initCatalogoSigamefView };
