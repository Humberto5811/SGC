// Lógica de negocio — Coordinación CM (Contrataciones; código interno ACTOS_PREPARATORIOS)
import { query } from '../db.js';
import {
  registrarMovimiento,
  ETAPAS,
  enrichRequerimientoRow,
  enrichRequerimientoRowsWithCcp,
  TRAZA_EXTRA_SELECT,
  buildListFilters,
} from './trazabilidad.js';
import {
  formatObservacionTraza,
  resolveEstadoFromDestino,
  resolveResponsableFromDestino,
  submoduloLabelToEtapa,
} from './observacionDestino.js';
import { appendObservacion } from './observacionesExpediente.js';
import { autoCerrarObservacionesEmisorAlContinuar } from './observacionesWorkflow.js';
import { emitirObservacion, procesarAccionObservacion } from './observacionesWorkflow.js';
import { normalizePermisos } from './permissionsCatalog.js';
import {
  REQUERIMIENTO_BANDEJA_FROM,
  REQUERIMIENTO_BANDEJA_EXTRA_SELECT,
} from './bandejaRequerimientoSql.js';

export const COORDINADOR_ACTOS = 'Coordinador de Contratos Menores';
export const SUBMODULO_COORDINACION_CM = 'Coordinación CM';
export const CARGO_ANALISTA_ACTOS = 'Analista de Contratos Menores';

const PERMISOS_JSON = `COALESCE(u.permisos, '{}'::jsonb)`;

const ESTADOS_EN_ACTOS = "('Programado', 'Aprobado Programación', 'En Invitaciones')";

/** Normaliza expedientes aprobados en Programación que aún no tienen etapa Actos en BD. */
export async function syncExpedientesActosPendientes() {
  await query(`
    UPDATE requerimientos SET
      estado = CASE WHEN estado = 'Aprobado Programación' THEN 'Programado' ELSE estado END,
      estado_actual = 'ACTOS_PREPARATORIOS',
      sub_modulo_actual = '${SUBMODULO_COORDINACION_CM}',
      responsable_actual = CASE
        WHEN responsable_actual IS NULL OR TRIM(responsable_actual) = '' OR responsable_actual ILIKE '%Programador%'
        THEN $1
        ELSE responsable_actual
      END,
      fecha_estado_actual = COALESCE(fecha_estado_actual, NOW()),
      updated_at = NOW()
    WHERE estado IN ${ESTADOS_EN_ACTOS}
      AND (estado_actual IS NULL OR estado_actual NOT IN ('ACTOS_PREPARATORIOS', 'INVITACIONES'))
  `, [COORDINADOR_ACTOS]);
}

function expedienteEnActos(row) {
  if (!row) return false;
  const etapa = String(row.estado_actual || '').toUpperCase();
  if (etapa === 'ACTOS_PREPARATORIOS') return true;
  const estado = String(row.estado || '').trim();
  return estado === 'Programado' || /^Aprobado Programaci/i.test(estado);
}

export async function listUsuariosPerfilActos(perfil, submoduloCode = '') {
  let extra = '';
  const params = [];
  if (perfil === 'analista') {
    // Usuarios con permiso en Actos Preparatorios o cargo de analista; excluye coordinadores y admin.
    extra = ` AND (
      ${PERMISOS_JSON} -> 'submodulos' ? 'ACTOS_PREPARATORIOS'
      OR u.cargo ILIKE $1
      OR u.cargo ILIKE '%Analista%Contratos%'
      OR u.cargo ILIKE '%Analista de Contratos%'
    )
    AND NOT (COALESCE(u.cargo, '') ILIKE '%Coordinador%Contratos%')
    AND u.rol <> 'admin'`;
    params.push(`%${CARGO_ANALISTA_ACTOS}%`);
  } else if (perfil === 'coordinador') {
    extra = ` AND (
      u.cargo ILIKE $1
      OR u.rol = 'admin'
    )`;
    params.push(`%Coordinador%Contratos%Menores%`);
  } else if (perfil === 'invitaciones') {
    extra = ` AND (
      ${PERMISOS_JSON} -> 'submodulos' ? 'INVITACIONES'
      OR u.cargo ILIKE '%Invitacion%'
    )`;
  } else if (submoduloCode) {
    extra = ` AND ${PERMISOS_JSON} -> 'submodulos' ? $1`;
    params.push(String(submoduloCode).toUpperCase());
  }
  const { rows } = await query(`
    SELECT u.id, u.dni, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.activo
    FROM usuarios u
    WHERE u.activo = TRUE ${extra}
    ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST
    LIMIT 100
  `, params);
  return rows.map((u) => ({
    id: u.id,
    nombre: u.nombre || [u.apellidos, u.nombres].filter(Boolean).join(' ').trim(),
    cargo: u.cargo || '',
    rol: u.rol,
  })).filter((u) => u.nombre);
}

const SUBMODULO_LABELS = {
  ACTOS_PREPARATORIOS: SUBMODULO_COORDINACION_CM,
  INVITACIONES: 'Invitaciones',
  CCP: 'CCP',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  EJECUCION: 'Ejecución Contractual',
  PROGRAMACION: 'Programación',
};

function submoduloLabelFromCode(code) {
  return SUBMODULO_LABELS[String(code || '').toUpperCase()] || String(code || '');
}

/** Usuarios activos con permiso real en un submódulo de Contrataciones (permisos normalizados). */
export async function listUsuariosPorSubmodulo(submoduloCode, search = '') {
  const code = String(submoduloCode || 'ACTOS_PREPARATORIOS').toUpperCase();
  const params = ['admin'];
  let where = 'WHERE u.activo = TRUE AND u.rol <> $1';
  if (String(search || '').trim()) {
    params.push(`%${String(search).trim()}%`);
    where += ` AND (
      COALESCE(u.nombre, '') ILIKE $${params.length}
      OR COALESCE(u.apellidos, '') ILIKE $${params.length}
      OR COALESCE(u.nombres, '') ILIKE $${params.length}
      OR COALESCE(u.username, '') ILIKE $${params.length}
      OR COALESCE(u.dni, '') ILIKE $${params.length}
      OR COALESCE(u.cargo, '') ILIKE $${params.length}
    )`;
  }
  where += ` AND NOT (COALESCE(u.cargo, '') ILIKE '%Coordinador%Contratos%')`;
  const { rows } = await query(`
    SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos
    FROM usuarios u
    ${where}
    ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST
    LIMIT 200
  `, params);
  return rows
    .map((u) => {
      const permisosNorm = normalizePermisos(u.permisos, u.rol);
      return {
        id: u.id,
        nombre: u.nombre || [u.apellidos, u.nombres].filter(Boolean).join(' ').trim(),
        cargo: u.cargo || '',
        username: u.username || u.dni || '',
        rol: u.rol,
        permisosNorm,
      };
    })
    .filter((u) => {
      const p = u.permisosNorm;
      if (code === 'EJECUCION') {
        return p.modulos.includes('EJECUCION')
          || p.submodulos.some((s) => ['REGISTRO_ORDEN', 'ALMACEN', 'TESORERIA', 'AMPLIACION'].includes(s));
      }
      return p.modulos.includes('CONTRATACIONES') && p.submodulos.includes(code);
    })
    .map(({ permisosNorm, ...rest }) => rest);
}

const BASE_FROM = REQUERIMIENTO_BANDEJA_FROM;

const ETAPAS_BANDEJA_CM = `(
  'ACTOS_PREPARATORIOS', 'INVITACIONES', 'RECEPCION_COTIZACIONES',
  'CUADRO_COMPARATIVO', 'CCP', 'EJECUCION', 'FINALIZADO', 'OBSERVADO'
)`;

export async function listarBandejaActos(page, pageSize, queryParams = {}, options = {}) {
  await syncExpedientesActosPendientes();
  const offset = (page - 1) * pageSize;
  const { whereExtra, params: filterParams } = buildListFilters(queryParams);
  const params = [...filterParams];
  // Tablero de supervisión CM: no ocultar expedientes por cambio de responsable o etapa posterior.
  let where = `WHERE (
    r.estado_actual IN ${ETAPAS_BANDEJA_CM}
    OR r.estado IN ${ESTADOS_EN_ACTOS}
    OR r.estado ILIKE 'Sol.Cot. Enviada%'
    OR (
      COALESCE(r.payload, '{}')::jsonb -> 'historial_actos' IS NOT NULL
      AND jsonb_typeof(COALESCE(r.payload, '{}')::jsonb -> 'historial_actos') = 'array'
      AND jsonb_array_length(COALESCE(r.payload, '{}')::jsonb -> 'historial_actos') > 0
    )
  )`;
  if (whereExtra) where += ` AND ${whereExtra}`;

  if (options.soloAsignadosA) {
    params.push(`%${options.soloAsignadosA}%`);
    where += ` AND r.responsable_actual ILIKE $${params.length}`;
    where += ` AND r.responsable_actual NOT ILIKE '%Coordinador%Contratos%'`;
  }

  if (options.soloMiEquipo) {
    where += ` AND COALESCE(r.responsable_actual, '') <> ''`;
    where += ` AND r.responsable_actual NOT ILIKE '%Coordinador%Contratos%'`;
  }

  const countRes = await query(`SELECT COUNT(*)::int AS total ${BASE_FROM} ${where}`, params);
  const total = countRes.rows[0].total;

  params.push(pageSize, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await query(`
    SELECT
      r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado,
      r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
      COALESCE(c.nombre, c.codigo, a.responsable, '') AS centro_nombre,
      ${REQUERIMIENTO_BANDEJA_EXTRA_SELECT},
      ${TRAZA_EXTRA_SELECT}
    ${BASE_FROM}
    ${where}
    ORDER BY r.created_at DESC NULLS LAST, r.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return {
    data: await enrichRequerimientoRowsWithCcp(rows),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function loadReqPayload(requerimientoId) {
  const reqCheck = await query('SELECT id, payload, estado, estado_actual, responsable_actual FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!reqCheck.rowCount) return null;
  let payload = {};
  try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
  return { row: reqCheck.rows[0], payload };
}

function pushObservacion(payload, entry) {
  emitirObservacion(payload, entry);
}

function resolveEstadoMovimientoObservacion(destinoSubmodulo, destinoEtapa) {
  if (!destinoSubmodulo && !destinoEtapa) return `Observado — ${SUBMODULO_COORDINACION_CM}`;
  return resolveEstadoFromDestino(destinoSubmodulo, destinoEtapa);
}

export async function asignarAnalistaActos(requerimientoId, { analista, usuario, submodulo_code, submodulo_label }) {
  await syncExpedientesActosPendientes();
  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');
  if (!expedienteEnActos(loaded.row)) throw new Error(`El expediente no está en ${SUBMODULO_COORDINACION_CM}`);

  const code = String(submodulo_code || 'ACTOS_PREPARATORIOS').toUpperCase();
  const subLabel = submodulo_label || submoduloLabelFromCode(code);
  const origenEtapa = String(loaded.row.estado_actual || 'ACTOS_PREPARATORIOS').toUpperCase();

  if (origenEtapa !== 'ACTOS_PREPARATORIOS') {
    await query(`
      UPDATE requerimientos SET
        estado = CASE WHEN estado = 'Aprobado Programación' THEN 'Programado' ELSE estado END,
        estado_actual = 'ACTOS_PREPARATORIOS',
        sub_modulo_actual = '${SUBMODULO_COORDINACION_CM}',
        updated_at = NOW()
      WHERE id = $1
    `, [requerimientoId]);
    loaded.row.estado_actual = 'ACTOS_PREPARATORIOS';
    if (loaded.row.estado === 'Aprobado Programación') loaded.row.estado = 'Programado';
  }

  if (!Array.isArray(loaded.payload.historial_actos)) loaded.payload.historial_actos = [];
  loaded.payload.historial_actos.push({
    tipo: 'ASIGNACION',
    moduloOrigen: 'COORDINACION_CM',
    usuarioOrigen: usuario || COORDINADOR_ACTOS,
    moduloDestino: code,
    usuarioDestino: analista,
    submodulo: subLabel,
    analista,
    usuario: usuario || '',
    fecha: new Date().toISOString(),
  });
  await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);

  const estadoNuevo = code === 'ACTOS_PREPARATORIOS'
    ? (loaded.row.estado || 'Programado')
    : resolveEstadoFromDestino(subLabel, code);

  return registrarMovimiento({
    requerimientoId,
    estadoNuevo,
    usuario: usuario || COORDINADOR_ACTOS,
    accion: 'asignacion',
    observacion: `Asignado a ${analista} — ${subLabel}`,
    responsable: analista,
    etapaEjecutor: 'ACTOS_PREPARATORIOS',
  });
}

export async function reasignarActos(requerimientoId, body) {
  return asignarAnalistaActos(requerimientoId, { ...body, usuario: body.usuario || COORDINADOR_ACTOS });
}

export async function observarActos(requerimientoId, body) {
  const {
    motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo,
    accion, observacion_id, observacion_padre_id, observacionPadreId,
  } = body || {};

  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');

  const accionObs = procesarAccionObservacion(loaded.payload, {
    accion, observacion_id, origen_submodulo: origen_submodulo || SUBMODULO_COORDINACION_CM, usuario,
  });
  if (accionObs) {
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);
    return enrichRequerimientoRow((await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId])).rows[0]);
  }

  if (!motivo) throw new Error('Motivo requerido');

  pushObservacion(loaded.payload, {
    motivo,
    gerente: usuario || COORDINADOR_ACTOS,
    origen: 'ACTOS PREPARATORIOS',
    origen_submodulo: origen_submodulo || SUBMODULO_COORDINACION_CM,
    destino_submodulo: destino_submodulo || '',
    destino_etapa: destino_etapa || '',
    destino_persona: destino_persona || '',
    observacion_padre_id: observacion_padre_id || observacionPadreId || null,
  });
  await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);

  const etapaDestObs = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'REGISTRADO').toUpperCase();
  const estadoNuevo = resolveEstadoMovimientoObservacion(destino_submodulo, destino_etapa);
  const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDestObs);

  return registrarMovimiento({
    requerimientoId,
    estadoNuevo,
    usuario: usuario || COORDINADOR_ACTOS,
    accion: 'observado',
    observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
    responsable,
    etapaEjecutor: 'ACTOS_PREPARATORIOS',
    etapaDestinoEvento: etapaDestObs,
  }, { soloHistorial: true });
}

export async function derivarActos(requerimientoId, body) {
  const { motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo } = body || {};
  if (!destino_submodulo && !destino_etapa) throw new Error('Destino requerido');

  await syncExpedientesActosPendientes();
  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');

  if (motivo) {
    pushObservacion(loaded.payload, {
      motivo,
      gerente: usuario || COORDINADOR_ACTOS,
      origen: 'ACTOS PREPARATORIOS',
      origen_submodulo: origen_submodulo || SUBMODULO_COORDINACION_CM,
      destino_submodulo: destino_submodulo || '',
      destino_etapa: destino_etapa || '',
      destino_persona: destino_persona || '',
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(loaded.payload)]);
  }

  const etapaDest = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'ACTOS_PREPARATORIOS').toUpperCase();
  const estadoNuevo = resolveEstadoFromDestino(destino_submodulo, etapaDest);
  const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDest);

  if (etapaDest === 'INVITACIONES') {
    const { transicionarExpediente } = await import('./expedienteTransicion.js');
    const uid = /^\d+$/.test(String(destino_persona || '').trim()) ? Number(destino_persona) : null;
    const result = await transicionarExpediente({
      requerimientoId,
      evento: 'COORDINACION_CM_APROBADA',
      usuarioDestinoId: uid,
      unidadDestino: uid ? null : (responsable || null),
      motivo: motivo
        ? formatObservacionTraza(motivo, { destino_persona, destino_submodulo })
        : `Derivado a ${destino_submodulo || etapaDest}`,
      metadata: { client_request_id: `actos-derivar:${requerimientoId}`, via: 'derivarActos' },
      actorRol: usuario || COORDINADOR_ACTOS,
    });
    return result.expediente;
  }

  return registrarMovimiento({
    requerimientoId,
    estadoNuevo,
    usuario: usuario || COORDINADOR_ACTOS,
    accion: 'derivado',
    observacion: motivo ? formatObservacionTraza(motivo, { destino_persona, destino_submodulo }) : `Derivado a ${destino_submodulo || etapaDest}`,
    responsable,
    etapaEjecutor: 'ACTOS_PREPARATORIOS',
    etapaDestino: etapaDest,
  });
}

export async function aprobarActosInvitaciones(requerimientoId, { responsableDestino, usuario }) {
  await syncExpedientesActosPendientes();
  const loaded = await loadReqPayload(requerimientoId);
  if (!loaded) throw new Error('Requerimiento no encontrado');
  if (!expedienteEnActos(loaded.row) && String(loaded.row.estado_actual || '').toUpperCase() !== 'ACTOS_PREPARATORIOS') {
    throw new Error(`El expediente no está en ${SUBMODULO_COORDINACION_CM}`);
  }

  if (!Array.isArray(loaded.payload.historial_actos)) loaded.payload.historial_actos = [];
  loaded.payload.historial_actos.push({
    tipo: 'aprobacion_invitaciones',
    usuario: usuario || '',
    responsable_destino: responsableDestino,
    fecha: new Date().toISOString(),
  });
  if (!Array.isArray(loaded.payload.historial_invitaciones)) loaded.payload.historial_invitaciones = [];
  loaded.payload.historial_invitaciones.push({
    tipo: 'ingreso_invitaciones',
    usuario: usuario || '',
    fecha: new Date().toISOString(),
  });
  autoCerrarObservacionesEmisorAlContinuar(loaded.payload, SUBMODULO_COORDINACION_CM, usuario || CARGO_ANALISTA_ACTOS);

  const { transicionarExpediente } = await import('./expedienteTransicion.js');
  const uid = /^\d+$/.test(String(responsableDestino || '').trim())
    ? Number(responsableDestino)
    : null;
  const result = await transicionarExpediente({
    requerimientoId,
    evento: 'COORDINACION_CM_APROBADA',
    usuarioDestinoId: uid,
    unidadDestino: uid ? null : (responsableDestino || ETAPAS.INVITACIONES.responsable || null),
    motivo: `Aprobado en ${SUBMODULO_COORDINACION_CM} — derivado a Invitaciones`,
    metadata: {
      client_request_id: `actos-aprobar:${requerimientoId}`,
      via: 'aprobarActosInvitaciones',
    },
    actorRol: usuario || CARGO_ANALISTA_ACTOS,
    domainMutator: async (tx) => {
      await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
        requerimientoId,
        JSON.stringify(loaded.payload),
      ]);
      return { payload_actos: true };
    },
  });
  return result.expediente;
}
