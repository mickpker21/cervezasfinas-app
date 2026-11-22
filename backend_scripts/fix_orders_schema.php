<?php
header("Content-Type: text/plain; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    echo "--- STARTING SCHEMA REPAIR ---\n";

    // 1. Repair installation_orders
    echo "Repairing installation_orders...\n";
    $pdo->exec("ALTER TABLE installation_orders MODIFY client_id VARCHAR(50)");
    $pdo->exec("ALTER TABLE installation_orders MODIFY destination_client_id VARCHAR(50)");
    
    $cachedColumns = [
        "client_name_cached VARCHAR(255)",
        "client_address_cached TEXT",
        "client_business_name_cached VARCHAR(255)",
        "destination_client_name_cached VARCHAR(255)",
        "destination_client_address_cached TEXT",
        "destination_client_business_name_cached VARCHAR(255)"
    ];

    foreach ($cachedColumns as $col) {
        try {
            $pdo->exec("ALTER TABLE installation_orders ADD COLUMN $col");
        } catch (Exception $e) {
            // Ignorar si ya existen
        }
    }
    echo "Success: installation_orders columns updated.\n";

    // 2. Repair asset_movements (just in case)
    echo "Checking asset_movements...\n";
    try {
        $pdo->exec("ALTER TABLE asset_movements MODIFY from_client_id VARCHAR(50)");
        $pdo->exec("ALTER TABLE asset_movements MODIFY to_client_id VARCHAR(50)");
        echo "Success: asset_movements columns updated.\n";
    } catch (Exception $e) {
        echo "Note: asset_movements update skipped or failed (may not exist yet): " . $e->getMessage() . "\n";
    }

    // 3. Repair current_asset_locations
    echo "Checking current_asset_locations...\n";
    try {
        $pdo->exec("ALTER TABLE current_asset_locations MODIFY client_id VARCHAR(50)");
        echo "Success: current_asset_locations column updated.\n";
    } catch (Exception $e) {
        echo "Note: current_asset_locations update skipped or failed.\n";
    }

    echo "\n--- REPAIR COMPLETE ---\n";

} catch (Exception $e) {
    echo "CRITICAL ERROR: " . $e->getMessage() . "\n";
}
?>
