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

if ($execution_id <= 0) {
    sendJSON(['error' => 'execution_id is required'], 400);
}

try {
    // Actualizar ejecución a rechazada
    $stmt = $pdo->prepare("
        UPDATE shop_cooler_executions 
        SET status = 'rejected', reviewed_at = NOW()
        WHERE id = ? AND status = 'pending'
    ");
    $stmt->execute([$execution_id]);
    
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Execution not found or already processed'], 404);
    }
    
    sendJSON([
        'success' => true,
        'message' => 'Execution rejected'
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
