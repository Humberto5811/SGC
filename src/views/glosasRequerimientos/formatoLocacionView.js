import { createGlosaView } from './glosaFactory.js';

const view = createGlosaView('locacion', 'Formato Locación', 'bi-building');
const renderFormatoLocacionView = view.render;
const initFormatoLocacionView = view.init;
export { renderFormatoLocacionView, initFormatoLocacionView };
