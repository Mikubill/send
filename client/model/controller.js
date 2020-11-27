import FileReceiver from './fileReceiver';
import FileSender from './fileSender';
import copyDialog from '../ui/copyDialog';
import { updateFavicon } from '../ui/faviconProgressbar';
import okDialog from '../ui/okDialog';
import shareDialog from '../ui/shareDialog';

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

    async function checkFiles() {
        const changes = await state.storage.merge();
        if (changes.incoming || changes.downloadCount) {
            render();
        }
    }

    function updateProgress() {
        emitter.emit('DOMTitleChange', 'Sending ' + percent(state.transfer.progressRatio));
        updateFavicon(state.transfer.progressRatio);
        render();
    }

    emitter.on('DOMContentLoaded', () => {
        document.addEventListener('blur', () => (updateTitle = true));
        document.addEventListener('focus', () => {
            emitter.emit('DOMTitleChange', 'Send');
            updateFavicon(0);
        });
        updateFavicon(0);
        checkFiles();
    });

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
        emitter.emit('DOMTitleChange', 'Send');
        updateFavicon(0);
    });

    emitter.on('addFiles', async ({
        files
    }) => {
        if (files.length < 1) {
            return;
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
            let token;
            if (state.recaptcha) {
                token = await state.recaptcha.execute('upload')
            }
            const ownedFile = await sender.upload(archive, token, state.capabilities);
            state.storage.totalUploads += 1;
            const duration = Date.now() - start;
            emitter.emit('DOMTitleChange', 'Send');
            updateFavicon(0);

            state.storage.addFile(ownedFile);
            // TODO integrate password into /upload request
            if (archive.password) {
                emitter.emit('password', {
                    password: archive.password,
                    file: ownedFile
                });
            }
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
            await state.storage.merge();
            render();
        }
    });

    emitter.on('password', async ({
        password,
        file
    }) => {
        try {
            state.settingPassword = true;
            render();
            await file.setPassword(password);
            state.storage.writeFile(file);
            await delay(1000);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            state.passwordSetError = err;
        } finally {
            state.settingPassword = false;
        }
        render();
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
            const dl = state.transfer.download({
                stream: state.capabilities.streamTransfer
            });
            render();
            await dl;
            state.storage.totalDownloads += 1;
            const duration = Date.now() - start;
            emitter.emit('DOMTitleChange', 'Send');
            updateFavicon(0);
        } catch (err) {
            if (err.message === '0') {
                // download cancelled
                state.transfer.reset();
                render();
            } else {
                // eslint-disable-next-line no-console
                state.transfer = null;
                const location = err.message === '404' ? '/404' : '/error';
                if (location === '/error') {
                    const duration = Date.now() - start;
                }
                emitter.emit('pushState', location);
            }
        } finally {
            openLinksInNewTab(links, false);
        }
    });

    emitter.on('copy', ({ url }) => { copyToClipboard(url); });

    emitter.on('closeModal', () => {
        state.modal = null;
        // }
        render();
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
}