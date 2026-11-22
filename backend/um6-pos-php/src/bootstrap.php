<?php
declare(strict_types=1);

/**
 * Bootstrap básico para la API PHP de UM6 POS.
 *
 * - Carga variables de entorno desde .env si existe.
 * - Expone helpers para configuración, base de datos, JSON y errores.
 */

/**
 * Carga un archivo .env muy simple (FORMATO: KEY=VALUE).
 *
 * @param string $path
 * @return void
 */
function um6_load_env(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }
        [$key, $value] = $parts;
        $key = trim($key);
        $value = trim($value);
        if ($key === '') {
            continue;
        }
        if (!array_key_exists($key, $_ENV)) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}

// Intentar cargar .env local (misma carpeta del backend PHP)
$envPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
if (is_file($envPath)) {
    um6_load_env($envPath);
}

/**
 * Helper para leer una variable de entorno con valor por defecto.
 *
 * @param string $key
 * @param mixed $default
 * @return mixed
 */
function um6_env(string $key, mixed $default = null): mixed
{
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }
    return $value;
}

/**
 * Devuelve la configuración global de la aplicación.
 *
 * @return array<string,mixed>
 */
function um6_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = [
        'db_host' => um6_env('MYSQL_HOST', '127.0.0.1'),
        'db_port' => (int) um6_env('MYSQL_PORT', 3306),
        'db_name' => um6_env('MYSQL_DATABASE', 'um6_pos'),
        'db_user' => um6_env('MYSQL_USER', ''),
        'db_pass' => um6_env('MYSQL_PASSWORD', ''),
        'supabase_url' => rtrim((string) um6_env('SUPABASE_URL', ''), '/'),
        'supabase_service_key' => (string) um6_env('SUPABASE_SERVICE_ROLE_KEY', ''),
        'public_base_url' => rtrim((string) um6_env('PUBLIC_BASE_URL', ''), '/'),
    ];

    return $config;
}

/**
 * Devuelve una conexión PDO reutilizable.
 *
 * @return PDO
 */
function um6_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = um6_config();

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $cfg['db_host'],
        $cfg['db_port'],
        $cfg['db_name']
    );

    try {
        $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (PDOException $e) {
        um6_json_error(500, 'Error conectando a la base de datos', ['error' => $e->getMessage()]);
    }

    return $pdo;
}

/**
 * Ejecuta una función dentro de una transacción MySQL.
 *
 * @template T
 * @param callable(PDO):T $callback
 * @return T
 */
function um6_with_transaction(callable $callback): mixed
{
    $pdo = um6_pdo();
    try {
        $pdo->beginTransaction();
        $result = $callback($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Si la función ya envió respuesta, solo relanzar
        if (!headers_sent()) {
            um6_json_error(500, 'Error en la transacción', ['error' => $e->getMessage()]);
        }
        throw $e;
    }
}

/**
 * Envía una respuesta JSON y termina la ejecución.
 *
 * @param int $status
 * @param mixed $data
 * @return void
 */
function um6_json_response(int $status, mixed $data): void
{
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        http_response_code($status);
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Envía una respuesta de error JSON con el formato esperado por el frontend.
 *
 * @param int $status
 * @param string $message
 * @param mixed $details
 * @return void
 */
function um6_json_error(int $status, string $message, mixed $details = null): void
{
    $body = ['message' => $message];
    if ($details !== null) {
        $body['details'] = $details;
    }
    um6_json_response($status, $body);
}

/**
 * Devuelve el cuerpo JSON parseado o null si no hay cuerpo.
 *
 * Lanza error 400 si el JSON es inválido.
 *
 * @return mixed
 */
function um6_get_json_body(): mixed
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        um6_json_error(400, 'JSON inválido');
    }
    return $data;
}

/**
 * Construye la URL pública base (si no se definió PUBLIC_BASE_URL).
 *
 * @return string
 */
function um6_detect_base_url(): string
{
    $cfg = um6_config();
    if (!empty($cfg['public_base_url'])) {
        return $cfg['public_base_url'];
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

