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
$photo_url = $input['photo_url'] ?? '';

if (empty($photo_url)) {
    sendJSON(['error' => 'photo_url is required'], 400);
}

try {
    $client_code = $auth['client_code'];
    
    // Crear ejecución de enfriador
    $stmt = $pdo->prepare("
        INSERT INTO shop_cooler_executions (client_code, photo_url, status)
        VALUES (?, ?, 'pending')
    ");
    $stmt->execute([$client_code, $photo_url]);
    $execution_id = $pdo->lastInsertId();
    
    sendJSON([
        'success' => true,
        'data' => [
            'execution_id' => $execution_id,
            'message' => 'Foto enviada correctamente. Televenta revisará tu ejecución.'
        ]
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
