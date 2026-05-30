import { createGlosaView } from './glosaFactory.js';

const view = createGlosaView('licitaciones', 'Formato Licitaciones', 'bi-hammer');
const renderFormatoLicitacionesView = view.render;
const initFormatoLicitacionesView = view.init;
export { renderFormatoLicitacionesView, initFormatoLicitacionesView };
