/**
 * AdjuntoManager — administración centralizada de adjuntos.
 */
import { ENTIDADES_ADJUNTABLES, TIPOS_ADJUNTO } from '../common/ConstantesEventos.js';
import { generarId, ahoraISO, requerido } from '../common/Utils.js';

const COLECCION = 'adjuntos';

function inferirTipo(mimeType = '', nombre = '') {
  const m = String(mimeType).toLowerCase();
  const n = String(nombre).toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return TIPOS_ADJUNTO.PDF;
  if (m.includes('sheet') || m.includes('excel') || n.endsWith('.xlsx') || n.endsWith('.xls')) return TIPOS_ADJUNTO.EXCEL;
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return TIPOS_ADJUNTO.WORD;
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(n)) return TIPOS_ADJUNTO.IMAGEN;
  if (m || n) return TIPOS_ADJUNTO.DOCUMENTO;
  return TIPOS_ADJUNTO.OTROS;
}

function claveEntidad(tipoEntidad, entidadId) {
  return `${String(requerido(tipoEntidad, 'tipoEntidad'))}:${String(requerido(entidadId, 'entidadId'))}`;
}

export class AdjuntoManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async agregarAdjunto(payload = {}) {
    const tipoEntidad = payload.tipoEntidad || ENTIDADES_ADJUNTABLES.EXPEDIENTE;
    const entidadId = requerido(payload.entidadId, 'entidadId');
    const ts = ahoraISO();

    const adj = {
      id: generarId('adj'),
      tipoEntidad,
      entidadId: String(entidadId),
      nombre: payload.nombre || payload.nombreArchivo || 'archivo',
      mimeType: payload.mimeType || payload.mime_type || 'application/octet-stream',
      tipo: payload.tipo || inferirTipo(payload.mimeType, payload.nombre),
      tamano: payload.tamano || payload.tamaño_bytes || 0,
      contenidoBase64: payload.contenidoBase64 || payload.contenido_base64 || null,
      referencia: payload.referencia || null,
      usuario: payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema',
      fechaRegistro: ts,
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, claveEntidad(tipoEntidad, entidadId), adj);
    return adj;
  }

  async eliminarAdjunto(tipoEntidad, entidadId, adjuntoId) {
    const key = claveEntidad(tipoEntidad, entidadId);
    const lista = await this.store.getLista(COLECCION, key);
    const filtrada = lista.filter((a) => a.id !== adjuntoId);
    if (filtrada.length === lista.length) throw new Error('Adjunto no encontrado');
    const storeKey = `${COLECCION}:${claveEntidad(tipoEntidad, entidadId)}`;
    await this.store.set(COLECCION, storeKey, filtrada);
    return { success: true, id: adjuntoId };
  }

  async listarAdjuntos(tipoEntidad, entidadId) {
    return this.store.getLista(COLECCION, claveEntidad(tipoEntidad, entidadId));
  }

  async descargarAdjunto(tipoEntidad, entidadId, adjuntoId) {
    const lista = await this.listarAdjuntos(tipoEntidad, entidadId);
    const adj = lista.find((a) => a.id === adjuntoId);
    if (!adj) throw new Error('Adjunto no encontrado');
    return adj;
  }

  async contarAdjuntos(tipoEntidad, entidadId) {
    const lista = await this.listarAdjuntos(tipoEntidad, entidadId);
    return lista.length;
  }
}

export function crearAdjuntoManager(contexto) {
  return new AdjuntoManager(contexto);
}

export { ENTIDADES_ADJUNTABLES, TIPOS_ADJUNTO };
export default AdjuntoManager;
