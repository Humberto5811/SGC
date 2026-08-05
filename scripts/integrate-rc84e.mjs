/**
 * RC8.4E — Integration script: adds enrichEstadoResponsableForBandeja to all 12 bandejas.
 * Run: node scripts/integrate-rc84e.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Files and their enrichment points
const bandejas = [
  // Already enriched: Consultas y Observaciones, Recepción de Cotizaciones, Validaciones
  // Remaining:
  {
    file: 'server/lib/cuadroComparativo.js',
    fnName: 'listarCuadroComparativoExpedientes',
    hasImport: false,
    needsImport: true,
    enrichAfter: 'return result;',  // find this line and add enrich call before it
    idField: 'requerimiento_id',
  },
  {
    file: 'server/lib/ccpCertificacion.js',
    fnName: 'listarBandejaCcp',
    hasImport: false,
    needsImport: true,
    enrichAfter: null,  // need to find the return
    idField: 'requerimiento_id',
  },
  {
    file: 'server/lib/ordenesContratacion.js',
    fnName: 'listarBandejaOrdenes',
    hasImport: false,
    needsImport: true,
    enrichAfter: null,
    idField: 'requerimiento_id',
  },
  {
    file: 'server/lib/recepcionBienes.js',
    fnName: 'listarBandejaRecepcionBienes',
    hasImport: false,
    needsImport: true,
    enrichAfter: null,
    idField: 'requerimiento_id',
  },
];

function ensureImport(content) {
  if (content.includes("enrichEstadoResponsableForBandeja")) return content;
  
  // Add after the last import statement
  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) {
      lastImportIdx = i;
    }
  }
  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, 
      "import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';");
  } else {
    // No imports found, add at top after any comments
    lines.splice(0, 0,
      "import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';");
  }
  return lines.join('\n');
}

function findReturnInFunction(content, fnName) {
  // Find the function body by matching braces
  const fnRegex = new RegExp(`(export async function ${fnName}[^{]*\\{)([\\s\\S]*?)(\\n\\})`, 'm');
  const match = content.match(fnRegex);
  if (!match) return null;
  
  const fnBody = match[2];
  const fnBodyLines = fnBody.split('\n');
  
  // Find the last return statement
  for (let i = fnBodyLines.length - 1; i >= 0; i--) {
    if (/^\s*return\s/.test(fnBodyLines[i])) {
      return { line: fnBodyLines[i], idx: i, body: fnBody, bodyLines: fnBodyLines };
    }
  }
  
  // No return found, find the last statement before closing brace
  for (let i = fnBodyLines.length - 1; i >= 0; i--) {
    if (fnBodyLines[i].trim()) {
      return { line: fnBodyLines[i], idx: i, body: fnBody, bodyLines: fnBodyLines };
    }
  }
  
  return null;
}

function addEnrichmentToFunction(content, fnName, idField) {
  // Find the function and its return statement
  const fnStart = content.indexOf(`export async function ${fnName}`);
  if (fnStart === -1) {
    console.log(`  WARN: function ${fnName} not found`);
    return content;
  }
  
  // Already enriched?
  const fnEnd = content.indexOf('export async function ', fnStart + 1);
  const fnSlice = fnEnd > 0 ? content.substring(fnStart, fnEnd) : content.substring(fnStart);
  if (fnSlice.includes('enrichEstadoResponsableForBandeja')) {
    console.log(`  Already enriched: ${fnName}`);
    return content;
  }
  
  // Find the last return/map within the function
  const fnBodyStart = content.indexOf('{', fnStart) + 1;
  const fnBodyEnd = findMatchingBrace(content, fnBodyStart - 1);
  if (!fnBodyEnd) {
    console.log(`  WARN: could not find function body end for ${fnName}`);
    return content;
  }
  
  let fnBody = content.substring(fnBodyStart, fnBodyEnd);
  
  // Find the last return statement
  const returnRegex = /\n(\s*)(return\s[^;]+;)/g;
  let lastMatch = null;
  let match;
  while ((match = returnRegex.exec(fnBody)) !== null) {
    lastMatch = match;
  }
  
  if (!lastMatch) {
    console.log(`  WARN: no return statement found in ${fnName}`);
    return content;
  }
  
  const indent = lastMatch[1];
  const enrichmentCode = `\n${indent}// RC8.4E — anexar estado_responsable_vigente en batch\n${indent}await enrichEstadoResponsableForBandeja(result);\n`;
  
  // Insert before the return
  fnBody = fnBody.substring(0, lastMatch.index + 1) + enrichmentCode + fnBody.substring(lastMatch.index + 1);
  
  // Reconstruct
  const before = content.substring(0, fnBodyStart);
  const after = content.substring(fnBodyEnd);
  return before + fnBody + after;
}

function findMatchingBrace(str, startIdx) {
  let depth = 1;
  let i = startIdx + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === '{') depth++;
    if (str[i] === '}') depth--;
    i++;
  }
  return depth === 0 ? i - 1 : null;
}

for (const bandeja of bandejas) {
  const filePath = join(root, bandeja.file);
  console.log(`\nProcessing ${bandeja.file} -> ${bandeja.fnName}...`);
  
  try {
    let content = readFileSync(filePath, 'utf8');
    
    if (bandeja.needsImport) {
      content = ensureImport(content);
    }
    
    content = addEnrichmentToFunction(content, bandeja.fnName, bandeja.idField);
    
    writeFileSync(filePath, content, 'utf8');
    console.log(`  OK: ${bandeja.fnName} enriched`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}

console.log('\nDone!');