/**
 * RC8.15.6 HOTFIX3 — Exclusividad del menú Acciones.
 * Prueba el helper institucional con DOM/Bootstrap mínimos en memoria.
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

class FakeTarget {
  constructor({ toggle = false, insideDropdown = false } = {}) {
    this.isToggle = toggle;
    this.insideDropdown = insideDropdown;
  }

  closest(selector) {
    if (selector === '.bandeja-actions-btn') return this.isToggle ? this : null;
    if (selector === '.req-col-acc .dropdown') return this.insideDropdown ? this : null;
    return null;
  }

  matches(selector) {
    return selector === '.bandeja-actions-btn' && this.isToggle;
  }
}

class FakeContainer {
  constructor() {
    this.listeners = new Map();
    this.toggles = [];
    this.actions = [];
  }

  querySelector() {
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '.bandeja-menu-act') return this.actions;
    if (selector.includes('dropdown-toggle') || selector.includes('bandeja-actions-btn')) {
      return this.toggles;
    }
    return [];
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type, target) {
    for (const handler of this.listeners.get(type) || []) handler({ type, target });
  }

  contains(target) {
    return this.toggles.includes(target);
  }
}

const globalListeners = new Map();
const fakeDocument = {
  containers: [],
  querySelectorAll(selector) {
    return this.containers.flatMap((container) => container.querySelectorAll(selector));
  },
  addEventListener(type, handler) {
    const handlers = globalListeners.get(type) || new Set();
    handlers.add(handler);
    globalListeners.set(type, handlers);
  },
  dispatch(type, event) {
    for (const handler of globalListeners.get(type) || []) handler(event);
  },
  contains() {
    return true;
  },
};

const dropdowns = new WeakMap();
class FakeDropdown {
  constructor(toggle) {
    this.toggle = toggle;
  }

  hide() {
    this.toggle.open = false;
    this.toggle.container.dispatch('hidden.bs.dropdown', this.toggle);
  }

  dispose() {
    dropdowns.delete(this.toggle);
  }

  static getInstance(toggle) {
    return dropdowns.get(toggle) || null;
  }

  static getOrCreateInstance(toggle) {
    let instance = dropdowns.get(toggle);
    if (!instance) {
      instance = new FakeDropdown(toggle);
      dropdowns.set(toggle, instance);
    }
    return instance;
  }
}

const fakeWindowListeners = new Map();
globalThis.document = fakeDocument;
globalThis.window = {
  bootstrap: { Dropdown: FakeDropdown },
  addEventListener(type, handler) {
    fakeWindowListeners.set(type, handler);
  },
  removeEventListener(type, handler) {
    if (fakeWindowListeners.get(type) === handler) fakeWindowListeners.delete(type);
  },
};

const {
  bindActionMenus,
  closeBandejaActionMenus,
} = await import('../src/utils/bandejaUi.js');

function makeToggle(container) {
  const toggle = new FakeTarget({ toggle: true, insideDropdown: true });
  toggle.container = container;
  toggle.open = false;
  toggle.setAttribute = () => {};
  toggle.removeAttribute = () => {};
  toggle.parentElement = { querySelector: () => ({ removeAttribute: () => {} }) };
  return toggle;
}

function open(container, toggle) {
  container.dispatch('show.bs.dropdown', toggle);
  toggle.open = true;
}

console.log('\n=== RC8.15.6 HOTFIX3 — Menú Acciones exclusivo ===\n');

const container = new FakeContainer();
fakeDocument.containers.push(container);
const toggleA = makeToggle(container);
const toggleB = makeToggle(container);
container.toggles.push(toggleA, toggleB);
let actionRuns = 0;
const action = {
  dataset: { act: 'ver', id: '1' },
  closest: () => null,
};
container.actions.push(action);
bindActionMenus(container, { ver: () => { actionRuns += 1; } });

open(container, toggleA);
ok(toggleA.open, 'A. abrir A mantiene A abierto');

open(container, toggleB);
ok(!toggleA.open && toggleB.open, 'B. abrir B cierra inmediatamente A');
ok(container.toggles.filter((toggle) => toggle.open).length === 1,
  'C. solo existe un menú abierto');

fakeDocument.dispatch('click', { target: new FakeTarget() });
ok(!toggleA.open && !toggleB.open, 'D. click fuera cierra el menú');

open(container, toggleA);
fakeDocument.dispatch('keydown', { key: 'Escape', target: fakeDocument });
ok(!toggleA.open, 'E. Escape cierra el menú');

open(container, toggleA);
action.onclick({ stopPropagation() {} });
ok(!toggleA.open && actionRuns === 1, 'F. ejecutar una acción cierra el menú');

const viewSource = readFileSync(
  new URL('../src/views/ejecucion/presentacionEntregableView.js', import.meta.url),
  'utf8',
);
ok(/function renderCurrent\(\)\s*\{\s*\/\/[^\n]*\n\s*closeBandejaActionMenus\(\)/.test(viewSource),
  'G. cambio de pestaña o rerender cierra el menú activo');

bindActionMenus(container, { ver: () => { actionRuns += 1; } });
ok(globalListeners.get('click')?.size === 1
  && globalListeners.get('keydown')?.size === 1
  && container.listeners.get('show.bs.dropdown')?.size === 1
  && container.listeners.get('hidden.bs.dropdown')?.size === 1,
'H. rerender no duplica listeners globales ni del contenedor');

const menuSource = viewSource.slice(
  viewSource.indexOf('export function entregableMenuItems'),
  viewSource.indexOf('function renderEstadosOrden'),
);
ok([
  'Registrar entregable',
  'Modificar entregable',
  'Observar',
  'Generar Acta de Conformidad',
  'Derivar a Coordinador CM',
].every((label) => menuSource.includes(label)),
  'I. matriz funcional de acciones permanece');
ok(/renderEstadoBadgeFromRow\(row\)/.test(viewSource)
  && /renderResponsableCellHtml\(row, esc\)/.test(viewSource),
'J. estado y responsable conservan sus componentes centrales');
ok(/renderEstadosOrden\(row\)/.test(viewSource)
  && /renderResponsablesOrden\(row\)/.test(viewSource)
  && /estado_responsable_vigente/.test(viewSource),
'K. pestaña Órdenes conserva el contrato HOTFIX2');

closeBandejaActionMenus();
console.log(`\n=== Resultado HOTFIX3: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
