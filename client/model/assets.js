// import genmap from './generate_asset_map';
// const isServer = typeof genmap === 'function';
let prefix = '';
import manifest from './generate_asset_map';
const assets = manifest;

function getAsset(name) {
    // console.log(assets[name].default)
    return prefix + assets[name].default;
}

function setPrefix(name) {
    prefix = name;
}

function getMatches(match) {
    return Object.keys(assets)
    .filter(k => match.test(k))
    .map(getAsset);
}

const instance = {
    setPrefix: setPrefix,
    get: getAsset,
    match: getMatches,
    // setMiddleware: (middleware) => {
    //     function getManifest() {
    //         return JSON.parse(
    //             middleware.fileSystem.readFileSync(
    //                 middleware.getFilenameFromUrl('/manifest.json')
    //             )
    //         );
    //     }
    //     if (middleware) {
    //         instance.get = function getAssetWithMiddleware(name) {
    //             const m = getManifest();
    //             return prefix + m[name];
    //         };
    //         instance.match = function matchAssetWithMiddleware(match) {
    //             const m = getManifest();
    //             return Object.keys(m)
    //             .filter(k => match.test(k))
    //             .map(k => prefix + m[k]);
    //         };
    //     }
    // }
};

export default instance;