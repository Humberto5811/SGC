import db from '../../db.js';

export async function getAllCatalogo(req, res) {
  try {
    const { rows } = await db.query('SELECT id, nombre, descripcion, estado, created_at, updated_at FROM catalogo ORDER BY id');
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function getCatalogoById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT id, nombre, descripcion, estado, created_at, updated_at FROM catalogo WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function createCatalogo(req, res) {
  const { nombre, descripcion, estado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre is required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO catalogo (nombre, descripcion, estado) VALUES ($1, $2, $3) RETURNING id, nombre, descripcion, estado, created_at, updated_at',
      [nombre, descripcion || null, estado === undefined ? true : estado]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function updateCatalogo(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, estado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre is required' });
  try {
    const { rows } = await db.query(
      'UPDATE catalogo SET nombre=$1, descripcion=$2, estado=$3, updated_at=now() WHERE id=$4 RETURNING id, nombre, descripcion, estado, created_at, updated_at',
      [nombre, descripcion || null, estado === undefined ? true : estado, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function deleteCatalogo(req, res) {
  const { id } = req.params;
  try {
    const { rowCount } = await db.query('DELETE FROM catalogo WHERE id=$1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
