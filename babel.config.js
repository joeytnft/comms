module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@hooks': './src/hooks',
            '@services': './src/services',
            '@store': './src/store',
            '@types': './src/types',
            '@utils': './src/utils',
            '@config': './src/config',
            '@crypto': './src/crypto',
            '@api': './src/api',
            '@contexts': './src/contexts',
            '@navigation': './src/navigation',
          },
        },
      ],
    ],
  };
};
