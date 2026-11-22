<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$execution_id = intval($input['execution_id'] ?? 0);
$points_awarded = intval($input['points_awarded'] ?? 0);

if ($execution_id <= 0 || $points_awarded < 0 || $points_awarded > 100) {
    sendJSON(['error' => 'Invalid parameters'], 400);
}

try {
    $pdo->beginTransaction();
    
    // 1. Obtener ejecución
    $execStmt = $pdo->prepare("SELECT * FROM shop_cooler_executions WHERE id = ? AND status = 'pending'");
    $execStmt->execute([$execution_id]);
    $execution = $execStmt->fetch();
    
    if (!$execution) {
        sendJSON(['error' => 'Execution not found or already processed'], 404);
    }
    
    $client_code = $execution['client_code'];
    
    // 2. Actualizar ejecución
    $updateStmt = $pdo->prepare("
        UPDATE shop_cooler_executions 
        SET status = 'approved', 
            points_awarded = ?,
            reviewed_at = NOW()
        WHERE id = ?
    ");
    $updateStmt->execute([$points_awarded, $execution_id]);
    
    // 3. Otorgar puntos (expiran en 6 meses)
    if ($points_awarded > 0) {
        $expires_at = date('Y-m-d H:i:s', strtotime('+6 months'));
        
        $transStmt = $pdo->prepare("
            INSERT INTO shop_points_transactions 
            (client_code, type, points, reason, related_execution_id, expires_at)
            VALUES (?, 'earned', ?, 'Ejecución de enfriador aprobada', ?, ?)
        ");
        $transStmt->execute([$client_code, $points_awarded, $execution_id, $expires_at]);
        
        // Actualizar balance
        $balanceStmt = $pdo->prepare("
            INSERT INTO shop_client_points (client_code, points_balance)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE 
                points_balance = points_balance + ?,
                updated_at = NOW()
        ");
        $balanceStmt->execute([$client_code, $points_awarded, $points_awarded]);
    }
    
    $pdo->commit();
    
    sendJSON([
        'success' => true,
        'message' => 'Execution approved',
        'points_awarded' => $points_awarded
    ]);
    
} catch (PDOException $e) {
    $pdo->rollBack();
    sendJSON(['error' => 'Database error'], 500);
}
?>
