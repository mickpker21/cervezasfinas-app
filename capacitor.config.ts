// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cervezasfinas.www',   // el que pusiste en el init
  appName: 'CERVEZAS FINAS',        // el nombre que pusiste
  webDir: 'dist',                   // 👈 IMPORTANTE: dist, no www
  bundledWebRuntime: false,
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
      iconColor: "#059669"
    }
  },
};

export default config;
