<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/store.php';

/**
 * Maneja las rutas de tiendas (/api/stores*).
 *
 * @param string $method
 * @param string $path
 * @param array<string,mixed> $user
 * @param PDO $pdo
 * @return bool true si manejó la ruta, false en caso contrario
 */
function um6_route_stores(string $method, string $path, array $user, PDO $pdo): bool
{
    // GET /api/stores
    if ($method === 'GET' && $path === '/api/stores') {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);

        $search = strtolower(trim((string) ($_GET['search'] ?? '')));
        $sql = 'SELECT id, code, name, address, max_capacity, min_capacity, manager_email FROM stores';
        $params = [];
        if ($search !== '') {
            $sql .= ' WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ?';
            $like = '%' . $search . '%';
            $params = [$like, $like];
        }
        $sql .= ' ORDER BY name ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        um6_json_response(200, $rows);
    }

    // GET /api/stores/me
    if ($method === 'GET' && $path === '/api/stores/me') {
        um6_require_role($user, ['UM6', 'gerente']);

        $store = um6_get_store_for_user($pdo, $user, isset($_GET['storeCode']) ? (string) $_GET['storeCode'] : null);
        $stmt = $pdo->prepare(
            'SELECT id, code, name, address, max_capacity, min_capacity, manager_email
             FROM stores WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$store['id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        um6_json_response(200, $row !== false ? $row : null);
    }

    // GET /api/stores/me/inventory
    if ($method === 'GET' && $path === '/api/stores/me/inventory') {
        um6_require_role($user, ['UM6', 'gerente']);

        $store = um6_get_store_for_user($pdo, $user, isset($_GET['storeCode']) ? (string) $_GET['storeCode'] : null);
        $stmt = $pdo->prepare(
            'SELECT p.id as product_id,
                    p.sku,
                    p.name,
                    i.on_hand,
                    i.reserved,
                    i.max_level,
                    i.min_level
             FROM inventories i
             JOIN products p ON p.id = i.product_id
            WHERE i.store_id = ?
            ORDER BY p.name ASC'
        );
        $stmt->execute([$store['id']]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        um6_json_response(200, [
            'storeId' => $store['id'],
            'items' => $items,
        ]);
    }

    // PATCH /api/stores/inventory-levels
    if ($method === 'PATCH' && $path === '/api/stores/inventory-levels') {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $storeCode = isset($body['storeCode']) && is_string($body['storeCode']) ? trim($body['storeCode']) : '';
        $items = $body['items'] ?? null;

        if ($storeCode === '' || !is_array($items) || count($items) < 1) {
            um6_json_error(400, 'Payload inválido');
        }

        $store = um6_require_store_by_code($pdo, $storeCode);

        um6_with_transaction(function (PDO $conn) use ($store, $items): void {
            $sql = 'INSERT INTO inventories (store_id, product_id, on_hand, reserved, max_level, min_level)
                    VALUES (?, ?, 0, 0, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      max_level = VALUES(max_level),
                      min_level = VALUES(min_level)';
            $stmt = $conn->prepare($sql);

            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $productId = $item['productId'] ?? null;
                if (!is_numeric($productId) || (int) $productId <= 0) {
                    continue;
                }
                $maxLevel = $item['maxLevel'] ?? null;
                $minLevel = $item['minLevel'] ?? null;

                $maxLevelVal = null;
                if ($maxLevel !== null && $maxLevel !== '') {
                    $maxLevelVal = (float) $maxLevel;
                    if ($maxLevelVal < 0) {
                        $maxLevelVal = 0.0;
                    }
                }

                $minLevelVal = null;
                if ($minLevel !== null && $minLevel !== '') {
                    $minLevelVal = (float) $minLevel;
                    if ($minLevelVal < 0) {
                        $minLevelVal = 0.0;
                    }
                }

                $stmt->execute([
                    $store['id'],
                    (int) $productId,
                    $maxLevelVal,
                    $minLevelVal,
                ]);
            }
        });

        um6_json_response(200, ['message' => 'Niveles actualizados']);
    }

    return false;
}

