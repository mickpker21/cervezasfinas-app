<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();
$auth = requireAuth();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$product_sku = $input['product_sku'] ?? '';

if (empty($product_sku)) {
    sendJSON(['error' => 'product_sku is required'], 400);
}

try {
    $pdo->beginTransaction();
    
    $client_code = $auth['client_code'];
    
    // 1. Verificar que el producto existe y está activo
    $prodStmt = $pdo->prepare("
        SELECT points_required FROM shop_point_redemption_products 
        WHERE sku = ? AND is_active = 1
    ");
    $prodStmt->execute([$product_sku]);
    $product = $prodStmt->fetch();
    
    if (!$product) {
        sendJSON(['error' => 'Product not available for redemption'], 404);
    }
    
    $points_required = intval($product['points_required']);
    
    // 2. Verificar puntos disponibles del cliente
    $balanceStmt = $pdo->prepare("
        SELECT points_balance FROM shop_client_points WHERE client_code = ?
    ");
    $balanceStmt->execute([$client_code]);
    $balance = $balanceStmt->fetch();
    
    $current_balance = $balance ? intval($balance['points_balance']) : 0;
    
    if ($current_balance < $points_required) {
        sendJSON(['error' => 'Insufficient points'], 400);
    }
    
    // 3. Crear solicitud de canje
    $redemptionStmt = $pdo->prepare("
        INSERT INTO shop_point_redemptions (client_code, product_sku, points_used, status)
        VALUES (?, ?, ?, 'pending')
    ");
    $redemptionStmt->execute([$client_code, $product_sku, $points_required]);
    $redemption_id = $pdo->lastInsertId();
    
    // 4. Descontar puntos (crear transacción)
    $transStmt = $pdo->prepare("
        INSERT INTO shop_points_transactions 
        (client_code, type, points, reason, related_redemption_id)
        VALUES (?, 'redeemed', ?, 'Canje de producto', ?)
    ");
    $transStmt->execute([$client_code, $points_required, $redemption_id]);
    
    // 5. Actualizar balance
    $new_balance = $current_balance - $points_required;
    $updateStmt = $pdo->prepare("
        UPDATE shop_client_points 
        SET points_balance = ?, updated_at = NOW()
        WHERE client_code = ?
    ");
    $updateStmt->execute([$new_balance, $client_code]);
    
    $pdo->commit();
    
    sendJSON([
        'success' => true,
        'data' => [
            'redemption_id' => $redemption_id,
            'points_used' => $points_required,
            'new_balance' => $new_balance
        ]
    ]);
    
} catch (PDOException $e) {
    $pdo->rollBack();
    sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
}
?>
