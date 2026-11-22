import { supabase } from '@/supabaseClient';
import imageCompression from 'browser-image-compression';

const BASE_URL = (import.meta.env.VITE_UM6_POS_API_URL || '').replace(/\/$/, '');

/**
 * Sube una imagen al servidor Hostinger (PHP).
 * @param {File} file - El archivo de imagen a subir.
 * @param {string} folder - Carpeta de destino (ej. 'visitas', 'evaluaciones').
 * @returns {Promise<string|null>} - URL pública de la imagen o null si falla.
 */
export async function uploadImageToHostinger(file, folder = 'general') {
    if (!file) return null;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
            console.error('[uploadImageToHostinger] No hay sesión activa.');
            return null;
        }

        // --- COMPRESIÓN DE IMAGEN ---
        const options = {
            maxSizeMB: 0.3,          // Límite de ~300 KB
            maxWidthOrHeight: 1200,  // Resolución máxima 1200px
            useWebWorker: true,
            fileType: 'image/jpeg'   // Convertir a JPEG para mejor compresión
        };
        
        let fileToUpload = file;
        try {
            console.log('[uploadImageToHostinger] Comprimiendo imagen de:', (file.size / 1024 / 1024).toFixed(2), 'MB');
            fileToUpload = await imageCompression(file, options);
            console.log('[uploadImageToHostinger] Imagen comprimida a:', (fileToUpload.size / 1024 / 1024).toFixed(2), 'MB');
        } catch (error) {
            console.warn('[uploadImageToHostinger] Falló la compresión, enviando archivo original:', error);
            // Si falla, intentamos mandar el archivo original
        }
        // -----------------------------

        const formData = new FormData();
        formData.append('image', fileToUpload);
        formData.append('folder', folder);

        // Ajustar la URL según la estructura. 
        // Asumimos que BASE_URL apunta a .../src o .../api donde vive upload_image.php
        // Si BASE_URL apunta a routes_pos.php, necesitamos subir un nivel o ajustar.
        // Por seguridad, intentamos construir la URL relativa a la base del backend.

        // HACK: Si BASE_URL termina en .php (ej routes_pos.php), lo quitamos para buscar el upload_image.php en el mismo dir
        let uploadUrl = BASE_URL;
        if (uploadUrl.endsWith('.php')) {
            uploadUrl = uploadUrl.substring(0, uploadUrl.lastIndexOf('/'));
        }

        uploadUrl = `${uploadUrl}/upload_image.php`;

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('[uploadImageToHostinger] Error response:', text);
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            return data.url;
        } else {
            console.error('[uploadImageToHostinger] Error del servidor:', data.message);
            return null;
        }
    } catch (error) {
        console.error('[uploadImageToHostinger] Error de red o excepción:', error);
        return null;
    }
}
