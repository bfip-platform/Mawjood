// The family invite generator uses crypto.getRandomValues(). Hermes does not
// guarantee Web Crypto globals, so install the native secure-random polyfill
// before Expo Router evaluates app modules.
import 'react-native-get-random-values';
import 'expo-router/entry';
