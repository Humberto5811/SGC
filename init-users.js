// Inicializar usuarios en localStorage
const defaultUsers = [
  { dni: 'admin', nombre: 'Administrador', rol: 'admin', email: 'admin@sgc.pe' },
  { dni: 'au', nombre: 'Usuario AU', rol: 'au', email: 'au@sgc.pe' },
  { dni: 'dec', nombre: 'Usuario DEC', rol: 'dec', email: 'dec@sgc.pe' },
  { dni: '12345678', nombre: 'Usuario Prueba', rol: 'usuario', email: 'prueba@sgc.pe' }
];

if (!localStorage.getItem('users')) {
  localStorage.setItem('users', JSON.stringify(defaultUsers));
  console.log('Usuarios inicializados:', defaultUsers);
}