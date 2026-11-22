<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Auth check (Client)
$auth = requireAuth();
$client_code = $auth['client_code'];

$input = json_decode(file_get_contents('php://input'), true);
$message = trim($input['message'] ?? '');

if (empty($message)) {
    sendJSON(['error' => 'Message required'], 400);
}

try {
    $stmt = $pdo->prepare("
        INSERT INTO shop_support_messages (client_code, sender_type, message) 
        VALUES (?, 'client', ?)
    ");
    $stmt->execute([$client_code, $message]);

    sendJSON(['success' => true, 'id' => $pdo->lastInsertId()]);

} catch (PDOException $e) {
    sendJSON(['error' => 'DB Error'], 500);
}
?>
