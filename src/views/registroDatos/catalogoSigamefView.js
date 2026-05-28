// =====================================================
// Catálogo SIGAMEF - Vista completa con CRUD e Import/Export Excel
// =====================================================

const STORAGE_KEY = 'catalogoSigamef';
const PAGE_SIZE = 50;

let catalogoData = [];
let filteredData = [];
let currentPage = 1;
let editingIndex = -1;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    catalogoData = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error al cargar catálogo SIGAMEF:', e);
    catalogoData = [];
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogoData));
  } catch (e) {
    console.warn('No se pudo guardar en localStorage (posible límite de tamaño). Los datos se mantienen en memoria para esta sesión.', e);
    alert('Advertencia: Los datos son demasiado grandes para almacenar localmente. Se mantienen en memoria para esta sesión. Puede exportar a Excel para guardar.');
  }
}

function applyFilter(searchText) {
  const term = (searchText || '').toLowerCase().trim();
  if (!term) {
    filteredData = [...catalogoData];
  } else {
    filteredData = catalogoData.filter(item =>
      (item.item_bien || '').toLowerCase().includes(term) ||
      (item.nombre_item || '').toLowerCase().includes(term) ||
      (item.tipo_bien || '').toLowerCase().includes(term) ||
      (item.unidad_medida || '').toLowerCase().includes(term)
    );
  }
  currentPage = 1;
}

function getTotalPages() {
  return Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
}

function getPageData() {
  const start = (currentPage - 1) * PAGE_SIZE;
  return filteredData.slice(start, start + PAGE_SIZE);
}

function checkIcon(val) {
  return val ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-secondary"></i>';
}

function renderTableRows() {
  const pageData = getPageData();
  if (pageData.length === 0) {
    return `<tr><td colspan="10" class="text-center text-muted py-4">No se encontraron registros</td></tr>`;
  }
  return pageData.map((item, idx) => {
    const globalIdx = catalogoData.indexOf(item);
    return `<tr>
      <td class="small">${item.tipo_bien || ''}</td>
      <td class="small fw-bold">${item.item_bien || ''}</td>
      <td class="small">${item.nombre_item || ''}</td>
      <td class="small">${item.unidad_medida || ''}</td>
      <td class="small text-end">${typeof item.precio_unitario === 'number' ? item.precio_unitario.toFixed(2) : '0.00'}</td>
      <td class="text-center">${checkIcon(item.ficha_tecnica)}</td>
      <td class="text-center">${checkIcon(item.acuerdo_marco)}</td>
      <td class="text-center">${checkIcon(item.producto_controlado)}</td>
      <td class="text-center">${checkIcon(item.ficha_homologada)}</td>
      <td class="text-center" style="white-space:nowrap;">
        <button class="btn btn-sm btn-outline-primary me-1 btn-catalogo-edit" data-idx="${globalIdx}" title="Editar">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger btn-catalogo-delete" data-idx="${globalIdx}" title="Eliminar">
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

function refreshTable() {
  const tbody = document.getElementById('catalogoBody');
  const pagContainer = document.getElementById('paginationContainer');
  const pagInfo = document.getElementById('paginationInfo');
  const totalBadge = document.getElementById('totalRegistros');

  if (!tbody) return;

  tbody.innerHTML = renderTableRows();
  if (pagContainer) pagContainer.innerHTML = renderPagination();

  const start = filteredData.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, filteredData.length);
  if (pagInfo) pagInfo.textContent = `Mostrando ${start}-${end} de ${filteredData.length}`;
  if (totalBadge) totalBadge.textContent = `${catalogoData.length} registros`;
}

function openAddModal() {
  editingIndex = -1;
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

function openEditModal(idx) {
  editingIndex = idx;
  const item = catalogoData[idx];
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

function saveItem() {
  const tipoBien = document.getElementById('modal_tipo_bien').value;
  const itemBien = document.getElementById('modal_item_bien').value.trim();
  const nombreItem = document.getElementById('modal_nombre_item').value.trim();
  const unidadMedida = document.getElementById('modal_unidad_medida').value.trim();
  const precioUnitario = parseFloat(document.getElementById('modal_precio_unitario').value) || 0;
  const fichaTecnica = document.getElementById('modal_ficha_tecnica').checked;
  const acuerdoMarco = document.getElementById('modal_acuerdo_marco').checked;
  const productoControlado = document.getElementById('modal_producto_controlado').checked;
  const fichaHomologada = document.getElementById('modal_ficha_homologada').checked;

  if (!itemBien || !nombreItem) {
    alert('El código del item y la descripción son obligatorios.');
    return;
  }

  const record = {
    tipo_bien: tipoBien,
    item_bien: itemBien,
    nombre_item: nombreItem,
    unidad_medida: unidadMedida,
    precio_unitario: precioUnitario,
    ficha_tecnica: fichaTecnica,
    acuerdo_marco: acuerdoMarco,
    producto_controlado: productoControlado,
    ficha_homologada: fichaHomologada
  };

  if (editingIndex >= 0) {
    catalogoData[editingIndex] = record;
  } else {
    catalogoData.push(record);
  }

  saveData();
  const searchVal = document.getElementById('searchCatalogo')?.value || '';
  applyFilter(searchVal);
  refreshTable();

  const modalEl = document.getElementById('catalogoModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
}

function deleteItem(idx) {
  const item = catalogoData[idx];
  if (!item) return;

  const nameEl = document.getElementById('deleteItemName');
  if (nameEl) nameEl.textContent = `${item.item_bien} - ${item.nombre_item}`;

  const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
  modal.show();

  const btnConfirm = document.getElementById('btnConfirmDelete');
  const newBtn = btnConfirm.cloneNode(true);
  btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
  newBtn.addEventListener('click', () => {
    catalogoData.splice(idx, 1);
    saveData();
    const searchVal = document.getElementById('searchCatalogo')?.value || '';
    applyFilter(searchVal);
    refreshTable();
    const modalInstance = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
    if (modalInstance) modalInstance.hide();
  });
}

function importExcel(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
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

      const action = catalogoData.length > 0
        ? confirm(`Se encontraron ${imported.length} registros.\n\nPresione ACEPTAR para REEMPLAZAR los datos actuales (${catalogoData.length} registros).\nPresione CANCELAR para AGREGAR los registros al catálogo existente.`)
        : true;

      if (action) {
        catalogoData = imported;
      } else {
        catalogoData = catalogoData.concat(imported);
      }

      saveData();
      applyFilter('');
      const searchInput = document.getElementById('searchCatalogo');
      if (searchInput) searchInput.value = '';
      refreshTable();
      alert(`Importación exitosa: ${imported.length} registros ${action ? 'cargados' : 'agregados'}.`);
    } catch (err) {
      console.error('Error al importar Excel:', err);
      alert('Error al procesar el archivo Excel. Verifique el formato.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportExcel() {
  if (catalogoData.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }

  const exportData = catalogoData.map(item => ({
    'tipo_bien': item.tipo_bien || '',
    'item_bien': item.item_bien || '',
    'nombre_item': item.nombre_item || '',
    'unidad_medida': item.unidad_medida || '',
    'precio_unitario': item.precio_unitario || 0,
    'ficha_tecnica': item.ficha_tecnica ? 1 : 0,
    'acuerdo_marco': item.acuerdo_marco ? 1 : 0,
    'producto_controlado': item.producto_controlado ? 1 : 0,
    'ficha_homologada': item.ficha_homologada ? 1 : 0
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);

  const colWidths = [
    { wch: 10 }, { wch: 16 }, { wch: 60 }, { wch: 15 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo SIGAMEF');
  XLSX.writeFile(wb, `catalogo_sigamef_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

let searchTimeout = null;

function initCatalogoSigamefView() {
  loadData();
  applyFilter('');
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

  // Búsqueda con debounce
  const searchInput = document.getElementById('searchCatalogo');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilter(searchInput.value);
        refreshTable();
      }, 300);
    });
  }

  // Limpiar búsqueda
  const btnClear = document.getElementById('btnClearSearch');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      const input = document.getElementById('searchCatalogo');
      if (input) input.value = '';
      applyFilter('');
      refreshTable();
    });
  }

  // Delegación de eventos para botones de tabla y paginación
  document.addEventListener('click', handleTableClick);
}

function handleTableClick(e) {
  const editBtn = e.target.closest('.btn-catalogo-edit');
  if (editBtn) {
    e.preventDefault();
    const idx = parseInt(editBtn.dataset.idx, 10);
    openEditModal(idx);
    return;
  }

  const deleteBtn = e.target.closest('.btn-catalogo-delete');
  if (deleteBtn) {
    e.preventDefault();
    const idx = parseInt(deleteBtn.dataset.idx, 10);
    deleteItem(idx);
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
