function renderFormGroup({ id, label, type = 'text', value = '', placeholder = '', required = false }) {
  return `
    <div class="mb-3">
      <label for="${id}" class="form-label">${label}</label>
      <input id="${id}" name="${id}" type="${type}" class="form-control" value="${value}" placeholder="${placeholder}" ${required ? 'required' : ''} />
    </div>
  `;
}

export { renderFormGroup };
