import { authService } from '../../services/authService.js';
import { glosasBienesService } from '../../services/glosasBienesService.js';

let state = {
  glosas: [],
  editing: false,
  saving: false,
};

function buildFormatoBienesView() {
  return `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
        <div>
          <h2>Formato Bienes</h2>
          <p class="text-muted">Gestión de glosas de requerimientos del Formato de Bienes.</p>
        </div>
        <div class="btn-group">
          <button id="btnEditFormatoBienes" class="btn btn-primary">Editar</button>
          <button id="btnSaveFormatoBienes" class="btn btn-success" disabled>Guardar</button>
        </div>
      </div>
      <div id="formatoBienesMessages" class="mt-3"></div>
      <div id="formatoBienesContent" class="mt-4"></div>
    </div>
  `;
}

function renderGlosaItem(glosa) {
  const readonly = !state.editing ? 'disabled' : '';
  const singleLineFields = ['Vigencia del producto', 'Lugar de entrega', 'Modalidad de pago'];
  const isShort = singleLineFields.includes(glosa.titulo);
  const inputClass = isShort ? 'form-control' : 'form-control' ;

  const isPlazo = glosa.numero === '14.1' || /plazo de entrega/i.test(glosa.titulo);
  if (isPlazo) {
    const rowsHtml = (glosa.entregas || []).map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>
          <input ${readonly} class="form-control" type="text" value="${item.entregable || ''}"
            onchange="formatoBienesUpdateEntrega(${glosa.id}, ${index}, 'entregable', this.value)" />
        </td>
        <td>
          <input ${readonly} class="form-control" type="number" min="0" value="${item.cantidad ?? 0}"
            onchange="formatoBienesUpdateEntrega(${glosa.id}, ${index}, 'cantidad', this.value)" />
        </td>
        <td>
          <input ${readonly} class="form-control" type="text" value="${item.plazo || ''}"
            onchange="formatoBienesUpdateEntrega(${glosa.id}, ${index}, 'plazo', this.value)" />
        </td>
        <td>
          <input ${readonly} class="form-control" type="text" value="${item.condicion || ''}"
            onchange="formatoBienesUpdateEntrega(${glosa.id}, ${index}, 'condicion', this.value)" />
        </td>
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-danger" ${state.editing && index > 0 ? '' : 'disabled'}
            onclick="formatoBienesRemoveRow(${glosa.id}, ${index})">Eliminar fila</button>
        </td>
      </tr>
    `).join('');

    return `
      <div class="card mb-4">
        <div class="card-header bg-secondary text-white">
          <strong>${glosa.titulo}</strong>
        </div>
        <div class="card-body">
          <div class="table-responsive mb-3">
            <table class="table table-bordered align-middle">
              <thead>
                <tr>
                  <th>N° entrega</th>
                  <th>Cantidad a entregar</th>
                  <th>Plazo de entrega</th>
                  <th>Condición de entrega</th>
                  <th class="text-center">Acción</th>
                </tr>
              </thead>
              <tbody id="formatoBienesTableBody-${glosa.id}">
                ${rowsHtml || `
                        <tr>
                          <td>1</td>
                          <td><input ${readonly} class="form-control" type="text" value=""
                            onchange="formatoBienesUpdateEntrega(${glosa.id}, 0, 'entregable', this.value)" /></td>
                          <td><input ${readonly} class="form-control" type="number" min="0" value="0"
                            onchange="formatoBienesUpdateEntrega(${glosa.id}, 0, 'cantidad', this.value)" /></td>
                          <td><input ${readonly} class="form-control" type="text" value=""
                            onchange="formatoBienesUpdateEntrega(${glosa.id}, 0, 'plazo', this.value)" /></td>
                          <td><input ${readonly} class="form-control" type="text" value=""
                            onchange="formatoBienesUpdateEntrega(${glosa.id}, 0, 'condicion', this.value)" /></td>
                          <td class="text-center"><button type="button" class="btn btn-sm btn-danger" disabled>Eliminar fila</button></td>
                        </tr>
                `}
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div><strong>Total Cantidad:</strong> <span id="formatoBienesTotal-${glosa.id}">${getTotal(glosa)}</span></div>
            <button type="button" class="btn btn-sm btn-outline-primary" ${state.editing ? '' : 'disabled'}
              onclick="formatoBienesAddRow(${glosa.id})">Agregar fila</button>
          </div>
          <div class="mb-3">
            <label class="form-label">Notas adicionales</label>
            <textarea ${readonly} id="formatoBienesTextarea-${glosa.id}" class="form-control" rows="3"
              onchange="formatoBienesUpdateField(${glosa.id}, 'contenido', this.value)">${glosa.contenido || ''}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card mb-4">
      <div class="card-header bg-secondary text-white"><strong>${(glosa.literal ? glosa.literal + ') ' : (glosa.numero ? glosa.numero + ' ' : '')) + glosa.titulo}</strong></div>
      <div class="card-body">
        ${isShort ? `
          <input ${readonly} id="formatoBienesInput-${glosa.id}" class="${inputClass}" type="text"
            value="${glosa.contenido || ''}"
            onchange="formatoBienesUpdateField(${glosa.id}, 'contenido', this.value)" />
        ` : `
          <textarea ${readonly} id="formatoBienesTextarea-${glosa.id}" class="${inputClass}" rows="4"
            onchange="formatoBienesUpdateField(${glosa.id}, 'contenido', this.value)">${glosa.contenido || ''}</textarea>
        `}
      </div>
    </div>
  `;
}

function getTotal(glosa) {
  return (glosa.entregas || []).reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);
}

function renderFormContent() {
  const container = document.getElementById('formatoBienesContent');
  if (!container) return;
  if (!state.glosas.length) {
    container.innerHTML = '<div class="alert alert-info">No hay glosas de bienes cargadas.</div>';
    return;
  }
  container.innerHTML = state.glosas.map(renderGlosaItem).join('');
  updateTotals();
}

function setMessage(type, text) {
  const messages = document.getElementById('formatoBienesMessages');
  if (!messages) return;
  messages.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${text}
      <button type="button" class="btn-close" aria-label="Close" onclick="this.parentElement.remove()"></button>
    </div>
  `;
}

function updateTotals() {
  state.glosas.forEach((glosa) => {
    if (glosa.numero === '14.1' || /plazo de entrega/i.test(glosa.titulo)) {
        const totalEl = document.getElementById(`formatoBienesTotal-${glosa.id}`);
      if (totalEl) totalEl.textContent = getTotal(glosa);
    }
  });
}

async function loadGlosas() {
  try {
    const response = await glosasBienesService.getAll();
    state.glosas = response.data.map((glosa) => ({ ...glosa, entregas: glosa.entregas || [{ numero_entrega: 1, cantidad: 0, plazo: '', condicion: '' }] }));
    renderFormContent();
    attachButtons();
  } catch (error) {
    setMessage('danger', `Error al cargar las glosas: ${error.message}`);
  }
}

function attachButtons() {
  const btnEdit = document.getElementById('btnEditFormatoBienes');
  const btnSave = document.getElementById('btnSaveFormatoBienes');
  if (btnEdit) btnEdit.onclick = () => toggleEditing(true);
  if (btnSave) btnSave.onclick = () => saveGlosas();
}

function toggleEditing(enabled) {
  state.editing = enabled;
  const btnSave = document.getElementById('btnSaveFormatoBienes');
  if (btnSave) btnSave.disabled = !enabled;
  renderFormContent();
}

function findGlosa(id) {
  return state.glosas.find((item) => item.id === Number(id));
}

window.formatoBienesUpdateField = (glosaId, field, value) => {
  const glosa = findGlosa(glosaId);
  if (!glosa) return;
  glosa[field] = value;
};

window.formatoBienesUpdateEntrega = (glosaId, index, field, value) => {
  const glosa = findGlosa(glosaId);
  if (!glosa) return;
  if (!Array.isArray(glosa.entregas)) glosa.entregas = [];
  if (!glosa.entregas[index]) {
    glosa.entregas[index] = { numero_entrega: index + 1, entregable: '', cantidad: 0, plazo: '', condicion: '' };
  }
  glosa.entregas[index][field] = field === 'cantidad' ? Number(value) || 0 : value;
  updateTotals();
};

window.formatoBienesAddRow = (glosaId) => {
  const glosa = findGlosa(glosaId);
  if (!glosa) return;
  if (!Array.isArray(glosa.entregas)) glosa.entregas = [];
  const nextIndex = glosa.entregas.length + 1;
  glosa.entregas.push({ numero_entrega: nextIndex, entregable: '', cantidad: 0, plazo: '', condicion: '' });
  renderFormContent();
};

window.formatoBienesRemoveRow = (glosaId, index) => {
  const glosa = findGlosa(glosaId);
  if (!glosa || !Array.isArray(glosa.entregas)) return;
  if (glosa.entregas.length <= 1) return;
  glosa.entregas.splice(index, 1);
  glosa.entregas = glosa.entregas.map((item, idx) => ({ ...item, numero_entrega: idx + 1 }));
  renderFormContent();
};

async function saveGlosas() {
  if (!state.editing) return;
  setMessage('info', 'Guardando cambios...');
  const currentUser = authService.getCurrentUser();
  const usuario = currentUser?.dni || 'anonimo';

  try {
    await Promise.all(state.glosas.map(async (glosa) => {
      const payload = {
        literal: glosa.literal || null,
        numero: glosa.numero || null,
        contenido: glosa.contenido || '',
        usuario_modificacion: usuario,
      };
      if (glosa.numero === '14.1' || /plazo de entrega/i.test(glosa.titulo)) {
        payload.entregas = glosa.entregas.map((item, idx) => ({
          numero_entrega: idx + 1,
          entregable: item.entregable || '',
          cantidad: Number(item.cantidad) || 0,
          plazo: item.plazo || '',
          condicion: item.condicion || ''
        }));
      }
      return glosasBienesService.update(glosa.id, payload);
    }));

    setMessage('success', '✅ Glosas guardadas correctamente');
    state.editing = false;
    await loadGlosas();
  } catch (error) {
    setMessage('danger', `Error al guardar: ${error.message}`);
  }
}

export function renderFormatoBienesView() {
  return buildFormatoBienesView();
}

export function initFormatoBienesView() {
  loadGlosas();
}
