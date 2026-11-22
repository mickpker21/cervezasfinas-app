<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$redemption_id = intval($input['redemption_id'] ?? 0);

if ($redemption_id <= 0) {
    sendJSON(['error' => 'redemption_id is required'], 400);
}

try {
    // Actualizar solicitud a aprobada
    $stmt = $pdo->prepare("
        UPDATE shop_point_redemptions 
        SET status = 'approved', approved_at = NOW()
        WHERE id = ? AND status = 'pending'
    ");
    $stmt->execute([$redemption_id]);
    
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Redemption not found or already processed'], 404);
    }
    
    sendJSON([
        'success' => true,
        'message' => 'Redemption approved'
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
