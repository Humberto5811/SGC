/**
 * RC8.11.1 — APLICACIÓN ADMINISTRATIVA CONTROLADA DEL BOOTSTRAP CANÓNICO
 *
 * Aplica la reconciliación RC8.11 a UN SOLO expediente por vez.
 *
 * Uso:
 *   node scripts/apply-rc811-bootstrap-canonico.mjs --codigo=REQ-00003 --motivo="Aplicación administrativa controlada RC8.11.1" --confirmar
 *
 * Parámetros OBLIGATORIOS:
 *   --codigo=REQ-XXXXX   Código exacto del requerimiento a reconciliar.
 *   --motivo="texto"     Motivo/documentación de la intervención administrativa.
 *   --confirmar          Confirmación explícita de la operación.
 *
 * PROHIBIDO:
 *   --all                No se permite aplicar a todos los expedientes.
 *   --apply              No se permite (solo aplica con --confirmar).
 *
 * Flujo:
 *   1. Validar parámetros obligatorios.
 *   2. Recalcular plan RC8.11 (dry-run).
 *   3. Mostrar estado actual (ERV + asignación).
 *   4. Mostrar evidencia encontrada.
 *   5. Mostrar etapa y responsable propuestos.
 *   6. Verificar acción = RECONCILIAR.
 *   7. Ejecutar en transacción.
 *   8. Releer ERV + asignación post-aplicación.
 *   9. Registrar trazabilidad administrativa.
 *   10. Mostrar comparación antes/después.
 */

import {
  planReconciliarBootstrapCanonico,
  aplicarReconciliarBootstrapCanonico,
  ORIGEN_RECONCILIACION_RC811,
} from '../server/lib/reconciliarBootstrapCanonico.js';
import { query } from '../server/db.js';
import { registrarMovimiento } from '../server/lib/trazabilidad.js';
import { getEtapaMeta } from '../shared/workflow/etapas.js';
import { getLabelEstado } from '../shared/estadoExpedienteCatalog.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';

// ────────────────────────────────────────
// Parseo y validación de argumentos
// ────────────────────────────────────────

function parseArgs(argv) {
  const args = { codigo: null, motivo: null, confirmar: false };

  for (const a of argv) {
    if (a === '--confirmar') {
      args.confirmar = true;
    } else if (a === '--all') {
      console.error('\nERROR RC8.11.1: --all está PROHIBIDO. Solo se permite un expediente por vez con --codigo=REQ-XXXXX.\n');
      process.exit(2);
    } else if (a === '--apply') {
      console.error('\nERROR RC8.11.1: --apply no es válido. Use --confirmar para aplicar la reconciliación.\n');
      process.exit(2);
    } else if (a.startsWith('--codigo=')) {
      args.codigo = a.slice(9).trim();
    } else if (a.startsWith('--motivo=')) {
      args.motivo = a.slice(9).trim();
    }
  }

  return args;
}

function validarArgs(args) {
  const errores = [];

  if (!args.codigo || !/^REQ-\d{5}$/i.test(args.codigo)) {
    errores.push('--codigo=REQ-XXXXX es obligatorio (formato REQ-XXXXX).');
  }

  if (!args.motivo || args.motivo.length < 5) {
    errores.push('--motivo="texto" es obligatorio (mínimo 5 caracteres).');
  }

  if (!args.confirmar) {
    errores.push('--confirmar es obligatorio para aplicar la reconciliación.');
  }

  if (errores.length > 0) {
    console.error('\n=== ERROR DE PARÁMETROS RC8.11.1 ===\n');
    errores.forEach((e) => console.error(`  ✗ ${e}`));
    console.error('\nUso correcto:');
    console.error('  node scripts/apply-rc811-bootstrap-canonico.mjs --codigo=REQ-00003 --motivo="Aplicación controlada RC8.11.1" --confirmar\n');
    process.exit(2);
  }
}

// ────────────────────────────────────────
// Helpers de formato
// ────────────────────────────────────────

function pad(s, n) {
  const t = String(s ?? '');
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

function fmtResp(r) {
  if (!r) return '—';
  const tipo = r.responsableTipo || r.tipo_responsable || '';
  if (tipo === 'PERSONA' || tipo === TIPO_RESPONSABLE.PERSONA) {
    const uid = r.responsableUsuarioId ?? r.responsable_usuario_id ?? '?';
    const name = r.responsableNombre || r.responsableUsername || r.responsable_nombre || '';
    return `PERSONA:${uid}${name ? `(${name})` : ''}`;
  }
  if (tipo === 'UNIDAD' || tipo === TIPO_RESPONSABLE.UNIDAD) {
    return `UNIDAD:${r.responsableUnidad || r.responsable_unidad || ''}`;
  }
  if (tipo === 'PENDIENTE' || tipo === TIPO_RESPONSABLE.PENDIENTE) return 'PENDIENTE';
  return tipo || '—';
}

function fmtFuente(f) {
  const s = String(f ?? '—');
  if (s.includes('backfill')) return `${s} ⚠️`;
  if (s.includes('RECONCILIACION')) return `${s} 🔧`;
  return s;
}

// ────────────────────────────────────────
// Resolver ID de requerimiento desde código
// ────────────────────────────────────────

async function resolveRequerimientoId(codigo) {
  const { rows } = await query(
    `SELECT id, codigo, tipo, estado, estado_actual, sub_modulo_actual, responsable_actual
     FROM requerimientos WHERE UPPER(codigo) = $1 LIMIT 1`,
    [codigo.toUpperCase()],
  );
  return rows[0] || null;
}

// ────────────────────────────────────────
// Leer estado post-aplicación
// ────────────────────────────────────────

async function readEstadoPostAplicacion(requerimientoId) {
  const [{ rows: erv }, { rows: asg }] = await Promise.all([
    query(
      `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
      [requerimientoId],
    ),
    query(
      `SELECT * FROM expediente_asignaciones
       WHERE requerimiento_id = $1 AND activo = TRUE`,
      [requerimientoId],
    ),
  ]);

  // Enriquecer con nombres de usuarios
  if (erv[0]?.responsable_usuario_id) {
    const { rows: users } = await query(
      `SELECT id, username, nombre, apellidos, nombres FROM usuarios WHERE id = $1`,
      [erv[0].responsable_usuario_id],
    );
    if (users[0]) {
      erv[0]._responsable_nombre = users[0].nombre
        || `${users[0].apellidos || ''} ${users[0].nombres || ''}`.trim()
        || users[0].username;
      erv[0]._responsable_username = users[0].username;
    }
  }

  if (asg[0]?.usuario_id) {
    const { rows: users } = await query(
      `SELECT id, username, nombre, apellidos, nombres FROM usuarios WHERE id = $1`,
      [asg[0].usuario_id],
    );
    if (users[0]) {
      asg[0]._usuario_nombre = users[0].nombre
        || `${users[0].apellidos || ''} ${users[0].nombres || ''}`.trim()
        || users[0].username;
      asg[0]._usuario_username = users[0].username;
    }
  }

  return { erv: erv[0] || null, asignacion: asg[0] || null };
}

// ────────────────────────────────────────
// MAIN
// ────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validarArgs(args);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RC8.11.1 — APLICACIÓN ADMINISTRATIVA CONTROLADA BOOTSTRAP  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. Resolver requerimiento ──
  console.log('[1/10] Buscando requerimiento...');
  const req = await resolveRequerimientoId(args.codigo);
  if (!req) {
    console.error(`\nERROR: No se encontró requerimiento con código "${args.codigo}".\n`);
    process.exit(3);
  }
  console.log(`  ✓ Encontrado: ${req.codigo} (ID=${req.id}, tipo=${req.tipo || '?'})`);

  // ── 2. Estado actual (pre-plan) ──
  console.log('\n[2/10] Leyendo estado actual (ERV + asignación)...');
  const before = await readEstadoPostAplicacion(req.id);
  console.log(`  ERV etapa      : ${before.erv?.etapa_codigo || '—'}`);
  console.log(`  ERV estado     : ${before.erv?.estado_codigo || '—'}`);
  console.log(`  ERV responsable: ${fmtResp(before.erv)}`);
  console.log(`  ERV fuente     : ${fmtFuente(before.erv?.responsable_fuente)}`);
  console.log(`  ERV versión    : ${before.erv?.version ?? '—'}`);
  console.log(`  Asignación     : ${before.asignacion ? `${before.asignacion.etapa_codigo} → ${fmtResp(before.asignacion)} (activa)` : 'NINGUNA'}`);

  // ── 3. Calcular plan RC8.11 ──
  console.log('\n[3/10] Recalculando plan RC8.11 (dry-run)...');
  const plan = await planReconciliarBootstrapCanonico({ requerimientoIds: [req.id] });
  const row = (plan.rows || []).find((r) => r.requerimientoId === req.id);

  if (!row) {
    console.error(`\nERROR: No se pudo generar plan para ${args.codigo}.\n`);
    process.exit(4);
  }

  // ── 4. Mostrar evidencia ──
  console.log('\n[4/10] Evidencia encontrada:');
  console.log(`  Tipo requerimiento : ${row.tipo}`);
  console.log(`  Evidencia avanzada : ${row.evidenciaAvanzada || '—'}`);
  if (row.evidenciaDetalle && Object.keys(row.evidenciaDetalle).length > 0) {
    for (const [k, v] of Object.entries(row.evidenciaDetalle)) {
      if (v !== null && v !== undefined && v !== '') {
        console.log(`    • ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
  }
  console.log(`  Hallazgos totales  : ${(row.hallazgos || []).length}`);
  const descartados = (row.hallazgos || []).filter((h) => h.descartado);
  if (descartados.length > 0) {
    console.log(`    Descartados       : ${descartados.length}`);
    descartados.forEach((h) => {
      console.log(`      ↳ ${h.etapa} (${h.evidencia}) — veto: ${h.detalle?.veto || '?'}`);
    });
  }

  // ── 5. Etapa y responsable propuestos ──
  console.log('\n[5/10] Propuesta de reconciliación:');
  console.log(`  Etapa propuesta     : ${row.etapaPropuesta || '—'}`);
  console.log(`  Estado propuesto    : ${row.estadoPropuesto || '—'}`);
  console.log(`  Label propuesto     : ${row.estadoLabelPropuesto || '—'}`);
  console.log(`  Responsable tipo    : ${row.responsablePropuesto?.responsableTipo || '—'}`);
  if (row.responsablePropuesto?.responsableTipo === 'PERSONA') {
    console.log(`  Responsable usuario : ${row.responsablePropuesto?.responsableUsuarioId || '?'}`);
    console.log(`  Responsable nombre  : ${row.responsablePropuesto?.responsableNombre || row.responsablePropuesto?.responsableUsername || '—'}`);
  }
  console.log(`  Responsable unidad  : ${row.responsablePropuesto?.responsableUnidad || '—'}`);
  console.log(`  Motivo resolución   : ${row.responsablePropuesto?.motivo || '—'}`);
  console.log(`  Clasificaciones     : ${(row.clasificaciones || []).join(', ') || '—'}`);
  console.log(`  Warnings            : ${(row.warnings || []).join(', ') || '—'}`);

  // ── 6. Verificar acción ──
  console.log('\n[6/10] Verificando acción...');
  if (row.accion !== 'RECONCILIAR') {
    console.log(`  ✗ Acción = ${row.accion} (NO requiere reconciliación).`);
    console.log(`  ✓ El expediente ya está en estado canónico. No hay cambios que aplicar.\n`);
    process.exit(0);
  }
  console.log(`  ✓ Acción = RECONCILIAR → Procede aplicar.`);

  // ── 7. Confirmación y aplicación en transacción ──
  console.log('\n[7/10] Aplicando reconciliación en transacción...');
  console.log(`  Motivo administrativo: ${args.motivo}`);

  const resultado = await aplicarReconciliarBootstrapCanonico({
    requerimientoIds: [req.id],
    dryRun: false,
  });

  console.log(`  ✓ Transacción completada.`);
  console.log(`  ✓ Filas aplicadas: ${resultado.applied}`);

  // ── 8. Releer estado post-aplicación ──
  console.log('\n[8/10] Releyendo estado post-aplicación...');
  const after = await readEstadoPostAplicacion(req.id);
  console.log(`  ERV etapa      : ${after.erv?.etapa_codigo || '—'}`);
  console.log(`  ERV estado     : ${after.erv?.estado_codigo || '—'}`);
  console.log(`  ERV responsable: ${fmtResp(after.erv)}`);
  console.log(`  ERV fuente     : ${fmtFuente(after.erv?.responsable_fuente)}`);
  console.log(`  ERV versión    : ${after.erv?.version ?? '—'}`);
  console.log(`  Asignación     : ${after.asignacion ? `${after.asignacion.etapa_codigo} → ${fmtResp(after.asignacion)} (activa)` : 'NINGUNA'}`);

  // ── 9. Registrar trazabilidad administrativa ──
  console.log('\n[9/10] Registrando trazabilidad administrativa...');
  try {
    const estadoLabel = row.estadoLabelPropuesto || row.etapaPropuesta;
    const respDescripcion = row.responsablePropuesto?.responsableTipo === 'PERSONA'
      ? `Responsable: ${row.responsablePropuesto?.responsableNombre || row.responsablePropuesto?.responsableUsername || `ID ${row.responsablePropuesto?.responsableUsuarioId}`}`
      : row.responsablePropuesto?.responsableTipo === 'UNIDAD'
        ? `Unidad: ${row.responsablePropuesto?.responsableUnidad}`
        : 'Pendiente';

    await registrarMovimiento({
      requerimientoId: req.id,
      etapa: row.etapaPropuesta,
      usuario: 'admin-rc8111',
      observacion: `[RC8.11.1] Reconciliación bootstrap canónico. Motivo: ${args.motivo}. `
        + `Etapa → ${estadoLabel}. ${respDescripcion}. `
        + `Evidencia: ${row.evidenciaAvanzada || 'plan RC8.11'}. `
        + `Fuente: ${ORIGEN_RECONCILIACION_RC811}.`,
      accion: 'reconciliacion_bootstrap',
      tipoEvento: 'etapa',
    });
    console.log('  ✓ Trazabilidad registrada.');
  } catch (err) {
    console.error(`  ⚠ Error registrando trazabilidad: ${err.message}`);
    console.error('    (La reconciliación ya fue aplicada; la trazabilidad puede registrarse manualmente.)');
  }

  // ── 10. Comparación antes/después ──
  console.log('\n[10/10] Comparación ANTES → DESPUÉS:');
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  ${pad('Campo', 22)} | ${pad('ANTES', 22)} | ${pad('DESPUÉS', 22)}`);
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  ${pad('ERV etapa', 22)} | ${pad(before.erv?.etapa_codigo || '—', 22)} | ${pad(after.erv?.etapa_codigo || '—', 22)}`);
  console.log(`  ${pad('ERV estado', 22)} | ${pad(before.erv?.estado_codigo || '—', 22)} | ${pad(after.erv?.estado_codigo || '—', 22)}`);
  console.log(`  ${pad('ERV responsable', 22)} | ${pad(fmtResp(before.erv), 22)} | ${pad(fmtResp(after.erv), 22)}`);
  console.log(`  ${pad('ERV fuente', 22)} | ${pad(fmtFuente(before.erv?.responsable_fuente), 22)} | ${pad(fmtFuente(after.erv?.responsable_fuente), 22)}`);
  console.log(`  ${pad('ERV versión', 22)} | ${pad(String(before.erv?.version ?? '—'), 22)} | ${pad(String(after.erv?.version ?? '—'), 22)}`);
  console.log(`  ${pad('Asignación', 22)} | ${pad(before.asignacion ? `activa:${before.asignacion.etapa_codigo}` : 'NINGUNA', 22)} | ${pad(after.asignacion ? `activa:${after.asignacion.etapa_codigo}` : 'NINGUNA', 22)}`);
  console.log(`  ${'─'.repeat(70)}`);

  // Verificar consistencia post-aplicación
  const consistencia = [];
  if (!after.erv) consistencia.push('ERV no existe post-aplicación');
  if (!after.asignacion) consistencia.push('Sin asignación activa post-aplicación');
  if (after.erv && after.erv.etapa_codigo !== row.etapaPropuesta) {
    consistencia.push(`ERV etapa=${after.erv.etapa_codigo} ≠ propuesta=${row.etapaPropuesta}`);
  }
  if (after.asignacion && after.asignacion.etapa_codigo !== row.etapaPropuesta) {
    consistencia.push(`Asignación etapa=${after.asignacion.etapa_codigo} ≠ propuesta=${row.etapaPropuesta}`);
  }

  if (consistencia.length > 0) {
    console.error('\n⚠ ADVERTENCIAS DE CONSISTENCIA:');
    consistencia.forEach((c) => console.error(`  • ${c}`));
  } else {
    console.log('\n✓ CONSISTENCIA VERIFICADA — ERV y asignación coinciden con la propuesta.');
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RC8.11.1 — APLICACIÓN COMPLETADA EXITOSAMENTE             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n=== ERROR FATAL RC8.11.1 ===');
  console.error(err);
  process.exit(1);
});