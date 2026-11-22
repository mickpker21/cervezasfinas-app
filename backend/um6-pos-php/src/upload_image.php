<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/auth.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 1. Autenticación (Reutilizamos lógica de auth.php)
$user = um6_authenticate(); 
// um6_authenticate termina el script si falla, así que si llegamos aquí, el usuario es válido.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    um6_json_error(405, 'Método no permitido');
}

// 2. Validar archivo
if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    um6_json_error(400, 'No se recibió ninguna imagen válida.');
}

$file = $_FILES['image'];
$folder = isset($_POST['folder']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['folder']) : 'general';

// Validar tipo de archivo
$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($file['tmp_name']);

if (!in_array($mimeType, $allowedTypes)) {
    um6_json_error(400, 'Tipo de archivo no permitido. Solo imágenes (JPG, PNG, GIF, WEBP).');
}

// 3. Preparar directorio
$baseDir = __DIR__ . '/../uploads';
$targetDir = $baseDir . '/' . $folder;

if (!is_dir($targetDir)) {
    if (!mkdir($targetDir, 0755, true)) {
        um6_json_error(500, 'Error al crear el directorio de destino.');
    }
}

// 4. Generar nombre único
$extension = pathinfo($file['name'], PATHINFO_EXTENSION);
if (!$extension) {
    $extension = 'jpg'; // Fallback
}
$filename = uniqid('img_', true) . '.' . $extension;
$targetPath = $targetDir . '/' . $filename;

// 5. Mover archivo
if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    // Construir URL pública
    // Asumimos que el script está en /api/upload_image.php y las imágenes en /api/uploads/
    // Ajustar según la estructura real del servidor.
    // Si um6-pos-php está en la raíz pública o en una subcarpeta, la URL cambiará.
    // Usaremos una URL relativa al dominio actual o una absoluta si se configura.
    
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'];
    // Detectar path base. Si este script está en /backend/um6-pos-php/src/upload_image.php
    // y uploads está en /backend/um6-pos-php/uploads/
    // La URL web dependerá de cómo esté mapeado el servidor web.
    // Asumiremos una estructura estándar donde 'src' no está en la URL pública o se accede vía /api
    
    // ESTRATEGIA SEGURA: Devolver la ruta relativa desde la raíz del proyecto backend
    // El frontend deberá saber la URL base del backend.
    
    // Si el usuario accede a https://dominio.com/api/upload_image.php
    // La imagen estará en https://dominio.com/api/uploads/folder/filename
    
    // Intentamos deducir la URL base
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']); // e.g. /api
    // Si src es parte de la ruta, subimos un nivel para llegar a la raíz del proyecto backend
    $baseWebDir = str_replace('/src', '', $scriptDir); 
    
    // Ajuste fino: si uploads está al mismo nivel que src
    $publicUrl = $protocol . "://" . $host . $baseWebDir . "/uploads/" . $folder . "/" . $filename;

    echo json_encode([
        'success' => true,
        'url' => $publicUrl,
        'filename' => $filename
    ]);
} else {
    um6_json_error(500, 'Error al guardar el archivo en el servidor.');
}
