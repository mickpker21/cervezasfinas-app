<?php
// backend_scripts/php/visitas-import.php
include_once 'db.php'; // Assumes PDO $pdo connection

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$input = json_decode(file_get_contents('php://input'), true);
$rows = $input['visitas'] ?? [];

if (empty($rows)) {
    echo json_encode(['message' => 'No data provided', 'inserted' => 0]);
    exit;
}

$stmt = $pdo->prepare("
    INSERT INTO visitas (
        id, client_id, client_code, business_name, user_id, fecha, hora, ruta, motivo, notes,
        photo_fachada, photo_interior, photo_enfriador, lat, lng, inventory, created_at
    ) VALUES (
        :id, :client_id, :client_code, :business_name, :user_id, :fecha, :hora, :ruta, :motivo, :notes,
        :photo_fachada, :photo_interior, :photo_enfriador, :lat, :lng, :inventory, :created_at
    ) ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha), hora=VALUES(hora), motivo=VALUES(motivo), notes=VALUES(notes),
        client_code=VALUES(client_code), business_name=VALUES(business_name),
        photo_fachada=VALUES(photo_fachada), photo_interior=VALUES(photo_interior),
        photo_enfriador=VALUES(photo_enfriador), inventory=VALUES(inventory), updated_at=:server_timestamp
");

$processed = 0;
$errors = [];
$server_timestamp = date('Y-m-d H:i:s');

foreach ($rows as $row) {
    try {
        $stmt->execute([
            ':id' => $row['id'],
            ':client_id' => $row['client_id'],
            ':client_code' => $row['client_code'] ?? null,
            ':business_name' => $row['business_name'] ?? null,
            ':user_id' => $row['user_id'],
            ':fecha' => $row['fecha'],
            ':hora' => $row['hora'] ?? null,
            ':ruta' => $row['ruta'] ?? null,
            ':motivo' => $row['motivo'] ?? null,
            ':notes' => $row['notes'] ?? null,
            ':photo_fachada' => $row['photo_fachada'] ?? null,
            ':photo_interior' => $row['photo_interior'] ?? null,
            ':photo_enfriador' => $row['photo_enfriador'] ?? null,
            ':lat' => $row['lat'] ?? null,
            ':lng' => $row['lng'] ?? null,
            ':inventory' => is_array($row['inventory']) ? json_encode($row['inventory']) : ($row['inventory'] ?? null),
            ':created_at' => $row['created_at'] ?? $server_timestamp,
            ':server_timestamp' => $server_timestamp
        ]);
        $processed++;
    } catch (PDOException $e) {
        $errors[] = "Error ID {$row['id']}: " . $e->getMessage();
    }
}

echo json_encode(['processed' => $processed, 'errors' => $errors]);
?>
