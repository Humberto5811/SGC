/**
 * RC8.6C — Resolvedor de asignación real existente (solo evidencia demostrable).
 *
 * Fuentes prohibidas (no se leen ni se usan para persona vigente):
 * creador del requerimiento, modificador, último editor, centro,
 * submódulo, rol genérico, administrador ni workflowSnapshot.
 */
import { isRolGenerico } from '../../shared/identificadoresUsuarios.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';

export const ORIGEN_RECONCILIACION = 'RECONCILIACION_ASIGNACION_REAL';

const ETAPAS_INVITACIONES = new Set([
  'INVITACIONES',
  'CONSULTAS_OBSERVACIONES',
  'CONSULTAS',
  'RECEPCION_COTIZACIONES',
]);

const ETAPAS_VALIDACIONES = new Set([
  'VALIDACIONES',
  'VALIDACION_USUARIO',
  'VALIDACION',
]);

const ETAPAS_CM = new Set([
  'COORDINACION_CM',
  'ACTOS_PREPARATORIOS',
]);

const ETAPAS_ORDEN = new Set([
  'REGISTRO_ORDEN',
  'REGISTRO_ORDENES',
  'ORDEN',
]);

const ETAPAS_RECEPCION = new Set([
  'RECEPCION_BIENES',
  'PRESENTACION_ENTREGABLES',
  'CONFORMIDAD',
  'ALMACEN',
]);

function runner(client) {
  if (client?.query) return (text, params) => client.query(text, params);
  return async (text, params) => {
    const { query } = await import('../db.js');
    return query(text, params);
  };
}

function normKey(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function safeJson(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  } catch (_) {
    return {};
  }
}

function packUsuario(u, { unidad = null, fuente, evidenciaId = null } = {}) {
  if (!u?.id) return null;
  const username = String(u.username || '').trim();
  const nombre = String(u.nombre || `${u.apellidos || ''} ${u.nombres || ''}`.trim() || username).trim();
  if (!username && !nombre) return null;
  if (isRolGenerico(username) || isRolGenerico(nombre)) return null;
  return {
    usuarioId: Number(u.id),
    username,
    nombre,
    unidad: unidad || null,
    fuente,
    evidenciaId: evidenciaId != null ? evidenciaId : null,
  };
}

function packUnidad(unidad, fuente, evidenciaId = null) {
  const u = String(unidad || '').trim();
  if (!u || isRolGenerico(u)) return null;
  return {
    usuarioId: null,
    username: '',
    nombre: '',
    unidad: u,
    fuente,
    evidenciaId,
  };
}

/**
 * Resuelve un texto (username / nombre completo) a un único usuario activo.
 * Ambiguo o genérico → null.
 */
export async function resolveUsuarioDesdeIdentificador(client, raw) {
  const valor = String(raw || '').trim();
  if (!valor || isRolGenerico(valor)) return null;
  const run = runner(client);

  if (/^\d+$/.test(valor)) {
    const { rows } = await run(
      `SELECT id, username, nombre, nombres, apellidos
       FROM usuarios WHERE id = $1 AND activo = TRUE LIMIT 1`,
      [Number(valor)],
    );
    return rows[0] || null;
  }

  const { rows } = await run(
    `SELECT id, username, nombre, nombres, apellidos
     FROM usuarios
     WHERE activo = TRUE
       AND (
         LOWER(TRIM(username)) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(nombre, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(apellidos, '') || ' ' || COALESCE(nombres, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(nombres, '') || ' ' || COALESCE(apellidos, ''))) = LOWER(TRIM($1))
       )
     LIMIT 3`,
    [valor],
  );
  if (rows.length !== 1) return null;
  return rows[0];
}

async function loadSolicitudVigente(client, requerimientoId) {
  const run = runner(client);
  const { rows } = await run(
    `SELECT sc.id, sc.codigo, sc.estado, sc.responsable
     FROM solicitud_requerimientos sr
     JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
     WHERE sr.requerimiento_id = $1
     ORDER BY sc.id DESC
     LIMIT 1`,
    [requerimientoId],
  );
  return rows[0] || null;
}

async function loadAsignacionActivaEtapa(client, requerimientoId, etapasPermitidas) {
  const run = runner(client);
  const { rows } = await run(
    `SELECT id, etapa_codigo, usuario_id, unidad_codigo, tipo_responsable, origen_asignacion
     FROM expediente_asignaciones
     WHERE requerimiento_id = $1
       AND activo = TRUE
       AND tipo_responsable = 'PERSONA'
       AND usuario_id IS NOT NULL
     ORDER BY asignado_at DESC
     LIMIT 5`,
    [requerimientoId],
  );
  const hit = rows.find((a) => etapasPermitidas.has(String(a.etapa_codigo || '').toUpperCase()));
  if (!hit) return null;
  const u = await resolveUsuarioDesdeIdentificador(client, String(hit.usuario_id));
  if (!u) return null;
  return packUsuario(u, {
    unidad: hit.unidad_codigo || null,
    fuente: 'expediente_asignaciones.activa',
    evidenciaId: hit.id,
  });
}

async function resolveFamiliaInvitaciones(client, requerimientoId) {
  const sc = await loadSolicitudVigente(client, requerimientoId);
  if (sc) {
    // 1–2. Responsable contractual persistido en la solicitud (persona real).
    // No se usa el campo de creación de la solicitud como responsable vigente.
    const respTxt = String(sc.responsable || '').trim();
    if (respTxt && !isRolGenerico(respTxt)) {
      const u = await resolveUsuarioDesdeIdentificador(client, respTxt);
      if (u) {
        return packUsuario(u, {
          unidad: 'Invitaciones',
          fuente: 'solicitud.responsable',
          evidenciaId: sc.id,
        });
      }
    }
  }

  // 3. Asignación activa previa válida para la familia.
  const previa = await loadAsignacionActivaEtapa(client, requerimientoId, ETAPAS_INVITACIONES);
  if (previa) return previa;

  return null;
}

async function resolveValidaciones(client, requerimientoId) {
  const run = runner(client);

  // 1–2. Derivación AU / validador en validacion_informe o validacion_responsable
  // No confundir derivacion_ccp (locación→CCP) ni nombres de tramitador CCP
  // con evidencia real de Área Usuaria.
  const ESTADOS_AU = new Set([
    'DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO', 'PENDIENTE',
  ]);
  const { rows: cots } = await run(
    `SELECT cot.id, cot.validacion_responsable, cot.validacion_informe, cot.validacion_estado
     FROM cotizaciones_proveedor cot
     JOIN solicitud_requerimientos sr ON sr.solicitud_id = cot.solicitud_id
     WHERE sr.requerimiento_id = $1
     ORDER BY cot.id DESC
     LIMIT 20`,
    [requerimientoId],
  );

  for (const cot of cots) {
    const inf = safeJson(cot.validacion_informe);
    const der = inf?.derivacion || {};
    const tieneDerivacionAu = !!(
      der
      && typeof der === 'object'
      && (
        der.responsable_id != null
        || der.usuario_id != null
        || der.responsable_destino_id != null
        || String(der.responsable_nombre || der.responsable_destino_nombre || '').trim()
      )
    );
    const estadoVal = String(cot.validacion_estado || '').trim().toUpperCase();
    const hayActividadAu = ESTADOS_AU.has(estadoVal) || tieneDerivacionAu;

    const uid = der.responsable_id ?? der.usuario_id ?? der.responsable_destino_id;
    if (uid != null && Number.isFinite(Number(uid))) {
      const u = await resolveUsuarioDesdeIdentificador(client, String(uid));
      if (u) {
        return packUsuario(u, {
          unidad: 'Validaciones',
          fuente: 'cotizacion.validacion_informe.derivacion',
          evidenciaId: cot.id,
        });
      }
    }
    const nombreDer = String(der.responsable_nombre || der.responsable_destino_nombre || '').trim();
    if (nombreDer && !isRolGenerico(nombreDer)) {
      const u = await resolveUsuarioDesdeIdentificador(client, nombreDer);
      if (u) {
        return packUsuario(u, {
          unidad: 'Validaciones',
          fuente: 'cotizacion.validacion_informe.derivacion',
          evidenciaId: cot.id,
        });
      }
    }
    // validacion_responsable solo si hubo actividad AU real (no derivación CCP).
    if (hayActividadAu) {
      const vr = String(cot.validacion_responsable || '').trim();
      if (vr && !isRolGenerico(vr)) {
        const u = await resolveUsuarioDesdeIdentificador(client, vr);
        if (u) {
          return packUsuario(u, {
            unidad: 'Validaciones',
            fuente: 'cotizacion.validacion_responsable',
            evidenciaId: cot.id,
          });
        }
      }
    }
  }

  const previa = await loadAsignacionActivaEtapa(client, requerimientoId, ETAPAS_VALIDACIONES);
  if (previa) return previa;
  return null;
}

async function resolveCoordinacionCm(client, requerimientoId) {
  const run = runner(client);
  const { rows } = await run(
    `SELECT id, payload FROM requerimientos WHERE id = $1 LIMIT 1`,
    [requerimientoId],
  );
  const payload = safeJson(rows[0]?.payload);
  const hist = Array.isArray(payload.historial_actos) ? payload.historial_actos : [];
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const h = hist[i];
    if (h?.tipo === 'asignacion' && h.analista && !isRolGenerico(h.analista)) {
      const u = await resolveUsuarioDesdeIdentificador(client, h.analista);
      if (u) {
        return packUsuario(u, {
          unidad: 'Coordinación CM',
          fuente: 'historial_actos.asignacion',
          evidenciaId: rows[0]?.id ?? null,
        });
      }
    }
    if (h?.tipo === 'asignacion' && h.coordinador && !isRolGenerico(h.coordinador)) {
      const u = await resolveUsuarioDesdeIdentificador(client, h.coordinador);
      if (u) {
        return packUsuario(u, {
          unidad: 'Coordinación CM',
          fuente: 'historial_actos.asignacion_coordinador',
          evidenciaId: rows[0]?.id ?? null,
        });
      }
    }
  }

  const previa = await loadAsignacionActivaEtapa(client, requerimientoId, ETAPAS_CM);
  if (previa) return previa;

  return packUnidad('Coordinación CM', 'unidad_destino_etapa');
}

async function resolveCcp(client, requerimientoId) {
  const run = runner(client);
  const { rows } = await run(
    `SELECT cc.id, cc.responsable_ccp_id, cc.responsable_ccp_nombre
     FROM cuadros_comparativos cc
     JOIN solicitud_requerimientos sr ON sr.solicitud_id = cc.solicitud_id
     WHERE sr.requerimiento_id = $1
       AND COALESCE(cc.estado, '') <> 'ANULADO'
     ORDER BY cc.id DESC
     LIMIT 5`,
    [requerimientoId],
  );

  for (const cc of rows) {
    if (cc.responsable_ccp_id != null) {
      const u = await resolveUsuarioDesdeIdentificador(client, String(cc.responsable_ccp_id));
      if (u) {
        return packUsuario(u, {
          unidad: 'CCP',
          fuente: 'cuadro.responsable_ccp_id',
          evidenciaId: cc.id,
        });
      }
    }
    const nom = String(cc.responsable_ccp_nombre || '').trim();
    if (nom && !isRolGenerico(nom)) {
      const u = await resolveUsuarioDesdeIdentificador(client, nom);
      if (u) {
        return packUsuario(u, {
          unidad: 'CCP',
          fuente: 'cuadro.responsable_ccp_nombre',
          evidenciaId: cc.id,
        });
      }
    }
  }

  return packUnidad('CCP', 'unidad_destino_etapa');
}

async function resolveRegistroOrdenes(client, requerimientoId) {
  // Sin columna de usuario asignado explícito en órdenes: no inferir desde creado_por.
  const previa = await loadAsignacionActivaEtapa(client, requerimientoId, ETAPAS_ORDEN);
  if (previa) return previa;
  return packUnidad('Registro de Órdenes', 'unidad_destino_etapa');
}

async function resolveRecepcionConformidad(client, requerimientoId) {
  const run = runner(client);
  const { rows } = await run(
    `SELECT id, usuario_asignado, actor_responsable, actor_responsable_id
     FROM recepcion_bienes_expedientes
     WHERE requerimiento_id = $1
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 5`,
    [requerimientoId],
  );

  for (const r of rows) {
    if (r.actor_responsable_id != null) {
      const u = await resolveUsuarioDesdeIdentificador(client, String(r.actor_responsable_id));
      if (u) {
        return packUsuario(u, {
          unidad: 'Almacén',
          fuente: 'recepcion.actor_responsable_id',
          evidenciaId: r.id,
        });
      }
    }
    for (const cand of [r.usuario_asignado, r.actor_responsable]) {
      const txt = String(cand || '').trim();
      if (!txt || isRolGenerico(txt)) continue;
      const u = await resolveUsuarioDesdeIdentificador(client, txt);
      if (u) {
        return packUsuario(u, {
          unidad: 'Almacén',
          fuente: 'recepcion.usuario_asignado',
          evidenciaId: r.id,
        });
      }
    }
  }

  return packUnidad('Almacén', 'unidad_destino_etapa');
}

/**
 * Única función server-side de evidencia real por etapa.
 * @returns {Promise<{usuarioId,username,nombre,unidad,fuente,evidenciaId}|null>}
 */
export async function resolveAsignacionRealExistente({
  requerimientoId,
  etapaCodigo = '',
  estadoCodigo = '',
  client = null,
} = {}) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  let etapa = String(etapaCodigo || '').trim().toUpperCase();
  if (!etapa && estadoCodigo) {
    etapa = String(getEtapaMeta(String(estadoCodigo).toUpperCase())?.codigo || estadoCodigo).toUpperCase();
  }
  if (etapa === 'VALIDACION_USUARIO' || etapa === 'VALIDACION') etapa = 'VALIDACIONES';
  if (etapa === 'ACTOS_PREPARATORIOS') etapa = 'COORDINACION_CM';
  if (etapa === 'ORDEN' || etapa === 'REGISTRO_ORDENES') etapa = 'REGISTRO_ORDEN';

  if (ETAPAS_INVITACIONES.has(etapa) || etapa === 'CONSULTAS_OBSERVACIONES') {
    return resolveFamiliaInvitaciones(client, rid);
  }
  if (ETAPAS_VALIDACIONES.has(etapa)) {
    return resolveValidaciones(client, rid);
  }
  if (ETAPAS_CM.has(etapa) || etapa === 'COORDINACION_CM') {
    return resolveCoordinacionCm(client, rid);
  }
  if (etapa === 'CCP') {
    return resolveCcp(client, rid);
  }
  if (ETAPAS_ORDEN.has(etapa) || etapa === 'REGISTRO_ORDEN') {
    return resolveRegistroOrdenes(client, rid);
  }
  if (ETAPAS_RECEPCION.has(etapa)) {
    return resolveRecepcionConformidad(client, rid);
  }

  // Otras etapas: solo asignación activa PERSONA ya persistida.
  const previa = await loadAsignacionActivaEtapa(client, rid, new Set([etapa]));
  return previa || null;
}

export function esAsignacionPersonaValida(asig) {
  return !!(
    asig
    && String(asig.tipo_responsable || '').toUpperCase() === 'PERSONA'
    && asig.usuario_id != null
    && Number(asig.usuario_id) > 0
  );
}

export function esEstadoPendienteSinPersona(estado) {
  if (!estado) return true;
  const tipo = String(estado.responsable_tipo || '').toUpperCase();
  if (tipo === 'PERSONA' && estado.responsable_usuario_id) return false;
  return tipo === 'PENDIENTE' || estado.responsable_usuario_id == null;
}

export { normKey };

export default {
  resolveAsignacionRealExistente,
  resolveUsuarioDesdeIdentificador,
  ORIGEN_RECONCILIACION,
  esAsignacionPersonaValida,
  esEstadoPendienteSinPersona,
};
