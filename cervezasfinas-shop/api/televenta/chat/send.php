<?php
require_once '../../common.php';

handleCORS();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$client_code = $input['client_code'] ?? '';
$message = trim($input['message'] ?? '');

if (empty($client_code) || empty($message)) {
    sendJSON(['error' => 'Missing data'], 400);
}

try {
    $stmt = $pdo->prepare("
        INSERT INTO shop_support_messages (client_code, sender_type, message) 
        VALUES (?, 'agent', ?)
    ");
    $stmt->execute([$client_code, $message]);

    sendJSON(['success' => true, 'id' => $pdo->lastInsertId()]);

} catch (PDOException $e) {
    sendJSON(['error' => 'DB Error'], 500);
}
?>
