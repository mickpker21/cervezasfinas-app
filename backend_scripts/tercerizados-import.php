<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include_once 'db_config.php';

$data = json_decode(file_get_contents("php://input"));

if (empty($data->client_id) || empty($data->fecha_compra_manual)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Datos incompletos: se requiere client_id y fecha_compra_manual."]);
    exit;
}

try {
    $pdo = getDBConnection();

    // 1. Insertar el registro de tercerizado
    $stmt = $pdo->prepare("
        INSERT INTO tercerizados (client_id, fecha_compra_manual, created_by, created_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE fecha_compra_manual = VALUES(fecha_compra_manual)
    ");

    $stmt->execute([
        $data->client_id,
        $data->fecha_compra_manual,
        $data->created_by ?? null
    ]);

    echo json_encode([
        "success" => true,
        "message" => "Cliente registrado exitosamente en el panel de Tercerizados."
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Error de base de datos: " . $e->getMessage()]);
}
?>
