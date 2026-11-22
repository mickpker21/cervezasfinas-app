<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    $input = file_get_contents("php://input");
    $data = json_decode($input, true);

    if (!isset($data['id'])) {
        throw new Exception("Invalid payload: 'id' required.");
    }

    $id = $data['id'];

    // Hard Delete
    $sql = "DELETE FROM clients WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() > 0) {
        echo json_encode([
            'message' => 'Client deleted successfully',
            'id' => $id
        ]);
    } else {
        // Maybe it didn't exist, but success anyway
        echo json_encode([
            'message' => 'Client deleted (or not found)',
            'id' => $id
        ]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
