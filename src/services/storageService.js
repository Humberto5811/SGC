export const storageService = {
  initialize: () => {
    if (!localStorage.getItem('users')) {
      const defaultUsers = [
        { dni: 'admin', nombre: 'Administrador', rol: 'admin', email: 'admin@sgc.pe' },
        { dni: 'au', nombre: 'Usuario AU', rol: 'au', email: 'au@sgc.pe' },
        { dni: 'dec', nombre: 'Usuario DEC', rol: 'dec', email: 'dec@sgc.pe' }
      ];
      localStorage.setItem('users', JSON.stringify(defaultUsers));
      console.log('✅ Usuarios inicializados');
    }
    if (!localStorage.getItem('areas')) {
      localStorage.setItem('areas', JSON.stringify(['Administración', 'Logística', 'Operaciones']));
    }
    if (!localStorage.getItem('metas')) {
      localStorage.setItem('metas', JSON.stringify(['Meta 1', 'Meta 2', 'Meta 3']));
    }
  },
  getUsers: () => JSON.parse(localStorage.getItem('users') || '[]'),
  getAreas: () => JSON.parse(localStorage.getItem('areas') || '[]'),
  getMetas: () => JSON.parse(localStorage.getItem('metas') || '[]')
};
