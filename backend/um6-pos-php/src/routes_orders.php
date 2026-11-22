<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/store.php';
require_once __DIR__ . '/inventory.php';

/**
 * Maneja las rutas de pedidos (/api/orders*).
 *
 * @param string $method
 * @param string $path
 * @param array<string,mixed> $user
 * @param PDO $pdo
 * @return bool true si manejó la ruta, false en caso contrario
 */
function um6_route_orders(string $method, string $path, array $user, PDO $pdo): bool
{
    // GET /api/orders
    if ($method === 'GET' && $path === '/api/orders') {
        $role = strtolower((string) ($user['role'] ?? ''));
        $store = null;

        if ($role === 'um6') {
            $store = um6_get_store_for_user($pdo, $user, null);
        } elseif (in_array($role, ['gerente', 'admin', 'administrador'], true)) {
            $storeCodeParam = isset($_GET['storeCode']) ? trim((string) $_GET['storeCode']) : '';
            if ($storeCodeParam !== '') {
                $store = um6_require_store_by_code($pdo, $storeCodeParam);
            }
        } else {
            um6_json_error(403, 'No autorizado');
        }

        $params = [];
        $sql = 'SELECT o.id, o.store_id, s.code as store_code, o.status, o.suggested, o.notes, o.created_at, o.updated_at
                  FROM orders o
                  JOIN stores s ON s.id = o.store_id';

        if ($store !== null) {
            $sql .= ' WHERE o.store_id = ?';
            $params[] = $store['id'];
        }

        $sql .= ' ORDER BY o.created_at DESC LIMIT 100';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $orderIds = array_map(
            static fn(array $o): int => (int) $o['id'],
            $orders
        );

        $itemsByOrderId = [];
        if (count($orderIds) > 0) {
            $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
            $sqlItems = "SELECT oi.order_id, oi.product_id, p.name, oi.quantity
                           FROM order_items oi
                           JOIN products p ON p.id = oi.product_id
                          WHERE oi.order_id IN ($placeholders)";
            $stmt = $pdo->prepare($sqlItems);
            $stmt->execute($orderIds);
            $itemRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($itemRows as $row) {
                $oid = (int) $row['order_id'];
                if (!isset($itemsByOrderId[$oid])) {
                    $itemsByOrderId[$oid] = [];
                }
                $itemsByOrderId[$oid][] = $row;
            }
        }

        $grouped = [];
        foreach ($orders as $order) {
            $oid = (int) $order['id'];
            $order['items'] = $itemsByOrderId[$oid] ?? [];
            $grouped[] = $order;
        }

        um6_json_response(200, $grouped);
    }

    // GET /api/orders/suggestions
    if ($method === 'GET' && $path === '/api/orders/suggestions') {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);

        $code = isset($_GET['storeCode']) ? trim((string) $_GET['storeCode']) : '';
        if ($code === '') {
            um6_json_error(400, 'storeCode requerido');
        }

        $store = um6_require_store_by_code($pdo, $code);

        $stmt = $pdo->prepare(
            'SELECT p.id as product_id,
                    p.name,
                    p.sku,
                    COALESCE(i.on_hand, 0) AS on_hand,
                    i.max_level,
                    i.min_level,
                    GREATEST(COALESCE(i.max_level, 0) - COALESCE(i.on_hand, 0), 0) AS suggested_quantity
               FROM inventories i
               JOIN products p ON p.id = i.product_id
              WHERE i.store_id = ?
                AND i.max_level IS NOT NULL
                AND COALESCE(i.max_level, 0) > COALESCE(i.on_hand, 0)
              ORDER BY suggested_quantity DESC, p.name ASC'
        );
        $stmt->execute([$store['id']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $items = [];
        foreach ($rows as $row) {
            $items[] = [
                'productId' => (int) $row['product_id'],
                'name' => $row['name'],
                'sku' => $row['sku'],
                'onHand' => (float) ($row['on_hand'] ?? 0),
                'maxLevel' => $row['max_level'] !== null ? (float) $row['max_level'] : null,
                'minLevel' => $row['min_level'] !== null ? (float) $row['min_level'] : null,
                'quantity' => (float) ($row['suggested_quantity'] ?? 0),
            ];
        }

        um6_json_response(200, [
            'storeCode' => $store['code'],
            'items' => $items,
        ]);
    }

    // POST /api/orders
    if ($method === 'POST' && $path === '/api/orders') {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $storeCode = isset($body['storeCode']) && is_string($body['storeCode'])
            ? trim($body['storeCode'])
            : '';
        if ($storeCode === '') {
            um6_json_error(400, 'storeCode requerido');
        }

        $items = $body['items'] ?? null;
        if (!is_array($items) || count($items) < 1) {
            um6_json_error(400, 'Debe incluir al menos un producto');
        }

        $suggested = !empty($body['suggested']);
        $notes = isset($body['notes']) && is_string($body['notes'])
            ? trim($body['notes'])
            : null;

        $store = um6_require_store_by_code($pdo, $storeCode);

        $orderId = um6_with_transaction(function (PDO $conn) use (
            $store,
            $items,
            $suggested,
            $notes,
            $user
        ): int {
            $sqlOrder = 'INSERT INTO orders (store_id, status, suggested, notes, created_by)
                         VALUES (?, \'IN_TRANSIT\', ?, ?, ?)';
            $stmt = $conn->prepare($sqlOrder);
            $stmt->execute([
                $store['id'],
                $suggested ? 1 : 0,
                $notes,
                (string) $user['id'],
            ]);
            $orderId = (int) $conn->lastInsertId();

            $valuePlaceholders = [];
            $params = [];
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $productId = $item['productId'] ?? null;
                $quantity = $item['quantity'] ?? null;
                if (!is_numeric($productId) || !is_numeric($quantity) || (float) $quantity <= 0) {
                    continue;
                }
                $valuePlaceholders[] = '(?, ?, ?)';
                $params[] = $orderId;
                $params[] = (int) $productId;
                $params[] = (float) $quantity;
            }

            if (!empty($valuePlaceholders)) {
                $sqlItems = 'INSERT INTO order_items (order_id, product_id, quantity) VALUES ' .
                    implode(',', $valuePlaceholders);
                $stmt = $conn->prepare($sqlItems);
                $stmt->execute($params);
            }

            return $orderId;
        });

        um6_json_response(201, ['id' => $orderId]);
    }

    // PATCH /api/orders/:id/status
    if ($method === 'PATCH' && preg_match('#^/api/orders/(\d+)/status$#', $path, $matches)) {
        um6_require_role($user, ['gerente', 'admin', 'administrador']);
        $orderId = (int) $matches[1];

        $body = um6_get_json_body();
        if (!is_array($body) || !isset($body['status']) || !is_string($body['status'])) {
            um6_json_error(400, 'Payload inválido');
        }
        $status = strtoupper(trim($body['status']));
        $allowed = ['DRAFT', 'SENT', 'IN_TRANSIT', 'REJECTED'];
        if (!in_array($status, $allowed, true)) {
            um6_json_error(400, 'Estatus inválido');
        }

        $stmt = $pdo->prepare(
            'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $stmt->execute([$status, $orderId]);

        if ($stmt->rowCount() === 0) {
            um6_json_error(404, 'Pedido no encontrado');
        }

        um6_json_response(200, ['message' => 'Estatus actualizado']);
    }

    // POST /api/orders/:id/accept
    if ($method === 'POST' && preg_match('#^/api/orders/(\d+)/accept$#', $path, $matches)) {
        um6_require_role($user, ['UM6']);
        $orderId = (int) $matches[1];

        $store = um6_get_store_for_user($pdo, $user, null);

        um6_with_transaction(function (PDO $conn) use ($orderId, $store, $user): void {
            $stmt = $conn->prepare(
                'SELECT id, store_id, status FROM orders WHERE id = ? FOR UPDATE'
            );
            $stmt->execute([$orderId]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($order === false) {
                um6_json_error(404, 'Pedido no encontrado');
            }

            if ((int) $order['store_id'] !== (int) $store['id']) {
                um6_json_error(403, 'No autorizado para este pedido');
            }

            if (!in_array($order['status'], ['IN_TRANSIT', 'SENT'], true)) {
                um6_json_error(400, 'El pedido no se puede aceptar en este estado');
            }

            $stmt = $conn->prepare(
                'SELECT product_id, quantity FROM order_items WHERE order_id = ?'
            );
            $stmt->execute([$orderId]);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($items as $item) {
                $productId = (int) $item['product_id'];
                $qty = (float) $item['quantity'];

                um6_upsert_inventory($conn, (int) $store['id'], $productId);
                um6_register_movement(
                    $conn,
                    (int) $store['id'],
                    $productId,
                    'ORDER_ACCEPT',
                    $qty,
                    'order#' . $orderId,
                    (string) $user['id']
                );
                um6_update_inventory($conn, (int) $store['id'], $productId, $qty);
            }

            $stmt = $conn->prepare(
                'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            $stmt->execute(['RECEIVED', $orderId]);
        });

        um6_json_response(200, ['message' => 'Pedido recibido']);
    }

    return false;
}

