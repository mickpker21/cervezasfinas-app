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
    
    // Obtener o crear registro de puntos del cliente
    $stmt = $pdo->prepare("
        SELECT * FROM shop_client_points WHERE client_code = ?
    ");
    $stmt->execute([$client_code]);
    $clientPoints = $stmt->fetch();
    
    if (!$clientPoints) {
        // Crear registro si no existe
        $insertStmt = $pdo->prepare("
            INSERT INTO shop_client_points (client_code, points_balance)
            VALUES (?, 0)
        ");
        $insertStmt->execute([$client_code]);
        
        $clientPoints = [
            'client_code' => $client_code,
            'points_balance' => 0,
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s')
        ];
    }
    
    // Calcular puntos que expiran pronto (en los próximos 30 días)
    $expiringStmt = $pdo->prepare("
        SELECT SUM(points) as expiring_points
        FROM shop_points_transactions
        WHERE client_code = ?
        AND type = 'earned'
        AND expires_at IS NOT NULL
        AND expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
        AND expires_at > NOW()
    ");
    $expiringStmt->execute([$client_code]);
    $expiring = $expiringStmt->fetch();
    
    sendJSON([
        'success' => true,
        'data' => [
            'balance' => intval($clientPoints['points_balance']),
            'expiring_soon' => intval($expiring['expiring_points'] ?? 0),
            'updated_at' => $clientPoints['updated_at']
        ]
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
