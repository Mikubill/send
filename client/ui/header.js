import html from 'choo/html';
import Component from 'choo/component';
// import Account from './account';
import assets from '../model/assets';
import {
    platform
} from '../model/utils';

class Header extends Component {
    constructor(name, state, emit) {
        super(name);
        this.state = state;
        this.emit = emit;
        // this.account = state.cache(Account, 'account');
    }

    update() {
        this.emit('render');
        return false;
    }
    createElement() {
        const title =
            platform() === 'android' ?
            html `
            <a class="flex flex-row items-center">
              <img src="${assets.get('icon.svg')}" />
              <svg class="w-48">
                <use xlink:href="${assets.get('wordmark.svg')}#logo" />
              </svg>
            </a>
          ` :
            html `
            <a class="flex flex-row items-center" href="/">
              <img
                alt="${this.state.translate('title')}"
                src="${assets.get('icon.svg')}"
              />
              <svg viewBox="66 0 340 64" class="w-48 md:w-64">
                <use xlink:href="${assets.get('wordmark.svg')}#logo" />
              </svg>
            </a>
          `;
        return html `
      <header
        class="main-header relative flex-none flex flex-row items-center justify-between w-full px-6 md:px-8 h-16 md:h-24 z-20 bg-transparent"
      >
        ${title} 
      </header>
    `;
    }
}

export default Header;