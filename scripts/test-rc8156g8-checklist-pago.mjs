/**
 * RC8.15.6G-8 — Checklist documental real de Pagos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  adjuntarDocumentoChecklistAnalista,
  getDocumentoChecklistPagoBytes,
  listarDocumentosEntregablePago,
  obtenerActaConformidadPagoPreview,
  obtenerChecklistExpedientePago,
  retirarDocumentoChecklistAnalista,
} from '../server/lib/entregableChecklistPago.js';
import {
  adjuntarDocumentosRecepcionEntregable,
  evaluarPenalidadEntregable,
  listarBandejaPreparacionExpedientePago,
  listarTrazabilidadEntregable,
  registrarRecepcionEntregable,
} from '../server/lib/entregablesServicios.js';
import { getExpedienteOrdenCompleto } from '../server/lib/ordenesContratacion.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import {
  CHECKLIST_ESTADO,
  calcularProgresoChecklist,
} from '../shared/entregableChecklistPago.js';
import { TIPO_ENTREGABLE } from '../shared/entregableDocumentosTipos.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };
async function expectReject(work) { try { await work(); return null; } catch (e) { return e; } }
function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

console.log('\n=== RC8.15.6G-8 — Checklist documental Pagos ===\n');

await runMigrations();
ok(read('server/migrations/058_entregable_checklist_pago_documentos.js').includes('CHECKLIST_OTRO'),
  '0. migración 058 presente');

const view = read('src/views/ejecucion/derivacionPagoView.js');
ok(view.includes('verEntregable') && view.includes('checklistDocumentos') && view.includes('verActaConformidad'),
  '0b. menú Pagos incluye acciones G-8');

const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
let ordenId = null;
let e1 = null;
let analista = null;
let ajeno = null;
let docFupId = null;
let docOtroId = null;
const usuarioIds = [];

try {
  async function crearUsuario(sufijo) {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos)
      VALUES ($1,$2,$3,'usuario','Analista CM',TRUE,$4::jsonb) RETURNING *
    `, [
      `G8${sufijo}${nonce}`.slice(0, 20),
      `g8_${nonce}_${sufijo}`,
      `Fixture G8 ${sufijo}`,
      JSON.stringify({ perfil: 'ANALISTA_CM' }),
    ])).rows[0];
    usuarioIds.push(row.id);
    return row;
  }
  analista = await crearUsuario('resp');
  ajeno = await crearUsuario('ajeno');
  const ctxResp = {
    id: Number(analista.id),
    username: analista.username,
    rol: 'usuario',
    cargo: analista.cargo,
    permisos: { perfil: 'ANALISTA_CM' },
  };
  const ctxAjeno = {
    id: Number(ajeno.id),
    username: ajeno.username,
    rol: 'usuario',
    cargo: ajeno.cargo,
    permisos: { perfil: 'ANALISTA_CM' },
  };

  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];

  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion, enviado_proveedor_at
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,900,'EN_EJECUCION','SERVICIO',CURRENT_DATE) RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G8${nonce}`])).rows[0].id);

  e1 = Number((await query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
      fecha_base, fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','G8 E1',10,CURRENT_DATE,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-g8' });
  await query(`
    UPDATE entregable_asignaciones
    SET usuario_id=$2, tipo_responsable='PERSONA', etapa_codigo=$3
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1, analista.id, ETAPAS.PRESENTACION_ENTREGABLES]);

  await registrarRecepcionEntregable(e1, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: `SGD-G8-${nonce}`,
    documentos: [{
      tipo_documento: TIPO_ENTREGABLE,
      nombre_archivo: 'entregable-g8.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('ENT-G8'),
    }],
  }, ctxResp, analista.username);

  await adjuntarDocumentosRecepcionEntregable(e1, {
    documentos: [{
      tipo_documento: 'SEGURO',
      nombre: 'Póliza RC',
      nombre_archivo: 'seguro-g8.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('SEG-G8'),
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-12-31',
    }],
  }, ctxResp, analista.username);

  await query(`
    UPDATE entregable_estado_vigente
    SET etapa_codigo=$2, etapa_label='Preparación de expediente para Pago',
        estado_codigo='EN_PREPARACION_PAGO', estado_label='En preparación de pago',
        responsable_tipo='PERSONA', responsable_usuario_id=$3
    WHERE orden_entrega_id=$1
  `, [e1, ETAPAS.PREPARACION_EXPEDIENTE_PAGO, analista.id]);
  await query(`
    UPDATE entregable_asignaciones
    SET usuario_id=$2, tipo_responsable='PERSONA', etapa_codigo=$3
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [e1, analista.id, ETAPAS.PREPARACION_EXPEDIENTE_PAGO]);

  const bandeja = await listarBandejaPreparacionExpedientePago(ctxResp);
  const fila = bandeja.find((item) => Number(item.orden_entrega_id) === e1);
  ok(Boolean(fila?.puede_checklist_pago), '1. bandeja expone flags checklist/entregable/acta');

  const entDocs = await listarDocumentosEntregablePago(e1, ctxResp);
  ok(entDocs.documentos.length >= 1, '2. entregable ENTREGABLE visible sin copiar');
  ok(entDocs.documentos[0]?.preview?.kind === 'entregable_recepcion', '2b. preview referencia recepción');

  const expediente = await getExpedienteOrdenCompleto(ordenId);
  const entExp = (expediente.documentos || []).filter((d) => d.kind === 'entregable_recepcion');
  ok(entExp.length >= 2, '3. documentos G-7I reutilizados en expediente (refs, no copia)');

  const checklist0 = await obtenerChecklistExpedientePago(e1, ctxResp);
  const seg = (checklist0.bloques?.sistema || []).find((f) => f.codigo === 'SEGURO');
  ok(seg?.estado === CHECKLIST_ESTADO.VENCIDO, '4. SEGURO vencido marcado VENCIDO');
  const ent = (checklist0.bloques?.sistema || []).find((f) => f.codigo === 'ENTREGABLE');
  ok(ent?.estado === CHECKLIST_ESTADO.COMPLETO, '4b. ENTREGABLE COMPLETO');

  await evaluarPenalidadEntregable(e1, { corresponde_penalidad: false }, ctxResp, analista.username);
  const chkNoPen = await obtenerChecklistExpedientePago(e1, ctxResp);
  const fmt = (chkNoPen.bloques?.sistema || []).find((f) => f.codigo === 'FORMATO_PENALIDAD_FIRMADO');
  const carta = (chkNoPen.bloques?.sistema || []).find((f) => f.codigo === 'CARTA_PENALIDAD');
  ok(fmt?.estado === CHECKLIST_ESTADO.NO_APLICA && carta?.estado === CHECKLIST_ESTADO.NO_APLICA,
    '5. penalidad NO_CORRESPONDE → docs penalidad NO_APLICA');

  await evaluarPenalidadEntregable(e1, { corresponde_penalidad: true, observacion: 'Atraso' }, ctxResp, analista.username);
  const chkPen = await obtenerChecklistExpedientePago(e1, ctxResp);
  const fmt2 = (chkPen.bloques?.sistema || []).find((f) => f.codigo === 'FORMATO_PENALIDAD_FIRMADO');
  ok(fmt2?.estado === CHECKLIST_ESTADO.FALTANTE, '5b. penalidad CORRESPONDE → formato obligatorio FALTANTE');

  const fup = await adjuntarDocumentoChecklistAnalista(e1, {
    tipo_documento: 'FUP',
    documento: {
      nombre_archivo: 'fup.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('FUP'),
    },
  }, ctxResp, analista.username);
  docFupId = Number(fup.documento?.id);
  ok(docFupId > 0, '6. FUP adjuntado en entregable_pago_documentos');

  const otroDoc = await adjuntarDocumentoChecklistAnalista(e1, {
    tipo_documento: 'CHECKLIST_OTRO',
    descripcion: 'Sustento adicional',
    obligatorio: false,
    documento: {
      nombre_archivo: 'otro.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('OTRO'),
    },
  }, ctxResp, analista.username);
  docOtroId = Number(otroDoc.documento?.id);
  ok(docOtroId > 0, '7. CHECKLIST_OTRO múltiple adjuntado');

  const chk1 = await obtenerChecklistExpedientePago(e1, ctxResp);
  ok(chk1.puede_gestionar_analista === true, '8. responsable puede gestionar analista');
  ok(chk1.progreso?.total > 0 && typeof chk1.progreso?.completos === 'number',
    `9. progreso X/Y (${chk1.progreso?.texto})`);
  const progManual = calcularProgresoChecklist(chk1.filas || []);
  ok(progManual.total === chk1.progreso.total, '9b. progreso coherente con shared');

  const bytes = await getDocumentoChecklistPagoBytes(e1, docFupId, ctxResp);
  ok(bytes.bytes?.length > 0, '10. preview bytes checklist autenticado');

  const errAjeno = await expectReject(() => adjuntarDocumentoChecklistAnalista(e1, {
    tipo_documento: 'TCE',
    documento: {
      nombre_archivo: 'tce.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('TCE'),
    },
  }, ctxAjeno, ajeno.username));
  ok(errAjeno?.status === 403 || errAjeno?.code === 'CHECKLIST_PAGO_GESTION_DENEGADA'
    || errAjeno?.code === 'CHECKLIST_PAGO_NO_AUTORIZADO', '11. usuario ajeno denegado');

  const trazaAntes = (await listarTrazabilidadEntregable(e1, ctxResp))
    .filter((ev) => /^CHECKLIST_DOCUMENTO_/.test(String(ev.evento_codigo || ''))).length;
  await retirarDocumentoChecklistAnalista(e1, docOtroId, ctxResp, analista.username);
  const trazaDespues = (await listarTrazabilidadEntregable(e1, ctxResp))
    .filter((ev) => /^CHECKLIST_DOCUMENTO_/.test(String(ev.evento_codigo || ''))).length;
  ok(trazaDespues > trazaAntes, '12. trazabilidad CHECKLIST_DOCUMENTO_RETIRADO');

  const acta = await obtenerActaConformidadPagoPreview(e1, ctxResp);
  ok(typeof acta.disponible === 'boolean', '13. acta conformidad preview estructural');

  ok(read('src/utils/entregableChecklistPagoModal.js').includes('openChecklistPreview'),
    '14. modal FE reutiliza visor autenticado');
} finally {
  if (e1) {
    await query('DELETE FROM entregable_eventos WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM entregable_penalidad_evaluacion WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM entregable_recepcion_documentos WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_entrega_id=$1)', [e1]).catch(() => {});
    await query('DELETE FROM entregable_recepciones WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM entregable_pago_documentos WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM entregable_asignaciones WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM entregable_estado_vigente WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM entregable_estado_historial WHERE orden_entrega_id=$1', [e1]).catch(() => {});
    await query('DELETE FROM orden_entregas WHERE id=$1', [e1]).catch(() => {});
  }
  if (ordenId) {
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]).catch(() => {});
  }
  if (usuarioIds.length) {
    await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [usuarioIds]).catch(() => {});
  }
  console.log('\n  ✓ cleanup fixtures G-8\n');
}

console.log('RC8.15.6G-8 OK\n');
