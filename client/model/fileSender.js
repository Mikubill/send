import Nanobus from 'nanobus';
import OwnedFile from './ownedFile';
import Keychain from './keychain';
import swMsg from './swMsg';
import { uploadWs } from './api';
import { encryptedSize } from './utils';
import { blobStream, concatStream } from './streams';
import { bufferToStr, strToBuffer, bytes } from './utils';

export default class FileSender extends Nanobus {
    constructor() {
        super('FileSender');
        this.keychain = new Keychain();
        this.reset();
    }

    get progressRatio() {
        return this.progress[0] / this.progress[1];
    }

    get progressIndefinite() {
        return (
            ['fileSizeProgress', 'notifyUploadEncryptDone'].indexOf(this.msg) === -1
        );
    }

    get sizes() {
        return {
            partialSize: bytes(this.progress[0]),
            totalSize: bytes(this.progress[1])
        };
    }

    reset() {
        this.uploadRequest = null;
        this.msg = 'importingFile';
        this.progress = [0, 1];
        this.cancelled = false;
    }

    cancel() {
        this.cancelled = true;
        if (this.uploadRequest) {
            this.uploadRequest.cancel();
        }
    }

    upload(archive, token, cap) {
        // if (!archive.hasExp) {
        //     archive.timeLimit = 0
        //     archive.dlimit = 0
        // }
        if (cap.streamTransfer && navigator.serviceWorker.controller) {
            return this.uploadStream(archive, token);
        }
        return this.uploadNative(archive, token);
    }

    async uploadWs(encStream, archive, token) {
        if (archive.password) {
            this.keychain.setPassword(archive.password);
        }
        const hasPassword = archive.password != undefined && archive.password != null
        const totalSize = encryptedSize(archive.size)
        const metadata = await this.keychain.encryptMetadata(archive);
        const authKey = await this.keychain.authKeyB64()
        this.uploadRequest = uploadWs(encStream, metadata, authKey, 
            archive.timeLimit, archive.dlimit, hasPassword, token,
            p => {
                this.progress = [p, totalSize];
                this.emit('progress');
            }
        );

        if (this.cancelled) {
            throw new Error(0);
        }

        this.msg = 'fileSizeProgress';
        this.emit('progress'); // HACK to kick MS Edge
        try {
            const result = await this.uploadRequest.result;
            this.msg = 'notifyUploadEncryptDone';
            this.uploadRequest = null;
            this.progress = [1, 1];
            const secretKey = bufferToStr(this.keychain.rawSecret);
            const ownedFile = new OwnedFile({
                id: result.id,
                url: `${result.url}#${secretKey}`,
                name: archive.name,
                size: archive.size,
                manifest: archive.manifest,
                time: result.duration,
                hasExp: archive.hasExp,
                speed: archive.size / (result.duration / 1000),
                createdAt: Date.now(),
                expiresAt: Date.now() + archive.timeLimit * 1000,
                secretKey: secretKey,
                nonce: this.keychain.nonce,
                ownerToken: result.ownerToken,
                dlimit: archive.dlimit,
                timeLimit: archive.timeLimit,
            });
            if (archive.password) {
                ownedFile.password = archive.password
                ownedFile._hasPassword = true;
            }
            return ownedFile;
        } catch (e) {
            this.msg = 'errorPageHeader';
            this.uploadRequest = null;
            throw e;
        }
    }

    async uploadStream(archive, token) {
        if (this.cancelled) {
            throw new Error(0);
        }
        this.msg = 'encryptingFile';
        this.emit('encrypting');
        const init = {
            request: 'initUpload',
            archive: archive,
            key: bufferToStr(this.keychain.rawSecret),
        }
        const encStream = await swMsg(init);
        return this.uploadWs(encStream, archive, token)
    }

    async uploadNative(archive, token) {
        // await import("buffer")
        let eceModule = await import('./ece');
        if (this.cancelled) {
            throw new Error(0);
        }
        this.msg = 'encryptingFile';
        this.emit('encrypting');

        const rawStream = concatStream(archive.files.map(file => blobStream(file)));
        const encStream = await eceModule.encryptStream(rawStream, this.keychain.rawSecret);
        return this.uploadWs(encStream, archive, token)
    }
}
