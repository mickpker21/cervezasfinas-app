<?php
include_once 'db_config.php';
try {
    $pdo = getDBConnection();
    
    echo "--- TERCERIZADOS COLS ---\n";
    $stmt = $pdo->query("DESCRIBE tercerizados");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
    
    echo "\n--- VENTAS_POR_SKU COLS ---\n";
    $stmt = $pdo->query("DESCRIBE ventas_por_sku");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
    
    echo "\n--- SAMPLE TERCERIZADOS ---\n";
    $stmt = $pdo->query("SELECT * FROM tercerizados LIMIT 1");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
?>
