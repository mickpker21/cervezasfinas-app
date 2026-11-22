<?php
require '../common.php';
try {
    $pdo = getDB();
    $stmt = $pdo->query("SELECT sales_route FROM shop_special_prices LIMIT 0");
    echo "SCHEMA_OK";
} catch (PDOException $e) {
    echo "SCHEMA_ERROR: " . $e->getMessage();
}
?>
