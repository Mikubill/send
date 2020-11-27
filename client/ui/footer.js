import html from 'choo/html';
import Component from 'choo/component';

class Footer extends Component {
    constructor(name, state) {
        super(name);
        this.state = state;
        this.encode = atob;
    }

    update() {
        return false;
    }

    createElement() {
        const translate = this.state.translate;
        return html `
      <footer
        class="flex flex-col md:flex-row items-start w-full flex-none self-start p-6 md:p-8 font-medium text-xs text-grey-60 dark:text-grey-40 md:items-center justify-between"
      >
        <div></div>
        <ul
          class="flex flex-col md:flex-row items-start md:items-center md:justify-end"
        >
          <li class="m-2">
            <a href="/legal"> ${translate('footerLinkPrivacy')} </a>
          </li>
          <li class="m-2">
            <a href="${atob("bWFpbHRvOmFidXNlQG5la28ubno")}">Abuse</a>
          </li>
          <li class="m-2">
            <a href="https://github.com/Mikubill/send">Source</a>
          </li>
        </ul>
      </footer>
    `;
    }
}

export default Footer;