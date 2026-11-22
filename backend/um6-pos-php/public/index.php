<?php
declare(strict_types=1);

// Resolver ruta de src tanto si index.php está en la raíz (um6-pos-api/index.php)
// como si está en una subcarpeta "public" (backend/um6-pos-php/public/index.php).
$rootDir = __DIR__;
$srcDir = is_dir($rootDir . '/src') ? $rootDir . '/src' : dirname($rootDir) . '/src';

require_once $srcDir . '/bootstrap.php';
require_once $srcDir . '/auth.php';
require_once $srcDir . '/store.php';
require_once $srcDir . '/routes_stores.php';
require_once $srcDir . '/routes_pos.php';
require_once $srcDir . '/routes_orders.php';
require_once $srcDir . '/routes_planograms.php';
require_once $srcDir . '/routes_products.php';

// CORS básico y manejo de preflight
if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?: '/';

// Normalizar path quitando el subdirectorio base (por ejemplo /um6-pos-api)
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$baseDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
if ($baseDir !== '' && str_starts_with($path, $baseDir)) {
    $path = substr($path, strlen($baseDir));
    if ($path === '') {
        $path = '/';
    }
}

// Permitir usar ?route=/api/... como alternativa si no hay rewrite
if (isset($_GET['route']) && is_string($_GET['route']) && $_GET['route'] !== '') {
    $path = $_GET['route'];
}

// HEALTH (sin auth)
if ($method === 'GET' && $path === '/health') {
    try {
        $pdo = um6_pdo();
        $pdo->query('SELECT 1');
        um6_json_response(200, [
            'status' => 'ok',
            'timestamp' => gmdate('c'),
        ]);
    } catch (Throwable $e) {
        um6_json_error(500, 'Error de salud de la API', ['error' => $e->getMessage()]);
    }
}

// Rutas /api/* requieren autenticación
if (!str_starts_with($path, '/api/')) {
    um6_json_error(404, 'Ruta no encontrada');
}

$user = um6_authenticate();
$pdo = um6_pdo();

try {
    if (um6_route_stores($method, $path, $user, $pdo)) {
        exit;
    }
    if (um6_route_pos($method, $path, $user, $pdo)) {
        exit;
    }
    if (um6_route_orders($method, $path, $user, $pdo)) {
        exit;
    }
    if (um6_route_planograms($method, $path, $user, $pdo)) {
        exit;
    }
    if (um6_route_products($method, $path, $user, $pdo)) {
        exit;
    }

    um6_json_error(404, 'Ruta no encontrada');
} catch (Throwable $e) {
    if (!headers_sent()) {
        um6_json_error(500, 'Error inesperado', ['error' => $e->getMessage()]);
    }
    throw $e;
}
