<?php
require_once '../common.php';
handleCORS();
$pdo = getDB();

try {
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM shop_cooler_executions");
    $count = $stmt->fetchColumn();
    
    $stmt2 = $pdo->query("SELECT * FROM shop_cooler_executions LIMIT 5");
    $rows = $stmt2->fetchAll();

    sendJSON([
        'count' => $count,
        'sample_data' => $rows
    ]);
} catch (PDOException $e) {
    sendJSON(['error' => $e->getMessage()], 500);
}
?>
