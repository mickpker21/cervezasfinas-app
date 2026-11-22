<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once 'db_config.php';

$data = json_decode(file_get_contents("php://input"));

if (!isset($data->id)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Order ID is required."]);
    exit;
}

try {
    $pdo = getDBConnection();
    
    $fields = [];
    $params = [":id" => $data->id];

    if (property_exists($data, 'assigned_to')) {
        $fields[] = "assigned_to = :assigned_to";
        $params[":assigned_to"] = $data->assigned_to;
    }

    if (property_exists($data, 'status')) {
        $fields[] = "status = :status";
        $params[":status"] = $data->status;
    }

    if (property_exists($data, 'notes')) {
        $fields[] = "notes = :notes";
        $params[":notes"] = $data->notes;
    }

    if (empty($fields)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "No fields to update."]);
        exit;
    }

    $sql = "UPDATE installation_orders SET " . implode(", ", $fields) . ", updated_at = NOW() WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if ($stmt->rowCount() > 0) {
        echo json_encode(["status" => "success", "message" => "Order updated successfully."]);
    } else {
        // Might be same values or ID not found
        echo json_encode(["status" => "success", "message" => "No changes made or order not found."]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database error", "error" => $e->getMessage()]);
}
?>
