import raw from 'choo/html/raw';
import qrcode from '../model/qrcode';

export default (url) => {
    const gen = qrcode(5, 'L');
    gen.addData(url);
    gen.make();
    const qr = gen.createSvgTag({
        scalable: true
    });
    return raw(qr);
};