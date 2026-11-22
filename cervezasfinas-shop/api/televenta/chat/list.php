<?php
require_once '../../common.php';

handleCORS();
$pdo = getDB();

try {
    // Get list of clients who have messages, ordered by most recent message
    // Also count unread messages from client
    
    // Complex query to get latest message info + unread count per client
    $sql = "
        SELECT 
            m.client_code,
            MAX(m.created_at) as last_activity,
            SUM(CASE WHEN m.sender_type = 'client' AND m.is_read = 0 THEN 1 ELSE 0 END) as unread_count,
            (SELECT message FROM shop_support_messages WHERE client_code = m.client_code ORDER BY id DESC LIMIT 1) as last_message
        FROM shop_support_messages m
        GROUP BY m.client_code
        ORDER BY last_activity DESC
    ";
    
    $stmt = $pdo->query($sql);
    $chats = $stmt->fetchAll();
    
    // Enrich with client name if available? 
    // Assuming we don't have easy join to clients table here effectively without cross-db complexity if separated, 
    // but usually they are in same DB or we can query 'clients' table if it exists in this DB context.
    // Based on previous code, 'clients' table exists.
    
    foreach ($chats as &$chat) {
        $cStmt = $pdo->prepare("SELECT name FROM clients WHERE client_code = ?");
        $cStmt->execute([$chat['client_code']]);
        $clientName = $cStmt->fetchColumn();
        $chat['client_name'] = $clientName ? $clientName : 'Cliente ' . $chat['client_code'];
    }

    sendJSON(['success' => true, 'data' => $chats]);

} catch (PDOException $e) {
    sendJSON(['error' => 'DB Error: ' . $e->getMessage()], 500);
}
?>
