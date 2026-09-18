/**
 * RC8.17.8H6-A3 — Invitaciones bandeja: columna Etapa + celdas canónicas + layout compacto.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderBandejaCanonicoEtapaEstadoRespCells,
} from '../src/utils/bandejaExpedienteColumns.js';
import { actosBandejaStyles } from '../src/utils/actosModals.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-A3 — Invitaciones bandeja compacta ===\n');

const rowErv = {
  id: 43,
  codigo: 'REQ-00043',
  bandeja_contrato: {
    etapa: { codigo: 'INVITACIONES', label: 'Invitaciones' },
    estado: { codigo: 'EN_TRAMITE', label: 'En trámite' },
    responsable: {
      tipo: 'PERSONA',
      nombre: 'CRISOSTOMO REYNA JUAN ULISES',
      usuarioId: 260,
    },
    dias_en_estado: 1,
  },
};

console.log('A/B — Etapa | Estado | Responsable desde bandeja_contrato (ERV)');
const cells = renderBandejaCanonicoEtapaEstadoRespCells(rowErv);
ok(cells.includes('req-col-etapa'), 'A0 celda Etapa presente');
ok(cells.includes('req-col-estado-cell'), 'A0 celda Estado presente');
ok(cells.includes('req-col-resp'), 'A0 celda Responsable presente');
ok(/Invitaciones/i.test(cells), 'A1 Etapa = Invitaciones');
ok(/En trámite/i.test(cells), 'A2 Estado = En trámite');
ok(/CRISOSTOMO REYNA/i.test(cells), 'A3 Responsable analista');

console.log('\nE — Responsable con title (tooltip)');
ok(/title="CRISOSTOMO REYNA JUAN ULISES"/.test(cells), 'E1 title nombre completo');

console.log('\nC/D — Vista: columna Etapa en headers y estilos compactos');
const invSrc = await readFile(new URL('../src/views/contratacion/invitacionesView.js', import.meta.url), 'utf8');
const etapaIdx = invSrc.indexOf("sortableTh('Etapa'");
const estadoIdx = invSrc.indexOf("sortableTh('Estado'");
const respIdx = invSrc.indexOf("sortableTh('Responsable'");
ok(etapaIdx > 0 && estadoIdx > etapaIdx && respIdx > estadoIdx, 'C0 headers Etapa→Estado→Responsable juntos');
ok(invSrc.includes('renderBandejaCanonicoEtapaEstadoRespCells'), 'C1 filas usan helper canónico (no inferencia local)');
ok(invSrc.includes('compact: true'), 'D0 summary/filtros compactos (patrón Registro)');
ok(invSrc.includes('sgc-registro-compact'), 'D1 contenedor compacto');

const css = actosBandejaStyles();
ok(css.includes('inv-bandeja-wrap .req-col-etapa'), 'C2 estilos compactos Etapa');
ok(css.includes('thead th') && css.includes('white-space: normal'), 'C3 encabezados con wrap (sin superposición)');
ok(css.includes('text-overflow: ellipsis'), 'C4 celdas con ellipsis');

console.log('\n=== H6-A3 OK ===\n');
