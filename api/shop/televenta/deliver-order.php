<?php
require_once '../common.php';
require_once '../points/ledger.php';

handleCORS();
requireSupabaseRole(['admin', 'televenta', 'supervisor', 'operaciones', 'jefe de operaciones']);

$pdo = getDB();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    sendJSON(['error' => 'Invalid JSON body'], 400);
}
$order_id = array_key_exists('order_id', $input) && is_numeric($input['order_id'])
    ? (int) $input['order_id']
    : -1;
$order_number = trim((string)($input['order_number'] ?? ''));

if ($order_id <= 0 && $order_number !== '') {
    $lookupStmt = $pdo->prepare("SELECT id FROM shop_orders WHERE order_number = ? LIMIT 1");
    $lookupStmt->execute([$order_number]);
    $foundId = $lookupStmt->fetchColumn();
    if ($foundId !== false && (int)$foundId > 0) {
        $order_id = (int)$foundId;
    }
}

if ($order_id <= 0) {
    sendJSON(['error' => 'order_id is required'], 400);
}

try {
    $pdo->beginTransaction();
    
    // 1. Obtener datos del pedido
    $orderStmt = $pdo->prepare("
        SELECT * FROM shop_orders WHERE id = ? AND status IN ('confirmed', 'pending')
    ");
    $orderStmt->execute([$order_id]);
    $order = $orderStmt->fetch();
    
    if (!$order && $order_number !== '') {
        $orderStmt = $pdo->prepare("
            SELECT * FROM shop_orders WHERE order_number = ? AND status IN ('confirmed', 'pending') LIMIT 1
        ");
        $orderStmt->execute([$order_number]);
        $order = $orderStmt->fetch();
        if ($order && (int)$order['id'] > 0) {
            $order_id = (int)$order['id'];
        }
    }

    if (!$order) {
        $pdo->rollBack();
        sendJSON(['error' => 'Order not found or already delivered'], 404);
    }
    
    $client_code = $order['client_code'];
    $total_amount = floatval($order['total_amount']);
    
    // 2. Marcar orden como entregada
    $updateStmt = $pdo->prepare("
        UPDATE shop_orders 
        SET status = 'delivered', delivered_at = NOW()
        WHERE id = ? AND status IN ('confirmed', 'pending')
    ");
    $updateStmt->execute([$order_id]);
    if ($updateStmt->rowCount() < 1) {
        $pdo->rollBack();
        sendJSON(['error' => 'Order was already delivered'], 409);
    }
    
    // 3. Obtener configuración de puntos
    $configStmt = $pdo->prepare("SELECT * FROM shop_points_config LIMIT 1");
    $configStmt->execute();
    $config = $configStmt->fetch();
    
    $points_per_peso = $config ? floatval($config['points_per_peso']) : 1.0;
    $min_purchase = $config ? floatval($config['min_purchase_for_points']) : 0;
    
    $base_points = (int) floor(($total_amount * $points_per_peso) + 0.000001);
    $bonus_points = 0;

    $itemsStmt = $pdo->prepare("
        SELECT oi.quantity, p.points_awarded 
        FROM shop_order_items oi
        JOIN shop_products p ON oi.sku = p.sku
        WHERE oi.order_id = ?
    ");
    $itemsStmt->execute([$order_id]);
    $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($items as $item) {
        $bonus_points += ($item['quantity'] * intval($item['points_awarded']));
    }
    
    // RESTRICCIÓN ESTRICTA: Verificar si el cliente está activo y tiene acumulación de puntos habilitada (points_enabled = 1)
    $isRegisteredShopUser = false;
    try {
        $shopUserStmt = $pdo->prepare("SELECT COALESCE(points_enabled, 1) FROM shop_client_users WHERE client_code = ? AND is_active = 1 LIMIT 1");
        $shopUserStmt->execute([$client_code]);
        $peVal = $shopUserStmt->fetchColumn();
        $isRegisteredShopUser = ($peVal !== false && (int)$peVal === 1);
    } catch (Throwable $e) {
        $shopUserStmt = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ? AND is_active = 1 LIMIT 1");
        $shopUserStmt->execute([$client_code]);
        $isRegisteredShopUser = (bool)$shopUserStmt->fetchColumn();
    }

    $points_awarded = ($isRegisteredShopUser && $total_amount >= $min_purchase) ? $base_points + $bonus_points : 0;
    if ($points_awarded > 0) {
        $nextTxId = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_points_transactions")->fetchColumn();
        $expires_at = calculatePointsExpirationDate($pdo);
        
        $transStmt = $pdo->prepare("
            INSERT INTO shop_points_transactions 
            (id, client_code, type, points, reason, description, related_order_id, expires_at)
            VALUES (?, ?, 'earned', ?, ?, ?, ?, ?)
        ");
        $reason = "Compra entregada #{$order['order_number']}: {$base_points} base + {$bonus_points} extra SKU";
        $transStmt->execute([$nextTxId, $client_code, $points_awarded, $reason, $reason, $order_id, $expires_at]);
        
        $ledger = getClientPointsLedger($pdo, $client_code);
        $newBalance = (int)($ledger['points_balance'] ?? $ledger['balance'] ?? 0);

        $balanceStmt = $pdo->prepare("
            INSERT INTO shop_client_points (client_code, points_balance)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE 
                points_balance = ?,
                updated_at = NOW()
        ");
        $balanceStmt->execute([$client_code, $newBalance, $newBalance]);
    }
    
    $pdo->commit();

    try {
        require_once __DIR__ . '/../notifications/push-helper.php';
        $num = $order['order_number'] ?: ('#' . $order_id);
        $ptsTxt = ($points_awarded > 0) ? " ¡Ganaste +" . number_format($points_awarded) . " puntos!" : "";
        sendShopPushToClient($pdo, $client_code, "🚚 Pedido {$num} entregado", "Tu pedido fue entregado exitosamente.{$ptsTxt}", "/points");
    } catch (Exception $e) {}
    
    sendJSON([
        'success' => true,
        'data' => [
            'message' => 'Order delivered successfully',
            'points_awarded' => $points_awarded,
            'skipped' => !$isRegisteredShopUser,
            'reason' => !$isRegisteredShopUser ? 'El cliente no está registrado en UM6 SHOP.' : null,
            'base_points' => $base_points,
            'bonus_points' => $bonus_points
        ]
    ]);
    
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
}
?>