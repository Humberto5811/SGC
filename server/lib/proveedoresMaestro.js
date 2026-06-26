// Maestro institucional de proveedores — CRUD, importación y sincronización portal
import { query } from '../db.js';

export const RUBROS_PROVEEDOR = [
  'Medicamentos',
  'Reactivos',
  'Dispositivos Médicos',
  'Equipos',
  'Laboratorio',
  'Servicios',
  'Consultoría',
  'Locadores',
  'Software',
  'Mobiliario',
  'Otros',
];

export const ESTADOS_PROVEEDOR = ['Activo', 'Inactivo', 'Bloqueado'];

export const ORIGENES_REGISTRO = ['Portal Proveedor', 'Registro Manual', 'Importación Excel'];

const RUC_PREFIJOS = ['10', '15', '17', '20'];

export function validarRuc(ruc) {
  const s = String(ruc || '').replace(/\D/g, '');
  if (s.length !== 11) return false;
  if (!RUC_PREFIJOS.some((p) => s.startsWith(p))) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += parseInt(s[i], 10) * weights[i];
  let mod = 11 - (sum % 11);
  if (mod === 10) mod = 0;
  if (mod === 11) mod = 1;
  return mod === parseInt(s[10], 10);
}

export function validarCorreo(email) {
  const e = String(email || '').trim();
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function normalizarRuc(ruc) {
  return String(ruc || '').replace(/\D/g, '').slice(0, 11);
}

function parseEmails(data = {}) {
  if (Array.isArray(data.emails) && data.emails.length) return data.emails.map(String).filter(Boolean);
  const correo = String(data.correo || '').trim();
  if (correo) return correo.split(';').map((e) => e.trim()).filter(Boolean);
  return [];
}

function pushHistorial(existing, entry) {
  const list = Array.isArray(existing) ? [...existing] : [];
  const now = new Date();
  list.unshift({
    ...entry,
    fecha: now.toISOString().slice(0, 10),
    hora: now.toTimeString().slice(0, 8),
  });
  return list.slice(0, 200);
}

export function mapProveedorRow(row) {
  if (!row) return null;
  const emails = Array.isArray(row.emails) ? row.emails : [];
  const correo = row.correo || emails[0] || '';
  return {
    id: row.id,
    ruc: row.ruc,
    razon_social: row.razon_social || '',
    direccion: row.direccion || '',
    telefono: row.telefono || '',
    correo,
    emails,
    persona_contacto: row.persona_contacto || '',
    rubro: row.rubro || '',
    estado: row.estado || (row.activo === false ? 'Inactivo' : 'Activo'),
    origen_registro: row.origen_registro || 'Registro Manual',
    fecha_creacion: row.created_at,
    fecha_actualizacion: row.updated_at,
    ultima_participacion: row.ultima_participacion || null,
    cantidad_invitaciones: row.cantidad_invitaciones ?? 0,
    nombre_comercial: row.nombre_comercial || '',
    ultima_invitacion: row.ultima_invitacion || null,
    ultima_cotizacion: row.ultima_cotizacion || null,
    invitado_anteriormente: row.invitado_anteriormente === true || (row.total_invitaciones_previas ?? 0) > 0,
    total_invitaciones_previas: row.total_invitaciones_previas ?? row.cantidad_invitaciones ?? 0,
    ultima_convocatoria: row.ultima_convocatoria || '',
    presento_cotizacion: row.presento_cotizacion === true,
    ultimo_estado_invitacion: row.ultimo_estado_invitacion || '',
    cantidad_cotizaciones: row.cantidad_cotizaciones ?? 0,
    activo: row.activo !== false && String(row.estado || 'Activo') !== 'Inactivo',
    historial: row.historial || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validarDatosMinimos(data = {}) {
  const ruc = normalizarRuc(data.ruc);
  const razon = String(data.razon_social || '').trim();
  const emails = parseEmails(data);
  if (!ruc) throw new Error('RUC es obligatorio');
  if (!validarRuc(ruc)) throw new Error('RUC inválido — verifique el formato (11 dígitos)');
  if (!razon) throw new Error('Razón Social es obligatoria');
  if (!emails.length || !validarCorreo(emails[0])) throw new Error('Correo electrónico inválido');
  return { ruc, razon_social: razon, emails, correo: emails[0] };
}

export async function listarProveedoresMaestro(opts = {}) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(opts.pageSize, 10) || 50));
  const params = [];
  const conds = ['p.deleted_at IS NULL'];

  const addFilter = (field, value, op = 'ILIKE') => {
    const v = String(value || '').trim();
    if (!v) return;
    params.push(op === 'ILIKE' ? `%${v}%` : v);
    conds.push(`${field} ${op} $${params.length}`);
  };

  addFilter('p.ruc', opts.ruc);
  addFilter('p.razon_social', opts.razon_social);
  addFilter('p.correo', opts.correo);
  addFilter('p.telefono', opts.telefono);
  addFilter('p.rubro', opts.rubro, '=');
  if (opts.estado) addFilter('p.estado', opts.estado, '=');
  else if (!opts.include_inactivos) conds.push(`p.estado = 'Activo'`);

  const q = String(opts.search || opts.q || '').trim();
  if (q) {
    params.push(`%${q}%`);
    const n = params.length;
    conds.push(`(
      p.ruc ILIKE $${n} OR p.razon_social ILIKE $${n} OR COALESCE(p.nombre_comercial,'') ILIKE $${n}
      OR p.persona_contacto ILIKE $${n} OR p.correo ILIKE $${n} OR p.telefono ILIKE $${n}
    )`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const sortMap = {
    ruc: 'p.ruc',
    razon_social: 'p.razon_social',
    correo: 'p.correo',
    telefono: 'p.telefono',
    rubro: 'p.rubro',
    estado: 'p.estado',
    ultima_participacion: 'p.ultima_participacion',
  };
  const sortCol = sortMap[String(opts.sort || '').toLowerCase()] || 'p.razon_social';
  const sortDir = String(opts.sortDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM proveedores p ${where}`, params);
  const total = countRows[0]?.total || 0;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);

  const { rows } = await query(`
    SELECT p.*,
      COALESCE(p.cantidad_invitaciones, 0)::int AS total_invitaciones_previas,
      (COALESCE(p.cantidad_invitaciones, 0) > 0 OR EXISTS (
        SELECT 1 FROM invitacion_proveedores ip WHERE ip.proveedor_id = p.id
      )) AS invitado_anteriormente,
      hist.ultima_convocatoria,
      hist.ultimo_estado_invitacion,
      hist.ultima_fecha_invitacion AS ultima_invitacion,
      (EXISTS (
        SELECT 1 FROM cotizaciones_proveedor cp
        WHERE cp.proveedor_id = p.id AND cp.estado = 'COTIZACION_PRESENTADA'
      )) AS presento_cotizacion
    FROM proveedores p
    LEFT JOIN LATERAL (
      SELECT sc.codigo AS ultima_convocatoria,
        ip.estado AS ultimo_estado_invitacion,
        ip.fecha_envio AS ultima_fecha_invitacion
      FROM invitacion_proveedores ip
      LEFT JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
      WHERE ip.proveedor_id = p.id AND ip.fecha_envio IS NOT NULL
      ORDER BY ip.fecha_envio DESC NULLS LAST
      LIMIT 1
    ) hist ON TRUE
    ${where}
    ORDER BY ${sortCol} ${sortDir} NULLS LAST, p.id ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  return {
    data: rows.map(mapProveedorRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function buscarProveedoresMaestro(filters = {}, limit = 50) {
  const resp = await listarProveedoresMaestro({
    ...filters,
    page: filters.page || 1,
    pageSize: Math.min(limit, filters.pageSize || 50),
  });
  return resp.data;
}

export async function obtenerProveedorMaestro(id) {
  const { rows } = await query('SELECT * FROM proveedores WHERE id = $1 AND deleted_at IS NULL', [id]);
  return mapProveedorRow(rows[0]);
}

export async function obtenerProveedorPorRuc(ruc) {
  const normalized = normalizarRuc(ruc);
  const { rows } = await query('SELECT * FROM proveedores WHERE ruc = $1 AND deleted_at IS NULL', [normalized]);
  return mapProveedorRow(rows[0]);
}

async function assertRucUnico(ruc, excludeId = null) {
  const params = [ruc];
  let sql = 'SELECT id FROM proveedores WHERE ruc = $1 AND deleted_at IS NULL';
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }
  const { rows } = await query(sql, params);
  if (rows.length) throw new Error('Ya existe un proveedor con ese RUC');
}

export async function crearProveedorMaestro(data = {}, usuario = '', origen = 'Registro Manual') {
  const { ruc, razon_social, emails, correo } = validarDatosMinimos(data);
  await assertRucUnico(ruc);
  const historial = pushHistorial([], {
    usuario: usuario || 'Sistema',
    accion: 'Crear proveedor',
    detalle: `Origen: ${origen}`,
  });
  const estado = ESTADOS_PROVEEDOR.includes(data.estado) ? data.estado : 'Activo';
  const { rows } = await query(`
    INSERT INTO proveedores (
      ruc, razon_social, direccion, telefono, correo, emails, persona_contacto, rubro,
      estado, origen_registro, activo, historial
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
    RETURNING *
  `, [
    ruc,
    razon_social,
    String(data.direccion || '').trim(),
    String(data.telefono || '').trim(),
    correo,
    JSON.stringify(emails),
    String(data.persona_contacto || '').trim(),
    String(data.rubro || '').trim(),
    estado,
    origen,
    estado === 'Activo',
    JSON.stringify(historial),
  ]);
  return mapProveedorRow(rows[0]);
}

export async function actualizarProveedorMaestro(id, data = {}, usuario = '', accion = 'Editar proveedor') {
  const existing = (await query('SELECT * FROM proveedores WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
  if (!existing) throw new Error('Proveedor no encontrado');

  const merged = { ...mapProveedorRow(existing), ...data };
  const { ruc, razon_social, emails, correo } = validarDatosMinimos(merged);
  if (ruc !== existing.ruc) await assertRucUnico(ruc, id);

  const estado = ESTADOS_PROVEEDOR.includes(data.estado) ? data.estado : (existing.estado || 'Activo');
  const historial = pushHistorial(existing.historial, {
    usuario: usuario || 'Sistema',
    accion,
    detalle: `RUC ${ruc}`,
  });

  const { rows } = await query(`
    UPDATE proveedores SET
      ruc = $2,
      razon_social = $3,
      direccion = $4,
      telefono = $5,
      correo = $6,
      emails = $7::jsonb,
      persona_contacto = $8,
      rubro = $9,
      estado = $10,
      activo = $11,
      historial = $12::jsonb,
      updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *
  `, [
    id,
    ruc,
    razon_social,
    String(merged.direccion || '').trim(),
    String(merged.telefono || '').trim(),
    correo,
    JSON.stringify(emails),
    String(merged.persona_contacto || '').trim(),
    String(merged.rubro || '').trim(),
    estado,
    estado === 'Activo',
    JSON.stringify(historial),
  ]);
  return mapProveedorRow(rows[0]);
}

export async function eliminarProveedorLogico(id, usuario = '') {
  const existing = (await query('SELECT * FROM proveedores WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
  if (!existing) throw new Error('Proveedor no encontrado');
  const historial = pushHistorial(existing.historial, {
    usuario: usuario || 'Sistema',
    accion: 'Eliminar proveedor',
    detalle: `Eliminación lógica — RUC ${existing.ruc}`,
  });
  await query(`
    UPDATE proveedores SET
      estado = 'Inactivo',
      activo = FALSE,
      deleted_at = NOW(),
      historial = $2::jsonb,
      updated_at = NOW()
    WHERE id = $1
  `, [id, JSON.stringify(historial)]);
  return { success: true };
}

export async function sincronizarProveedorDesdePortal(proveedorId, datos = {}, usuarioRuc = '') {
  const existing = (await query('SELECT * FROM proveedores WHERE id = $1 AND deleted_at IS NULL', [proveedorId])).rows[0];
  if (!existing) return null;

  const correo = String(datos.correo || existing.correo || '').trim();
  const emails = correo ? [correo] : parseEmails(existing);
  const historial = pushHistorial(existing.historial, {
    usuario: usuarioRuc || 'Portal Proveedor',
    accion: 'Actualizar desde Portal',
    detalle: 'Datos actualizados al presentar cotización',
  });

  const { rows } = await query(`
    UPDATE proveedores SET
      razon_social = COALESCE(NULLIF($2, ''), razon_social),
      direccion = COALESCE(NULLIF($3, ''), direccion),
      telefono = COALESCE(NULLIF($4, ''), telefono),
      correo = COALESCE(NULLIF($5, ''), correo),
      emails = $6::jsonb,
      persona_contacto = COALESCE(NULLIF($7, ''), persona_contacto),
      rubro = COALESCE(NULLIF($8, ''), rubro),
      ultima_participacion = NOW(),
      historial = $9::jsonb,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    proveedorId,
    String(datos.razon_social || '').trim(),
    String(datos.direccion || datos.domicilio_fiscal || '').trim(),
    String(datos.telefono || datos.celular || '').trim(),
    correo,
    JSON.stringify(emails.length ? emails : parseEmails(existing)),
    String(datos.persona_contacto || '').trim(),
    String(datos.rubro || '').trim(),
    JSON.stringify(historial),
  ]);

  return mapProveedorRow(rows[0]);
}

export async function upsertProveedorMaestro(data = {}, { usuario = '', origen = 'Registro Manual', accion = null } = {}) {
  const ruc = normalizarRuc(data.ruc);
  const existing = (await query('SELECT * FROM proveedores WHERE ruc = $1', [ruc])).rows[0];
  if (existing && existing.deleted_at) {
    throw new Error('El proveedor existe pero está eliminado. Reactive desde el maestro.');
  }
  if (existing) {
    return actualizarProveedorMaestro(existing.id, data, usuario, accion || 'Editar proveedor');
  }
  return crearProveedorMaestro(data, usuario, origen);
}

export async function importarProveedoresMaestro(rows = [], usuario = '') {
  const results = { insertados: 0, actualizados: 0, errores: [] };
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    try {
      const ruc = normalizarRuc(row.RUC || row.ruc);
      const payload = {
        ruc,
        razon_social: row['Razón Social'] || row.razon_social || row.Razon_Social || '',
        direccion: row.Dirección || row.direccion || row.Direccion || '',
        correo: row.Correo || row.correo || '',
        telefono: String(row.Teléfono || row.telefono || row.Telefono || '').trim(),
        persona_contacto: row['Persona Contacto'] || row.persona_contacto || row.Persona_Contacto || '',
        rubro: row.Rubro || row.rubro || '',
      };
      const existing = await obtenerProveedorPorRuc(ruc);
      if (existing) {
        await actualizarProveedorMaestro(existing.id, payload, usuario, 'Importar');
        results.actualizados += 1;
      } else {
        await crearProveedorMaestro(payload, usuario, 'Importación Excel');
        results.insertados += 1;
      }
    } catch (err) {
      results.errores.push({ fila: i + 2, error: err.message || String(err) });
    }
  }
  return results;
}

/** Compatibilidad con invitaciones — upsert simplificado */
export async function upsertProveedorLegacy(data = {}, opts = {}) {
  const ruc = normalizarRuc(data.ruc);
  if (!validarRuc(ruc)) throw new Error('RUC inválido');
  const emails = parseEmails(data);
  const existing = (await query('SELECT * FROM proveedores WHERE ruc = $1', [ruc])).rows[0];

  if (existing) {
    const merged = {
      ruc,
      razon_social: data.razon_social || existing.razon_social,
      telefono: data.telefono || existing.telefono,
      correo: emails[0] || existing.correo,
      emails,
      direccion: data.direccion || existing.direccion,
      persona_contacto: data.persona_contacto || existing.persona_contacto,
      rubro: data.rubro || existing.rubro,
    };
    return actualizarProveedorMaestro(existing.id, merged, opts.usuario || '', opts.accion || 'Editar proveedor');
  }

  return crearProveedorMaestro({
    ruc,
    razon_social: data.razon_social || `Proveedor ${ruc}`,
    telefono: data.telefono || '',
    correo: emails[0] || '',
    emails,
    direccion: data.direccion || '',
    persona_contacto: data.persona_contacto || '',
    rubro: data.rubro || '',
  }, opts.usuario || '', opts.origen || 'Registro Manual');
}
