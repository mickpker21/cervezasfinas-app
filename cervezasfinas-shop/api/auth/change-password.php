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
$old_password = $input['old_password'] ?? '';
$new_password = $input['new_password'] ?? '';

if (empty($old_password) || empty($new_password)) {
    sendJSON(['error' => 'old_password and new_password are required'], 400);
}

try {
    $client_code = $auth['client_code'];
    
    // Obtener usuario
    $stmt = $pdo->prepare("SELECT * FROM shop_client_users WHERE client_code = ?");
    $stmt->execute([$client_code]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Verificar contraseña actual
    if (!password_verify($old_password, $user['password_hash'])) {
        sendJSON(['error' => 'Invalid current password'], 401);
    }
    
    // Actualizar contraseña
    $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
    $updateStmt = $pdo->prepare("UPDATE shop_client_users SET password_hash = ? WHERE client_code = ?");
    $updateStmt->execute([$new_hash, $client_code]);
    
    sendJSON([
        'success' => true,
        'message' => 'Password updated successfully'
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
