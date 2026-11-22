<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

// Allow getting latest stats (like unread count) 
// or getting messages since a specific ID

$client_code = '';

// Auth check (Client)
$auth = requireAuth();
$client_code = $auth['client_code'];

$last_id = intval($_GET['last_id'] ?? 0);

try {
    // 1. Get new messages since last_id
    $stmt = $pdo->prepare("
        SELECT * FROM shop_support_messages 
        WHERE client_code = ? 
        AND id > ?
        ORDER BY id ASC
    ");
    $stmt->execute([$client_code, $last_id]);
    $messages = $stmt->fetchAll();

    // 2. Mark agent messages as read when requested
    if (!empty($messages)) {
        // Only mark 'agent' messages as read since we are the client
        $pdo->prepare("
            UPDATE shop_support_messages 
            SET is_read = 1 
            WHERE client_code = ? AND sender_type = 'agent' AND is_read = 0
        ")->execute([$client_code]);
    }

    sendJSON([
        'success' => true,
        'messages' => $messages
    ]);

} catch (PDOException $e) {
    sendJSON(['error' => 'DB Error: ' . $e->getMessage()], 500);
}
?>
