// Middleware: rechaza requests sin sesión válida.
// Busca el header x-user-id (establecido por el frontend tras login).
// En una implementación completa esto debería verificar un JWT o cookie de sesión.
import { query } from '../db.js';

export default async function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const { rows } = await query(
      'SELECT id, dni, nombre, rol FROM usuarios WHERE id = $1 AND activo = TRUE',
      [userId],
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
