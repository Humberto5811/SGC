/**
 * Script de reparación MANUAL — NO ejecutar automáticamente.
 *
 * Corrige historial_estados[0] y movimiento CREADO cuando se guardó el centro
 * (p.ej. CNCC) como usuario creador en lugar del usuario real (p.ej. WVASQUEZ).
 *
 * Uso (solo cuando se conozca el usuario real):
 *   node scripts/repair-creador-trazabilidad-req.mjs --codigo REQ-00002 --usuario WVASQUEZ --dry-run
 *   node scripts/repair-creador-trazabilidad-req.mjs --codigo REQ-00002 --usuario WVASQUEZ --apply
 *
 * Sin --apply solo muestra el plan (dry-run implícito).
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const codigo = String(arg('codigo', '') || '').trim();
const usuarioReal = String(arg('usuario', '') || '').trim();
const apply = hasFlag('apply');

if (!codigo || !usuarioReal) {
  console.error('Uso: node scripts/repair-creador-trazabilidad-req.mjs --codigo REQ-00002 --usuario WVASQUEZ [--dry-run|--apply]');
  process.exit(1);
}

const pool = new pg.Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'sgc',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

function parseArr(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

try {
  const { rows } = await pool.query(
    `SELECT id, codigo, responsable, usuario_modificacion,
            historial_estados, historial_movimientos
     FROM requerimientos WHERE codigo = $1 LIMIT 1`,
    [codigo],
  );
  if (!rows.length) {
    console.error(`No encontrado: ${codigo}`);
    process.exit(2);
  }
  const row = rows[0];
  const centro = String(row.responsable || '').trim();
  const hist = parseArr(row.historial_estados);
  const movs = parseArr(row.historial_movimientos);

  const nextHist = hist.map((h, i) => {
    if (i !== 0 && !/creaci[oó]n|creado/i.test(String(h?.accion || ''))) return h;
    const u = String(h?.usuario || '').trim();
    if (!u || (centro && u.toLowerCase() === centro.toLowerCase()) || /^usuario au$/i.test(u)) {
      return { ...h, usuario: usuarioReal };
    }
    return h;
  });

  const nextMovs = movs.map((m) => {
    if (!/^CREADO$|CREACI[OÓ]N/i.test(String(m?.accion || '').trim())) return m;
    const u = String(m?.usuario || m?.actor || '').trim();
    const patch = { ...m };
    if (!u || (centro && u.toLowerCase() === centro.toLowerCase()) || /^usuario au$/i.test(u)) {
      patch.usuario = usuarioReal;
    }
    // Si responsable del movimiento es el centro, restaurar rol de etapa
    if (centro && String(m?.responsable || '').trim().toLowerCase() === centro.toLowerCase()) {
      patch.responsable = 'Usuario AU';
    }
    return patch;
  });

  const nextUm = (() => {
    const um = String(row.usuario_modificacion || '').trim();
    if (!um || (centro && um.toLowerCase() === centro.toLowerCase())) return usuarioReal;
    return um;
  })();

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY-RUN',
    id: row.id,
    codigo: row.codigo,
    centro_conservado: centro,
    before: {
      usuario_modificacion: row.usuario_modificacion,
      historial0: hist[0]?.usuario,
      creado: movs.find((m) => /^CREADO$/i.test(String(m?.accion || '')))?.usuario,
    },
    after: {
      usuario_modificacion: nextUm,
      historial0: nextHist[0]?.usuario,
      creado: nextMovs.find((m) => /^CREADO$/i.test(String(m?.accion || '')))?.usuario,
    },
  }, null, 2));

  if (!apply) {
    console.log('Dry-run: no se escribió en DB. Use --apply para persistir.');
    process.exit(0);
  }

  await pool.query(
    `UPDATE requerimientos SET
       historial_estados = $2::jsonb,
       historial_movimientos = $3::jsonb,
       usuario_modificacion = $4,
       updated_at = NOW()
     WHERE id = $1`,
    [row.id, JSON.stringify(nextHist), JSON.stringify(nextMovs), nextUm],
  );
  console.log('OK: reparación aplicada.');
} finally {
  await pool.end();
}
