<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/store.php';
require_once __DIR__ . '/inventory.php';

/**
 * Maneja las rutas de POS (/api/pos*).
 *
 * @param string $method
 * @param string $path
 * @param array<string,mixed> $user
 * @param PDO $pdo
 * @return bool true si manejó la ruta, false en caso contrario
 */
function um6_route_pos(string $method, string $path, array $user, PDO $pdo): bool
{
    // POST /api/pos/sales
    if ($method === 'POST' && $path === '/api/pos/sales') {
        um6_require_role($user, ['UM6']);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $reference = isset($body['reference']) && is_string($body['reference'])
            ? substr(trim($body['reference']), 0, 64)
            : null;
        $items = $body['items'] ?? null;
        if (!is_array($items) || count($items) < 1) {
            um6_json_error(400, 'Payload inválido');
        }

        $store = um6_get_store_for_user($pdo, $user, null);

        um6_with_transaction(function (PDO $conn) use ($items, $store, $reference, $user): void {
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $productId = $item['productId'] ?? null;
                $quantity = $item['quantity'] ?? null;
                if (!is_numeric($productId) || !is_numeric($quantity) || (float) $quantity <= 0) {
                    continue;
                }
                $productId = (int) $productId;
                $qty = (float) $quantity;

                um6_upsert_inventory($conn, (int) $store['id'], $productId);
                um6_register_movement(
                    $conn,
                    (int) $store['id'],
                    $productId,
                    'SALE',
                    $qty,
                    $reference,
                    (string) $user['id']
                );
                um6_update_inventory($conn, (int) $store['id'], $productId, -$qty);
            }
        });

        um6_json_response(201, ['message' => 'Venta registrada']);
    }

    // POST /api/pos/movements
    if ($method === 'POST' && $path === '/api/pos/movements') {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $storeCode = isset($body['storeCode']) && is_string($body['storeCode'])
            ? trim($body['storeCode'])
            : '';
        if ($storeCode === '') {
            um6_json_error(400, 'storeCode es requerido');
        }

        $type = isset($body['type']) && is_string($body['type'])
            ? strtoupper(trim($body['type']))
            : '';
        if (!in_array($type, ['ADJUSTMENT', 'STOCK_IN', 'STOCK_OUT'], true)) {
            um6_json_error(400, 'Tipo de movimiento inválido');
        }

        $reference = isset($body['reference']) && is_string($body['reference'])
            ? substr(trim($body['reference']), 0, 64)
            : null;
        $items = $body['items'] ?? null;
        if (!is_array($items) || count($items) < 1) {
            um6_json_error(400, 'Payload inválido');
        }

        $store = um6_get_store_for_user($pdo, $user, $storeCode);
        $sign = $type === 'STOCK_OUT' ? -1.0 : 1.0;

        um6_with_transaction(function (PDO $conn) use ($items, $store, $type, $reference, $user, $sign): void {
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $productId = $item['productId'] ?? null;
                $quantity = $item['quantity'] ?? null;
                if (!is_numeric($productId) || !is_numeric($quantity) || (float) $quantity <= 0) {
                    continue;
                }
                $productId = (int) $productId;
                $qty = (float) $quantity;

                um6_upsert_inventory($conn, (int) $store['id'], $productId);
                um6_register_movement(
                    $conn,
                    (int) $store['id'],
                    $productId,
                    $type,
                    $qty,
                    $reference,
                    (string) $user['id']
                );
                um6_update_inventory($conn, (int) $store['id'], $productId, $sign * $qty);
            }
        });

        um6_json_response(201, ['message' => 'Movimiento registrado']);
    }

    // GET /api/pos/sales/summary
    if ($method === 'GET' && $path === '/api/pos/sales/summary') {
        um6_require_role($user, ['UM6']);

        $store = um6_get_store_for_user($pdo, $user, null);

        $stmt = $pdo->prepare(
            'SELECT
               COALESCE(SUM(quantity), 0) AS total_units,
               COUNT(*) AS line_items,
               COUNT(DISTINCT COALESCE(NULLIF(reference, \'\'), CAST(id AS CHAR))) AS tickets
             FROM inventory_movements
            WHERE store_id = ?
              AND type = \'SALE\'
              AND DATE(created_at) = CURRENT_DATE'
        );
        $stmt->execute([$store['id']]);
        $totalsRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: [
            'total_units' => 0,
            'line_items' => 0,
            'tickets' => 0,
        ];

        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, p.sku, COALESCE(SUM(m.quantity), 0) AS total_units
               FROM inventory_movements m
               JOIN products p ON p.id = m.product_id
              WHERE m.store_id = ?
                AND m.type = \'SALE\'
                AND DATE(m.created_at) = CURRENT_DATE
              GROUP BY p.id, p.name, p.sku
              ORDER BY total_units DESC
              LIMIT 5'
        );
        $stmt->execute([$store['id']]);
        $productsRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $summary = [
            'totals' => [
                'units' => (float) ($totalsRow['total_units'] ?? 0),
                'lineItems' => (int) ($totalsRow['line_items'] ?? 0),
                'tickets' => (int) ($totalsRow['tickets'] ?? 0),
            ],
            'topProducts' => [],
        ];

        foreach ($productsRows as $row) {
            $summary['topProducts'][] = [
                'productId' => (int) $row['id'],
                'name' => $row['name'],
                'sku' => $row['sku'],
                'units' => (float) ($row['total_units'] ?? 0),
            ];
        }

        um6_json_response(200, $summary);
    }

    // POST /api/pos/inventory-validations
    if ($method === 'POST' && $path === '/api/pos/inventory-validations') {
        um6_require_role($user, ['UM6', 'gerente', 'admin', 'administrador']);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $storeCode = isset($body['storeCode']) && is_string($body['storeCode'])
            ? trim($body['storeCode'])
            : '';
        
        // Si no se envía storeCode, intentar obtenerlo del usuario si es tienda
        if ($storeCode === '') {
             $store = um6_get_store_for_user($pdo, $user, null);
             $storeCode = $store['code'];
        }

        $notes = isset($body['notes']) && is_string($body['notes']) ? trim($body['notes']) : '';
        $result = $body['result'] ?? [];

        $stmt = $pdo->prepare(
            'INSERT INTO pos_inventory_validations (store_code, user_id, notes, result_json)
             VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $storeCode,
            $user['id'],
            $notes,
            json_encode($result)
        ]);

        um6_json_response(201, ['message' => 'Validación guardada correctamente']);
    }

    // GET /api/pos/inventory-validations
    if ($method === 'GET' && $path === '/api/pos/inventory-validations') {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);

        $storeCode = $_GET['storeCode'] ?? '';
        
        $sql = 'SELECT * FROM pos_inventory_validations';
        $params = [];

        if ($storeCode !== '') {
            $sql .= ' WHERE store_code = ?';
            $params[] = $storeCode;
        }

        $sql .= ' ORDER BY created_at DESC LIMIT 50';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Decodificar el JSON para la respuesta
        foreach ($rows as &$row) {
            $row['result'] = json_decode($row['result_json'], true);
            unset($row['result_json']);
        }

        um6_json_response(200, $rows);
    }

    // POST /api/pos/audit-logs
    if ($method === 'POST' && $path === '/api/pos/audit-logs') {
        // Permitir a cualquier usuario autenticado registrar logs si es necesario, 
        // pero por ahora restringimos a roles de gestión.
        um6_require_role($user, ['gerente', 'admin', 'administrador', 'UM6']);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $action = $body['action'] ?? 'UNKNOWN';
        $targetStoreCode = $body['targetStoreCode'] ?? null;
        $details = $body['details'] ?? '';
        if (is_array($details)) {
            $details = json_encode($details);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO pos_audit_logs (user_id, action, target_store_code, details, ip_address)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $user['id'],
            $action,
            $targetStoreCode,
            $details,
            $_SERVER['REMOTE_ADDR'] ?? null
        ]);

        um6_json_response(201, ['message' => 'Log registrado']);
    }

    return false;
}

