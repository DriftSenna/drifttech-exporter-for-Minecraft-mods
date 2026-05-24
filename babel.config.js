module.exports = function(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    assumptions: {
      privateFieldsAsProperties: true,
      setPublicClassFields: true,
    },
    plugins: [
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      'react-native-reanimated/plugin',
    ],
  };
};
