import choo from 'choo';
import download from '../ui/download';
import body from '../ui/body';
import home from '../ui/home';
import unsupported from '../ui/unsupported';
import legal from '../ui/legal';
import error from '../ui/error';
import blank from '../ui/blank';
import notFound from '../ui/notFound';

export default (app = choo({ hash: true })) => {
    // console.log(body, home)
    app.route('/', body(home));
    app.route('/download/:id', body(download));
    app.route('/download/:id/:key', body(download));
    app.route('/unsupported/:reason', body(unsupported));
    app.route('/legal', body(legal));
    app.route('/error', body(error));
    app.route('/blank', body(blank));
    // app.route('/oauth', (state, emit) => {
    //   emit('authenticate', state.query.code, state.query.state);
    // });
    // app.route('/login', (state, emit) => {
    //   emit('replaceState', '/');
    //   setTimeout(() => emit('render'));
    // });
    app.route('*', body(notFound));
    return app;
};