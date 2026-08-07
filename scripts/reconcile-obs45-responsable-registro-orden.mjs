/**
 * Obs45 — reconciliar responsable PERSONA en REGISTRO_ORDEN cuando
 * la derivación CCP→RO dejó solo UNIDAD (p.ej. REQ-00002 / jcrisostomo).
 *
 * Uso:
 *   node scripts/reconcile-obs45-responsable-registro-orden.mjs
 *   node scripts/reconcile-obs45-responsable-registro-orden.mjs --apply
 *   node scripts/reconcile-obs45-responsable-registro-orden.mjs --codigo=REQ-00002 --apply
 */
import { query } from '../server/db.js';
import {
  crearAsignacion,
  upsertEstadoVigente,
  syncLegacyRequerimiento,
  cerrarAsignacionActiva,
  ORIGEN_ESCRITURA_VIGENTE,
} from '../server/lib/expedienteEstadoPersistido.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { withTransaction } from '../server/lib/workflow/workflowTransaction.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const codigoArg = args.find((a) => a.startsWith('--codigo='));
const codigoFilter = codigoArg ? codigoArg.split('=')[1] : null;

const { rows: candidatos } = await query(`
  SELECT r.id, r.codigo, r.estado_actual, r.responsable_actual,
    v.etapa_codigo, v.estado_codigo, v.responsable_tipo, v.responsable_usuario_id,
    v.responsable_unidad, v.responsable_fuente,
    a.id AS asg_id, a.usuario_id AS asg_usuario_id, a.unidad_codigo AS asg_unidad,
    a.tipo_responsable AS asg_tipo
  FROM requerimientos r
  JOIN expediente_estado_vigente v ON v.requerimiento_id = r.id
  LEFT JOIN expediente_asignaciones a ON a.requerimiento_id = r.id AND a.activo = TRUE
  WHERE UPPER(COALESCE(v.etapa_codigo, '')) IN ('REGISTRO_ORDEN', 'REGISTRO_ORDENES', 'ORDEN')
    AND UPPER(COALESCE(v.responsable_tipo, '')) = 'UNIDAD'
    AND v.responsable_usuario_id IS NULL
    AND ($1::text IS NULL OR r.codigo = $1)
  ORDER BY r.codigo
`, [codigoFilter]);

console.log(`Candidatos: ${candidatos.length} (apply=${apply})`);

for (const c of candidatos) {
  const { rows: prevCcp } = await query(`
    SELECT usuario_id, u.username
    FROM expediente_asignaciones a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.requerimiento_id = $1
      AND UPPER(COALESCE(a.etapa_codigo, '')) = 'CCP'
      AND a.usuario_id IS NOT NULL
    ORDER BY a.id DESC
    LIMIT 1
  `, [c.id]);

  const uid = prevCcp[0]?.usuario_id != null ? Number(prevCcp[0].usuario_id) : null;
  const username = prevCcp[0]?.username || null;
  console.log({
    codigo: c.codigo,
    etapa: c.etapa_codigo,
    responsable_actual: c.responsable_tipo,
    unidad: c.responsable_unidad,
    propuesto_usuario_id: uid,
    propuesto_username: username,
    accion: uid ? (apply ? 'APLICAR' : 'DRY-RUN') : 'SKIP_SIN_CCP_PERSONA',
  });

  if (!uid || !apply) continue;

  await withTransaction(async (tx) => {
    const origenEscritura = ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION;
    await cerrarAsignacionActiva(tx, c.id, { origenEscritura });
    await crearAsignacion(tx, {
      requerimientoId: c.id,
      etapaCodigo: 'REGISTRO_ORDEN',
      usuarioId: uid,
      unidadCodigo: 'Registro de Órdenes',
      tipoResponsable: TIPO_RESPONSABLE.PERSONA,
      origenAsignacion: 'RECONCILIACION_OBS45',
      asignadoPor: 'obs45_reconcile',
      motivo: 'Preservar analista CCP como responsable en Registro de Órdenes',
      origenEscritura,
    });
    await upsertEstadoVigente(tx, {
      requerimientoId: c.id,
      estadoCodigo: 'REGISTRO_ORDEN',
      estadoLabel: 'Registro de Orden',
      etapaCodigo: 'REGISTRO_ORDEN',
      etapaLabel: 'Registro de Orden',
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: 'Registro de Órdenes',
      responsableFuente: 'reconciliacion_obs45',
      actualizadoPor: 'obs45_reconcile',
      metadata: {
        origen: 'obs45',
        analista_ccp_previo: username,
      },
      origenEscritura,
    });
    await syncLegacyRequerimiento(tx, {
      requerimientoId: c.id,
      etapaCodigo: 'REGISTRO_ORDEN',
      estadoNegocio: 'En Registro de Órdenes',
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: 'Registro de Órdenes',
      subModuloLabel: 'Registro de Órdenes',
    });
  });
  console.log(`  ✓ aplicado ${c.codigo} → usuario ${uid} (${username})`);
}

if (!apply) {
  console.log('\nDry-run. Para aplicar: node scripts/reconcile-obs45-responsable-registro-orden.mjs --apply');
}
process.exit(0);
