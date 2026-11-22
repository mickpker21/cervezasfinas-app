<?php
require_once '../../common.php';

handleCORS();
$pdo = getDB();

$client_code = $_GET['client_code'] ?? '';
if (!$client_code) {
    sendJSON(['error' => 'Client code required'], 400);
}

try {
    // Mark messages as read (Agent reading client messages)
    $pdo->prepare("
        UPDATE shop_support_messages 
        SET is_read = 1 
        WHERE client_code = ? AND sender_type = 'client' AND is_read = 0
    ")->execute([$client_code]);

    // Fetch conversation
    $stmt = $pdo->prepare("
        SELECT * FROM shop_support_messages 
        WHERE client_code = ? 
        ORDER BY id ASC
    ");
    $stmt->execute([$client_code]);
    $messages = $stmt->fetchAll();

    sendJSON(['success' => true, 'data' => $messages]);

} catch (PDOException $e) {
    sendJSON(['error' => 'DB Error'], 500);
}
?>
