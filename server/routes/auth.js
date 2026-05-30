// Autenticación básica contra la tabla usuarios.
import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { dni, password } = req.body || {};
    if (!dni) return res.status(400).json({ success: false, error: 'DNI requerido' });

    const { rows } = await query('SELECT * FROM usuarios WHERE dni = $1 AND activo = TRUE', [dni]);
    const user = rows[0];
    if (!user) return res.status(401).json({ success: false, error: 'Usuario no encontrado' });

    // Si el usuario tiene contraseña configurada, validarla; si no, permitir (compat).
    if (user.password_hash && password) {
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const safe = { id: user.id, dni: user.dni, nombre: user.nombre, rol: user.rol, email: user.email };
    res.json({ success: true, user: safe });
  } catch (err) { next(err); }
});

export default router;
