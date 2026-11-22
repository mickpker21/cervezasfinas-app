<?php
include_once 'db_config.php';
header("Content-Type: text/plain");
try {
    $pdo = getDBConnection();
    echo "Checking installation_orders schema...\n";
    
    // Check if column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM installation_orders LIKE 'assigned_to'");
    $exists = $stmt->fetch();
    
    if (!$exists) {
        echo "Column 'assigned_to' missing. Adding it...\n";
        $pdo->exec("ALTER TABLE installation_orders ADD COLUMN assigned_to VARCHAR(50) DEFAULT NULL AFTER action");
        $pdo->exec("CREATE INDEX idx_assigned_to ON installation_orders(assigned_to)");
        echo "Column 'assigned_to' added successfully.\n";
    } else {
        echo "Column 'assigned_to' already exists.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
