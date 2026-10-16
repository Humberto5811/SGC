/**
 * RC8.17.8H6-D10-E3-C2.6A1 — Diagnóstico VPS solo lectura
 * Caso: SC-00001-2026-INS, Invitación 7, cuadro id=2 v3, REQ-00001, pedido SIGAMEF id=694
 *
 * Uso (VPS): cd /opt/sgc-test/app && node scripts/diag-rc8178h6-d10-e3-c26a1-sc00001-readonly.mjs
 *
 * Solo SELECT / funciones de lectura del listado. Sin mutaciones ni impresión de PDFs.
 */
import { query } from '../server/db.js';
import pool from '../server/db.js';
import {
  SQL_FILTER_ELEGIBLE_CUADRO_RONDA,
  SQL_NRO_INVITACION_COT,
} from '../server/lib/cuadroComparativoRonda.js';
import {
  listarCuadroComparativoExpedientes,
  filtrarBandejaPorRolRevision,
} from '../server/lib/cuadroComparativo.js';
import {
  resolvePedidoSigamefForAnexo8A,
  enrichItemsClasificadorAnexo8A,
} from '../shared/cuadroClasificadorAnexo8a.js';

const CASE = Object.freeze({
  solicitud_codigo: 'SC-00001-2026-INS',
  nro_invitacion: 7,
  cuadro_id: 2,
  cuadro_version: 3,
  requerimiento_codigo: 'REQ-00001',
  pedido_sigamef_id: 694,
  analista_username: 'jcrisostomo',
  coord_cm_username: 'wrodriguez',
});

function section(title) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

function pdfMeta(row = {}) {
  const len = (v) => (v == null || v === '' ? 0 : String(v).length);
  return {
    pdf_nombre: row.pdf_nombre || null,
    pdf_contenido_chars: len(row.pdf_contenido),
    firmado_nombre: row.firmado_nombre || null,
    firmado_contenido_chars: len(row.firmado_contenido),
    firmado_por: row.firmado_por || null,
    firmado_at: row.firmado_at || null,
    firmado_dec_nombre: row.firmado_dec_nombre || null,
    firmado_dec_contenido_chars: len(row.firmado_dec_contenido),
    creado_por: row.creado_por || null,
    actualizado_por: row.actualizado_por || null,
    creado_at: row.creado_at || null,
    actualizado_at: row.actualizado_at || null,
  };
}

function pickUsuarioBasico(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || null,
    nombre_trunc: row.nombre ? String(row.nombre).slice(0, 80) : null,
  };
}

async function resolveContexto() {
  const { rows: solRows } = await query(
    `SELECT id, codigo, estado, tipo, updated_at
     FROM solicitudes_cotizacion
     WHERE codigo = $1
     LIMIT 1`,
    [CASE.solicitud_codigo],
  );
  const solicitud = solRows[0];
  if (!solicitud) {
    return { error: `Solicitud ${CASE.solicitud_codigo} no encontrada` };
  }

  const { rows: reqRows } = await query(
    `SELECT r.id, r.codigo, r.estado, r.estado_actual
     FROM requerimientos r
     WHERE r.codigo = $1
     LIMIT 1`,
    [CASE.requerimiento_codigo],
  );
  const requerimiento = reqRows[0];

  const { rows: linkRows } = await query(
    `SELECT sr.solicitud_id, sr.requerimiento_id
     FROM solicitud_requerimientos sr
     WHERE sr.solicitud_id = $1 AND sr.requerimiento_id = $2
     LIMIT 1`,
    [solicitud.id, requerimiento?.id ?? 0],
  );

  const { rows: cuadroRows } = await query(
    `SELECT id, solicitud_id, tipo, version, estado, nro_invitacion, invitacion_id,
            actualizado_at, derivado_at, derivado_por,
            pdf_nombre, firmado_nombre, firmado_por, firmado_at,
            creado_por, actualizado_por, creado_at,
            LENGTH(COALESCE(pdf_contenido, '')) AS pdf_contenido_chars,
            LENGTH(COALESCE(firmado_contenido, '')) AS firmado_contenido_chars,
            LENGTH(COALESCE(firmado_dec_contenido, '')) AS firmado_dec_contenido_chars,
            firmado_dec_nombre, firmado_dec_por, firmado_dec_at,
            datos_json->'revision_coordinador' AS revision_coordinador,
            datos_json->>'revisado_por' AS revisado_por,
            datos_json->>'elaborado_por' AS elaborado_por,
            datos_json->>'aprobado_por' AS aprobado_por,
            jsonb_array_length(COALESCE(datos_json->'items', '[]'::jsonb)) AS items_count
     FROM cuadros_comparativos
     WHERE id = $1 AND version = $2
     LIMIT 1`,
    [CASE.cuadro_id, CASE.cuadro_version],
  );
  const cuadro = cuadroRows[0];

  const { rows: usuarios } = await query(
    `SELECT id, username, nombre
     FROM usuarios
     WHERE LOWER(TRIM(username)) IN ($1, $2)`,
    [CASE.analista_username.toLowerCase(), CASE.coord_cm_username.toLowerCase()],
  );
  const userByName = new Map(
    usuarios.map((u) => [String(u.username || '').toLowerCase(), u]),
  );

  return {
    solicitud,
    requerimiento,
    vinculo_solicitud_req: linkRows[0] || null,
    cuadro,
    analista: pickUsuarioBasico(userByName.get(CASE.analista_username.toLowerCase())),
    coord_cm: pickUsuarioBasico(userByName.get(CASE.coord_cm_username.toLowerCase())),
  };
}

try {
  section('0 — Resolución de IDs (SC / REQ / cuadro)');
  const ctx = await resolveContexto();
  if (ctx.error) {
    console.log(JSON.stringify(ctx, null, 2));
    await pool.end();
    process.exit(1);
  }
  console.log(JSON.stringify({
    solicitud_id: ctx.solicitud.id,
    solicitud_codigo: ctx.solicitud.codigo,
    requerimiento_id: ctx.requerimiento?.id ?? null,
    requerimiento_codigo: ctx.requerimiento?.codigo ?? null,
    cuadro: ctx.cuadro
      ? {
        id: ctx.cuadro.id,
        version: ctx.cuadro.version,
        estado: ctx.cuadro.estado,
        nro_invitacion: ctx.cuadro.nro_invitacion,
        items_count: ctx.cuadro.items_count,
      }
      : null,
    analista: ctx.analista,
    coord_cm: ctx.coord_cm,
    vinculo_solicitud_req: ctx.vinculo_solicitud_req,
  }, null, 2));

  const rid = ctx.requerimiento?.id;
  const sid = ctx.solicitud.id;

  section('1 — Etapa, estado y asignación vigentes (REQ-00001 → ERV + asignaciones)');
  if (!rid) {
    console.log('REQ-00001 no encontrado; se omite ERV.');
  } else {
    const [{ rows: erv }, { rows: asigActiva }, { rows: asigHist }] = await Promise.all([
      query(
        `SELECT requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
                responsable_tipo, responsable_usuario_id, responsable_unidad, actualizado_at
         FROM expediente_estado_vigente
         WHERE requerimiento_id = $1`,
        [rid],
      ),
      query(
        `SELECT a.id, a.etapa_codigo, a.tipo_responsable, a.usuario_id, a.unidad_codigo,
                a.activo, a.asignado_at, a.origen_asignacion, u.username
         FROM expediente_asignaciones a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.requerimiento_id = $1 AND a.activo = TRUE
         ORDER BY a.asignado_at DESC, a.id DESC`,
        [rid],
      ),
      query(
        `SELECT a.id, a.etapa_codigo, a.tipo_responsable, a.usuario_id, a.unidad_codigo,
                a.activo, a.asignado_at, a.cerrado_at, a.motivo, a.origen_asignacion, u.username
         FROM expediente_asignaciones a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.requerimiento_id = $1
         ORDER BY a.asignado_at ASC, a.id ASC`,
        [rid],
      ),
    ]);
    console.log(JSON.stringify({
      expediente_estado_vigente: erv[0] || null,
      asignacion_activa: asigActiva,
      asignaciones_historial: asigHist,
    }, null, 2));
  }

  section('2 — Trazabilidad derivación Analista → Coordinador CM (workflow + portal)');
  const reqIdsRows = await query(
    `SELECT DISTINCT requerimiento_id AS id
     FROM solicitud_requerimientos
     WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL
     UNION
     SELECT DISTINCT requerimiento_id AS id
     FROM cotizaciones_proveedor
     WHERE solicitud_id = $1 AND requerimiento_id IS NOT NULL`,
    [sid],
  );
  const reqIds = reqIdsRows.rows.map((r) => r.id).filter(Boolean);

  const [{ rows: wf }, { rows: trazaPortal }] = await Promise.all([
    query(
      `SELECT id, expediente_id, evento_codigo, etapa_origen, etapa_destino,
              actor_id, actor_rol, responsable_destino, created_at,
              metadata->>'usuario_destino_id' AS metadata_usuario_destino_id,
              metadata->>'responsable_seleccionado_id' AS metadata_responsable_seleccionado_id,
              metadata->>'accion' AS metadata_accion,
              metadata->>'revision_estado' AS metadata_revision_estado,
              metadata->>'observacion' AS metadata_observacion_trunc
       FROM workflow_eventos
       WHERE expediente_id = ANY($1::int[])
         AND (
           evento_codigo ILIKE 'CUADRO%'
           OR evento_codigo ILIKE '%DERIV%COORD%'
           OR evento_codigo ILIKE '%CUADRO_COMPARATIVO%'
         )
       ORDER BY id ASC`,
      [reqIds],
    ),
    query(
      `SELECT id, solicitud_id, requerimiento_id, evento,
              LEFT(detalle, 500) AS detalle_trunc,
              usuario, created_at
       FROM trazabilidad_portal
       WHERE solicitud_id = $1
         AND (
           evento ILIKE 'CUADRO%'
           OR evento ILIKE '%DERIVAR%COORD%'
         )
       ORDER BY id ASC`,
      [sid],
    ),
  ]);

  const wfDerivCoord = wf.filter((e) => /DERIVAR_COORD|DERIVADO_COORD|CUADRO_REVISION_DERIVAR/i.test(
    `${e.evento_codigo}|${e.metadata_accion || ''}`,
  ));
  const trazaDeriv = trazaPortal.filter((t) => /DERIVAR_COORDINADOR|DERIVADO_COORDINACION/i.test(t.evento));

  console.log(JSON.stringify({
    requerimiento_ids_solicitud: reqIds,
    workflow_eventos_cuadro_total: wf.length,
    workflow_derivacion_coord_filtrados: wfDerivCoord,
    trazabilidad_portal_cuadro_total: trazaPortal.length,
    trazabilidad_derivacion_coord_filtrados: trazaDeriv,
  }, null, 2));

  section('3 — Orden bandeja Analista (2 filas: fecha_ingreso_cuadro vs actualizado_at cuadro)');
  const analistaCtx = {
    username: CASE.analista_username,
    permisos: { rol_revision_cuadro: 'ANALISTA' },
    cargo: 'Analista de Contrataciones Menores',
  };
  const listado = await listarCuadroComparativoExpedientes();
  const { rol, data: bandejaAnalista } = filtrarBandejaPorRolRevision(listado, analistaCtx);

  const { rows: cuadrosSid } = await query(
    `SELECT id, solicitud_id, nro_invitacion, version, estado, actualizado_at
     FROM cuadros_comparativos
     WHERE solicitud_id = $1 AND estado <> 'ANULADO'
     ORDER BY nro_invitacion NULLS FIRST, version DESC`,
    [sid],
  );
  const cuadroByInv = new Map();
  for (const c of cuadrosSid) {
    const k = Number(c.nro_invitacion);
    if (!cuadroByInv.has(k)) cuadroByInv.set(k, c);
  }

  const bandejaRows = bandejaAnalista.map((f, idx) => {
    const nro = Number(f.nro_invitacion);
    const cc = cuadroByInv.get(nro) || null;
    return {
      rank: idx + 1,
      solicitud_codigo: f.solicitud_codigo,
      nro_invitacion: nro,
      estado_cuadro_global: f.estado_cuadro || f.estado,
      estado_cuadro_documental: f.estado_cuadro_documental || f.estado_db || null,
      fecha_ingreso_cuadro: f.fecha_ingreso_cuadro,
      cuadro_id: f.cuadro_id ?? cc?.id ?? null,
      cuadro_version: f.version ?? cc?.version ?? null,
      cuadro_actualizado_at: f.fecha_actualizacion ?? cc?.actualizado_at ?? null,
      es_caso: f.solicitud_codigo === CASE.solicitud_codigo && nro === CASE.nro_invitacion,
    };
  });

  const targetIdx = bandejaRows.findIndex((r) => r.es_caso);
  const vecinoSuperior = targetIdx > 0 ? bandejaRows[targetIdx - 1] : null;
  const caso = bandejaRows[targetIdx] ?? null;

  console.log(JSON.stringify({
    rol_filtro_bandeja: rol,
    total_filas_analista: bandejaRows.length,
    filas_mismo_SC: bandejaRows.filter((r) => r.solicitud_codigo === CASE.solicitud_codigo),
    caso_inv7: caso,
    fila_inmediatamente_superior_en_bandeja: vecinoSuperior,
    comparacion_orden: caso && vecinoSuperior ? {
      caso_fecha_ingreso: caso.fecha_ingreso_cuadro,
      superior_fecha_ingreso: vecinoSuperior.fecha_ingreso_cuadro,
      caso_cuadro_actualizado_at: caso.cuadro_actualizado_at,
      superior_cuadro_actualizado_at: vecinoSuperior.cuadro_actualizado_at,
      nota: 'Listado ordena por fecha_ingreso_cuadro DESC, no por actualizado_at del cuadro.',
    } : null,
    top_5_bandeja_analista: bandejaRows.slice(0, 5),
  }, null, 2));

  section('4 — Clasificador 08-A: ítems datos_json ↔ REQ-00001 ↔ pedido id 694 ↔ especifica');
  const { rows: ped694 } = await query(
    `SELECT p.id, p.pedido_sigamef, p.nro_pedido, p.codigo_sigamef,
            LEFT(COALESCE(p.descripcion, ''), 120) AS descripcion_trunc,
            LEFT(COALESCE(p.especifica, ''), 120) AS especifica_trunc
     FROM pedidos_sigamef p
     WHERE p.id = $1`,
    [CASE.pedido_sigamef_id],
  );

  const { rows: pedidosReq } = await query(
    `SELECT p.id, p.pedido_sigamef, p.nro_pedido, p.codigo_sigamef,
            LEFT(COALESCE(p.descripcion, ''), 120) AS descripcion_trunc,
            LEFT(COALESCE(p.especifica, ''), 120) AS especifica_trunc,
            rp.requerimiento_id
     FROM requerimiento_pedidos rp
     JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
     WHERE rp.requerimiento_id = $1
     ORDER BY p.id`,
    [rid ?? 0],
  );

  let itemsDiag = [];
  if (ctx.cuadro) {
    const { rows: djRows } = await query(
      `SELECT datos_json->'items' AS items FROM cuadros_comparativos WHERE id = $1`,
      [ctx.cuadro.id],
    );
    const items = Array.isArray(djRows[0]?.items) ? djRows[0].items : [];
    const pedidosMap = new Map([[Number(rid), pedidosReq]]);
    const enriched = enrichItemsClasificadorAnexo8A(items, pedidosMap);
    itemsDiag = items.map((it, i) => {
      const pedMatch = resolvePedidoSigamefForAnexo8A(it, pedidosReq);
      return {
        idx: i,
        item_key: it.item_key ?? null,
        requerimiento_id: it.requerimiento_id ?? null,
        requerimiento_codigo: it.requerimiento_codigo ?? null,
        codigo_sigamef: it.codigo_sigamef ?? it.codigo ?? null,
        pedido_sigamef_item: it.pedido_sigamef ?? null,
        pedido_sigamef_id_item: it.pedido_sigamef_id ?? it.pedido_id ?? null,
        descripcion_trunc: it.descripcion ? String(it.descripcion).slice(0, 100) : null,
        pedido_resuelto_id: pedMatch?.id ?? null,
        especifica_resuelta_trunc: pedMatch ? String(pedMatch.especifica || '').slice(0, 120) : null,
        clasificador_enriquecido: enriched[i]?.clasificador ?? null,
        vinculo_pedido_694: pedMatch ? Number(pedMatch.id) === CASE.pedido_sigamef_id : false,
      };
    });
  }

  console.log(JSON.stringify({
    pedido_694: ped694[0] || null,
    pedidos_requerimiento: pedidosReq,
    items_cuadro: itemsDiag,
  }, null, 2));

  section('5 — Metadatos firma PDF (autor, fechas, existencia/tamaño; sin binario)');
  if (ctx.cuadro) {
    console.log(JSON.stringify(pdfMeta(ctx.cuadro), null, 2));
  } else {
    console.log('Cuadro id=2 v3 no encontrado.');
  }

  section('6 — revision_coordinador, revisado_por y conformidad (datos_json persistido)');
  if (ctx.cuadro) {
    const rev = ctx.cuadro.revision_coordinador;
    console.log(JSON.stringify({
      revision_coordinador: rev,
      revisado_por_texto: ctx.cuadro.revisado_por || null,
      elaborado_por_texto: ctx.cuadro.elaborado_por || null,
      aprobado_por_texto: ctx.cuadro.aprobado_por || null,
      conformidad_coordinador: !!(rev && (rev.conformidad === true || rev.conformidad === 'true')),
    }, null, 2));
  }

  section('7 — Anexo: MIN(fecha_ingreso_cuadro) SQL vs actualizado_at cuadro v3 (Inv. 7)');
  const { rows: fechasInv7 } = await query(
    `SELECT
       cot.id AS cotizacion_id,
       ${SQL_NRO_INVITACION_COT} AS nro_invitacion,
       cot.validacion_estado,
       cot.validacion_informe->'derivacion_salida'->>'derivado_at' AS derivacion_salida_at,
       cot.validacion_informe->'derivacion_salida'->>'submodulo' AS destino_salida,
       cot.validacion_informe->>'enviado_at' AS enviado_at,
       cot.updated_at,
       cot.fecha_presentacion
     FROM cotizaciones_proveedor cot
     LEFT JOIN invitacion_proveedores ip ON ip.id = cot.invitacion_id
     WHERE cot.solicitud_id = $1
       AND cot.estado = 'COTIZACION_PRESENTADA'
       AND ${SQL_NRO_INVITACION_COT} = $2
       AND ${SQL_FILTER_ELEGIBLE_CUADRO_RONDA}
     ORDER BY cot.id`,
    [sid, CASE.nro_invitacion],
  );
  const { rows: minFecha } = await query(
    `SELECT MIN(
       COALESCE(
         NULLIF(cot.validacion_informe->'derivacion_salida'->>'derivado_at', '')::timestamptz,
         NULLIF(cot.validacion_informe->>'enviado_at', '')::timestamptz,
         cot.updated_at,
         cot.fecha_presentacion
       )
     ) AS fecha_ingreso_cuadro_calc
     FROM cotizaciones_proveedor cot
     LEFT JOIN invitacion_proveedores ip ON ip.id = cot.invitacion_id
     WHERE cot.solicitud_id = $1
       AND cot.estado = 'COTIZACION_PRESENTADA'
       AND ${SQL_NRO_INVITACION_COT} = $2
       AND ${SQL_FILTER_ELEGIBLE_CUADRO_RONDA}`,
    [sid, CASE.nro_invitacion],
  );
  console.log(JSON.stringify({
    cotizaciones_elegibles_inv7: fechasInv7,
    fecha_ingreso_cuadro_MIN_inv7: minFecha[0]?.fecha_ingreso_cuadro_calc ?? null,
    cuadro_actualizado_at_v3: ctx.cuadro?.actualizado_at ?? null,
  }, null, 2));

  section('Fin — pegar salida completa para C2.6A');
} catch (err) {
  console.error('ERROR_DIAG', err.message);
  if (err.query) console.error('QUERY', String(err.query).slice(0, 400));
  process.exitCode = 1;
} finally {
  await pool.end();
}
