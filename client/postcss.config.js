const purgeFromJs = (content) => {
  return content.match(/[A-Za-z0-9-_:\w/]+/g) || [];
}

const options = {
  plugins: [
    require('tailwindcss'),
    require('cssnano')({
      preset: 'default'
    }),
    require('autoprefixer'),
    require('@fullhuman/postcss-purgecss')({
      content: [
        './model/*.js',
        './ui/*.js',
        './index.template.html'
      ],
      extractors: [
        {
          extractor: purgeFromJs,
          extensions: ['js']
        }
      ]
    }),
  ]
};

// if (process.env.NODE_ENV === 'development') {
//   options.map = { inline: true };
// } else {
//   options.plugins.push(
    
//   );
//   options.plugins.push(

//   );
// }

module.exports = options;
