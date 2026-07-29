/**
 * Diagnóstico no destructivo de inconsistencias de estado global.
 * Genera reports/diagnostico-estados-globales.json y .md
 * No modifica datos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeEstadoCode,
  getUnknownEstadoCodes,
  clearUnknownEstadoCodes,
} from '../shared/estadoExpedienteCatalog.js';
import { resolveEstadoExpedienteVigente as resolve } from '../shared/estadoExpedienteVigente.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const reportsDir = path.join(root, 'reports');

clearUnknownEstadoCodes();

const hallazgos = {
  generado_at: new Date().toISOString(),
  modo: 'diagnostico_no_destructivo',
  notas: [
    'Sin conexión DB forzada: analiza reglas del resolvedor y casos sintéticos.',
    'Para auditoría en vivo, ejecutar con DATABASE_URL y flag --live (opcional futuro).',
  ],
  inconsistencias: [],
  aliases_historicos: [],
  codigos_desconocidos: [],
  reglas_prioridad: [],
};

// Casos sintéticos que reproducen el bug histórico
const casos = [
  {
    id: 'bug-bandeja-ccp-vs-orden',
    desc: 'Orden notificada pero evidencia solo CCP (bug histórico bandejas)',
    evidencia_parcial: { codigo_ccp: 'C1', ccp_activo: true },
    evidencia_completa: {
      codigo_ccp: 'C1',
      ccp_activo: true,
      orden_id: 9,
      orden_estado: 'ORDEN_NOTIFICADA',
      enviado_proveedor_at: '2026-07-20',
    },
  },
  {
    id: 'alias-orden-enviada',
    desc: 'Código histórico ORDEN_ENVIADA',
    evidencia_completa: { orden_estado: 'ORDEN_ENVIADA', codigo_ccp: 'C' },
  },
  {
    id: 'alias-ccp-registrado',
    desc: 'Código histórico CCP_REGISTRADO',
    evidencia_completa: { estado_ccp: 'CCP_REGISTRADO', codigo_ccp: 'C' },
  },
];

for (const c of casos) {
  if (c.evidencia_parcial && c.evidencia_completa) {
    const parcial = resolve(c.evidencia_parcial);
    const completa = resolve(c.evidencia_completa);
    if (parcial.codigo !== completa.codigo) {
      hallazgos.inconsistencias.push({
        id: c.id,
        tipo: 'evidencia_incompleta_en_bandeja',
        descripcion: c.desc,
        estado_sin_orden: { codigo: parcial.codigo, label: parcial.label },
        estado_con_orden: { codigo: completa.codigo, label: completa.label },
        correccion: 'Usar loadEstadoExpedienteEvidenceByIds en todas las bandejas',
      });
    }
  }
  if (c.evidencia_completa?.orden_estado === 'ORDEN_ENVIADA') {
    const v = resolve(c.evidencia_completa);
    hallazgos.aliases_historicos.push({
      codigo_historico: 'ORDEN_ENVIADA',
      codigo_canonico: v.codigo,
      label: v.label,
    });
  }
  if (c.evidencia_completa?.estado_ccp === 'CCP_REGISTRADO') {
    const v = resolve(c.evidencia_completa);
    hallazgos.aliases_historicos.push({
      codigo_historico: 'CCP_REGISTRADO',
      codigo_canonico: v.codigo,
      label: v.label,
    });
  }
}

// Prioridades documentadas
hallazgos.reglas_prioridad = [
  'ORDEN_RESUELTA > EXPEDIENTE_DERIVADO_PAGO > ORDEN_NOTIFICADA > ORDEN_REGISTRADA > CCP_REGISTRADA',
];

normalizeEstadoCode('CODIGO_RARO_DIAG');
hallazgos.codigos_desconocidos = getUnknownEstadoCodes();

// Intento live opcional
const live = process.argv.includes('--live');
if (live) {
  try {
    const { loadEstadoExpedienteEvidenceByIds } = await import('../server/lib/estadoExpedienteEvidence.js');
    const { query } = await import('../server/db.js');
    const { rows } = await query(`
      SELECT DISTINCT ON (oc.requerimiento_id)
        oc.requerimiento_id,
        oc.estado AS orden_estado,
        oc.enviado_proveedor_at,
        cod.codigo_ccp
      FROM ordenes_contratacion oc
      LEFT JOIN ccp_codigos cod
        ON cod.requerimiento_id = oc.requerimiento_id AND cod.estado = 'ACTIVO'
      WHERE oc.enviado_proveedor_at IS NOT NULL
         OR UPPER(COALESCE(oc.estado,'')) IN ('ORDEN_NOTIFICADA','ORDEN_ENVIADA','ENVIADO_PROVEEDOR')
      ORDER BY oc.requerimiento_id, oc.id DESC
      LIMIT 200
    `);
    const ids = rows.map((r) => r.requerimiento_id);
    const map = await loadEstadoExpedienteEvidenceByIds(ids);
    for (const r of rows) {
      const ev = map.get(Number(r.requerimiento_id)) || {};
      const soloCcp = resolve({
        codigo_ccp: r.codigo_ccp || ev.codigo_ccp,
        ccp_activo: !!(r.codigo_ccp || ev.codigo_ccp),
      });
      const full = resolve({ ...ev, codigo_ccp: r.codigo_ccp || ev.codigo_ccp });
      if (soloCcp.codigo === 'CCP_REGISTRADA'
        && ['ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'ORDEN_RESUELTA'].includes(full.codigo)) {
        hallazgos.inconsistencias.push({
          id: `live-req-${r.requerimiento_id}`,
          tipo: 'orden_notificada_vs_ccp_en_bandeja',
          requerimiento_id: r.requerimiento_id,
          sin_evidencia_orden: soloCcp.codigo,
          con_evidencia_orden: full.codigo,
        });
      }
      if (normalizeEstadoCode(r.orden_estado) === 'ORDEN_NOTIFICADA'
        && String(r.orden_estado || '').toUpperCase() === 'ORDEN_ENVIADA') {
        hallazgos.aliases_historicos.push({
          requerimiento_id: r.requerimiento_id,
          codigo_historico: r.orden_estado,
          codigo_canonico: 'ORDEN_NOTIFICADA',
        });
      }
    }
    hallazgos.notas.push(`Live: analizados ${rows.length} expedientes con orden.`);
  } catch (err) {
    hallazgos.notas.push(`Live no disponible: ${err.message}`);
  }
}

fs.mkdirSync(reportsDir, { recursive: true });
const jsonPath = path.join(reportsDir, 'diagnostico-estados-globales.json');
const mdPath = path.join(reportsDir, 'diagnostico-estados-globales.md');
fs.writeFileSync(jsonPath, JSON.stringify(hallazgos, null, 2), 'utf8');

const md = `# Diagnóstico de estados globales SGC

Generado: ${hallazgos.generado_at}

## Resumen

- Inconsistencias: **${hallazgos.inconsistencias.length}**
- Aliases históricos detectados: **${hallazgos.aliases_historicos.length}**
- Códigos desconocidos: **${hallazgos.codigos_desconocidos.length}**

## Inconsistencias

${hallazgos.inconsistencias.map((i) => `- **${i.id}** (${i.tipo}): ${i.descripcion || ''}
  - Sin orden: \`${i.estado_sin_orden?.codigo || i.sin_evidencia_orden || ''}\`
  - Con orden: \`${i.estado_con_orden?.codigo || i.con_evidencia_orden || ''}\`
  - Corrección: ${i.correccion || 'cargar evidencia completa'}`).join('\n') || '_Ninguna_'}

## Aliases históricos

${hallazgos.aliases_historicos.map((a) => `- \`${a.codigo_historico}\` → \`${a.codigo_canonico}\` (${a.label || ''})`).join('\n') || '_Ninguno_'}

## Códigos desconocidos

${hallazgos.codigos_desconocidos.map((c) => `- \`${c}\``).join('\n') || '_Ninguno_'}

## Notas

${hallazgos.notas.map((n) => `- ${n}`).join('\n')}
`;

fs.writeFileSync(mdPath, md, 'utf8');
console.log(`Diagnóstico escrito:\n- ${jsonPath}\n- ${mdPath}`);
console.log(`Inconsistencias: ${hallazgos.inconsistencias.length}`);
