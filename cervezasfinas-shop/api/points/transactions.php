<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();
$auth = requireAuth();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    $client_code = $auth['client_code'];
    
    // Obtener todas las transacciones
    $stmt = $pdo->prepare("
        SELECT 
            id,
            type,
            points,
            reason,
            expires_at,
            created_at,
            related_order_id,
            related_execution_id,
            related_redemption_id
        FROM shop_points_transactions
        WHERE client_code = ?
        ORDER BY created_at DESC
    ");
    $stmt->execute([$client_code]);
    $transactions = $stmt->fetchAll();
    
    // Para cada transacción, añadir info adicional
    foreach ($transactions as &$transaction) {
        $transaction['is_expired'] = false;
        
        if ($transaction['expires_at'] && strtotime($transaction['expires_at']) < time()) {
            $transaction['is_expired'] = true;
        }
        
        // Si tiene orden relacionada, obtener número
        if ($transaction['related_order_id']) {
            $orderStmt = $pdo->prepare("SELECT order_number FROM shop_orders WHERE id = ?");
            $orderStmt->execute([$transaction['related_order_id']]);
            $order = $orderStmt->fetch();
            $transaction['order_number'] = $order ? $order['order_number'] : null;
        }
    }
    
    sendJSON([
        'success' => true,
        'data' => $transactions
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
