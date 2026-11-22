<?php
require_once '../common.php';

try {
    $pdo = getDB();
    
    // Add points_awarded column if it doesn't exist
    $sql = "
        ALTER TABLE shop_products 
        ADD COLUMN IF NOT EXISTS points_awarded INT DEFAULT 0 COMMENT 'Points awarded when this product is sold';
    ";
    
    $pdo->exec($sql);
    
    echo "Migration successful: Added points_awarded column to shop_products.";
    
} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage();
}
?>
