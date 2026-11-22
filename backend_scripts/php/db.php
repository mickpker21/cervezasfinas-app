<?php
// backend_scripts/php/db.php
date_default_timezone_set('America/Mexico_City');

$host = 'localhost';
$dbname = 'u815168173_um6pos';
$user = 'u815168173_um6user';
$pass = 'Rsfl284@';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$dbname;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    // En producción, no mostrar el error real al usuario
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}
?>
