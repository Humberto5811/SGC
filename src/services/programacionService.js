import { api } from './apiService.js';

export const programacionService = {
  // Pedidos asociados
  getPedidos: (requerimientoId) => api.get(`/programacion/pedidos/${requerimientoId}`),
  asociarPedidos: (body) => api.post('/programacion/pedidos', body),
  eliminarAsociacion: (asociacionId) => api.del(`/programacion/pedidos/${asociacionId}`),
  getPedidosCount: () => api.get('/programacion/pedidos-count'),
  buscarPedido: (q) => api.get(`/programacion/buscar-pedido?q=${encodeURIComponent(q)}`),

  // Paquetes
  listPaquetes: () => api.get('/programacion/paquetes'),
  getPaquete: (id) => api.get(`/programacion/paquetes/${id}`),
  crearPaquete: (body) => api.post('/programacion/paquetes', body),
  aprobarPaquete: (id, body) => api.put(`/programacion/paquetes/${id}/aprobar`, body),
  eliminarPaquete: (id) => api.del(`/programacion/paquetes/${id}`),
};
