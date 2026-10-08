/**
 * RC8.17.8H6-C3-D10-D1 — Regresión bind segunda fuente tras refreshMatrizHost.
 * Estático + simulación DOM mínima (sin BD, sin modal Bootstrap).
 *
 *   node scripts/test-rc8178h6-d10d1-segunda-fuente-bind.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D10-D1 — Segunda fuente bind ===\n');

const modalSrc = fs.readFileSync(
  path.join(__dirname, '../src/utils/cuadroComparativoModal.js'),
  'utf8',
);

ok(/function rebindMatrizSegundaFuente\(editable\)/.test(modalSrc),
  'D10-D1 — helper rebindMatrizSegundaFuente presente');
ok(/function rebindMatrizSegundaFuente\(editable\)\s*\{[\s\S]*?refreshMatrizHost\(el, matriz, editable\);[\s\S]*?bindSegundaFuente\(editable\)/.test(modalSrc),
  'D10-D1 — rebind ejecuta refreshMatrizHost antes de bindSegundaFuente');

ok(/matrizSegundaFuenteEditable\(/.test(modalSrc)
  && /rebindMatrizSegundaFuente\(matrizSegundaFuenteEditable/.test(modalSrc),
  'D10-D1 — syncUiLocks usa matrizSegundaFuenteEditable + rebind');
ok(/function bindSegundaFuente\(panelEditable\)[\s\S]*?matrizSegundaFuenteEditable\(/.test(modalSrc),
  'D10-D1 — bindSegundaFuente alinea editable con syncUiLocks');
ok(/bindSegundaFuente\(editable\)/.test(modalSrc),
  'D10-D1 — rebind pasa editable a bindSegundaFuente');
ok(!/bindSegundaFuente\(\);\s*\n\s*refreshMatrizHost\(el, matriz, !readonly && !derivado/.test(modalSrc),
  'D10-D1 — syncUiLocks ya no enlaza bind antes de refresh');

ok(/btnAdd\.onclick\s*=/.test(modalSrc),
  'D10-D1 — Agregar usa onclick (evita listeners duplicados)');

ok(/showSegundaFuenteFormModal/.test(modalSrc) && /segunda_fuente/.test(modalSrc),
  'D10-D1 — formulario SF y persistencia en matriz intactos');

// Simulación: innerHTML destruye botón; bind debe ir después del refresh.
{
  const host = { innerHTML: '', _btn: null };
  Object.defineProperty(host, 'innerHTML', {
    set() {
      host._btn = { onclick: null };
    },
    get() { return ''; },
  });
  let clicked = false;
  const bind = () => {
    if (host._btn) host._btn.onclick = () => { clicked = true; };
  };
  const refresh = () => { host.innerHTML = '<button id="x">'; };

  clicked = false;
  bind();
  refresh();
  host._btn?.onclick?.();
  ok(!clicked, 'Sim — bind antes de refresh deja clic sin efecto');

  clicked = false;
  refresh();
  bind();
  host._btn?.onclick?.();
  ok(clicked, 'Sim — refresh luego bind: clic efectivo');
}

console.log('\n✅ RC8.17.8H6-C3-D10-D1 tests OK\n');
