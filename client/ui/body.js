import html from 'choo/html';
import Header from './header';
import Footer from './footer';

export default (main) => {
    return (state, emit) => {
        const b = html `
      <div
        class="flex flex-col items-center font-sans md:h-screen md:bg-grey-10 dark:bg-black"
      >
        ${state.cache(Header, 'header').render()} 
        ${main(state, emit)}
        ${state.cache(Footer, 'footer').render()}
      </div>
    `;
        return b;
    };
};