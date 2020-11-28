/* global DEFAULTS LIMITS */

// import 'core-js';
import './main.css';
import 'fast-text-encoding'; // MS Edge support
import choo from 'choo';
import routes from './routes';
import getCapabilities from './capabilities';
import controller from './controller';
import dragManager from './dragManager';
import pasteManager from './pasteManager';
import storage from './storage';
import Archive from './archive';
import { getTranslator } from './locale';
import { setTranslate, locale } from './utils';

(async function start() {
    const capabilities = await getCapabilities();
    if (
        !capabilities.crypto &&
        window.location.pathname !== '/unsupported/crypto'
    ) {
        return window.location.assign('/unsupported/crypto');
    }
    // capabilities.streamTransfer = false;
    const translate = await getTranslator(locale());
    setTranslate(translate);
    // eslint-disable-next-line require-atomic-updates
    window.initialState = {
        LIMITS,
        DEFAULTS,
        archive: new Archive([], DEFAULTS.EXPIRE_SECONDS),
        capabilities,
        translate,
        storage,
        transfer: null,
        fileInfo: null,
        locale: locale()
    };

    const app = routes(choo({
        hash: true
    }));
    // eslint-disable-next-line require-atomic-updates
    window.app = app;
    app.use(controller);
    app.use(dragManager);
    app.use(pasteManager);
    app.mount(document.getElementsByClassName('app')[0]);
})();
