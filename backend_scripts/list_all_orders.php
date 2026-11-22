<?php
header("Content-Type: application/json; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    // 1. Raw count
    $stmtCount = $pdo->query("SELECT COUNT(*) as total FROM installation_orders");
    $rowCount = $stmtCount->fetch()['total'];

    // 2. Raw rows
    $stmtRows = $pdo->query("SELECT id, client_id, status FROM installation_orders");
    $rows = $stmtRows->fetchAll(PDO::FETCH_ASSOC);

    // 3. Join rows
    $sqlJoin = "SELECT o.id as order_id, o.client_id, c.name, c.client_code
                FROM installation_orders o
                LEFT JOIN clients c ON o.client_id = c.id";
    $stmtJoin = $pdo->query($sqlJoin);
    $joinRows = $stmtJoin->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "database_table_count" => $rowCount,
        "raw_rows" => $rows,
        "join_rows_count" => count($joinRows),
        "join_rows" => $joinRows
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(["error" => $e->getMessage()]);
}
?>
