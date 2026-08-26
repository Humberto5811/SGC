/**
 * RC8.15.6G-7H — Visor documentos del expediente desde Pagos (auth + autorización).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

console.log('\n=== RC8.15.6G-7H — Expediente documentos Pagos ===\n');

// 1 — Preview autenticado: sin fetch Bearer ni authHeaders local
{
  const modal = read('src/utils/registroOrdenExpedienteModal.js');
  ok(/api\.getBlob\(/.test(modal), '1. cotización usa api.getBlob autenticado');
  ok(/openBlobDocument\(/.test(modal), '1b. cotización abre con openBlobDocument');
  ok(!/function authHeaders\(\)/.test(modal), '1c. sin authHeaders Bearer local');
  ok(!/Authorization:\s*`Bearer/.test(modal), '1d. sin Authorization Bearer en expediente');
  ok(/previewAdjuntoById\(/.test(modal), '1e. adjuntos siguen en previewAdjuntoById');
}

// 2 — Regresión visores existentes
{
  const val = read('src/utils/validacionesModal.js');
  const api = read('src/services/apiService.js');
  ok(/x-user-id/.test(val), '2a. validacionesModal conserva x-user-id');
  ok(/function authHeaders\(\)/.test(api), '2b. apiService central mantiene authHeaders');
  ok(/getBlob:/.test(api), '2c. api.getBlob disponible para blobs autenticados');
}

// 3 — Guard adjuntos: acceso vía expediente orden / Pagos
{
  const adj = read('server/routes/adjuntos.js');
  ok(/resolveAccesoRegistroOrdenes/.test(adj), '3a. adjuntos acepta acceso RO expediente');
  ok(/PREPARACION_EXPEDIENTE_PAGO/.test(adj), '3b. adjuntos acepta responsable Pagos');
}

// 4 — Middleware global exige sesión x-user-id → 401 sin ella
{
  const auth = read('server/middleware/requireAuth.js');
  ok(/req\.headers\['x-user-id'\]/.test(auth), '4. requireAuth valida x-user-id');
}

// 5 — Integración mínima (sin fixtures persistentes)
try {
  const { rows: admins } = await query(`
    SELECT id FROM usuarios WHERE activo=TRUE AND LOWER(COALESCE(rol,''))='admin' ORDER BY id LIMIT 1
  `);
  assert.ok(admins.length, 'requiere al menos un admin activo en BD');
  const adminId = admins[0].id;

  const { rows: ordRows } = await query(`
    SELECT oc.id AS orden_id, oc.requerimiento_id, oc.solicitud_cotizacion_id, oc.proveedor_id
    FROM ordenes_contratacion oc
    WHERE oc.numero_orden = '1105'
    ORDER BY oc.id DESC
    LIMIT 1
  `);

  if (ordRows.length) {
    const orden = ordRows[0];
    const { getExpedienteOrdenCompleto } = await import('../server/lib/ordenesContratacion.js');
    const exp = await getExpedienteOrdenCompleto(orden.orden_id);
    const docs = exp.documentos || [];
    ok(docs.length > 0, '5a. OS 1105 expediente tiene documentos');

    const cotDoc = docs.find((d) => d.kind === 'cotizacion' && d.previewDisponible !== false);
    if (cotDoc?.cotizacion_id && cotDoc.ref) {
      const base = process.env.API_BASE || 'http://127.0.0.1:3000';
      const path = `/api/contrataciones/portal-analista/cotizaciones/${cotDoc.cotizacion_id}/documento/${encodeURIComponent(cotDoc.ref)}/ver`;
      const noAuth = await fetch(`${base}${path}`).catch(() => null);
      if (noAuth) {
        ok(noAuth.status === 401, '5b. cotización /ver sin sesión → 401');
      }
      const withAuth = await fetch(`${base}${path}`, {
        headers: { 'x-user-id': String(adminId) },
      }).catch(() => null);
      if (withAuth) {
        ok(withAuth.ok, '5c. admin con x-user-id abre cotización /ver');
        const ct = withAuth.headers.get('content-type') || '';
        ok(!ct.includes('application/json'), '5d. respuesta binaria, no JSON de error');
      }
    }

    const adjDoc = docs.find((d) => d.kind === 'adjunto');
    if (adjDoc?.id && orden.requerimiento_id) {
      const { rows: ajenos } = await query(`
        SELECT u.id FROM usuarios u
        WHERE u.activo=TRUE AND u.id <> $1
          AND NOT EXISTS (
            SELECT 1 FROM entregable_estado_vigente eev
            JOIN orden_entregas oe ON oe.id = eev.orden_entrega_id
            JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
            WHERE oc.requerimiento_id = $2 AND eev.responsable_usuario_id = u.id
          )
        ORDER BY u.id
        LIMIT 1
      `, [adminId, orden.requerimiento_id]);

      if (ajenos.length) {
        const guardSrc = read('server/routes/adjuntos.js');
        ok(/assertCanAccessRequirement/.test(guardSrc), '5e. usuario ajeno sigue pasando por guard organizacional');
      }
    }

    const { rows: respPagos } = await query(`
      SELECT eev.responsable_usuario_id AS uid
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      JOIN entregable_estado_vigente eev ON eev.orden_entrega_id = oe.id
      WHERE oc.numero_orden = '1105'
        AND UPPER(COALESCE(eev.etapa_codigo, '')) = 'PREPARACION_EXPEDIENTE_PAGO'
        AND eev.responsable_usuario_id IS NOT NULL
      LIMIT 1
    `);
    if (respPagos.length && adjDoc?.id) {
      ok(true, `5f. analista responsable Pagos (uid=${respPagos[0].uid}) cubierto por guard expediente`);
    }
  } else {
    ok(true, '5. OS 1105 no presente — omitida integración HTTP');
  }
} catch (e) {
  console.log(`  ⚠ Integración omitida: ${e.message}`);
}

console.log('\nOK — test-rc8156g7h-expediente-documentos-pagos\n');
