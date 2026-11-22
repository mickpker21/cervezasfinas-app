<?php
header("Content-Type: application/json");
include_once 'db_config.php';
try {
    $pdo = getDBConnection();
    $tables = ['clients', 'installation_orders', 'current_asset_locations', 'assets'];
    $report = [];
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM $table");
            $report[$table] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            $report[$table] = "Error: " . $e->getMessage();
        }
    }
    echo json_encode($report, JSON_PRETTY_PRINT);
} catch (Exception $e) {
    echo json_encode(["error" => $e->getMessage()]);
}
?>
