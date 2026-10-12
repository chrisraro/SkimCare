/**
 * onnxruntime-react-native ships a legacy `unimodule.json`, so Expo autolinking treats it
 * as an Expo module and skips React Native autolinking: `OnnxruntimePackage` is then never
 * registered and `NativeModules.Onnxruntime` is null at runtime ("Cannot read property
 * 'install' of null"). An explicit (empty) platform config makes Expo link it as a normal
 * React Native library. Check with:
 *   npx expo-modules-autolinking react-native-config --platform android --json
 */
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: { android: {}, ios: {} },
    },
  },
};
