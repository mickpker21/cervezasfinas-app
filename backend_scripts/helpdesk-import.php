<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once 'db_config.php';

$data = json_decode(file_get_contents("php://input"));

if (!isset($data->tickets) && !isset($data->messages) && !isset($data->areas)) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid data. 'tickets', 'messages' or 'areas' required."]);
    exit;
}

try {
    $pdo = getDBConnection();
    $pdo->beginTransaction();

    $processed_tickets = 0;
    $processed_messages = 0;
    $processed_areas = 0;
    $errors = [];

    // 1. Process Areas
    if (isset($data->areas) && is_array($data->areas)) {
        $sql = "INSERT INTO support_ticket_areas (id, name, is_active)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                is_active = VALUES(is_active)";
        
        $stmt = $pdo->prepare($sql);
        foreach ($data->areas as $a) {
            try {
                $stmt->execute([
                    $a->id,
                    $a->name,
                    isset($a->is_active) ? $a->is_active : 1
                ]);
                $processed_areas++;
            } catch (Exception $e) {
                $errors[] = ["type" => "area", "id" => $a->id, "error" => $e->getMessage()];
            }
        }
    }

    // 2. Process Tickets
    if (isset($data->tickets) && is_array($data->tickets)) {
        $sql = "INSERT INTO support_tickets 
                (id, creator_id, creator_name, area_id, area_name, subject, description, priority, status, assigned_to, image_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                area_id = VALUES(area_id),
                area_name = VALUES(area_name),
                priority = VALUES(priority),
                status = VALUES(status),
                assigned_to = VALUES(assigned_to),
                image_url = VALUES(image_url)";
        
        $stmt = $pdo->prepare($sql);
        foreach ($data->tickets as $t) {
            try {
                $stmt->execute([
                    $t->id,
                    $t->creator_id,
                    $t->creator_name,
                    $t->area_id,
                    isset($t->area_name) ? $t->area_name : null,
                    $t->subject,
                    isset($t->description) ? $t->description : null,
                    isset($t->priority) ? $t->priority : 'MEDIA',
                    isset($t->status) ? $t->status : 'OPEN',
                    isset($t->assigned_to) ? $t->assigned_to : null,
                    isset($t->image_url) ? $t->image_url : null,
                    isset($t->created_at) ? $t->created_at : date('Y-m-d H:i:s')
                ]);
                $processed_tickets++;
            } catch (Exception $e) {
                $errors[] = ["type" => "ticket", "id" => $t->id, "error" => $e->getMessage()];
            }
        }
    }

    // 3. Process Messages
    if (isset($data->messages) && is_array($data->messages)) {
        $sql = "INSERT INTO support_ticket_messages 
                (id, ticket_id, sender_id, sender_name, message, image_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                message = VALUES(message),
                image_url = VALUES(image_url)";
        
        $stmt = $pdo->prepare($sql);
        foreach ($data->messages as $m) {
            try {
                $stmt->execute([
                    $m->id,
                    $m->ticket_id,
                    $m->sender_id,
                    $m->sender_name,
                    $m->message,
                    isset($m->image_url) ? $m->image_url : null,
                    isset($m->created_at) ? $m->created_at : date('Y-m-d H:i:s')
                ]);
                $processed_messages++;
            } catch (Exception $e) {
                $errors[] = ["type" => "message", "id" => $m->id, "error" => $e->getMessage()];
            }
        }
    }

    $pdo->commit();
    echo json_encode([
        "processed_areas" => $processed_areas,
        "processed_tickets" => $processed_tickets,
        "processed_messages" => $processed_messages,
        "errors" => $errors
    ]);

} catch (Exception $e) {
    if ($pdo) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["message" => "Critical error", "error" => $e->getMessage()]);
}
?>
