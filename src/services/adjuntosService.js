import { api } from './apiService.js';

export const adjuntosService = {
  // Subir un archivo adjunto a un requerimiento
  uploadAdjunto: (requerimientoId, archivo) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
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
  },

  // Obtener lista de adjuntos de un requerimiento
  getAdjuntos: (requerimientoId) => api.get(`/adjuntos/listar/${requerimientoId}`),

  // Descargar/abrir un adjunto
  descargarAdjunto: async (adjuntoId, nombreArchivo) => {
    const res = await api.get(`/adjuntos/descargar/${adjuntoId}`);
    if (res && res.contenido_base64) {
      const link = document.createElement('a');
      link.href = `data:${res.mime_type};base64,${res.contenido_base64}`;
      link.download = nombreArchivo;
      link.click();
      return true;
    }
    return false;
  },

  // Eliminar un adjunto
  eliminarAdjunto: (adjuntoId) => api.del(`/adjuntos/${adjuntoId}`),

  // Solicitar aprobación (cambiar estado a "En tramite de aprobación")
  solicitarAprobacion: (requerimientoId) =>
    api.put(`/requerimientos/${requerimientoId}/solicitar-aprobacion`, {}),
};
