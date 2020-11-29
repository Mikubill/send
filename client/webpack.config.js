const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const WebpackAutoInject = require('webpack-auto-inject-version');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebPackPlugin = require('html-webpack-plugin');
const TerserPlugin = require("terser-webpack-plugin");
const childProcess = require('child_process')
const FontminPlugin = require('./build/fontmin')

const mode = 'production';
const debug = !(mode == 'production')

const webJsOptions = {
  babelrc: false,
  presets: [
    [
      '@babel/preset-env',
      {
        modules: false,
        bugfixes: true,
        useBuiltIns: 'usage',
        corejs: 3,
      }
    ]
  ],
  plugins: [
    ['module:nanohtml'],
    // ["module:fast-async"],
    // ["transform-async-with-nodent"],
    ["babel-plugin-idx"],
    ["babel-plugin-groundskeeper-willie"],

    ["@babel/plugin-transform-runtime"],
    ['@babel/plugin-syntax-dynamic-import'],
    ['@babel/plugin-proposal-class-properties']
  ]
};

const serviceWorker = {
    watch: debug,
    target: 'webworker',
    entry: {
        serviceWorker: './model/serviceWorker.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: '/'
    },
    module: {
        rules: [{
                test: /\.(png|jpg)$/,
                loader: 'file-loader',
                options: {
                    name: '[name].[contenthash:8].[ext]'
                }
            },
            {
                test: /\.svg$/,
                use: [{
                        loader: 'file-loader',
                        options: {
                            name: '[name].[contenthash:8].[ext]'
                        }
                    },
                    {
                        loader: 'svgo-loader',
                        options: {
                            plugins: [{
                                    removeViewBox: false
                                }, // true causes stretched images
                                {
                                    convertStyleToAttrs: true
                                }, // for CSP, no unsafe-eval
                                {
                                    removeTitle: true
                                } // for smallness
                            ]
                        }
                    }
                ]
            },
            {
                // loads all assets from assets/ for use by common/assets.js
                test: require.resolve('./model/generate_asset_map.js'),
                use: ['babel-loader', 'val-loader']
            }
        ]
    },
    resolve: {
        alias: {
            crypto: "crypto-browserify",
            path: "path-browserify",
            stream: "stream-browserify"
        }
    },
    plugins: [
        new webpack.IgnorePlugin(/\.\.\/dist/),
        new webpack.DefinePlugin({
            __VERSION__: childProcess.execSync('git rev-list HEAD --count').toString()
        })
    ],
    // devtool: 'source-map',
    optimization: {
        mergeDuplicateChunks: true,
        removeAvailableModules: true,
        providedExports: true,
        sideEffects: false,
        minimizer: [
            new TerserPlugin({
                cache: false,
                parallel: true,
                sourceMap: debug,     // set to true if debugging of production build needed
                terserOptions: debug ? {} : {
                  keep_classnames: false,
                  mangle: true,
                  // modules: true,
                  compress: true,
                  keep_fnames: false,
                  output: {
                    comments: false,
                  }
                }
            })
        ],
    },
};

const web = {
    watch: debug,
    target: 'web',
    entry: {
        app: ['./model/main.js']
    },
    output: {
        publicPath: "/assets/",
        chunkFilename: 'chunk.[contenthash:8].js',
        filename: '[name].[contenthash:8].js',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.js/,
                include: /@fluent[\\/](bundle|langneg|syntax)[\\/]/,
                type: "javascript/auto",
            }, 
            {
                test: /\.js/,
                include: /[\\/](choo)[\\/]/,
                loader: "webpack-unassert-loader"
            }, 
            {
                test: /\.js/,
                loader: 'babel-loader' ,
                include: [
                  path.resolve(__dirname, 'ui'),
                  path.resolve(__dirname, 'model'),
                ],
                options: debug ? undefined : webJsOptions
            }, 
            {
                test: /\.(png|jpg)$/,
                loader: 'file-loader',
                options: {
                    name: '[name].[contenthash:8].[ext]'
                }
            },
            {
                test: /\.svg$/,
                use: [{
                        loader: 'file-loader',
                        options: {
                            name: '[name].[contenthash:8].[ext]'
                        }
                    },
                    {
                        loader: 'svgo-loader',
                        options: {
                            plugins: [{
                                    cleanupIDs: false
                                },
                                {
                                    removeViewBox: false
                                }, // true causes stretched images
                                {
                                    convertStyleToAttrs: true
                                }, // for CSP, no unsafe-eval
                                {
                                    removeTitle: true
                                } // for smallness
                            ]
                        }
                    }
                ]
            },
            {
                // creates style.css with all styles
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    "css-loader",
                    "postcss-loader"
                ]
            },
            {
                test: /\.ftl$/,
                use: 'raw-loader'
            },
            {
                // loads all assets from assets/ for use by common/assets.js
                test: require.resolve('./model/generate_asset_map.js'),
                use: ['babel-loader', 'val-loader']
            }
        ]
    },
    plugins: [
        new CopyPlugin({
            patterns: [{
                context: 'public',
                from: '*.*'
            }]
        }),
        new webpack.EnvironmentPlugin(['NODE_ENV']),
        new webpack.IgnorePlugin(/\.\.\/dist/), // used in common/*.js
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash:8].css',
        }),
        new FontminPlugin({
            autodetect: true
        }),
        new HtmlWebPackPlugin({
            filename: "index.html",
            template: "index.template.html",
            minify: debug ? {} : {
                html5: true,
                collapseWhitespace: true,
                minifyCSS: true,
                minifyJS: true
            },
            scriptLoading: "defer",
        }),
    ],
    devtool: debug ? undefined : 'source-map',
    resolve: {
        alias: {
            crypto: "crypto-browserify",
            stream: "stream-browserify",
        }
    },
    optimization: {
        usedExports: true,
        splitChunks: {
            cacheGroups: {
                c0: {
                    test: /[\\/]node_modules[\\/]/,
                    name: "vendors",
                    chunks: 'initial',
                },
                c1: {
                    test: /[\\/]node_modules[\\/]/,
                    chunks: 'async',
                    maxSize: 256000,
                },
                c2: {
                    test: /[\\/](ui|model)[\\/]/,
                    chunks: 'async',
                },
            }
        },
        mergeDuplicateChunks: true,
        removeAvailableModules: true,
        providedExports: true,
        sideEffects: false,
        minimizer: [
            new TerserPlugin({
                cache: false,
                parallel: true,
                sourceMap: debug,     // set to true if debugging of production build needed
                terserOptions: debug ? {} : {
                  keep_classnames: false,
                  mangle: true,
                  // modules: true,
                  compress: true,
                  keep_fnames: false,
                  output: {
                    comments: false,
                  }
                }
            })
        ],
    },
};

module.exports = (env, argv) => {
    console.error(`mode: ${mode}`);
    process.env.NODE_ENV = web.mode = serviceWorker.mode = mode;
    return [web, serviceWorker];
};
