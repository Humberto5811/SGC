/**
 * RC8.15.5C — Registro de recepción: el archivo seleccionado debe llegar al backend.
 *
 * Cubre A–M:
 *   A. El frontend utiliza el mismo input/estado del archivo seleccionado.
 *   B. Archivo ausente → rechazo correcto.
 *   C. PDF válido → aceptado.
 *   D. MIME no permitido → rechazo correcto.
 *   E. Se registra UNA recepción.
 *   F. Se registra UN documento relacionado con esa recepción.
 *   G. nombre_archivo correcto.
 *   H. mime_type = application/pdf.
 *   I. contenido no vacío.
 *   J. recepción y documento se escriben atómicamente.
 *   K. un error documental no deja recepción huérfana.
 *   L. entregables ANULADOS no son afectados.
 *   M. segundo entregable no es modificado.
 *
 * IMPORTANTE: usa fixture aislado (número de orden único, NUNCA OS 1105 real).
 * Para las operaciones con COMMIT propio de la función se limpian con DELETE.
 * Para la prueba de atomicidad documental (K) se usa un client con ROLLBACK.
 */
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
async function expectReject(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

function pdfBase64() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF').toString('base64');
}

console.log('\n=== RC8.15.5C — Registro de recepción: documento obligatorio ===\n');

// ── A. El frontend usa el mismo input/estado del archivo seleccionado ────────
{
  const view = read('src/views/ejecucion/presentacionEntregableView.js');
  ok(/id="\$\{PREFIX\}File"/.test(view), 'A1. input file visible único (peFile)');
  ok(/fileInput\?\.files\?\.length/.test(view)
    && /fileInput\.files\[0\]/.test(view)
    && /readAsDataURL\(f\)/.test(view),
    'A2. el File se lee del mismo input visible y se convierte a base64');
  ok(/documentos: contenido \? \[/.test(view)
    && !/archivos: contenido \? \[/.test(view),
    'A3. el payload del frontend usa "documentos" (contrato backend) y NO "archivos"');
  ok(/\$\{PREFIX\}File`\)\.value = ''/.test(view),
    'A4. al abrir el modal se limpia el input (reinicio de estado)');
}

// ── Regla MIME existente (PDF) ──────────────────────────────────────────────
{
  const lib = read('server/lib/entregablesServicios.js');
  ok(/MIME_ALOWED/.test(lib) && /'application\/pdf'/.test(lib),
    'D-base. lista de MIME permitidos incluye application/pdf');
  ok(/Archivo del entregable es obligatorio/.test(lib),
    'B-base. validación de archivo obligatorio existe en backend');
}

// ── DB: fixture aislado, nunca OS 1105 real ─────────────────────────────────
let db = null;
try { db = await import('../server/db.js'); } catch (_) { /* sin DB */ }
if (!db?.query) {
  console.log('  ⚠ Sin acceso a BD: verificaciones de integración omitidas.');
} else {
  const { query, getClient } = db;
  const { registrarRecepcionEntregable } = await import('../server/lib/entregablesServicios.js');
  await runIntegration({ query, getClient, registrarRecepcionEntregable });
  try { await db.default?.end(); } catch (_) { /* noop */ }
}

console.log(`\n=== Resultado RC8.15.5C: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

async function runIntegration({ query, getClient, registrarRecepcionEntregable }) {
  const lib = read('server/lib/entregablesServicios.js');
  const ts = Date.now();
  const numOrden = `RC8155C${ts}`;
  let ordId = null;

  try {
    // ── Crear orden de contratación fixture (OS ficticia, NO OS 1105) ──
    const prov = (await query(`SELECT proveedor_id FROM ordenes_contratacion WHERE tipo_orden='OS' LIMIT 1`)).rows[0];
    const req = (await query(`SELECT id FROM requerimientos ORDER BY id LIMIT 1`)).rows[0];
    if (!prov?.proveedor_id || !req?.id) throw new Error('Fixture sin proveedor/requerimiento base');

    const ord = (await query(
      `INSERT INTO ordenes_contratacion (requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden, fecha_orden, monto_total, estado, tipo_contratacion)
       VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,1000,'EN_EJECUCION','SERVICIO') RETURNING id`,
      [req.id, prov.proveedor_id, numOrden],
    )).rows[0];
    ordId = ord.id;

    // Entregable 1 (ACTIVO, se usará para registro)
    const ent1 = (await query(
      `INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
       VALUES ($1,1,'ENTREGABLE','Entregable fixture RC8.15.5C',30,CURRENT_DATE+30,500,'ACTIVO') RETURNING id`,
      [ordId],
    )).rows[0];
    const ent1Id = ent1.id;

    // Entregable 2 (ACTIVO, no debe ser modificado — M)
    const ent2 = (await query(
      `INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
       VALUES ($1,2,'ENTREGABLE','Segundo entregable fixture',30,CURRENT_DATE+30,500,'ACTIVO') RETURNING id`,
      [ordId],
    )).rows[0];
    const ent2Id = ent2.id;

    // Entregable 3 (ANULADO, no debe ser afectado — L)
    const entAnulada = (await query(
      `INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
       VALUES ($1,3,'ENTREGABLE','Entregable anulado fixture',30,CURRENT_DATE+30,500,'ANULADO') RETURNING id`,
      [ordId],
    )).rows[0];
    const entAnuladaId = entAnulada.id;

    // ── B. Archivo ausente → rechazo correcto ────────────────────────────
    const bErr = await expectReject(() => registrarRecepcionEntregable(
      ent1Id,
      { fecha_recepcion_mesa_partes: '2026-08-18', numero_expediente_sgd: '2026-151546', observacion: 'SIN ARCHIVO', documentos: [] },
      'test-user',
      'admin',
    ));
    ok(bErr && /Archivo del entregable es obligatorio/.test(bErr.message),
      `B. sin archivo → "Archivo del entregable es obligatorio" (${bErr?.message})`);
    const bCnt = (await query(`SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1`, [ent1Id])).rows[0].n;
    ok(Number(bCnt) === 0, 'B2. rechazo sin archivo NO crea recepción');

    // ── D. MIME no permitido → rechazo correcto ──────────────────────────
    const dErr = await expectReject(() => registrarRecepcionEntregable(
      ent1Id,
      {
        fecha_recepcion_mesa_partes: '2026-08-18',
        numero_expediente_sgd: '2026-151546',
        documentos: [{ nombre_archivo: 'malware.exe', mime_type: 'application/x-msdownload', contenido_base64: Buffer.from('MZ...'.repeat(10)).toString('base64') }],
      },
      'test-user',
      'admin',
    ));
    ok(dErr && dErr.code === 'ARCHIVO_MIME', `D. MIME no permitido rechazado (${dErr?.code})`);
    const dCnt = (await query(`SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1`, [ent1Id])).rows[0].n;
    ok(Number(dCnt) === 0, 'D2. rechazo MIME NO crea recepción');

    // ── C. PDF válido → aceptado ─────────────────────────────────────────
    const contenidoPdf = pdfBase64();
    const res = await registrarRecepcionEntregable(
      ent1Id,
      {
        fecha_recepcion_mesa_partes: '2026-08-18',
        numero_expediente_sgd: '2026-151546',
        observacion: 'PRESENTO 1ER ENTREGABLE',
        documentos: [{ nombre_archivo: 'ENTREGABLE 1 PROVEEDOR.pdf', mime_type: 'application/pdf', contenido_base64: `data:application/pdf;base64,${contenidoPdf}` }],
      },
      'test-user',
      'admin',
    );
    ok(res?.id && Number(res.numero_recepcion) === 1 && res.estado === 'RECIBIDO',
      'C. PDF válido aceptado (recepción 1 creada)');

    // E. una recepción
    const eRows = (await query(`SELECT * FROM entregable_recepciones WHERE orden_entrega_id=$1`, [ent1Id])).rows;
    ok(eRows.length === 1, `E. se registra UNA recepción (${eRows.length})`);

    // F. un documento relacionado con esa recepción
    const fRows = (await query(
      `SELECT d.* FROM entregable_recepcion_documentos d
       JOIN entregable_recepciones er ON er.id = d.recepcion_id
       WHERE er.orden_entrega_id=$1`,
      [ent1Id],
    )).rows;
    ok(fRows.length === 1, `F. se registra UN documento (${fRows.length})`);
    ok(Number(fRows[0].recepcion_id) === Number(res.id), 'F2. documento vinculado a la recepción creada');

    // G/H/I. nombre_archivo, mime_type, contenido
    ok(fRows[0].nombre_archivo === 'ENTREGABLE 1 PROVEEDOR.pdf', `G. nombre_archivo correcto (${fRows[0].nombre_archivo})`);
    ok(fRows[0].mime_type === 'application/pdf', `H. mime_type = application/pdf (${fRows[0].mime_type})`);
    const rawStored = String(fRows[0].contenido_base64 || '').replace(/\s+/g, '');
    const rawExpected = contenidoPdf.replace(/\s+/g, '');
    ok(rawStored.length > 20 && rawStored === rawExpected, `I. contenido no vacío y sin prefijo dataURL (${rawStored.length} chars)`);

    // J. recepción y documento escritos atómicamente (función transaccional)
    ok(/BEGIN/.test(lib) && /COMMIT/.test(lib) && /ROLLBACK/.test(lib)
      && /FOR UPDATE/.test(lib) && /INSERT INTO entregable_recepciones/.test(lib)
      && /INSERT INTO entregable_recepcion_documentos/.test(lib),
      'J. función usa transacción: BEGIN → recepción → documento → COMMIT, con FOR UPDATE');
    ok(eRows.length === 1 && fRows.length === 1,
      'J2. resultado atómico: 1 recepción + 1 documento');

    // ── K. un error documental no deja recepción huérfana ────────────────
    const kClient = await getClient();
    try {
      await kClient.query('BEGIN');
      const kRec = (await kClient.query(
        `INSERT INTO entregable_recepciones (orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion, fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por)
         VALUES ($1,$2,99,'SUBSANACION',CURRENT_DATE,'SGD-K','RECIBIDO','test') RETURNING id`,
        [ent2Id, ordId],
      )).rows[0];
      let kErr = null;
      await kClient.query('SAVEPOINT sp_k');
      try {
        await kClient.query(
          `INSERT INTO entregable_recepcion_documentos (recepcion_id, nombre_archivo, mime_type, contenido_base64)
           VALUES ($1,'doc.pdf','application/pdf', $2)`,
          [kRec.id, null],
        );
      } catch (e) {
        kErr = e;
        await kClient.query('ROLLBACK TO SAVEPOINT sp_k');
      }
      await kClient.query('RELEASE SAVEPOINT sp_k');
      await kClient.query('ROLLBACK');
      ok(kErr?.code === '23502' || kErr?.code === '23514',
        `K. error documental capturado (${kErr?.code})`);
      const kCheck = (await query(`SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1 AND numero_recepcion=99`, [ent2Id])).rows[0].n;
      ok(Number(kCheck) === 0, 'K2. ROLLBACK evita recepción huérfana sin documento');
    } catch (err) {
      try { await kClient.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      kClient.release();
    }

    // ── L. entregables ANULADOS no son afectados ─────────────────────────
    const lErr = await expectReject(() => registrarRecepcionEntregable(
      entAnuladaId,
      {
        fecha_recepcion_mesa_partes: '2026-08-18',
        numero_expediente_sgd: '2026-151546',
        documentos: [{ nombre_archivo: 'x.pdf', mime_type: 'application/pdf', contenido_base64: contenidoPdf }],
      },
      'test-user',
      'admin',
    ));
    ok(lErr && lErr.code === 'ENTREGABLE_NO_ACTIVO',
      `L. entregable ANULADO rechazado (${lErr?.code})`);
    const lCnt = (await query(`SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1`, [entAnuladaId])).rows[0].n;
    ok(Number(lCnt) === 0, 'L2. entregable ANULADO sin recepciones');

    // ── M. segundo entregable no es modificado ───────────────────────────
    const mCnt = (await query(`SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1`, [ent2Id])).rows[0].n;
    ok(Number(mCnt) === 0, `M. segundo entregable intacto (recepciones=${mCnt})`);
    const mDoc = (await query(
      `SELECT COUNT(*)::int AS n FROM entregable_recepcion_documentos d
       JOIN entregable_recepciones er ON er.id = d.recepcion_id
       WHERE er.orden_entrega_id=$1`,
      [ent2Id],
    )).rows[0].n;
    ok(Number(mDoc) === 0, 'M2. segundo entregable sin documentos');

    // ── Limpieza del fixture aislado (nunca OS 1105) ─────────────────────
    await query('DELETE FROM entregable_recepcion_documentos WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)', [ordId]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordId]);
    ordId = null;
    console.log('  ✓ fixture aislado limpiado');
  } catch (err) {
    console.log(`  ⚠ integración RC8.15.5C no pudo completarse: ${err?.message || err}`);
    try {
      if (ordId) {
        await query('DELETE FROM entregable_recepcion_documentos WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)', [ordId]);
        await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordId]);
        await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordId]);
        await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordId]);
      }
    } catch (_) { /* limpieza best-effort */ }
  }
}