<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * Busca una tienda por código.
 *
 * @param PDO $pdo
 * @param string $code
 * @return array<string,mixed>|null
 */
function um6_find_store_by_code(PDO $pdo, string $code): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, code, name FROM stores WHERE code = ? LIMIT 1'
    );
    $stmt->execute([$code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row !== false ? $row : null;
}

/**
 * Devuelve una tienda por código o lanza 404.
 *
 * @param PDO $pdo
 * @param string $code
 * @return array<string,mixed>
 */
function um6_require_store_by_code(PDO $pdo, string $code): array
{
    $store = um6_find_store_by_code($pdo, $code);
    if ($store === null) {
        um6_json_error(404, 'Store not found');
    }
    return $store;
}

/**
 * Devuelve la tienda asociada al usuario según rol y parámetros.
 *
 * @param PDO $pdo
 * @param array<string,mixed> $user
 * @param string|null $queryStoreCode
 * @return array<string,mixed>
 */
function um6_get_store_for_user(PDO $pdo, array $user, ?string $queryStoreCode = null): array
{
    $role = strtolower((string) ($user['role'] ?? ''));

    if (in_array($role, ['gerente', 'admin', 'administrador'], true)) {
        if ($queryStoreCode === null || trim($queryStoreCode) === '') {
            um6_json_error(400, 'storeCode requerido');
        }
        return um6_require_store_by_code($pdo, trim($queryStoreCode));
    }

    $fallbackRoute = $user['route'] ?? null;
    if ($fallbackRoute === null || trim((string) $fallbackRoute) === '') {
        um6_json_error(400, 'Usuario sin ruta asignada');
    }

    return um6_require_store_by_code($pdo, trim((string) $fallbackRoute));
}

