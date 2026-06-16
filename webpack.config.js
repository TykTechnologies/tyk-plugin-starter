const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/plugin.ts',
  target: ['web', 'es2020'],
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      // goja has no Node modules; webpack should not try to polyfill them
      crypto: false,
      fs: false,
      path: false,
      stream: false,
      http: false,
      https: false,
      url: false,
      net: false,
      tls: false,
      zlib: false,
    },
  },
  output: {
    filename: 'plugin.js',
    path: path.resolve(__dirname, 'dist'),
    iife: false,
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
  ],
  optimization: {
    // Keep readable-ish output for goja debugging; uncomment to minify.
    minimize: false,
  },
  performance: {
    hints: false,
  },
  devtool: false,
};
