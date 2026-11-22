import imageCompression from 'browser-image-compression';

/**
 * Comprime una imagen File/Blob.
 * @param {File|Blob} file - Imagen a comprimir
 * @param {Object} options - Opciones de compresión
 * @returns {Promise<File>} - Imagen comprimida
 */
export const compressImage = async (file, options = {}) => {
    const defaultOptions = {
        maxSizeMB: 1,          // Tamaño máximo en MB
        maxWidthOrHeight: 1920, // Máximo ancho/alto en px
        useWebWorker: true,     // Usar Web Worker para mejor rendimiento
        fileType: 'image/jpeg', // Formato de salida
        ...options
    };

    try {
        const compressedFile = await imageCompression(file, defaultOptions);
        console.log(`[fileUtils] Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
        return compressedFile;
    } catch (error) {
        console.warn('[fileUtils] Image compression failed, using original:', error);
        return file; // Fallback al archivo original
    }
};

/**
 * Convierte un objeto File/Blob a una cadena Base64.
 * Opcionalmente comprime la imagen antes de convertir.
 * @param {File|Blob} file - Archivo a convertir
 * @param {boolean} compress - Si debe comprimir antes de convertir
 * @returns {Promise<string>} - Data URL en Base64
 */
export const fileToBase64 = async (file, compress = true) => {
    let fileToProcess = file;

    // Comprimir si es una imagen y compress=true
    if (compress && file.type?.startsWith('image/')) {
        fileToProcess = await compressImage(file);
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(fileToProcess);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};

/**
 * Convierte una cadena Base64 (Data URL) de vuelta a un Blob.
 * Útil para subir la imagen a Supabase Storage.
 */
export const base64ToBlob = async (base64Data) => {
    const response = await fetch(base64Data);
    const blob = await response.blob();
    return blob;
};
