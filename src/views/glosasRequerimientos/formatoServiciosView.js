import { createGlosaView } from './glosaFactory.js';

const view = createGlosaView('servicios', 'Formato Servicios', 'bi-tools');
const renderFormatoServiciosView = view.render;
const initFormatoServiciosView = view.init;
export { renderFormatoServiciosView, initFormatoServiciosView };
