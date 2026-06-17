// src/services/programacionService.js
import { api } from './apiService.js';

export const programacionService = {
  // ==================== REQUERIMIENTOS ====================
  
  /**
   * Obtiene los requerimientos aprobados por DEC pendientes de programación
   * @returns {Promise} Lista de requerimientos con estado 'Aprobado DEC'
   */
  getRequerimientos: () => api.get('/programacion/requerimientos'),

  /**
   * Obtiene un requerimiento específico por ID
   * @param {number} id - ID del requerimiento
   * @returns {Promise} Datos del requerimiento
   */
  getRequerimiento: (id) => api.get(`/programacion/requerimientos/${id}`),

  // ==================== PEDIDOS SIGAMEF ====================

  /**
   * Lista los pedidos SIGAMEF asociados a un requerimiento
   * @param {number} requerimientoId - ID del requerimiento
   * @returns {Promise} Lista de pedidos asociados
   */
  getPedidos: (requerimientoId) => api.get(`/programacion/pedidos/${requerimientoId}`),

  /**
   * Asocia uno o más pedidos SIGAMEF a un requerimiento
   * @param {Object} body - { requerimiento_id, pedido_ids, usuario }
   * @returns {Promise} Resultado de la operación
   */
  asociarPedidos: (body) => api.post('/programacion/pedidos', body),

  /**
   * Elimina una asociación de pedido específica
   * @param {number} asociacionId - ID de la asociación a eliminar
   * @returns {Promise} Resultado de la operación
   */
  eliminarAsociacion: (asociacionId) => api.del(`/programacion/pedidos/${asociacionId}`),

  /**
   * Obtiene el conteo de pedidos asociados por requerimiento (batch)
   * @returns {Promise} Objeto con { requerimiento_id: count }
   */
  getPedidosCount: () => api.get('/programacion/pedidos-count'),

  /**
   * Busca pedidos SIGAMEF por código o descripción
   * @param {string} q - Término de búsqueda
   * @returns {Promise} Lista de pedidos encontrados
   */
  buscarPedido: (q) => api.get(`/programacion/buscar-pedido?q=${encodeURIComponent(q)}`),

  /**
   * Obtiene todos los pedidos SIGAMEF (para selección en modales)
   * @param {Object} params - Parámetros de paginación/filtro
   * @returns {Promise} Lista de pedidos
   */
  listarPedidos: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return api.get(`/programacion/pedidos${queryString ? `?${queryString}` : ''}`);
  },

  // ==================== PAQUETES DE CONSOLIDACIÓN ====================

  /**
   * Lista todos los paquetes de programación
   * @param {Object} params - Parámetros de filtro (estado, etc.)
   * @returns {Promise} Lista de paquetes
   */
  listPaquetes: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return api.get(`/programacion/paquetes${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Obtiene el detalle completo de un paquete
   * @param {number} id - ID del paquete
   * @returns {Promise} Detalle del paquete con requerimientos y pedidos
   */
  getPaquete: (id) => api.get(`/programacion/paquetes/${id}`),

  /**
   * Crea un nuevo paquete de consolidación
   * @param {Object} body - { requerimiento_ids, usuario }
   * @returns {Promise} Paquete creado
   */
  crearPaquete: (body) => api.post('/programacion/paquetes', body),

  /**
   * Aprueba un paquete (cambia estado y envía requerimientos a Actos Preparatorios)
   * @param {number} id - ID del paquete
   * @param {Object} body - { usuario }
   * @returns {Promise} Resultado de la operación
   */
  aprobarPaquete: (id, body) => api.put(`/programacion/paquetes/${id}/aprobar`, body),

  /**
   * Elimina un paquete (solo si está en estado Pendiente)
   * @param {number} id - ID del paquete
   * @returns {Promise} Resultado de la operación
   */
  eliminarPaquete: (id) => api.del(`/programacion/paquetes/${id}`),

  /**
   * Genera un reporte de un paquete en formato HTML
   * @param {number} id - ID del paquete
   * @returns {Promise} Reporte HTML
   */
  reportePaquete: (id) => api.get(`/programacion/paquetes/${id}/reporte`),

  // ==================== UTILIDADES ====================

  /**
   * Verifica si un requerimiento puede ser seleccionado para consolidación
   * @param {Object} req - Objeto requerimiento
   * @returns {boolean} true si es seleccionable
   */
  esSeleccionable: (req) => {
    if (!req) return false;
    // No seleccionable si: está anulado, ya tiene paquete, o no tiene pedidos
    const estaAnulado = req.estado && /anulad/i.test(req.estado);
    const tienePaquete = req.paquete_id !== null && req.paquete_id !== undefined;
    const tienePedidos = req._tienePedidos === true;
    
    return !estaAnulado && !tienePaquete && tienePedidos;
  },

  /**
   * Valida si un conjunto de requerimientos puede ser consolidado
   * @param {Array} requerimientos - Lista de requerimientos a validar
   * @returns {Object} { valido: boolean, errores: string[] }
   */
  validarConsolidacion: (requerimientos) => {
    const errores = [];
    
    if (!requerimientos || requerimientos.length < 2) {
      errores.push('Se requieren al menos 2 requerimientos para consolidar');
      return { valido: false, errores };
    }

    requerimientos.forEach((req, index) => {
      const label = req.codigo || req.cmn || `REQ-${String(req.id).padStart(5, '0')}`;
      
      if (req.estado && /anulad/i.test(req.estado)) {
        errores.push(`El requerimiento ${label} está anulado`);
      }
      
      if (req.paquete_id !== null && req.paquete_id !== undefined) {
        errores.push(`El requerimiento ${label} ya pertenece a otro paquete`);
      }
      
      if (!req._tienePedidos) {
        errores.push(`El requerimiento ${label} no tiene pedidos SIGAMEF asociados`);
      }
    });

    return { 
      valido: errores.length === 0, 
      errores 
    };
  }
};

// Exportar funciones individuales para compatibilidad con otros archivos
export const getRequerimientos = programacionService.getRequerimientos;
export const getPedidos = programacionService.getPedidos;
export const asociarPedidos = programacionService.asociarPedidos;
export const eliminarAsociacion = programacionService.eliminarAsociacion;
export const getPedidosCount = programacionService.getPedidosCount;
export const buscarPedido = programacionService.buscarPedido;
export const listPaquetes = programacionService.listPaquetes;
export const getPaquete = programacionService.getPaquete;
export const crearPaquete = programacionService.crearPaquete;
export const aprobarPaquete = programacionService.aprobarPaquete;
export const eliminarPaquete = programacionService.eliminarPaquete;

export default programacionService;