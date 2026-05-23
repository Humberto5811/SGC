function renderTable(headers, rows) {
  const head = headers.map((text) => `<th scope="col">${text}</th>`).join('');
  const body = rows
    .map(
      (columns) => `
      <tr>
        ${columns.map((col) => `<td>${col}</td>`).join('')}
      </tr>`
    )
    .join('');

  return `
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead class="table-light"><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export { renderTable };
