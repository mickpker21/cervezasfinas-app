<?php
include_once 'db_config.php';
try {
    $pdo = getDBConnection();
    $stmt = $pdo->query("SHOW COLUMNS FROM installation_orders");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($columns, JSON_PRETTY_PRINT);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
