import FileReceiver from './fileReceiver';
import FileSender from './fileSender';
import copyDialog from '../ui/copyDialog';
import { updateFavicon } from '../ui/faviconProgressbar';
import okDialog from '../ui/okDialog';
import shareDialog from '../ui/shareDialog';
// import { load } from 'recaptcha-v3'

import {
    bytes,
    locale,
    copyToClipboard,
    delay,
    openLinksInNewTab,
    percent
} from './utils';

export default function(state, emitter) {
    let lastRender = 0;
    // let updateTitle = true;

    function render() {
        emitter.emit('render');
    }

    async function checkFiles(toRender = true) {
        const changes = await state.storage.merge();
        if (changes.incoming || changes.downloadCount) {
            toRender && render();
        }
    }

    function updateProgress() {
        emitter.emit('DOMTitleChange', 'Sending ' + percent(state.transfer.progressRatio));
        updateFavicon(state.transfer.progressRatio);
        render();
    }

    async function initReCaptcha() {
        return new Promise(resolve => {
            resolve();
            // if (state.recaptcha) {
            //     resolve();
            // }
            // load(DEFAULTS.SIZE_KEY, {useRecaptchaNet: true, autoHideBadge: true}).then((r => {
            //     resolve();
            //     state.recaptcha = r;
            //     prepareReCaptcha()
            // }))
        })
    }

    async function initServiceWorker() {
        if (state.capabilities.serviceWorker) {
            try {
                await navigator.serviceWorker.register('/serviceWorker.js');
                await navigator.serviceWorker.ready;
            } catch (e) {
                state.capabilities.streamTransfer = false;
            }
        }
    }    

    async function getToken() {
        await state.recaptchaPromise;
        return new Promise(resolve => {
            // disabled
            resolve('token');
            // state.recaptcha.execute('transfer').then((token) => {
            //     resolve(token);
            // })
        })
    }

    function prepareReCaptcha() {
        if (!self.cachedRecaptcha || self.cachedRecaptcha.e <= Date.now()) {
            self.cachedRecaptcha = {
                c: getToken(),
                e: Date.now() + 60*2.5*1000
            }
        }
        return self.cachedRecaptcha.c
    }


    emitter.on('DOMContentLoaded', () => {
        document.addEventListener('blur', () => (updateTitle = true));
        document.addEventListener('focus', () => {
            emitter.emit('DOMTitleChange', 'Neko Send');
            updateFavicon(0);
        });
        state.recaptchaPromise = initReCaptcha();
        updateFavicon(0);
        initServiceWorker();
        checkFiles();
    });

    // emitter.on('updateInfo', () => {
    //     updateFavicon(0);
    //     checkFiles();
    // });

    emitter.on('render', () => {
        lastRender = Date.now();
    });

    emitter.on('removeUpload', file => {
        state.archive.remove(file);
        if (state.archive.numFiles === 0) {
            state.archive.clear();
        }
        render();
    });

    emitter.on('delete', async ownedFile => {
        try {
            state.storage.remove(ownedFile.id);
            await ownedFile.del();
        } catch (e) {
            state.sentry.captureException(e);
        }
        render();
    });

    emitter.on('cancel', () => {
        state.transfer.cancel();
        emitter.emit('DOMTitleChange', 'Neko Send');
        updateFavicon(0);
    });

    emitter.on('addFiles', async ({
        files
    }) => {
        if (files.length < 1) {
            return;
        }
        if (files.length == 0) {
            prepareReCaptcha()
        }
        try {
            state.archive.addFiles(
                files,
                state.LIMITS.MAX_FILE_SIZE,
                state.LIMITS.MAX_FILES_PER_ARCHIVE
            );
        } catch (e) {
            if (e.message === 'fileTooBig' && maxSize < state.LIMITS.MAX_FILE_SIZE) {
                return emitter.emit('signup-cta', 'size');
            }
            state.modal = okDialog(
                state.translate(e.message, {
                    size: bytes(maxSize),
                    count: state.LIMITS.MAX_FILES_PER_ARCHIVE
                })
            );
        }
        render();
    });

    emitter.on('upload', async () => {
        if (state.storage.files.length >= state.LIMITS.MAX_ARCHIVES_PER_USER) {
            state.modal = okDialog(
                state.translate('tooManyArchives', {
                    count: state.LIMITS.MAX_ARCHIVES_PER_USER
                })
            );
            return render();
        }
        const archive = state.archive;
        const sender = new FileSender();

        sender.on('progress', updateProgress);
        sender.on('encrypting', render);
        sender.on('complete', render);
        state.transfer = sender;
        state.uploading = true;
        render();

        const links = openLinksInNewTab();
        await delay(200);
        const start = Date.now();
        try {
            let token = await prepareReCaptcha()
            self.cachedRecaptcha = null
            const ownedFile = await sender.upload(archive, token, state.capabilities);
            state.storage.totalUploads += 1;
            state.storage.addFile(ownedFile);
            console.log(state.storage, ownedFile)
            const duration = Date.now() - start;
            emitter.emit('DOMTitleChange', 'Neko Send');
            updateFavicon(0);
            
            // TODO integrate password into /upload request
            // if (archive.password) {
            //     emitter.emit('password', {
            //         password: archive.password,
            //         file: ownedFile
            //     });
            // }
            state.modal = state.capabilities.share ?
                shareDialog(ownedFile.name, ownedFile.url) :
                copyDialog(ownedFile.name, ownedFile.url);
        } catch (err) {
            if (err.message === '0') {
                // cancelled. do nothing
                render();
            } else {
                // eslint-disable-next-line no-console
                console.error(err);
                emitter.emit('pushState', '/error');
            }
        } finally {
            openLinksInNewTab(links, false);
            archive.clear();
            state.uploading = false;
            state.transfer = null;
            checkFiles();
            render();
            prepareReCaptcha();
        }
    });

    emitter.on('getMetadata', async () => {
        const file = state.fileInfo;
        const receiver = new FileReceiver(file);
        // console.log(state.fileInfo)
        try {
            await receiver.getMetadata();
            state.transfer = receiver;
        } catch (e) {
            if (e.message === '401' || e.message === '404') {
                file.invalidPwd = true;
                if (!file.requiresPassword) {
                    return emitter.emit('pushState', '/404');
                }
            } else {
                console.error(e);
                return emitter.emit('pushState', '/error');
            }
        }

        render();
    });

    emitter.on('download', async file => {
        state.transfer.on('progress', updateProgress);
        state.transfer.on('decrypting', render);
        state.transfer.on('complete', render);
        const links = openLinksInNewTab();
        const size = file.size;
        const start = Date.now();
        try {
            let token = await prepareReCaptcha()
            self.cachedRecaptcha = null
            const dl = state.transfer.download({
                stream: state.capabilities.streamTransfer,
                token: token,
            });
            render();
            await dl;
            state.storage.totalDownloads += 1;
            const duration = Date.now() - start;
            emitter.emit('DOMTitleChange', 'Neko Send');
            updateFavicon(0);
        } catch (err) {
            if (err && err.message === '0') {
                // download cancelled
                state.transfer.reset();
                render();
            } else {
                // eslint-disable-next-line no-console
                console.log(err)
                state.transfer = null;
                const location = err ? err.message === '404' ? '/404' : '/error' : '/error';
                if (location === '/error') {
                    const duration = Date.now() - start;
                }
                emitter.emit('pushState', location);
            }
        } finally {
            openLinksInNewTab(links, false);
        }
    });

    setInterval(() => {
        // poll for updates of the upload list
            if (!state.modal && state.route === '/') {
            checkFiles();
        }
    }, 2 * 60 * 1000);

    setInterval(() => {
        // poll for rerendering the file list countdown timers
        if (
            !state.modal &&
            state.route === '/' &&
            state.storage.files.length > 0 &&
            Date.now() - lastRender > 30000
        ) {
             render();
        }
    }, 60000);

    emitter.on('copy', ({ url }) => { copyToClipboard(url); });

    emitter.on('closeModal', () => {
        state.modal = null;
        // }
        render();
    });
}