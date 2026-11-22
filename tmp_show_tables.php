<?php
require 'backend_scripts/db_config.php';
$pdo = getDBConnection();
$stmt = $pdo->query('SHOW TABLES');
print_r($stmt->fetchAll(PDO::FETCH_COLUMN));
