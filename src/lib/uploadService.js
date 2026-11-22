import { Capacitor } from '@capacitor/core';

const API_BASE = Capacitor.isNativePlatform()
    ? "https://cervezasfinas.com/api"
    : "/api";

const UPLOAD_SCRIPT_URL = `${API_BASE}/upload_photo.php`;

/**
 * Uploads a photo to the server.
 * @param {File} file - The file object to upload.
 * @param {string} folder - The subfolder to store the image in (e.g., 'visitas-fotos', 'evaluaciones').
 * @returns {Promise<string|null>} - The public URL of the uploaded image, or null if failed.
 */
export async function uploadPhoto(file, folder = 'default') {
    if (!file) return null;

    const formData = new FormData();
    
    // If it's a Blob (not a File with a name), provide a default name with extension
    if (file instanceof Blob && !(file instanceof File)) {
        formData.append('file', file, `upload_${Date.now()}.jpg`);
    } else {
        formData.append('file', file);
    }
    
    formData.append('folder', folder);

    console.log(`[uploadService] Intentando subir a: ${UPLOAD_SCRIPT_URL}`);

    try {
        const response = await fetch(UPLOAD_SCRIPT_URL, {
            method: 'POST',
            body: formData,
        });

        // Leemos el cuerpo UNA sola vez como texto
        const responseText = await response.text();

        if (!response.ok) {
            console.error('[uploadService] Error HTTP:', response.status, responseText);
            // alert(`Error al subir imagen: Servidor respondió ${response.status}. Revisa la consola.`);
            throw new Error(`Upload failed with status ${response.status}`);
        }

        // Intentamos parsear el texto como JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('[uploadService] Respuesta no es JSON válido:', responseText.substring(0, 100));
            // alert('Error: La respuesta del servidor no es JSON. Verifica la URL de upload_photo.php');
            throw new Error('Invalid JSON response');
        }

        if (data.success && data.url) {
            console.log('[uploadService] Subida exitosa:', data.url);
            return data.url;
        } else {
            console.error('[uploadService] El servidor devolvió error:', data.error);
            // alert(`Error del servidor: ${data.error}`);
            return null;
        }
    } catch (error) {
        console.error('[uploadService] Error de red o código:', error);
        // alert(`Error de conexión al subir foto: ${error.message}`);
        return null;
    }
}
