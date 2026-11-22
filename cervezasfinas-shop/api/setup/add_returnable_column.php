<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

try {
    // Add returnable_factor column
    $sql = "ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS returnable_factor DECIMAL(3,1) DEFAULT 0";
    $pdo->exec($sql);
    
    echo "Column 'returnable_factor' added successfully (or already exists).\n";

    // Set some test data (optional, but good for immediate verification)
    // Assuming some beer products might be returnable. 
    // We'll set a few random ones if they exist, just for demonstration if the user wants.
    // For now, we just add the column.

    sendJSON(['success' => true, 'message' => 'Schema updated successfully']);

} catch (PDOException $e) {
    sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
}
?>
