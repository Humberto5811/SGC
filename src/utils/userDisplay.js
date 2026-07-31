/** Nombre legible del usuario autenticado (Apellidos Nombres). */
export function getUserDisplayName(user) {
  if (!user) return 'Sistema';
  const full = [user.apellidos, user.nombres].filter(Boolean).join(' ').trim();
  if (full) return full;
  const nombre = String(user.nombre || '').trim();
  if (nombre && !/^\d+$/.test(nombre)) return nombre;
  return nombre || user.dni || user.username || 'Usuario';
}

/**
 * Identidad de auditoría para creación/trazabilidad (p.ej. usuario_modificacion).
 * Prefiere username (WVASQUEZ). Nunca usa user.centro (es abreviatura de centro).
 */
export function getUserAuditName(user) {
  if (!user) return 'Sistema';
  const username = String(user.username || '').trim();
  if (username && !/^\d+$/.test(username)) return username;
  const full = [user.apellidos, user.nombres].filter(Boolean).join(' ').trim();
  if (full) return full;
  const nombre = String(user.nombre || '').trim();
  const centro = String(user.centro || '').trim();
  // Evitar confundir nombre con centro (casos donde nombre quedó = CNCC)
  if (nombre && centro && nombre.toLowerCase() === centro.toLowerCase()) {
    return String(user.dni || username || 'Sistema').trim() || 'Sistema';
  }
  if (nombre && !/^\d+$/.test(nombre)) return nombre;
  return String(user.dni || username || 'Usuario').trim() || 'Usuario';
}
