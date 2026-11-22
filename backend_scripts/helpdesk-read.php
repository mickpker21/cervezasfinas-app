<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    // We can fetch different entities based on parameters
    $user_id = isset($_GET['user_id']) ? $_GET['user_id'] : null;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;

    $areas = [];
    $tickets = [];
    $messages = [];

    // 1. Fetch Areas
    $stmtAreas = $pdo->query("SELECT * FROM support_ticket_areas WHERE is_active = 1");
    $areas = $stmtAreas->fetchAll(PDO::FETCH_ASSOC);

    // 2. Fetch Tickets
    if ($user_id) {
        $stmtTickets = $pdo->prepare("SELECT * FROM support_tickets WHERE creator_id = ? OR assigned_to = ? ORDER BY created_at DESC LIMIT ?");
        $stmtTickets->bindValue(1, $user_id, PDO::PARAM_STR);
        $stmtTickets->bindValue(2, $user_id, PDO::PARAM_STR);
        $stmtTickets->bindValue(3, $limit, PDO::PARAM_INT);
        $stmtTickets->execute();
    } else {
        $stmtTickets = $pdo->prepare("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?");
        $stmtTickets->bindValue(1, $limit, PDO::PARAM_INT);
        $stmtTickets->execute();
    }
    $tickets = $stmtTickets->fetchAll(PDO::FETCH_ASSOC);

    // 3. Fetch Messages for these tickets
    if (count($tickets) > 0) {
        $ticket_ids = array_map(function($t) { return $t['id']; }, $tickets);
        $inQuery = implode(',', array_fill(0, count($ticket_ids), '?'));
        
        $stmtMessages = $pdo->prepare("SELECT * FROM support_ticket_messages WHERE ticket_id IN ($inQuery) ORDER BY created_at ASC");
        // Bind values dynamically
        foreach ($ticket_ids as $k => $id) {
            $stmtMessages->bindValue(($k+1), $id);
        }
        $stmtMessages->execute();
        $messages = $stmtMessages->fetchAll(PDO::FETCH_ASSOC);
    }
    
    echo json_encode([
        "areas" => $areas,
        "tickets" => $tickets,
        "messages" => $messages
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Database error", "error" => $e->getMessage()]);
}
?>
