import { api } from './apiService.js';

export const adjuntosService = {
  // Subir un archivo adjunto a un requerimiento
  uploadAdjunto: async (requerimientoId, archivo) => {
    try {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const base64 = e.target.result.split(',')[1];
            const res = await api.post(`/adjuntos/subir/${requerimientoId}`, {
              nombre_archivo: archivo.name,
              mime_type: archivo.type,
              contenido_base64: base64,
              tamaño_bytes: archivo.size,
            });
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Error leyendo archivo'));
        reader.readAsDataURL(archivo);
      });
    } catch (err) {
      throw err;
    }
  },

  // Obtener lista de adjuntos de un requerimiento
  getAdjuntos: async (requerimientoId) => {
    try {
      const res = await api.get(`/adjuntos/listar/${requerimientoId}`);
      return res;
    } catch (err) {
      throw err;
    }
  },

  // Descargar/abrir un adjunto
  descargarAdjunto: async (adjuntoId, nombreArchivo) => {
    try {
      const res = await api.get(`/adjuntos/descargar/${adjuntoId}`);
      if (res && res.contenido_base64) {
        const link = document.createElement('a');
        link.href = `data:${res.mime_type};base64,${res.contenido_base64}`;
        link.download = nombreArchivo;
        link.click();
        return true;
      }
      return false;
    } catch (err) {
      throw err;
    }
  },

  // Eliminar un adjunto
  eliminarAdjunto: async (adjuntoId) => {
    try {
      const res = await api.del(`/adjuntos/${adjuntoId}`);
      return res;
    } catch (err) {
      throw err;
    }
  },

  // Solicitar aprobación (cambiar estado a "En tramite de aprobación")
  solicitarAprobacion: async (requerimientoId) => {
    try {
      const res = await api.put(`/requerimientos/${requerimientoId}/solicitar-aprobacion`, {});
      return res;
    } catch (err) {
      throw err;
    }
  },
};
