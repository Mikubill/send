import html from 'choo/html';
import modal from './modal';

export default (state, emit) => {
    state.modal = null;
    return html `
    <main class="main">
      ${state.modal && modal(state, emit)}
      <div
        class="flex flex-col items-center bg-white m-4 px-6 py-8 border border-grey-30 md:border-none md:px-12 md:py-16 shadow w-full md:h-full dark:bg-grey-90"
      >
        <h1 class="text-center text-3xl font-bold">
          ${state.translate('legalTitle')}
        </h1>
        <p class="mt-2">${state.translate('legalDateStamp')}</p>
        <div class="overflow-y-scroll py-8 px-12">
          <p class="leading-normal">
            <span
              >Below are the top
              things you should know about Send.</span>
          </p>
          <ul class="mt-6 leading-normal">
            <li class="mb-4">
              <b>Content</b>: We receives an encrypted copy of the file you
              upload but we cannot access the content or name of your encrypted
              file. By default, files are stored without expiration. If you 
              choose a download cap or expiration date, the file can be
              deleted from our server sooner.
            </li>
            <li class="mb-4">
              <b>Data on your device</b>: So that you can check status or delete
              files, basic information about your uploaded files is stored on
              your local device. This includes our identifier for the file, the
              filename, and the file’s unique download URL. This is cleared if
              you delete your uploaded file or upon visiting Send after the file
              expires. Note, however, that the URL will persist in your browsing
              history (and with whomever you shared it) until manually deleted.
            </li>
            <li class="mb-4">
              <b>Third Party Services</b>: We use Google Cloud Platform and Cloudflare.
            </li>
          </ul>
        </div>
      </div>
    </main>
  `;
};