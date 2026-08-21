/** WebView của app Expo — cùng origin với FE, có `ReactNativeWebView`. */
export function isNativeWebView() {
  return typeof window !== "undefined" && !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;
}

export const NATIVE_AUTH_EVENT = "xe-native-auth";
