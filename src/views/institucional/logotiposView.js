import { api } from '../../services/apiService.js';

let logos = [];
let pendingDataUrl = '';

function renderLogotiposView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner"><div class="welcome-banner-content">
        <h2><i class="bi bi-image"></i> Logotipos</h2>
        <p>Gestión de logotipos institucionales</p>
      </div></div>
      <div class="card mb-3"><div class="card-body">
        <button class="btn btn-success" id="logo_new"><i class="bi bi-plus-circle"></i> Nuevo Logotipo</button>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="row g-3" id="logo_grid">
          <div class="col-12 text-center text-muted py-4">Cargando...</div>
        </div>
      </div></div>

      <div class="modal fade" id="logo_modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">Nuevo Logotipo</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body"><div class="row g-3">
            <div class="col-md-7"><label class="form-label fw-bold">Nombre</label>
              <input type="text" class="form-control" id="logo_nombre"></div>
            <div class="col-md-5"><label class="form-label fw-bold">Tipo</label>
              <select class="form-select" id="logo_tipo">
                <option>Principal</option><option>Secundario</option><option>Membrete</option>
              </select></div>
            <div class="col-12"><label class="form-label fw-bold">Imagen</label>
              <input type="file" class="form-control" id="logo_file" accept="image/*"></div>
            <div class="col-12 text-center">
              <img id="logo_preview" src="" alt="" style="max-height:140px; display:none;" class="border rounded p-2">
            </div>
          </div></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="logo_save"><i class="bi bi-save"></i> Guardar</button>
          </div>
        </div></div>
      </div>
    </div>`;
}

function renderGrid() {
  const grid = document.getElementById('logo_grid');
  if (!grid) return;
  if (logos.length === 0) {
    grid.innerHTML = '<div class="col-12 text-center text-muted py-4">No hay logotipos registrados</div>';
    return;
  }
  grid.innerHTML = logos.map((l) => `
    <div class="col-md-3 col-sm-6">
      <div class="card h-100">
        <div class="card-body text-center d-flex align-items-center justify-content-center" style="min-height:140px;">
          ${l.data_url ? `<img src="${l.data_url}" alt="${l.nombre}" style="max-height:120px; max-width:100%;">` : '<i class="bi bi-image text-muted" style="font-size:3rem;"></i>'}
        </div>
        <div class="card-footer">
          <div class="fw-bold text-truncate" title="${l.nombre || ''}">${l.nombre || '(sin nombre)'}</div>
          <small class="text-muted">${l.tipo || ''}</small>
          <button class="btn btn-sm btn-outline-danger w-100 mt-2 logo-del" data-id="${l.id}"><i class="bi bi-trash"></i> Eliminar</button>
        </div>
      </div>
    </div>`).join('');
}

async function loadLogos() {
  try {
    const resp = await api.list('logotipos', { page: 1, pageSize: 500 });
    logos = resp.data || [];
  } catch (e) {
    console.error('Error al cargar logotipos:', e);
    logos = [];
  }
  renderGrid();
}

function initLogotiposView() {
  loadLogos();

  const btnNew = document.getElementById('logo_new');
  if (btnNew) btnNew.addEventListener('click', () => {
    pendingDataUrl = '';
    document.getElementById('logo_nombre').value = '';
    document.getElementById('logo_tipo').value = 'Principal';
    document.getElementById('logo_file').value = '';
    const prev = document.getElementById('logo_preview');
    prev.style.display = 'none'; prev.src = '';
    new bootstrap.Modal(document.getElementById('logo_modal')).show();
  });

  const fileInput = document.getElementById('logo_file');
  if (fileInput) fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingDataUrl = ev.target.result;
      const prev = document.getElementById('logo_preview');
      prev.src = pendingDataUrl; prev.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });

  const btnSave = document.getElementById('logo_save');
  if (btnSave) btnSave.addEventListener('click', async () => {
    const body = {
      nombre: document.getElementById('logo_nombre').value.trim(),
      tipo: document.getElementById('logo_tipo').value,
      data_url: pendingDataUrl,
      estado: 'Activo',
    };
    if (!body.nombre) { alert('El nombre es obligatorio.'); return; }
    btnSave.disabled = true;
    try {
      await api.create('logotipos', body);
      await loadLogos();
      const m = bootstrap.Modal.getInstance(document.getElementById('logo_modal'));
      if (m) m.hide();
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    } finally {
      btnSave.disabled = false;
    }
  });

  document.removeEventListener('click', handleLogoClick);
  document.addEventListener('click', handleLogoClick);
}

async function handleLogoClick(e) {
  const del = e.target.closest('.logo-del');
  if (!del) return;
  e.preventDefault();
  if (!confirm('¿Eliminar este logotipo?')) return;
  try {
    await api.remove('logotipos', del.dataset.id);
    await loadLogos();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

export { renderLogotiposView, initLogotiposView };
