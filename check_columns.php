<?php
require_once __DIR__ . '/backend_scripts/db_config.php';
try {
    $pdo = getDBConnection();
    $stmt = $pdo->query("SHOW COLUMNS FROM assets");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    print_r($columns);
} catch (Exception $e) {
    echo $e->getMessage();
}
