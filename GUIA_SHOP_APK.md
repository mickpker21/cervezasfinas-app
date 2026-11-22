# Guía de Compilación APK - Cervezas Finas Shop (Versión Online)

Esta guía te ayudará a generar la APK para la **Tienda (Shop)**. Esta versión está configurada para funcionar 100% Online (tipo sitio web móvil).

## 1. Requisitos Previos
Ya tienes `npm` y `Android Studio` instalados (son los mismos que para la App de Reparto).

## 2. Preparar el Proyecto (Solo una vez)
Ya he configurado el proyecto por ti. Estos pasos ya se ejecutaron, pero si instalas en otra máquina, ejecuta:

```bash
cd cervezasfinas-shop
npm install
npx cap add android
```

## 3. Generar la APK (Paso a Paso)

Cada vez que quieras generar una nueva APK:

### Paso 1: Construir la Web
Desde la terminal en la carpeta `cervezasfinas-shop`:
```bash
cd cervezasfinas-shop
npm run build
```
*(Esto crea la carpeta `dist` con la última versión de tu tienda).*

### Paso 2: Sincronizar con Android
```bash
npx cap sync android
```
*(Esto copia la carpeta `dist` dentro del proyecto Android).*

### Paso 3: Abrir en Android Studio
```bash
npx cap open android
```
*(Se abrirá Android Studio).*

### Paso 4: Configurar y Compilar (En Android Studio)
1.  Espera a que termine el "Gradle Sync" (barra inferior).
2.  (Opcional) Cambia el icono en `res/mipmap` si deseas.
3.  Ve al menú **Build** > **Generate Signed Bundle / APK**.
4.  Selecciona **APK**.
5.  Usa tu llave (Keystore) habitual (la misma de la otra app sirve, o crea una nueva si prefieres separar firmas).
6.  Selecciona `release` y marca V1 y V2.
7.  ¡Listo! Tendrás tu `app-release.apk` para la Tienda.

## Notas Importantes
*   **Online Only**: Esta App requiere internet para mostrar productos y precios actualizados.
*   **Actualizaciones**: Si cambias algo en el código de la tienda React, debes repetir los pasos 1, 2, 3 y 4.
