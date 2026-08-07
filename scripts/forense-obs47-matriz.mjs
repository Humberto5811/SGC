/**
 * RC8.8 / Obs47 — Matriz forense (solo lectura) REQ-00001 / REQ-00002.
 */
import { query } from '../server/db.js';
import { resolveEstadoResponsableBatch } from '../server/lib/resolvedorEstadoResponsable.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import { listarBandejaCcp } from '../server/lib/ccpCertificacion.js';
import { listarBandejaOrdenes } from '../server/lib/ordenesContratacion.js';
import { listarRecepcionBienes } from '../server/lib/recepcionBienes.js';
import { listarCuadroComparativoExpedientes } from '../server/lib/cuadroComparativo.js';
import { listarValidacionesExpedientes } from '../server/lib/validacionesCotizacion.js';
import { getEstadoCatalogEntry } from '../src/ui/workflow/estadoCatalogo.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { renderEstadoBadgeHtml } from '../src/ui/workflow/EstadoBadge.js';
import { renderResponsableCellHtml } from '../src/utils/bandejaUi.js';

function pick(c) {
  if (!c) return null;
  const cat = getEstadoCatalogEntry(c.estadoCodigo, c.estadoLabel);
  return {
    estadoCodigo: c.estadoCodigo,
    estadoLabel: c.estadoLabel,
    etapaCodigo: c.etapaCodigo,
    etapaLabel: c.etapaLabel,
    responsableTipo: c.responsableTipo,
    usuarioId: c.responsableUsuarioId,
    nombre: c.responsableNombre || c.responsableUsername || null,
    unidad: c.responsableUnidad || null,
    colorCategoria: cat.categoria,
    fuente: c.responsableFuente || c.fuente || null,
  };
}

function findIn(list, codigo, keys = ['requerimiento_codigo', 'codigo', 'numero']) {
  return (list || []).find((r) => keys.some((k) => String(r[k] || '') === codigo));
}

const { rows: reqs } = await query(`
  SELECT id, codigo, tipo, estado_actual, responsable_actual
  FROM requerimientos WHERE codigo IN ('REQ-00001','REQ-00002') ORDER BY codigo
`);
const ids = reqs.map((r) => r.id);
const byCode = Object.fromEntries(reqs.map((r) => [r.codigo, r]));

const { rows: vig } = await query(`
  SELECT r.codigo, v.estado_codigo, v.estado_label, v.etapa_codigo, v.etapa_label,
         v.responsable_tipo, v.responsable_usuario_id, v.responsable_unidad,
         v.responsable_fuente, v.version, u.username, u.nombre
  FROM expediente_estado_vigente v
  JOIN requerimientos r ON r.id = v.requerimiento_id
  LEFT JOIN usuarios u ON u.id = v.responsable_usuario_id
  WHERE r.codigo = ANY($1::text[])
  ORDER BY r.codigo
`, [reqs.map((r) => r.codigo)]);

console.log('\n========== PERSISTIDO (fuente única) ==========');
for (const v of vig) {
  console.log(JSON.stringify({
    codigo: v.codigo,
    estadoCodigo: v.estado_codigo,
    estadoLabel: v.estado_label,
    etapaCodigo: v.etapa_codigo,
    etapaLabel: v.etapa_label,
    responsableTipo: v.responsable_tipo,
    usuarioId: v.responsable_usuario_id,
    username: v.username,
    nombre: v.nombre,
    unidad: v.responsable_unidad,
    fuente: v.responsable_fuente,
    version: v.version,
  }, null, 2));
}

const resolved = await resolveEstadoResponsableBatch(ids);
console.log('\n========== resolveEstadoResponsableBatch ==========');
for (const r of reqs) {
  console.log(r.codigo, JSON.stringify(pick(resolved.get(r.id)), null, 2));
}

const endpoints = [];

async function sample(name, loader, codigo) {
  let rows = [];
  let err = null;
  try {
    const out = await loader();
    rows = Array.isArray(out) ? out : (out?.rows || out?.data || out?.items || []);
  } catch (e) {
    err = e.message;
  }
  const hit = findIn(rows, codigo);
  let contrato = null;
  if (hit?.estado_responsable_vigente) {
    contrato = pick(hit.estado_responsable_vigente);
  } else if (hit) {
    // enrich local if missing
    const rid = hit.requerimiento_id || hit.id || byCode[codigo]?.id;
    if (rid) {
      const m = await resolveEstadoResponsableBatch([rid]);
      contrato = pick(m.get(Number(rid)));
    }
  }
  const adapted = hit ? adaptEstadoResponsable(hit) : null;
  const badgeClass = adapted
    ? (renderEstadoBadgeHtml(adapted).match(/estado-badge--|badge--|sgc-estado|categoria-|cat-/g) || []).join(',')
    : null;
  endpoints.push({
    vista: name,
    codigo,
    presente: !!hit,
    error: err,
    contrato,
    adapted: adapted ? {
      estadoCodigo: adapted.estadoCodigo,
      estadoLabel: adapted.estadoLabel,
      etapaLabel: adapted.etapaLabel,
      responsableDisplay: adapted.responsableDisplay,
      categoria: adapted.categoria,
      fuente: adapted.fuente,
    } : null,
    badgeHints: badgeClass,
    htmlRespSnippet: hit ? String(renderResponsableCellHtml(hit)).slice(0, 180) : null,
  });
}

for (const codigo of ['REQ-00001', 'REQ-00002']) {
  await sample('CCP', () => listarBandejaCcp(), codigo);
  await sample('Registro Órdenes', () => listarBandejaOrdenes(), codigo);
  await sample('Recepción Bienes', () => listarRecepcionBienes({}), codigo);
  await sample('Cuadro Comparativo', () => listarCuadroComparativoExpedientes({}), codigo);
  await sample('Validaciones', () => listarValidacionesExpedientes({}), codigo);
}

// Listados genéricos con enrich (trazabilidad / registro)
{
  const { rows } = await query(`
    SELECT * FROM requerimientos WHERE codigo = ANY($1::text[])
  `, [['REQ-00001', 'REQ-00002']]);
  await enrichEstadoResponsableForBandeja(rows, 'id');
  for (const row of rows) {
    endpoints.push({
      vista: 'enrichBatch (Registro/Eval/DEC/Prog/CM/Inv/traz)',
      codigo: row.codigo,
      presente: true,
      contrato: pick(row.estado_responsable_vigente),
      adapted: (() => {
        const a = adaptEstadoResponsable(row);
        return {
          estadoCodigo: a.estadoCodigo,
          estadoLabel: a.estadoLabel,
          etapaLabel: a.etapaLabel,
          responsableDisplay: a.responsableDisplay,
          categoria: a.categoria,
          fuente: a.fuente,
        };
      })(),
    });
  }
}

console.log('\n========== MATRIZ POR VISTA ==========');
console.log(JSON.stringify(endpoints, null, 2));

// Divergencias: mismo codigo, distintos estadoCodigo entre vistas presentes
console.log('\n========== DIVERGENCIAS ==========');
for (const codigo of ['REQ-00001', 'REQ-00002']) {
  const rows = endpoints.filter((e) => e.codigo === codigo && e.presente && e.contrato);
  const keys = rows.map((r) => `${r.vista}|${r.contrato.estadoCodigo}|${r.contrato.etapaCodigo}|${r.contrato.responsableTipo}|${r.contrato.usuarioId}|${r.contrato.unidad}|${r.contrato.colorCategoria}`);
  const uniq = [...new Set(keys)];
  console.log(codigo, 'contratos_unicos=', uniq.length);
  uniq.forEach((u) => console.log('  ', u));
  if (uniq.length > 1) console.log('  !! DIVERGE');
}

process.exit(0);
