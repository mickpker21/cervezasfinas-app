<?php
// CHECK DB HEALTH SCRIPT
include_once 'db.php';
header('Content-Type: application/json');

$response = [];

try {
    // 1. Check Table Existance
    $tables = [];
    $stmt = $pdo->query("SHOW TABLES LIKE 'evaluaciones%'");
    while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
        $tables[] = $row[0];
    }
    $response['tables'] = $tables;

    // 2. Analyze Evaluaciones PDV content
    $sqlPDV = "SELECT count(*) as total, 
               SUM(CASE WHEN payload LIKE '%Canal Moderno%' THEN 1 ELSE 0 END) as suspicious_cm_payload,
               SUM(CASE WHEN payload LIKE '%AB MARTINEZ%' THEN 1 ELSE 0 END) as specific_cm_example
               FROM evaluaciones_pdv";
    $stmtPDV = $pdo->query($sqlPDV);
    $response['stats_pdv'] = $stmtPDV->fetch(PDO::FETCH_ASSOC);

    // 3. Analyze Evaluaciones CM content
    $sqlCM = "SELECT count(*) as total FROM evaluaciones";
    $stmtCM = $pdo->query($sqlCM);
    $response['stats_cm'] = $stmtCM->fetch(PDO::FETCH_ASSOC);

} catch (PDOException $e) {
    $response['error'] = $e->getMessage();
}

echo json_encode($response, JSON_PRETTY_PRINT);
?>
