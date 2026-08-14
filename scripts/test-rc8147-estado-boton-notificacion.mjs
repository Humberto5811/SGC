/**
 * RC8.14.7 — Estado visual del botón de notificación al proveedor.
 * Verificación estática del flujo éxito/error del botón #roEnvioSend
 * en src/utils/registroOrdenModal.js.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/utils/registroOrdenModal.js'), 'utf8');

const ok = (cond, msg) => {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
};

console.log('\n=== RC8.14.7 — Estado visual del botón de notificación ===\n');

// 1. Durante el envío: botón deshabilitado + "Enviando…".
ok(/btn\.disabled = true/.test(src) && /btn\.textContent = 'Enviando…'/.test(src),
  '1. durante el envío el botón se deshabilita y muestra "Enviando…"');

// 2. En éxito: el texto cambia a "Notificado" (no queda en "Enviando…").
ok(/btn\.textContent = '✓ Notificado'/.test(src) || /btn\.textContent = 'Notificado'/.test(src),
  '2. en éxito el botón cambia su texto a "Notificado"');

// 3. En error: se restaura "Enviar" y el estado habilitado/deshabilitado.
ok(/btn\.textContent = 'Enviar'/.test(src) && /btn\.disabled = bloqueaEnvio/.test(src),
  '3. en error se restaura "Enviar" y el estado habilitado/deshabilitado');

// 4. Éxito: se mantiene el mensaje verde con enlace y onDone.
ok(/ok\.innerHTML = `Orden notificada/.test(src) && /onDone\?\.\(\)/.test(src),
  '4. se mantiene el mensaje verde con enlace y onDone');

console.log('\n=== RC8.14.7 — pruebas OK ===\n');
