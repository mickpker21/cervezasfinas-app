<?php
include_once 'db_config.php';
try {
    $pdo = getDBConnection();
    $sql = file_get_contents('migration_portfolio_about.sql');
    $pdo->exec($sql);
    echo "Migration successful!";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
