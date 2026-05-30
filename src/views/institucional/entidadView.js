import { api } from '../../services/apiService.js';

const FIELDS = [
  { name: 'ruc', label: 'RUC', col: 4 },
  { name: 'siglas', label: 'Siglas', col: 4 },
  { name: 'telefono', label: 'Teléfono', col: 4 },
  { name: 'nombre', label: 'Nombre de la Entidad', col: 12 },
  { name: 'direccion', label: 'Dirección', col: 8 },
  { name: 'email', label: 'Email', col: 4 },
  { name: 'titular', label: 'Titular de la Entidad', col: 12 },
];

function renderEntidadView() {
  const inputs = FIELDS.map((f) => `
    <div class="col-md-${f.col}">
      <label class="form-label fw-bold">${f.label}</label>
      <input type="text" class="form-control" id="ent_${f.name}">
    </div>`).join('');
  return `
    <div class="dashboard-container">
      <div class="welcome-banner"><div class="welcome-banner-content">
        <h2><i class="bi bi-info-circle"></i> Datos de la Entidad</h2>
        <p>Información institucional utilizada en los documentos del sistema</p>
      </div></div>
      <div class="card"><div class="card-body">
        <form id="entidadForm"><div class="row g-3">${inputs}</div>
          <div class="mt-4 d-flex gap-2 align-items-center">
            <button type="button" class="btn btn-primary" id="ent_save"><i class="bi bi-save"></i> Guardar Cambios</button>
            <span id="ent_msg" class="text-success fw-bold" style="display:none;"><i class="bi bi-check-circle"></i> Guardado correctamente</span>
          </div>
        </form>
      </div></div>
    </div>`;
}

async function initEntidadView() {
  try {
    const data = await api.get('/entidad');
    FIELDS.forEach((f) => {
      const el = document.getElementById(`ent_${f.name}`);
      if (el) el.value = data[f.name] == null ? '' : data[f.name];
    });
  } catch (e) {
    console.error('Error al cargar entidad:', e);
  }

  const btn = document.getElementById('ent_save');
  if (btn) {
    btn.addEventListener('click', async () => {
      const body = {};
      FIELDS.forEach((f) => { body[f.name] = document.getElementById(`ent_${f.name}`).value; });
      btn.disabled = true;
      try {
        await api.put('/entidad', body);
        const msg = document.getElementById('ent_msg');
        if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2500); }
      } catch (e) {
        alert('Error al guardar: ' + e.message);
      } finally {
        btn.disabled = false;
      }
    });
  }
}

export { renderEntidadView, initEntidadView };
