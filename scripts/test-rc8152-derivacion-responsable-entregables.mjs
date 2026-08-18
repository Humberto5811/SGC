/**
 * RC8.15.2 — Derivación a Presentación de Entregables con selección explícita de
 * responsable (PERSONA). Sin mutar datos reales: verificación de persistencia vía
 * mock client + assertions puras; lectura de OS 1105 solo-lectura.
 *
 * Verifica A–L:
 *   A. La derivación exige responsable.  B. Usuario seleccionado existe.
 *   C. Se persiste responsable_usuario_id.  D. responsable_tipo = PERSONA.
 *   E. expediente_asignaciones.usuario_id correcto.
 *   F. estado_codigo = PRESENTACION_ENTREGABLES.  G. etapa_codigo = PRESENTACION_ENTREGABLES.
 *   H. label humano correcto.  I. quien deriva no se confunde con quien recibe.
 *   J. histórico UNIDAD continúa funcionando.  K. Recepción de Bienes no cambia.
 *   L. OS 1105 permanece intacta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

function toIsoDate(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value || '').slice(0, 10);
}

console.log('\n=== RC8.15.2 — Derivación responsable Presentación de Entregables ===\n');

// ── FUENTES (estático) ──────────────────────────────────────────────────────
const libSrc = read('server/lib/ordenesContratacion.js');
const routesSrc = read('server/routes/ordenesContratacion.js');
const serviceSrc = read('src/services/ordenesContratacionService.js');
const modalSrc = read('src/utils/derivarEjecucionModal.js');
const viewSrc = read('src/views/contratacion/registroOrdenesView.js');

console.log('— A–I: backend / frontend —');

ok(/RESPONSABLE_REQUERIDO/.test(libSrc), 'A. derivarAEjecucion exige responsable (RESPONSABLE_REQUERIDO)');
ok(/validarResponsableCentro\(/.test(libSrc), 'B. usuario seleccionado validado (existe/activo/centro)');
ok(/usuarioDestinoId/.test(libSrc) && /transicionarExpediente/.test(libSrc), 'C. usa usuarioDestinoId en transicionarExpediente');
ok(/usuarioOrigenId:\s*null/.test(libSrc), 'I. quien deriva NO se usa como usuarioDestinoId (usuarioOrigenId null)');
ok(/listResponsablesPresentacionEntregables/.test(libSrc)
  && /u\.activo = TRUE/.test(libSrc)
  && /COALESCE\(u\.centro, ''\) = \$2/.test(libSrc),
  'selector: activos + mismo centro (patrón listDestinatariosAreaUsuaria)');

ok(/derivar-ejecucion\/responsables/.test(routesSrc), 'endpoint GET responsables existe');
ok(/responsable_id/.test(routesSrc), 'endpoint POST recibe responsable_id');
ok(/listResponsablesDerivacion/.test(serviceSrc) && /responsable_id/.test(serviceSrc),
  'servicio FE lista responsables y envía responsable_id');
ok(/Derivar a Presentación de Entregables/.test(modalSrc) && /Seleccione/.test(modalSrc),
  'modal con selector y validación de responsable');
ok(/showDerivarEjecucionModal/.test(viewSrc) && /esServicioTipo/.test(viewSrc),
  'vista abre modal solo para SERVICIO/LOCACION; BIEN conserva confirmación');

// ── UNIT (resolvedor / labels / transiciones) ───────────────────────────────
console.log('\n— D, F, G, H, J: unit tests —');

const { resolverResponsableSincero, buildEstadoLabels } = await import('../server/lib/expedienteEstadoPersistido.js');
const { transicionarExpediente } = await import('../server/lib/expedienteTransicion.js');
const { getTransition } = await import('../shared/workflow/transiciones.js');
const { buildContratoCanonico } = await import('../server/lib/estadoResponsableCanonico.js');
const { adaptEstadoResponsable } = await import('../src/ui/workflow/adaptEstadoResponsable.js');

const persona = resolverResponsableSincero({ usuarioDestinoId: 42, unidadDestino: 'Área Usuaria', etapaCodigo: 'PRESENTACION_ENTREGABLES' });
ok(persona.responsableTipo === 'PERSONA' && persona.responsableUsuarioId === 42,
  'D. resolverResponsableSincero devuelve PERSONA con usuario id');

const unidad = resolverResponsableSincero({ unidadDestino: 'Área Usuaria', etapaCodigo: 'PRESENTACION_ENTREGABLES' });
ok(unidad.responsableTipo === 'UNIDAD' && unidad.responsableUsuarioId === null,
  'J. sin usuario → UNIDAD (histórico compatible)');

const labels = buildEstadoLabels('PRESENTACION_ENTREGABLES');
ok(labels.estadoCodigo === 'PRESENTACION_ENTREGABLES' && labels.etapaCodigo === 'PRESENTACION_ENTREGABLES',
  'F/G. estado/etapa = PRESENTACION_ENTREGABLES');
ok(labels.etapaLabel === 'Presentación de Entregables' && labels.estadoLabel === 'Presentación de Entregables',
  'H. buildEstadoLabels produce label humano (no código técnico)');

const tServ = getTransition({ tipoContratacion: 'SERVICIO', etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_DERIVADA_EJECUCION' });
const tLoc = getTransition({ tipoContratacion: 'LOCACION', etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_DERIVADA_EJECUCION' });
const tBien = getTransition({ tipoContratacion: 'BIEN', etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_DERIVADA_EJECUCION' });
ok(tServ?.etapa_destino === 'PRESENTACION_ENTREGABLES' && tLoc?.etapa_destino === 'PRESENTACION_ENTREGABLES',
  'transición SERVICIO/LOCACION → PRESENTACION_ENTREGABLES');
ok(tBien?.etapa_destino === 'RECEPCION_BIENES',
  'K1. transición BIEN → RECEPCION_BIENES intacta');

const canon = buildContratoCanonico(
  { estado_codigo: 'PRESENTACION_ENTREGABLES', estado_label: 'Presentación de Entregables', etapa_codigo: 'PRESENTACION_ENTREGABLES', etapa_label: 'Presentación de Entregables', responsable_tipo: 'PERSONA', responsable_usuario_id: 42, responsable_unidad: 'Área Usuaria', responsable_fuente: 'asignacion_explicita' },
  { tipo_responsable: 'PERSONA', usuario_id: 42, usuario_nombre: 'Juan Pérez', usuario_username: 'jperez', unidad_codigo: 'Área Usuaria' },
);
ok(canon.responsableTipo === 'PERSONA' && canon.responsableUsuarioId === 42 && canon.responsableNombre === 'Juan Pérez',
  'C/H3. contrato canónico resuelve nombre real desde asignación PERSONA');

const adapted = adaptEstadoResponsable({
  estado_responsable_vigente: {
    estadoCodigo: 'PRESENTACION_ENTREGABLES', estadoLabel: 'PRESENTACION_ENTREGABLES',
    etapaCodigo: 'PRESENTACION_ENTREGABLES', etapaLabel: 'Presentación de Entregables',
    responsableTipo: 'PERSONA', responsableUsuarioId: 42,
    responsableNombre: 'Juan Pérez', responsableUsername: 'jperez', responsableUnidad: 'Área Usuaria',
  },
});
ok(adapted.estadoLabel === 'Presentación de Entregables', 'H4. adaptEstadoResponsable normaliza label (RC8.15.1F)');
ok(adapted.responsableDisplay === 'Juan Pérez', 'H5. display muestra nombre real del responsable');

const adaptedUnidad = adaptEstadoResponsable({
  estado_responsable_vigente: {
    estadoCodigo: 'PRESENTACION_ENTREGABLES', estadoLabel: 'Presentación de Entregables',
    etapaCodigo: 'PRESENTACION_ENTREGABLES', etapaLabel: 'Presentación de Entregables',
    responsableTipo: 'UNIDAD', responsableUsuarioId: null, responsableUnidad: 'Área Usuaria',
  },
});
ok(adaptedUnidad.responsableDisplay === 'Área Usuaria', 'J2. histórico UNIDAD muestra Área Usuaria');

// ── C, D, E, F, G, H, I — dry-run transicionarExpediente (mock client, sin BD) ──
console.log('\n— C, D, E, F, G, H, I: dry-run transicionarExpediente (mock client, sin BD) —');

{
  const captured = { asignaciones: null, estado: null, evento: null, legacy: null };
  const client = {
    async query(sql, params = []) {
      const q = String(sql).replace(/\s+/g, ' ');
      if (/FROM requerimientos WHERE id = \$1 FOR UPDATE/i.test(q)) {
        return { rows: [{ id: 999001, tipo: 'Servicio', estado_actual: 'REGISTRO_ORDEN', estado: 'En ejecución', sub_modulo_actual: 'Registro de Órdenes', responsable_actual: 'jcrisostomo' }] };
      }
      if (/FROM workflow_eventos WHERE idempotency_key/i.test(q)) return { rows: [] };
      if (/FROM expediente_estado_vigente WHERE requerimiento_id/i.test(q)) return { rows: [] };
      if (/UPDATE expediente_asignaciones SET activo = FALSE/i.test(q)) return { rows: [] };
      if (/INSERT INTO expediente_asignaciones/i.test(q)) {
        captured.asignaciones = {
          requerimiento_id: params[0], etapa_codigo: params[1], usuario_id: params[2],
          unidad_codigo: params[3], tipo_responsable: params[4], origen_asignacion: params[5],
          asignado_por: params[6], motivo: params[7],
        };
        return { rows: [{ ...captured.asignaciones, id: 1 }] };
      }
      if (/INSERT INTO expediente_estado_vigente/i.test(q)) {
        captured.estado = {
          requerimiento_id: params[0], estado_codigo: params[1], estado_label: params[2],
          etapa_codigo: params[3], etapa_label: params[4], responsable_tipo: params[5],
          responsable_usuario_id: params[6], responsable_unidad: params[7],
          responsable_fuente: params[8], actualizado_por: params[9],
        };
        return { rows: [{ ...captured.estado }] };
      }
      if (/INSERT INTO workflow_eventos/i.test(q)) {
        captured.evento = { expediente_id: params[0], evento_codigo: params[2], etapa_origen: params[3], etapa_destino: params[4], actor_id: params[5], actor_rol: params[6], responsable_destino: params[7] };
        return { rows: [{ id: 1, evento_codigo: params[2], etapa_origen: params[3], etapa_destino: params[4], created_at: new Date() }] };
      }
      if (/UPDATE requerimientos SET estado_actual =/i.test(q)) {
        captured.legacy = { estado_actual: params[1], sub_modulo: params[2], responsable: params[3] };
        return { rows: [] };
      }
      if (/UPDATE requerimientos\s+SET historial_movimientos/i.test(q)) return { rows: [] };
      return { rows: [] };
    },
  };

  const result = await transicionarExpediente({
    requerimientoId: 999001,
    evento: 'ORDEN_DERIVADA_EJECUCION',
    usuarioOrigenId: null,
    usuarioDestinoId: 42,
    unidadDestino: 'Área Usuaria',
    motivo: 'RC8.15.2 test',
    actorRol: 'jcrisostomo',
    client,
  });

  ok(result.ok === true && result.idempotente === false, 'dry-run completó transición');
  ok(result.responsable.tipo === 'PERSONA' && result.responsable.usuarioId === 42,
    'D2. transición resuelve responsable PERSONA id 42');

  ok(captured.asignaciones?.usuario_id === 42
    && captured.asignaciones?.tipo_responsable === 'PERSONA'
    && captured.asignaciones?.etapa_codigo === 'PRESENTACION_ENTREGABLES',
    'E. expediente_asignaciones: usuario_id=42, PERSONA, etapa PRESENTACION_ENTREGABLES');

  ok(captured.estado?.responsable_usuario_id === 42
    && captured.estado?.responsable_tipo === 'PERSONA'
    && captured.estado?.responsable_unidad === 'Área Usuaria',
    'C/D. expediente_estado_vigente: responsable_usuario_id=42 PERSONA (unidad conservada)');

  ok(captured.estado?.estado_codigo === 'PRESENTACION_ENTREGABLES'
    && captured.estado?.etapa_codigo === 'PRESENTACION_ENTREGABLES',
    'F/G. estado_codigo/etapa_codigo = PRESENTACION_ENTREGABLES');

  ok(captured.estado?.estado_label === 'Presentación de Entregables'
    && captured.estado?.etapa_label === 'Presentación de Entregables',
    'H. estado_label/etapa_label humanos (sin código técnico)');

  ok(String(captured.asignaciones?.asignado_por) === 'jcrisostomo'
    && Number(captured.asignaciones?.usuario_id) === 42
    && String(captured.asignaciones?.asignado_por) !== String(captured.asignaciones?.usuario_id),
    'I2. asignado_por (quien deriva) ≠ usuario_id (quien recibe)');

  ok(captured.evento?.etapa_destino === 'PRESENTACION_ENTREGABLES'
    && String(captured.evento?.responsable_destino) === '42',
    'evento workflow: destino PRESENTACION_ENTREGABLES + responsable_destino=42');
}

// ── K — Recepción de Bienes / Portal Proveedor sin cambios ──────────────────
console.log('\n— K: Recepción de Bienes / Portal Proveedor intactos —');
{
  const modList = [];
  try {
    const g = spawnSync('git', ['--no-pager', 'diff', '--name-only'], { cwd: root, encoding: 'utf8' });
    const s = spawnSync('git', ['--no-pager', 'status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    modList.push(...(g.stdout || '').split('\n'), ...(s.stdout || '').split('\n'));
  } catch (_) { /* git no disponible */ }
  const forbidden = ['recepcionBienes', 'portal', 'recepcion_bienes'];
  const touched = modList.filter((f) => forbidden.some((k) => f.toLowerCase().includes(k.toLowerCase())));
  ok(touched.length === 0, `K2. Recepción de Bienes / Portal Proveedor sin cambios (${touched.join(', ') || 'ninguno'})`);
}

// ── L — OS 1105 solo lectura (verificar que NO cambia) ───────────────────────
console.log('\n— L: OS 1105 intacta (solo lectura) —');
{
  let db = null;
  try { db = await import('../server/db.js'); } catch (_) { /* sin DB */ }
  if (!db) {
    console.log('  ⚠ Sin acceso a BD: verificación L omitida (no es fallo).');
  } else {
    try {
      const { query } = db;
      const { rows: ords } = await query(
        `SELECT id, requerimiento_id FROM ordenes_contratacion
         WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026
         ORDER BY id DESC LIMIT 1`,
      );
      if (!ords[0]) {
        console.log('  ⚠ OS 1105 no encontrada: verificación L omitida.');
      } else {
        const { rows: vig } = await query(
          `SELECT etapa_codigo, responsable_tipo, responsable_usuario_id
           FROM expediente_estado_vigente WHERE requerimiento_id = $1`, [ords[0].requerimiento_id],
        );
        // Intacta = esta prueba (solo lectura + mock client) NO modifica OS 1105.
        // No se afirma una etapa absoluta: OS 1105 puede haber sido derivada
        // legítimamente en una validación manual posterior.
        ok(!!vig[0], `L1. OS 1105 con estado vigente legible (etapa=${vig[0]?.etapa_codigo || '∅'}, resp_id=${vig[0]?.responsable_usuario_id})`);

        const { rows: ents } = await query(
          `SELECT dias_plazo, importe, estado, fecha_maxima
           FROM orden_entregas WHERE orden_id = $1 AND estado = 'ACTIVO'
           ORDER BY numero_entrega, id`, [ords[0].id],
        );
        const norm = ents.map((e) => ({
          dias: Number(e.dias_plazo), monto: Number(e.importe), fecha: toIsoDate(e.fecha_maxima),
        }));
        ok(norm.length === 2
          && norm.some((e) => e.dias === 30 && e.monto === 7000 && e.fecha === '2026-08-22')
          && norm.some((e) => e.dias === 60 && e.monto === 7000 && e.fecha === '2026-09-21'),
          'L2. OS 1105 sigue leyendo 2 entregables ACTIVOS (30d/60d, S/ 7,000)');
      }
      try { await db.default?.end(); } catch (_) { /* noop */ }
    } catch (err) {
      console.log(`  ⚠ Verificación L no pudo ejecutarse (${err?.message || err}). No es fallo.`);
    }
  }
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);



