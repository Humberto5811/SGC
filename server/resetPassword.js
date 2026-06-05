import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { query } from './db.js';

dotenv.config();

const [,, dni, password, nombre, rol] = process.argv;
if (!dni || !password) {
  console.error('Uso: node server/resetPassword.js <dni> <password> [nombre] [rol]');
  process.exit(2);
}

(async () => {
  try {
    const hash = await bcrypt.hash(password, 10);
    // Intentar actualizar
    const res = await query('UPDATE usuarios SET password_hash = $1, updated_at = NOW() WHERE dni = $2 RETURNING id, dni', [hash, dni]);
    if (res && res.rowCount > 0) {
      console.log('Contraseña actualizada para usuario:', res.rows[0].dni);
      process.exit(0);
    }

    // Si no existe, insertar nuevo usuario
    const insertNombre = nombre || `Usuario ${dni}`;
    const insertRol = rol || 'au';
    const insertEmail = `${dni}@sgc.pe`;
    const ins = await query(
      `INSERT INTO usuarios (dni, nombre, rol, email, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, dni`,
      [dni, insertNombre, insertRol, insertEmail, hash]
    );
    if (ins && ins.rowCount > 0) {
      console.log('Usuario creado y contraseña establecida para:', ins.rows[0].dni);
      process.exit(0);
    }

    console.error('No se pudo crear ni actualizar el usuario:', dni);
    process.exit(1);
  } catch (err) {
    console.error('Error actualizando/creando usuario:', err.message || err);
    process.exit(1);
  }
})();
