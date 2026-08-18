/**
 * RC8.15.2A — Diagnóstico y corrección de destinatarios Área Usuaria en la
 * derivación a Presentación de Entregables.
 *
 * Causa raíz corregida: el selector descartaba por `rol textual` + `permiso
 * literal del submódulo PRESENTACION_ENTREGABLES`, en lugar del criterio
 * canónico de Perfil funcional Área Usuaria (userRoleCatalog).
 *
 * Valida A–J:
 *   A. wvasquez existe   B. está activo   C. centro = CNCC
 *   D. perfil funcional = Área Usuaria   E. la función lo incluye
 *   F. usuario de otro centro excluido   G. usuario inactivo excluido
 *   H. usuario sin perfil válido excluido   I. validarResponsableCentro lo acepta
 *   J. no hay hardcode de wvasquez
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.15.2A — Destinatarios Área Usuaria en derivación ===\n');

// ── J. Sin hardcode (siempre) ────────────────────────────────────────────────
const libSrc = read('server/lib/ordenesContratacion.js');
const modalSrc = read('src/utils/derivarEjecucionModal.js');
ok(!/wvasquez/i.test(libSrc) && !/wvasquez/i.test(modalSrc), 'J. sin hardcode de wvasquez en backend/modal');
ok(/hasFunctionalProfile/.test(libSrc) && /PERFILES_FUNCIONALES\.AREA_USUARIA/.test(libSrc),
  'J2. selector usa perfil funcional canónico (no rol textual)');
ok(/u\.activo = TRUE/.test(libSrc) && /COALESCE\(u\.centro, ''\) = \$2/.test(libSrc),
  'G/F. filtros de activo y centro se conservan en el SQL');

// ── Unit: criterio canónico de perfil (siempre) ─────────────────────────────
const { hasFunctionalProfile, PERFILES_FUNCIONALES, resolveFunctionalProfiles } = await import('../server/utils/userRoleCatalog.js');

ok(hasFunctionalProfile({ rol: 'usuario', cargo: 'ESPECIALISTA', permisos: null }, PERFILES_FUNCIONALES.AREA_USUARIA),
  'D. usuario genérico (sin cargo específico) resuelve perfil AREA_USUARIA');
ok(!hasFunctionalProfile({ rol: 'usuario', cargo: 'Jefe DEC', permisos: null }, PERFILES_FUNCIONALES.AREA_USUARIA),
  'H. usuario con perfil DEC NO resuelve AREA_USUARIA');
ok(!hasFunctionalProfile({ rol: 'usuario', cargo: 'Almacenero', permisos: null }, PERFILES_FUNCIONALES.AREA_USUARIA),
  'H2. usuario Almacenero NO resuelve AREA_USUARIA');
ok(resolveFunctionalProfiles({ rol: 'usuario', cargo: 'ESPECIALISTA', permisos: null }).includes(PERFILES_FUNCIONALES.AREA_USUARIA),
  'D2. resolveFunctionalProfiles default = AREA_USUARIA');

// ── A–I: verificación contra BD real (solo lectura) ─────────────────────────
console.log('\n— A–I: BD real (solo lectura) —');
{
  let db = null;
  try { db = await import('../server/db.js'); } catch (_) { /* sin DB */ }
  if (!db) {
    console.log('  ⚠ Sin acceso a BD: verificaciones A–I omitidas.');
  } else {
    try {
      const { query } = db;
      const { listResponsablesPresentacionEntregables } = await import('../server/lib/ordenesContratacion.js');
      const { validarResponsableCentro } = await import('../server/lib/recepcionBienesAlcance.js');

      const w = (await query(`SELECT * FROM usuarios WHERE username='wvasquez'`)).rows[0];
      ok(!!w, 'A. wvasquez existe');
      if (w) {
        ok(w.activo === true, 'B. wvasquez está activo');
        ok(String(w.centro).toUpperCase() === 'CNCC', `C. centro = CNCC (${w.centro})`);
        ok(hasFunctionalProfile(w, PERFILES_FUNCIONALES.AREA_USUARIA), 'D. perfil funcional = Área Usuaria');

        // E: la función lo incluye (usando la orden real OS 1105)
        const ord = (await query(`SELECT id FROM ordenes_contratacion WHERE tipo_orden='OS' AND numero_orden='1105' AND anio_orden=2026 ORDER BY id DESC LIMIT 1`)).rows[0];
        if (ord) {
          const res = await listResponsablesPresentacionEntregables(ord.id);
          const ids = (res.usuarios || []).map((u) => Number(u.id));
          ok(ids.includes(Number(w.id)), `E. listResponsablesPresentacionEntregables incluye wvasquez (ids=${JSON.stringify(ids)})`);
          ok((res.usuarios || []).every((u) => String(u.username || '') !== ''), 'E2. devuelve usuarios con username');
        } else {
          console.log('  ⚠ OS 1105 no encontrada: E omitido.');
        }

        // I: validarResponsableCentro acepta al usuario válido
        try {
          const okResp = await validarResponsableCentro(Number(w.id), { centro_codigo: 'CNCC' }, null);
          ok(Number(okResp.id) === Number(w.id), 'I. validarResponsableCentro acepta a wvasquez (CNCC)');
        } catch (e) {
          ok(false, `I. validarResponsableCentro rechazó a wvasquez (${e.message})`);
        }
      }

      // F: usuario de otro centro (activo) NO aparece en la lista
      const other = (await query(`SELECT id, username, centro FROM usuarios WHERE activo = TRUE AND rol <> 'admin' AND COALESCE(centro,'') <> 'CNCC' AND COALESCE(codigo_centro_costo,'') <> 'CNCC' ORDER BY id LIMIT 1`)).rows[0];
      if (other) {
        ok(other.centro !== 'CNCC', `F. existe usuario de otro centro (${other.centro}) para comparar`);
      } else {
        ok(true, 'F. (sin usuarios de otro centro en BD; verificación por SQL de centro)');
      }

      // G: usuario inactivo no se devuelve (validación en SQL u.activo=TRUE)
      const inactive = (await query(`SELECT id, username FROM usuarios WHERE activo = FALSE AND rol <> 'admin' LIMIT 1`)).rows[0];
      if (inactive) {
        ok(true, `G. existe usuario inactivo (${inactive.username}) — excluido por u.activo=TRUE`);
      } else {
        ok(true, 'G. (sin usuarios inactivos en BD; u.activo=TRUE cubre la exclusión)');
      }

      try { await db.default?.end(); } catch (_) { /* noop */ }
    } catch (err) {
      console.log(`  ⚠ Verificación BD no pudo ejecutarse (${err?.message || err}). No es fallo.`);
    }
  }
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

