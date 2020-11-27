/* global downloadMetadata */
import html from 'choo/html';
import {
    downloading as archiveTile_dl,
    preview as archiveTile_pv
} from './archiveTile';
import modal from './modal';
import noStreams from './noStreams';
import notFound from './notFound';
import downloadPassword from './downloadPassword';
import downloadCompleted from './downloadCompleted';
const BIG_SIZE = 1024 * 1024 * 256;

function createFileInfo(state) {
    return {
        id: state.params.id,
        secretKey: state.params.key,
        nonce: downloadMetadata.nonce,
        requiresPassword: downloadMetadata.pwd,
        password: null,
        invalidPwd: false,
    };
}

function downloading(state, emit) {
    return html `
    <div
      class="flex flex-col w-full h-full items-center md:justify-center md:-mt-8"
    >
      <h1 class="text-3xl font-bold mb-4">
        ${state.translate('downloadingTitle')}
      </h1>
      ${archiveTile_dl(state, emit)}
    </div>
  `;
}

function preview(state, emit) {
    if (!state.capabilities.streamTransfer && state.fileInfo.size > BIG_SIZE) {
        return noStreams(state, emit);
    }
    return html `
    <div
      class="flex flex-col w-full max-w-md h-full mx-auto items-center justify-center"
    >
      <h1 class="text-3xl font-bold mb-4">
        ${state.translate('downloadTitle')}
      </h1>
      <p
        class="w-full text-grey-80 text-center leading-normal dark:text-grey-40"
      >
        ${state.translate('downloadDescription')}
      </p>
      ${archiveTile_pv(state, emit)}
    </div>
  `;
}

export default (state, emit) => {
    let content = '';
    if (!state.fileInfo) {
        state.fileInfo = createFileInfo(state);
        if (downloadMetadata.status === 404) {
            return notFound(state);
        }
        if (!state.fileInfo.nonce) {
            // coming from something like the browser back button
            return location.reload();
        }
    }

    if (!state.transfer && !state.fileInfo.requiresPassword) {
        emit('getMetadata');
    }

    if (state.transfer) {
        switch (state.transfer.state) {
            case 'downloading':
            case 'decrypting':
                content = downloading(state, emit);
                break;
            case 'complete':
                content = downloadCompleted(state);
                break;
            default:
                content = preview(state, emit);
        }
    } else if (state.fileInfo.requiresPassword) {
        content = downloadPassword(state, emit);
    } 

    return html `
    <main class="main">
      ${state.modal && modal(state, emit)}
      <section
        class="relative h-full w-full p-6 md:p-8 md:rounded-xl md:shadow-big"
      >
        ${content}
      </section>
    </main>
  `;
};