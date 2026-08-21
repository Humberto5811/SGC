/** SOLO LECTURA — RC8.15.6G-3 diagnóstico OS 1105 E1 post-subsanación G2 */
import pool, { query } from '../server/db.js';
import { listarBandejaEntregablesServicios } from '../server/lib/entregablesServicios.js';
import { resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';

const OS = '1105';
const ENTREGA = 1;

const orden = (await query(`
  SELECT oc.id AS orden_id, oe.id AS orden_entrega_id
  FROM ordenes_contratacion oc
  JOIN orden_entregas oe ON oe.orden_id=oc.id AND oe.numero_entrega=$2 AND oe.estado='ACTIVO'
  WHERE oc.tipo_orden='OS' AND oc.numero_orden=$1 ORDER BY oc.id LIMIT 1
`, [OS, ENTREGA])).rows[0];
if (!orden) { console.log('E1 no encontrado'); process.exit(1); }
const eid = orden.orden_entrega_id;

const estado = (await query(`SELECT ev.*, u.username FROM entregable_estado_vigente ev LEFT JOIN usuarios u ON u.id=ev.responsable_usuario_id WHERE ev.orden_entrega_id=$1`, [eid])).rows[0];

const obs = (await query(`
  SELECT eo.*, wo.id AS wo_id, wo.estado AS wo_estado, wo.usuario_origen_id, wo.usuario_destino_id,
    wo.origen_submodulo_codigo, wo.destino_submodulo_codigo, wo.documentos, wo.motivo AS wo_motivo,
    wo.subsanada_at, wo.cerrada_at, uo.username AS origen_u, ud.username AS destino_u
  FROM entregable_observaciones eo
  LEFT JOIN workflow_observaciones wo ON wo.id=eo.workflow_observacion_id
  LEFT JOIN usuarios uo ON uo.id=wo.usuario_origen_id
  LEFT JOIN usuarios ud ON ud.id=wo.usuario_destino_id
  WHERE eo.orden_entrega_id=$1 ORDER BY eo.id DESC
`, [eid])).rows;

const recepciones = (await query(`
  SELECT id, numero_recepcion, tipo_recepcion, estado, registrado_por
  FROM entregable_recepciones WHERE orden_entrega_id=$1 ORDER BY numero_recepcion, id
`, [eid])).rows;

const actas = (await query(`
  SELECT eca.id, eca.recepcion_id, eca.version, eca.estado_documental, eca.numero_acta, eca.generado_at
  FROM entregable_conformidad_actas eca WHERE eca.orden_entrega_id=$1 ORDER BY eca.id
`, [eid])).rows;

const firmadas = (await query(`
  SELECT ecav.id, ecav.acta_id, ecav.vigente, ecav.estado_documental, ecav.nombre, eca.recepcion_id
  FROM entregable_conformidad_acta_visados ecav
  JOIN entregable_conformidad_actas eca ON eca.id = ecav.acta_id
  WHERE ecav.orden_entrega_id=$1 AND ecav.deleted_at IS NULL ORDER BY ecav.id
`, [eid])).rows;

// Simular subquery bandeja para recepción vigente + acta + firmada
const vigenteRecep = (await query(`
  SELECT er.id, er.numero_recepcion, er.tipo_recepcion, er.estado
  FROM entregable_recepciones er
  WHERE er.orden_entrega_id=$1
    AND UPPER(COALESCE(er.estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
  ORDER BY er.numero_recepcion DESC, er.id DESC LIMIT 1
`, [eid])).rows[0];

const actaVigenteBandeja = (await query(`
  SELECT MAX(eca.version)::int AS version, eca.recepcion_id
  FROM entregable_conformidad_actas eca
  WHERE eca.orden_entrega_id=$1
    AND eca.recepcion_id = (
      SELECT er.id FROM entregable_recepciones er
      WHERE er.orden_entrega_id=$1
        AND UPPER(COALESCE(er.estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
      ORDER BY er.numero_recepcion DESC, er.id DESC LIMIT 1
    )
  GROUP BY eca.recepcion_id
`, [eid])).rows[0];

const firmadaVigenteBandeja = Number((await query(`
  SELECT COUNT(*)::int AS n
  FROM entregable_conformidad_acta_visados ecav
  JOIN entregable_conformidad_actas eca ON eca.id=ecav.acta_id
  WHERE ecav.orden_entrega_id=$1 AND ecav.vigente=TRUE AND ecav.deleted_at IS NULL
    AND eca.recepcion_id = (
      SELECT er.id FROM entregable_recepciones er
      WHERE er.orden_entrega_id=$1
        AND UPPER(COALESCE(er.estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
      ORDER BY er.numero_recepcion DESC, er.id DESC LIMIT 1
    )
`, [eid])).rows[0].n);

const eventos = (await query(`
  SELECT id, evento_codigo, etapa_anterior_codigo, etapa_nueva_codigo,
    responsable_anterior_usuario, responsable_nuevo_usuario, ejecutado_por, motivo, ocurrido_at
  FROM entregable_eventos WHERE orden_entrega_id=$1 ORDER BY id DESC LIMIT 12
`, [eid])).rows;

const asignaciones = (await query(`
  SELECT id, etapa_codigo, usuario_id, activo, origen_asignacion, asignado_at, motivo
  FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id DESC LIMIT 8
`, [eid])).rows;

const wrodriguez = (await query(`SELECT * FROM usuarios WHERE LOWER(username)='wrodriguez' AND activo`)).rows[0];
const wvasquez = (await query(`SELECT * FROM usuarios WHERE LOWER(username)='wvasquez' AND activo`)).rows[0];

function bandejaCtx(u) {
  return { id: Number(u.id), username: u.username, nombre: u.nombre, cargo: u.cargo, rol: u.rol, permisos: u.permisos };
}

const bandejaRod = wrodriguez ? await listarBandejaEntregablesServicios(bandejaCtx(wrodriguez)) : [];
const bandejaVas = wvasquez ? await listarBandejaEntregablesServicios(bandejaCtx(wvasquez)) : [];
const filaRod = bandejaRod.find(r => Number(r.orden_entrega_id) === Number(eid));
const filaVas = bandejaVas.find(r => Number(r.orden_entrega_id) === Number(eid));

console.log(JSON.stringify({
  A_estado_vigente: {
    etapa_codigo: estado?.etapa_codigo,
    responsable_tipo: estado?.responsable_tipo,
    responsable_usuario_id: estado?.responsable_usuario_id,
    responsable_username: estado?.username,
  },
  B_observaciones: obs.map(o => ({
    id: o.id, estado: o.estado, workflow_observacion_id: o.workflow_observacion_id,
    wo_estado: o.wo_estado, origen: o.origen_u, destino: o.destino_u,
    origen_submodulo: o.origen_submodulo_codigo, etapa_retorno: o.documentos?.etapa_retorno,
    recepcion_id: o.recepcion_id, recepcion_subsanacion_id: o.recepcion_subsanacion_id,
    observado_por: o.observado_por, subsanado_por: o.subsanado_por,
    observado_at: o.observado_at, subsanado_at: o.subsanado_at,
  })),
  D_recepciones: recepciones,
  E_actas: actas,
  F_firmadas: firmadas,
  G_recepcion_vigente_bandeja: vigenteRecep,
  H_acta_vigente_bandeja_query: actaVigenteBandeja,
  I_firmada_vigente_bandeja_count: firmadaVigenteBandeja,
  J_eventos_recientes: eventos,
  K_asignaciones_recientes: asignaciones,
  L_bandeja_wrodriguez: filaRod ? {
    etapa: filaRod.estado_etapa_codigo,
    situacion_codigo: filaRod.situacion_codigo,
    observacion_abierta: filaRod.observacion_abierta,
    acta_generada_version: filaRod.acta_generada_version,
    firmada_vigente: filaRod.firmada_vigente,
    ultima_recepcion: filaRod.ultima_recepcion,
    flags: {
      puede_observar_coordinador_cm: filaRod.puede_observar_coordinador_cm,
      puede_derivar_analista_cm: filaRod.puede_derivar_analista_cm,
      puede_observar: filaRod.puede_observar,
      puede_subsanar: filaRod.puede_subsanar,
      puede_ver_trazabilidad: filaRod.puede_ver_trazabilidad,
    },
    perfiles: resolveFunctionalProfiles(bandejaCtx(wrodriguez)),
    es_responsable: Number(wrodriguez?.id) === Number(filaRod.responsable_usuario_id),
  } : null,
  M_bandeja_wvasquez: filaVas ? {
    situacion_codigo: filaVas.situacion_codigo,
    es_responsable: Number(wvasquez?.id) === Number(filaVas.responsable_usuario_id),
    flags: {
      puede_subsanar: filaVas.puede_subsanar,
      puede_derivar_analista_cm: filaVas.puede_derivar_analista_cm,
    },
  } : null,
}, null, 2));

await pool.end();
