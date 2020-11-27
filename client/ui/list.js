import html from 'choo/html';

export default (items, ulStyle = '', liStyle = '') => {
    const lis = items.map(
        i =>
        html `
        <li class="${liStyle}">${i}</li>
      `
    );
    return html `
    <ul class="${ulStyle}">
      ${lis}
    </ul>
  `;
}