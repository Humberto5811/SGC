/**
 * Routers de importación UPSERT para catálogos simples de Registro de Datos.
 */
import { importEngineRouter } from '../bulkImport.js';
import {
  cleanString, normalizeRowKeys, normalizeNumber, normalizeDateValue,
} from '../lib/importNormalize.js';

const toBool = (v) => v === true || v === 1 || ['1', 'si', 'sí', 'x', 'true'].includes(String(v).toLowerCase());

export const metasImportRouter = importEngineRouter({
  table: 'metas',
  catalogo: 'metas',
  columns: ['codigo', 'nombre', 'descripcion', 'estado'],
  conflictKeys: ['codigo'],
  transform: (raw) => normalizeRowKeys(raw),
  validate: (row) => (!cleanString(row.codigo) ? 'codigo requerido' : null),
  coerce: (row) => ({
    codigo: cleanString(row.codigo),
    nombre: cleanString(row.nombre),
    descripcion: cleanString(row.descripcion),
    estado: cleanString(row.estado) || 'Activo',
  }),
});

export const areasImportRouter = importEngineRouter({
  table: 'areas',
  catalogo: 'areas',
  columns: ['codigo', 'nombre', 'responsable', 'estado'],
  conflictKeys: ['codigo'],
  transform: (raw) => normalizeRowKeys(raw),
  validate: (row) => (!cleanString(row.codigo) ? 'codigo requerido' : null),
  coerce: (row) => ({
    codigo: cleanString(row.codigo),
    nombre: cleanString(row.nombre),
    responsable: cleanString(row.responsable),
    estado: cleanString(row.estado) || 'Activo',
  }),
});

export const ordenesImportRouter = importEngineRouter({
  table: 'ordenes',
  catalogo: 'ordenes',
  columns: ['numero', 'tipo', 'proveedor', 'ruc', 'monto', 'fecha', 'estado'],
  conflictKeys: ['numero'],
  transform: (raw) => normalizeRowKeys(raw),
  validate: (row) => (!cleanString(row.numero) ? 'numero requerido' : null),
  coerce: (row) => ({
    numero: cleanString(row.numero),
    tipo: cleanString(row.tipo),
    proveedor: cleanString(row.proveedor),
    ruc: cleanString(row.ruc),
    monto: normalizeNumber(row.monto, 0),
    fecha: normalizeDateValue(row.fecha) || null,
    estado: cleanString(row.estado) || 'Registrado',
  }),
});

export const configuracionImportRouter = importEngineRouter({
  table: 'configuracion_doc',
  catalogo: 'configuracion_doc',
  columns: ['objeto', 'nombre', 'descripcion', 'obligatorio', 'estado'],
  conflictKeys: ['objeto', 'nombre'],
  transform: (raw) => normalizeRowKeys(raw),
  validate: (row) => {
    if (!cleanString(row.objeto)) return 'objeto requerido';
    if (!cleanString(row.nombre)) return 'nombre requerido';
    return null;
  },
  coerce: (row) => ({
    objeto: cleanString(row.objeto),
    nombre: cleanString(row.nombre),
    descripcion: cleanString(row.descripcion),
    obligatorio: toBool(row.obligatorio),
    estado: cleanString(row.estado) || 'Activo',
  }),
});
