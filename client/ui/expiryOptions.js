import html from 'choo/html';
import raw from 'choo/html/raw';
import { secondsToL10nId } from '../model/utils';
import selectbox from './selectbox';

export default (state, emit) => {
  const el = html `
        <div class="relative inline-block my-1 ${state.archive.hasExp
            ? ''
            : 'invisible'}" id="exp-2">
      ${raw(
        state.translate('archiveExpiryInfo', {
          downloadCount:
            '<span class="lg:inline-block md:block sm:inline-block block"></span><select id="dlCount"></select>',
          timespan: '<select id="timespan"></select>'
        })
      )}
      </div>`;

    function toggleExpiryInput(event) {
        event.stopPropagation();
        const checked = event.target.checked;
        const input = document.getElementById('exp-2');
        if (checked) {
            input.classList.remove('invisible');
            state.archive.hasExp = true;
        } else {
            input.classList.add('invisible');
            state.archive.hasExp = false;
        }
    }

    // if (el.__encoded) {
    //     // we're rendering on the server
    //     return el;
    // }

    const counts = state.DEFAULTS.DOWNLOAD_COUNTS
    // .filter(
    //     i => state.capabilities.account || i <= state.user.maxDownloads
    // );

    const dlCountSelect = el.querySelector('#dlCount');
    el.replaceChild(
        selectbox(
            state.archive.dlimit,
            counts,
            num => state.translate('downloadCount', {
                num
            }),
            value => {
                const max = state.LIMITS.MAX_DOWNLOADS;
                state.archive.dlimit = Math.min(value, max);
                if (value > max) {
                    // emit('signup-cta', 'count');
                    emitter.emit('replaceState', '/error');
                } else {
                    emit('render');
                }
            },
            'expire-after-dl-count-select'
        ),
        dlCountSelect
    );

    const expires = state.DEFAULTS.EXPIRE_TIMES_SECONDS
    // .filter(
    //     i => state.capabilities.account || i <= state.user.maxExpireSeconds
    // );

    const timeSelect = el.querySelector('#timespan');
    el.replaceChild(
        selectbox(
            state.archive.timeLimit,
            expires,
            num => {
                const l10n = secondsToL10nId(num);
                return state.translate(l10n.id, l10n);
            },
            value => {
                const max = state.LIMITS.MAX_EXPIRE_SECONDS;
                state.archive.timeLimit = Math.min(value, max);
                if (value > max) {
                    // emit('signup-cta', 'time');
                    emitter.emit('replaceState', '/error');
                } else {
                    emit('render');
                }
            },
            'expire-after-time-select'
        ),
        timeSelect
    );

    const wl = html `
    <div class="mt-1 px-1">
      <div class="checkbox inline-block mr-3">
        <input
          id="add-expiry"
          type="checkbox"
          ${state.archive.hasExp ? 'checked' : ''}
          autocomplete="off"
          onchange="${toggleExpiryInput}"
        />
        <label for="add-expiry">
          ${state.translate('expireOp')}
        </label>
      </div>
      ${el}
    </div>
  `;

    return wl;
};