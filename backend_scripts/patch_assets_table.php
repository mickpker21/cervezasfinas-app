<?php
require_once __DIR__ . '/db_config.php';

try {
    $pdo = getDBConnection();
    
    // Add columns to assets table
    $queries = [
        "ALTER TABLE assets ADD COLUMN brand VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE assets ADD COLUMN model VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE assets ADD COLUMN qr_value VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE assets ADD COLUMN warehouse_id VARCHAR(50) DEFAULT NULL"
    ];
    
    foreach ($queries as $q) {
        try {
            $pdo->exec($q);
            echo "Successfully executed: $q\n";
        } catch (Exception $e) {
            echo "Skipped or failed (might already exist): " . $e->getMessage() . "\n";
        }
    }
    
    echo "Done patching assets table.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
