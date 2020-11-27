import html from 'choo/html';
import list from './list';
import { archived, uploading, wip, empty } from './archiveTile';
import modal from './modal';
import intro from './intro';

export default (state, emit) => {
    const archives = state.storage.files
    .filter(archive => !archive.expired)
    .map(archive => archived(state, emit, archive));
    let left = '';
    if (state.uploading) {
        left = uploading(state, emit);
    } else if (state.archive.numFiles > 0) {
        left = wip(state, emit);
    } else {
        left = empty(state, emit);
    }
    archives.reverse();
    const right =
        archives.length === 0 ?
        intro(state) :
        list(archives, 'p-2 h-full overflow-y-auto w-full', 'mb-4 w-full');

    return html `
    <main class="main">
      ${state.modal && modal(state, emit)}
      <section
        class="h-full w-full p-6 md:p-8 overflow-hidden md:flex md:flex-row md:rounded-xl md:shadow-big"
      >
        <div class="px-2 w-full md:px-0 md:mr-8 md:w-1/2">${left}</div>
        <div class="mt-6 w-full md:w-1/2 md:-m-2">${right}</div>
      </section>
    </main>
  `;
};