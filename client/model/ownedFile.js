import Keychain from './keychain';
import { bufferToStr } from './utils';
import { del, fileInfo, setParams, setPassword } from './api';

export default class OwnedFile {
    constructor(obj) {
        if (!obj.manifest) {
            throw new Error('invalid file object');
        }
        this.id = obj.id;
        this.url = obj.url;
        this.name = obj.name;
        this.size = obj.size;
        this.manifest = obj.manifest;
        this.time = obj.time;
        this.speed = obj.speed;
        this.hasExp = obj.hasExp;
        this.password = obj.password

        this.createdAt = obj.createdAt;
        this.expiresAt = obj.expiresAt;
        this.ownerToken = obj.ownerToken;
        this.dlimit = obj.dlimit || 1;
        this.dtotal = obj.dtotal || 0;
        this.keychain = new Keychain(obj.secretKey, obj.nonce);
        this._hasPassword = !!obj.hasPassword;
        this.timeLimit = obj.timeLimit;
    }

    get hasPassword() {
        return !!this._hasPassword;
    }

    get expired() {
        if (this.expiresAt == 0) {
            return true;
        }
        if (!this.hasExp) {
            return false
        }
        return this.dlimit === this.dtotal || Date.now() > this.expiresAt;
    }

    del() {
        return del(this.id, this.ownerToken);
    }

    changeLimit(dlimit, user = {}) {
        if (this.dlimit !== dlimit) {
            this.dlimit = dlimit;
            return setParams(this.id, this.ownerToken, user.bearerToken, {
                dlimit
            });
        }
        return Promise.resolve(true);
    }

    async updateDownloadCount(result) {
        const oldTotal = this.dtotal, oldLimit = this.dlimit;
        if (!result) {
            result = await fileInfo(this.id, this.ownerToken);
            if (result.length > 0) { 
                result = result[0] 
            }
        }
        this.dtotal = result.dtotal;
        this.dlimit = result.dlimit;
        if (result.ttl == 0) {
            this.expiresAt = 0;  
        }
        return oldTotal !== this.dtotal || oldLimit !== this.dlimit;
    }

    toJSON() {
        return {
            id: this.id,
            url: this.url,
            name: this.name,
            size: this.size,
            manifest: this.manifest,
            time: this.time,
            speed: this.speed,
            expiry: this.hasExp,
            createdAt: this.createdAt,
            expiresAt: this.expiresAt,
            secretKey: bufferToStr(this.keychain.rawSecret),
            ownerToken: this.ownerToken,
            dlimit: this.dlimit,
            dtotal: this.dtotal,
            hasPassword: this.hasPassword,
            timeLimit: this.timeLimit
        };
    }
}