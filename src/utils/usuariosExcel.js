import * as XLSX from 'xlsx';

const HEADERS_ROW1 = [
  'DNI empleado', 'Apellido paterno', 'Apellido materno', 'Nombres',
  'Centro_costo', 'Nombre_depend', 'Centro', 'N° Celular', 'Correo electrónico', 'Estado',
];

function normalizeDni(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  return String(v).trim();
}

function normalizeEstado(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['inactivo', '0', 'no', 'false'].includes(s)) return 'Inactivo';
  return 'Activo';
}

function splitApellidos(apellidos) {
  const parts = String(apellidos || '').trim().split(/\s+/).filter(Boolean);
  return { paterno: parts[0] || '', materno: parts.slice(1).join(' ') };
}

/** Parsea archivo Excel del reporte de personal (formato adjunto por el usuario). */
export function parseUsuariosExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const usuarios = [];
  const errores = [];

  let startIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const c0 = String(rows[i][0] || '').toLowerCase();
    if (c0.includes('dni')) { startIdx = i + 2; break; }
  }
  if (startIdx < 2) startIdx = 3;

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];
    const dni = normalizeDni(r[0]);
    if (!dni) continue;

    const paterno = String(r[1] || '').trim();
    const materno = String(r[2] || '').trim();
    const nombres = String(r[3] || '').trim();
    if (!paterno && !materno && !nombres) {
      errores.push({ fila: i + 1, dni, error: 'Fila sin apellidos ni nombres' });
      continue;
    }

    usuarios.push({
      dni,
      apellidos: [paterno, materno].filter(Boolean).join(' ').trim(),
      apellido_paterno: paterno,
      apellido_materno: materno,
      nombres,
      codigo_centro_costo: String(r[4] || '').trim(),
      descripcion_area: String(r[5] || '').trim(),
      centro: String(r[6] || '').trim(),
      telefono: String(r[7] || '').trim(),
      email: String(r[8] || '').trim(),
      estado: normalizeEstado(r[9] || 'Activo'),
      rol: 'usuario',
    });
  }

  return { usuarios, errores, totalFilas: rows.length - startIdx };
}

/** Genera libro Excel con el mismo formato del reporte de personal. */
export function buildUsuariosExcel(usuarios) {
  const data = [];
  data.push([]);
  data.push([...HEADERS_ROW1]);
  data.push([]);

  (usuarios || []).forEach((u) => {
    const { paterno, materno } = splitApellidos(u.apellidos);
    data.push([
      u.dni || '',
      paterno,
      materno,
      u.nombres || '',
      u.codigo_centro_costo || '',
      u.descripcion_area || '',
      u.centro || '',
      u.telefono || '',
      u.email || '',
      u.activo === false ? 'Inactivo' : 'Activo',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
    { wch: 18 }, { wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Personal');
  return wb;
}

export function downloadUsuariosExcel(usuarios, filename = 'reporte_usuarios.xlsx') {
  const wb = buildUsuariosExcel(usuarios);
  XLSX.writeFile(wb, filename);
}

export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseUsuariosExcel(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}
