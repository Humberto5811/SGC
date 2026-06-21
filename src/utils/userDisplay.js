/** Nombre legible del usuario autenticado (Apellidos Nombres). */
export function getUserDisplayName(user) {
  if (!user) return 'Sistema';
  const full = [user.apellidos, user.nombres].filter(Boolean).join(' ').trim();
  if (full) return full;
  const nombre = String(user.nombre || '').trim();
  if (nombre && !/^\d+$/.test(nombre)) return nombre;
  return nombre || user.dni || user.username || 'Usuario';
}
