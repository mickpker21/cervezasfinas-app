<?php
// Archivo de conexión a base de datos MySQL
// Incluir este archivo en todas las APIs

// JWT Secret (cambiar en producción)
define('JWT_SECRET', 'cf-shop-secret-2024-ultra-seguro');

// Función para conectar a la base de datos
function getDB() {
    $host = 'localhost';
    $dbname = 'u815168173_um6pos';  // Base de datos cervezasfinas.com
    $user = 'u815168173_um6user';    // Usuario de MySQL
    $pass = 'Rsfl284@';  // Password MySQL
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    } catch(PDOException $e) {
        sendJSON(['error' => 'Database connection failed'], 500);
        exit;
    }
}

// Función para enviar respuesta JSON
function sendJSON($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit();
}

// Función para manejar CORS
function handleCORS() {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}

// Función para generar JWT
function generateJWT($client_code) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'client_code' => $client_code,
        'iat' => time(),
        'exp' => time() + (86400 * 30) // 30 días
    ]);
    
    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
    
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    
    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

// Función para validar JWT
function validateJWT($token) {
    if (!$token) return false;
    
    $tokenParts = explode('.', $token);
    if (count($tokenParts) !== 3) return false;
    
    $header = $tokenParts[0];
    $payload = $tokenParts[1];
    $signatureProvided = $tokenParts[2];
    
    $base64UrlHeader = $header;
    $base64UrlPayload = $payload;
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    
    if ($base64UrlSignature !== $signatureProvided) return false;
    
    $payloadDecoded = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $payload)), true);
    
    // Verificar expiración
    if (isset($payloadDecoded['exp']) && $payloadDecoded['exp'] < time()) {
        return false;
    }
    
    return $payloadDecoded;
}

// Función para obtener token del header Authorization
// Función para obtener headers de forma compatible
function getRequestHeaders() {
    if (function_exists('getallheaders')) {
        return getallheaders();
    }
    $headers = [];
    foreach ($_SERVER as $name => $value) {
        if (substr($name, 0, 5) == 'HTTP_') {
            $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
        }
    }
    return $headers;
}

// Función para obtener token del header Authorization
function getBearerToken() {
    $headers = getRequestHeaders();
    $authHeader = null;

    if (isset($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
    } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) { // Apache fallback
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) { // Rewrite fallback
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    if ($authHeader) {
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            return $matches[1];
        }
    }
    return null;
}

// Función para requerir autenticación
function requireAuth() {
    $token = getBearerToken();
    $payload = validateJWT($token);
    
    if (!$payload) {
        sendJSON(['error' => 'Unauthorized'], 401);
    }
    
    return $payload;
}
?>
