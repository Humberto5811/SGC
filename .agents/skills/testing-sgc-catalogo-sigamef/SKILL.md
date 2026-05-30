---
name: testing-sgc-catalogo-sigamef
description: Test the Catálogo SIGAMEF module end-to-end including CRUD operations, Excel import/export, checkboxes, pagination, and search. Use when verifying changes to the catalogo SIGAMEF feature or mantenimiento routing.
---

# Testing SGC - Catálogo SIGAMEF Module

## Prerequisites

- Node.js installed
- Repository cloned at the expected location

## Devin Secrets Needed

None required. The app uses localStorage and has no external auth for the dev environment.

## Starting the Dev Server

The Vite dev server may have permission issues with `npx vite`. Use this workaround:

```bash
cd <repo-root>
npm install
node ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173
```

Note: If port 5173 is occupied, Vite will auto-assign the next available port (e.g., 5174). Check the terminal output for the actual URL.

## Authentication

Login with DNI: `admin`, Password: `admin`. The app uses localStorage-based auth with no server validation. Role will be "admin" / "Administrador".

## Key Test Flows

### 1. Navigate to Module
- Click Mantenimiento > Registro de Datos > Catálogo SIGAMEF
- URL should be `/#/mantenimiento/catalogo`
- **Verify**: Page title "Catálogo SIGAMEF", buttons "Nuevo", "Importar Excel", "Exportar Excel"

### 2. Import Excel
- The file input (`#btnImportExcel`) is hidden (`display:none`). You cannot click it via screenshot-based GUI interaction.
- **Use Playwright CDP** to set the file programmatically:
  ```javascript
  const { chromium } = require('playwright');
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const page = browser.contexts()[0].pages()[0];
  const fileInput = await page.$('#btnImportExcel');
  await fileInput.setInputFiles('/path/to/excel-file.xlsx');
  await page.waitForTimeout(8000); // Large files need processing time
  ```
- **Verify**: Alert shows "Importación exitosa: XXXXX registros cargados", badge updates with count

### 3. Create Record (Nuevo)
- Click "Nuevo" button to open modal
- Fill fields: Tipo, Código Item, Descripción, Unidad, Precio
- Toggle checkbox switches for Ficha Técnica, Acuerdo Marco, Producto Controlado, Ficha Homologada
- Click "Guardar"
- **Verify**: Modal closes, badge count increases, search for the new code returns 1 result with correct checkbox icons

### 4. Edit Record
- Click the blue pencil (edit) button on a row
- **Verify**: Modal title says "Editar Registro", fields are pre-filled
- Modify fields and toggle checkboxes
- Click "Guardar"
- **Verify**: Changes reflected in the table row

### 5. Delete Record
- Click the red trash (delete) button on a row
- **Verify**: Confirmation modal shows record code and description
- Click "Eliminar"
- **Verify**: Record removed, count decreases

### 6. Export Excel
- Click "Exportar Excel"
- **Verify**: File downloads as `catalogo_sigamef_YYYY-MM-DD.xlsx`

### 7. Pagination
- With many records loaded, pagination appears at the bottom
- Pagination links might be offscreen; use Playwright to click them if scroll doesn't work
- **Verify**: "Mostrando X-Y de Z" updates, table data changes between pages

### 8. Search/Filter
- Type in the search box (has 300ms debounce)
- **Verify**: Table filters to matching records, pagination updates

## Known Issues & Workarounds

- **localStorage 5MB limit**: With large datasets (>40K records), saving to localStorage will exceed the limit. The app shows a warning alert: "Los datos son demasiado grandes para almacenar localmente...". Data stays in memory for the session but won't persist on page reload. Dismiss the alert with OK and continue testing.
- **Bootstrap JS must be loaded**: The `index.html` must include the Bootstrap JS Bundle (`bootstrap.bundle.min.js`) before SheetJS for modals to work. If modals don't open, check this first.
- **Scroll issues**: The computer tool's scroll action may not work correctly. Use Playwright CDP to interact with offscreen elements (like pagination links).
- **File input hidden**: Import Excel uses a hidden file input. Always use Playwright CDP `setInputFiles` instead of trying to click the button visually.

## Regression Checks

After testing the Catálogo SIGAMEF module, verify other mantenimiento sub-modules still work:
- Usuarios y Permisos (`/#/mantenimiento/usuarios`)
- Fichas Técnicas (`/#/mantenimiento/fichas`)

These should load without errors and show their respective placeholder content.

## Architecture Notes

- SPA with hash-based routing (`/#/route`)
- View/Service pattern: views in `src/views/`, services in `src/services/`
- Mantenimiento routing is handled in `src/views/mantenimientoView.js` via a `subRoutes` map
- Catálogo SIGAMEF view is at `src/views/registroDatos/catalogoSigamefView.js` (also symlinked/copied at `src/views/mantenimiento/registroDatos/`)
- Data persistence: localStorage key `'catalogoSigamef'`
- Pagination: 50 records per page
