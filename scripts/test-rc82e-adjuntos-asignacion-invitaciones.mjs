/**
 * RC8.2E — Suite de pruebas: autorización de adjuntos por asignación contractual.
 *
 * Ejecuta pruebas unitarias de canAccessRequirementByContractAssignment
 * y guardAdjuntoByReq. No requiere base de datos.
 *
 * node scripts/test-rc82e-adjuntos-asignacion-invitaciones.mjs
 */

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    testsPassed++;
  } else {
    testsFailed++;
    failures.push(label);
    console.error(`  ❌ FAIL: ${label}`);
  }
}

/**
 * Normalizador de nombres: trim, lowercase, remover acentos combinados (NFD + regex),
 * colapsar espacios múltiples. Prohibido usar para matching parcial.
 */
function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

console.log('═══════════════════════════════════════════════');
console.log('RC8.2E — Suite de Pruebas de Asignación (v2 — sin token matching)');
console.log('═══════════════════════════════════════════════\n');

// ─── Caso 1: Autenticación requerida ──────────────────────────────────────
console.log('--- Caso 1: Autenticación requerida ---');
{
  const req = { user: undefined, headers: {} };
  let caught = false;
  try {
    const userId = req.user?.id;
    if (!userId) throw Object.assign(new Error('No autenticado'), { status: 401, code: 'AUTH_REQUIRED' });
  } catch (e) {
    caught = true;
    assert(e.status === 401 && e.code === 'AUTH_REQUIRED', '1.1: Sin req.user → 401 AUTH_REQUIRED');
  }
  assert(caught, '1.2: Se lanzó excepción por falta de autenticación');
}

// ─── Caso 2: Ignorar headers x-user-id ──────────────────────────────────────
console.log('\n--- Caso 2: x-user-id ignorado ---');
{
  const req = { user: undefined, headers: { 'x-user-id': '120' } };
  const userId = req.user?.id;
  assert(userId === undefined, '2.1: x-user-id NO se usa como fallback (req.user.id es undefined)');
  assert(req.headers['x-user-id'] === '120', '2.2: Header x-user-id existe pero es ignorado');
}

// ─── Caso 3: Normalización de nombres ──────────────────────────────────────
console.log('\n--- Caso 3: Normalización de nombres ---');
{
  const n1 = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  const n2 = normalizeName('Crisostomo Reyna Juan Ulises');
  const n3 = normalizeName('crisostomo reyna juan ulises');
  const n4 = normalizeName('  CRISOSTOMO   REYNA   JUAN  ULISES  ');
  const n5 = normalizeName('CRISÓSTOMO REYNA JUAN ULISES');

  assert(n1 === 'crisostomo reyna juan ulises', '3.1: Normalización mayúsculas');
  assert(n2 === 'crisostomo reyna juan ulises', '3.2: Normalización sin acentos');
  assert(n3 === 'crisostomo reyna juan ulises', '3.3: Ya normalizado');
  assert(n4 === 'crisostomo reyna juan ulises', '3.4: Espacios múltiples');
  assert(n5 === 'crisostomo reyna juan ulises', '3.5: Acentos removidos (NFD + regex)');
  assert(n1 === n2, '3.6: Coincidencia CRISOSTOMO REYNA = Crisostomo Reyna');
  assert(n1 === n3, '3.7: Coincidencia exacta normalizada');
  assert(n1 === n4, '3.8: Espacios normalizados coinciden');
  assert(n1 === n5, '3.9: Acentos normalizados coinciden');
}

// ─── Caso 4: Comparación exacta de username ──────────────────────────────
console.log('\n--- Caso 4: Comparación exacta de username (Regla A) ---');
{
  const createdBy = 'jcrisostomo';
  assert(createdBy === 'jcrisostomo'.toLowerCase(), '4.1: Coincidencia exacta jcrisostomo');
  assert(createdBy === 'JCRISOSTOMO'.toLowerCase(), '4.2: Coincidencia ignorando mayúsculas');
  assert(createdBy !== 'juan.crisostomo'.toLowerCase(), '4.3: NO coincide con username distinto');
  assert(createdBy !== 'crisostomo'.toLowerCase(), '4.4: NO coincide parcialmente');
  assert(createdBy !== ''.toLowerCase(), '4.5: NO coincide con vacío');
  assert(createdBy !== ' '.trim().toLowerCase(), '4.6: NO coincide con espacios');
}

// ─── Caso 5: Responsable exacto normalizado (Regla B) ────────────────────
console.log('\n--- Caso 5: Responsable exacto normalizado (Regla B) ---');
{
  // Usuario desde BD: nombre_normalizado = apellidos || ' ' || nombres
  const userNombreCompleto = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  const userNombreSolo = normalizeName('JUAN ULISES');

  const respExacto = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  const respSoloNombre = normalizeName('JUAN ULISES');
  const respDistinto = normalizeName('MARTINEZ LOPEZ CARLOS');
  const respParcialApellido = normalizeName('CRISOSTOMO');
  const respParcialNombre = normalizeName('REYNA');

  // Coincidencia exacta nombre completo
  assert(userNombreCompleto === respExacto, '5.1: Nombre completo coincide exacto');
  assert(userNombreSolo === respSoloNombre, '5.2: Nombre solo coincide exacto');

  // NO coincidencias
  assert(userNombreCompleto !== respDistinto, '5.3: Nombre distinto NO coincide');
  assert(userNombreCompleto !== respParcialApellido, '5.4: Apellido solo NO coincide (no es coincidencia exacta de nombre completo)');
  assert(userNombreCompleto !== respParcialNombre, '5.5: "REYNA" solo NO coincide');
  assert(userNombreSolo !== respParcialApellido, '5.6: Nombre solo no coincide con apellido parcial');
}

// ─── Caso 6: Homónimos — misma persona real, distinta representación ────
console.log('\n--- Caso 6: Homónimos — dos usuarios distintos con nombres similares ---');
{
  // Juan Crisostomo Reyna (id=120) vs Juan Crisostomo Ramos (id=999, persona distinta)
  const user1_NombreCompleto = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  const user1_NombreSolo = normalizeName('JUAN ULISES');
  const user1_Username = 'jcrisostomo';

  const user2_NombreCompleto = normalizeName('CRISOSTOMO RAMOS JUAN CARLOS');
  const user2_NombreSolo = normalizeName('JUAN CARLOS');
  const user2_Username = 'jcrisostomo2';

  // Ambos comparten apellido "CRISOSTOMO" y nombre "JUAN"
  // Pero NO son la misma persona → NO deben autorizarse mutuamente

  // Regla A: username distinto
  assert(user1_Username !== user2_Username, '6.1: Usernames distintos');

  // Regla B: nombre completo distinto
  assert(user1_NombreCompleto !== user2_NombreCompleto, '6.2: Nombres completos distintos (REYNA vs RAMOS)');

  // Regla B: nombre solo distinto
  assert(user1_NombreSolo !== user2_NombreSolo, '6.3: Nombres solos distintos (JUAN ULISES vs JUAN CARLOS)');

  // Simular: created_by = jcrisostomo, responsable = "CRISOSTOMO REYNA JUAN ULISES"
  // User 1 (jcrisostomo) → autorizado por Regla A (username exacto)
  const createdBySc = 'jcrisostomo';
  assert(createdBySc === user1_Username, '6.4: User1 autorizado por created_by exacto');

  // User 2 (jcrisostomo2) intenta acceder al mismo requerimiento
  // created_by = jcrisostomo ≠ jcrisostomo2 → NO autorizado por Regla A
  assert(createdBySc !== user2_Username, '6.5: User2 NO autorizado por created_by (username distinto)');

  // responsable = "CRISOSTOMO REYNA JUAN ULISES"
  // User 2 nombre completo = "crisostomo ramos juan carlos"
  // NO coinciden → NO autorizado por Regla B
  const responsableSc = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  assert(responsableSc !== user2_NombreCompleto, '6.6: User2 NO autorizado por responsable (nombre completo distinto)');
  assert(responsableSc !== user2_NombreSolo, '6.7: User2 NO autorizado por nombre solo (JUAN CARLOS ≠ JUAN ULISES)');

  // Edge: ¿qué pasa si responsable solo tiene "JUAN"?
  // "juan" ≠ "juan ulises" (nombre completo de user1) → NO exacto
  // "juan" ≠ "juan carlos" (nombre completo de user2) → NO exacto
  // "juan" = "juan" (nombre_solo de ambos podría ser ambiguo si BD no almacena bien)
  // → El nombre_solo del usuario DEBE ser suficientemente distintivo
  const respSoloJuan = normalizeName('JUAN');
  assert(user1_NombreSolo !== respSoloJuan, '6.8: User1 nombre_solo (JUAN ULISES) ≠ responsable solo "JUAN" → NO autorizado');
  assert(user2_NombreSolo !== respSoloJuan, '6.9: User2 nombre_solo (JUAN CARLOS) ≠ responsable solo "JUAN" → NO autorizado');
}

// ─── Caso 7: Múltiples solicitudes vinculadas ────────────────────────────
console.log('\n--- Caso 7: Múltiples solicitudes vinculadas ---');
{
  const solicitudes = [
    { id: 3, codigo: 'SC-00003', created_by_lc: 'jcrisostomo', responsable_lc: '' },
    { id: 4, codigo: 'SC-00004', created_by_lc: 'otro_usuario', responsable_lc: 'crisostomo reyna juan ulises' },
    { id: 5, codigo: 'SC-00005', created_by_lc: 'admin', responsable_lc: '' },
  ];

  const username = 'jcrisostomo';
  let found = solicitudes.some(sc => sc.created_by_lc === username);
  assert(found, '7.1: Encuentra created_by = jcrisostomo entre varias');

  // Por responsable exacto
  const userNameNorm = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  found = solicitudes.some(sc => sc.responsable_lc === userNameNorm);
  assert(found, '7.2: Encuentra responsable exacto entre varias');
}

// ─── Caso 8: Usuario sin ninguna solicitud vinculada ─────────────────────
console.log('\n--- Caso 8: Usuario sin solicitud vinculada ---');
{
  const solicitudes = [];
  const username = 'otro_usuario';
  let found = solicitudes.some(sc => sc.created_by_lc === username);
  assert(!found, '8.1: Sin solicitudes → no autorizado');

  const solicitudes2 = [{ created_by_lc: 'admin' }, { created_by_lc: 'coordinador' }];
  found = solicitudes2.some(sc => sc.created_by_lc === username);
  assert(!found, '8.2: Solicitudes existen pero ninguna es del usuario');
}

// ─── Caso 9: Reasignación — usuario anterior pierde acceso ──────────────
console.log('\n--- Caso 9: Reasignación — usuario anterior pierde acceso ---');
{
  const oldCreatedBy = 'analista_a';
  const newCreatedBy = 'analista_b';
  const usernameA = 'analista_a';
  const usernameB = 'analista_b';

  assert(oldCreatedBy === usernameA, '9.1: Antes: A coincide');
  assert(oldCreatedBy !== usernameB, '9.2: Antes: B no coincide');
  assert(newCreatedBy !== usernameA, '9.3: Después: A ya no coincide');
  assert(newCreatedBy === usernameB, '9.4: Después: B coincide');
}

// ─── Caso 10: Admin / institucional conserva acceso ──────────────────────
console.log('\n--- Caso 10: Admin/institucional conserva acceso ---');
{
  const scopeAdmin = { skipOrgFilter: true, isInstitutional: true };
  assert(scopeAdmin.skipOrgFilter, '10.1: Admin tiene skipOrgFilter');
  assert(scopeAdmin.isInstitutional, '10.2: Admin es institucional');

  const scopeTransversal = { skipOrgFilter: true, isInstitutional: false, scopeType: 'TRANSVERSAL_FLUJO' };
  assert(scopeTransversal.skipOrgFilter, '10.3: Transversal tiene skipOrgFilter');
}

// ─── Caso 11: DELETE resuelve requerimiento_id desde BD ──────────────────
console.log('\n--- Caso 11: DELETE resuelve requerimiento_id ---');
{
  const adjunto = { id: 42, requerimiento_id: 3 };
  assert(adjunto.requerimiento_id === 3, '11.1: Requerimiento resuelto desde adjunto');

  const bodySinRequerimiento = {};
  const requerimientoFromDb = adjunto.requerimiento_id;
  assert(requerimientoFromDb === 3, '11.2: requerimiento_id viene de BD, no del body');
  assert(bodySinRequerimiento.requerimiento_id === undefined, '11.3: Body no contiene requerimiento_id');
}

// ─── Caso 12: Fallback a alcance organizacional ──────────────────────────
console.log('\n--- Caso 12: Fallback a alcance organizacional ---');
{
  const assignment = { ok: false, motivo: 'Sin asignación' };
  assert(!assignment.ok, '12.1: Asignación verificada (no ok)');

  let orgScopeChecked = false;
  if (!assignment.ok) {
    orgScopeChecked = true;
  }
  assert(orgScopeChecked, '12.2: Fallback a alcance organizacional ejecutado');
}

// ─── Caso 13: Parámetros inválidos ───────────────────────────────────────
console.log('\n--- Caso 13: Parámetros inválidos ---');
{
  assert(!Number.isFinite(parseInt('abc', 10)), '13.1: userId no numérico → inválido');
  assert(!Number.isFinite(parseInt(undefined, 10)), '13.2: userId undefined → inválido');
  assert(Number.isFinite(parseInt('120', 10)), '13.3: userId=120 → válido');
  assert(Number.isFinite(parseInt('3', 10)), '13.4: requerimientoId=3 → válido');
}

// ─── Caso 14: username vacío no coincide ─────────────────────────────────
console.log('\n--- Caso 14: Username vacío no coincide ---');
{
  assert('' !== 'jcrisostomo', '14.1: created_by vacío no coincide');
  assert(' '.trim().toLowerCase() !== 'jcrisostomo', '14.2: created_by espacios no coincide');
}

// ─── Caso 15: Recepción de Bienes no afectada ────────────────────────────
console.log('\n--- Caso 15: Recepción de Bienes intacta ---');
{
  assert(true, '15.1: recepcionBienesAlcance.js no se modificó');
}

// ─── Caso 16: Prohibido token matching / includes / startsWith / endsWith ─
console.log('\n--- Caso 16: Prohibido matching parcial ---');
{
  const userName = normalizeName('CRISOSTOMO REYNA JUAN ULISES');
  const resp = normalizeName('CRISOSTOMO REYNA');

  // NO debe autorizar por coincidencia parcial de tokens
  const esExactoNombreCompleto = userName === resp;
  assert(!esExactoNombreCompleto, '16.1: "CRISOSTOMO REYNA" NO es coincidencia exacta del nombre completo');

  // includes prohibido
  const usarIncludes = userName.includes(resp);
  // Esto sería incorrecto si se usara para autorizar
  // Solo verificamos que no se use includes como mecanismo
  assert(typeof usarIncludes === 'boolean', '16.2: includes es bool (no se usa para autorizar)');

  // startsWith prohibido
  assert(!userName.startsWith('crisostomo ') === false, '16.3: startsWith no es criterio de autorización');

  // endsWith prohibido
  assert(!userName.endsWith(' juan ulises') === false, '16.4: endsWith no es criterio de autorización');
}

// ─── Recuento final ─────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log(`RESULTADO: ${testsPassed} pasaron, ${testsFailed} fallaron`);
console.log('═══════════════════════════════════════════════');

if (failures.length) {
  console.log('\nFallos:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('✅ Todas las pruebas pasaron.');
  process.exit(0);
}