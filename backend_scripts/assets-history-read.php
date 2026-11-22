<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    $asset_id = isset($_GET['asset_id']) ? $_GET['asset_id'] : null;

    if (!$asset_id) {
        http_response_code(400);
        echo json_encode(["message" => "asset_id is required."]);
        exit;
    }

    // Join with clients to get names and installation_orders for action info
    // Assuming performer_id is a user id that might need profile join via JS or another API
    $sql = "SELECT m.*, 
            c1.name as from_client_name, 
            c2.name as to_client_name,
            o.action as order_action,
            o.notes as order_notes
            FROM asset_movements m
            LEFT JOIN clients c1 ON m.from_client_id = c1.id
            LEFT JOIN clients c2 ON m.to_client_id = c2.id
            LEFT JOIN installation_orders o ON m.order_id = o.id
            WHERE m.asset_id = ?
            ORDER BY m.created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$asset_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['rows' => $rows, 'count' => count($rows)]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
