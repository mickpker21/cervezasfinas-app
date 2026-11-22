<?php
/**
 * admin_update_user.php
 * Endpoint administrativo para actualizar usuarios (rol, ruta y contraseña)
 * Usado en entornos donde no se puede ejecutar Node.js (como Hostinger Básico)
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

// Manejo de pre-flight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require_once 'supabase_config.php';

// Verificar que las variables de configuración existen
if (empty($SUPABASE_URL) || empty($SUPABASE_SERVICE_KEY)) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "CONFIG_ERROR", "details" => "Falta configuración en supabase_config.php"]);
    exit;
}

// Obtener el cuerpo de la petición
$json = file_get_contents('php://input');
$data = json_decode($json, true);

$user_id = $data['user_id'] ?? null;
$type = $data['type'] ?? null;
$route = $data['route'] ?? null;
$password = $data['password'] ?? null;

if (!$user_id || !$type) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "VALIDATION_ERROR", "details" => "user_id y type son requeridos"]);
    exit;
}

// Preparar el payload para la API de Supabase Admin
$updateData = [
    "user_metadata" => [
        "type" => $type,
        "role" => $type,
        "route" => $route
    ]
];

// Si se proporcionó una nueva contraseña, incluirla
if (!empty($password)) {
    $updateData["password"] = $password;
}

// Endpoint de la API Admin de Supabase
$url = $SUPABASE_URL . "/auth/v1/admin/users/" . $user_id;

// Iniciar cURL
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PUT"); // Para actualizar se usa PUT en la API admin
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($updateData));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "apikey: " . $SUPABASE_SERVICE_KEY,
    "Authorization: Bearer " . $SUPABASE_SERVICE_KEY
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "CURL_ERROR", "details" => $error]);
    exit;
}

// Decodificar respuesta de Supabase
$supabaseResponse = json_decode($response, true);

if ($httpCode >= 200 && $httpCode < 300) {
    echo json_encode([
        "success" => true,
        "message" => "Usuario actualizado correctamente",
        "data" => $supabaseResponse
    ]);
} else {
    http_response_code($httpCode);
    echo json_encode([
        "success" => false,
        "error" => "SUPABASE_ERROR",
        "status" => $httpCode,
        "details" => $supabaseResponse ?? $response
    ]);
}
