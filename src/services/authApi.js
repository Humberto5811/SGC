import { api } from './apiService.js';

export const authApi = {
  logout: () => api.post('/auth/logout', {}),
  cambioPassword: (body) => api.post('/auth/cambio-password', body),
};

export default authApi;
