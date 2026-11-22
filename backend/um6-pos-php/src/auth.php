<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * Llama a Supabase para obtener el usuario a partir de un access token.
 *
 * @param string $accessToken
 * @return array<string,mixed>
 */
function um6_supabase_get_user(string $accessToken): array
{
    $cfg = um6_config();
    $baseUrl = $cfg['supabase_url'];
    $serviceKey = $cfg['supabase_service_key'];

    if ($baseUrl === '' || $serviceKey === '') {
        um6_json_error(500, 'Supabase no está configurado correctamente');
    }

    $url = $baseUrl . '/auth/v1/user';

    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $accessToken,
    ];

    // Fallback simple sin cURL
    if (!function_exists('curl_init')) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'timeout' => 10,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            um6_json_error(500, 'No se pudo contactar Supabase (file_get_contents)');
        }

        $data = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            um6_json_error(500, 'Respuesta inválida de Supabase');
        }

        if (!isset($data['id'])) {
            um6_json_error(401, 'Token inválido', ['supabase' => $data]);
        }

        return $data;
    }

    $ch = curl_init($url);
    if ($ch === false) {
        um6_json_error(500, 'No se pudo inicializar la llamada a Supabase');
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 10,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        um6_json_error(500, 'Error comunicándose con Supabase', ['error' => $error]);
    }

    curl_close($ch);

    if ($httpCode >= 400) {
        $errorBody = json_decode($response, true);
        um6_json_error(401, 'Token inválido', [
            'httpCode' => $httpCode,
            'supabase' => $errorBody,
        ]);
    }

    $data = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        um6_json_error(500, 'Respuesta inválida de Supabase');
    }

    if (!isset($data['id'])) {
        um6_json_error(401, 'Token inválido', ['supabase' => $data]);
    }

    return $data;
}

/**
 * Autentica al usuario usando el header Authorization: Bearer <token>.
 *
 * Devuelve un arreglo con id, email, role, route y raw (usuario completo).
 *
 * @return array<string,mixed>
 */
function um6_authenticate(): array
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token = null;

    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
    }

    if (!$token) {
        um6_json_error(401, 'Token requerido');
    }

    $user = um6_supabase_get_user($token);

    $meta = [];
    if (isset($user['user_metadata']) && is_array($user['user_metadata'])) {
        $meta = $user['user_metadata'];
    }

    $role = $meta['role'] ?? $meta['type'] ?? $meta['user_role'] ?? null;
    $route = $meta['route'] ?? $meta['route_number'] ?? $meta['routeNumber'] ?? null;

    return [
        'id' => $user['id'] ?? null,
        'email' => $user['email'] ?? null,
        'role' => $role,
        'route' => $route,
        'raw' => $user,
    ];
}

/**
 * Verifica que el usuario tenga alguno de los roles permitidos.
 *
 * @param array<string,mixed> $user
 * @param string[] $roles
 * @return void
 */
function um6_require_role(array $user, array $roles): void
{
    $allowed = array_map(
        static fn(string $r): string => strtolower($r),
        $roles
    );
    $current = strtolower((string) ($user['role'] ?? ''));
    if (!in_array($current, $allowed, true)) {
        um6_json_error(403, 'No autorizado');
    }
}

