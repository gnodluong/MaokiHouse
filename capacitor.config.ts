import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maokihouse.admin',
  appName: 'Maoki Admin',
  webDir: 'mobile/dist',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
  plugins: {
    // Native HTTP for fetch/XHR: calls to the Maoki web API are not blocked by browser CORS rules.
    CapacitorHttp: { enabled: true },
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#f4f5f7' },
  },
};
export default config;
