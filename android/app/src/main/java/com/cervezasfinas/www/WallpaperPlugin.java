package com.cervezasfinas.www;

import android.app.WallpaperManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(
        name = "Wallpaper",
        permissions = {
                @Permission(strings = { android.Manifest.permission.SET_WALLPAPER }, alias = "wallpaper")
        }
)
public class WallpaperPlugin extends Plugin {

    @PluginMethod
    public void setWallpaper(PluginCall call) {
        String imageUrl = call.getString("url");
        boolean system = call.getBoolean("system", true);
        boolean lock = call.getBoolean("lock", false);

        if (imageUrl == null) {
            call.reject("Must provide an image URL");
            return;
        }

        // We need to do network request in a background thread
        new Thread(() -> {
            try {
                URL url = new URL(imageUrl);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setDoInput(true);
                connection.connect();
                InputStream input = connection.getInputStream();
                java.io.BufferedInputStream bufferedInput = new java.io.BufferedInputStream(input);
                Bitmap bitmap = BitmapFactory.decodeStream(bufferedInput);

                if (bitmap == null) {
                    call.reject("Failed to decode image from URL");
                    return;
                }

                WallpaperManager wallpaperManager = WallpaperManager.getInstance(getContext());
                
                int flags = 0;
                if (system) flags |= WallpaperManager.FLAG_SYSTEM;
                if (lock && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    flags |= WallpaperManager.FLAG_LOCK;
                }

                if (flags == 0) {
                    // Fallback to setting it globally for older Android versions
                    wallpaperManager.setBitmap(bitmap);
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    wallpaperManager.setBitmap(bitmap, null, true, flags);
                } else {
                    wallpaperManager.setBitmap(bitmap);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);

            } catch (Exception e) {
                Log.e("WallpaperPlugin", "Error setting wallpaper", e);
                call.reject("Error setting wallpaper: " + e.getMessage());
            }
        }).start();
    }
}
