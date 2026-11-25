<?php
date_default_timezone_set('America/Mexico_City');
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once 'db_config.php';

function normalizeMexicoDateTime($val, $defaultNow = false) {
    if ($val === null || trim((string)$val) === '') {
        return $defaultNow ? date('Y-m-d H:i:s') : null;
    }
    $str = trim((string)$val);
    // Si ya viene en formato MySQL local de México (sin Z ni offset), conservarlo exacto
    if (preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', $str)) {
        return strlen($str) === 16 ? str_replace('T', ' ', $str) . ':00' : str_replace('T', ' ', $str);
    }
    try {
        $dt = new DateTime($str);
        $dt->setTimezone(new DateTimeZone('America/Mexico_City'));
        return $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return $defaultNow ? date('Y-m-d H:i:s') : $str;
    }
}

$data = json_decode(file_get_contents("php://input"));

if (!isset($data->supervisions) && !isset($data->visits)) {
    http_response_code(400);
    echo json_encode(["message" => "Invalid data. 'supervisions' or 'visits' array required."]);
    exit;
}

try {
    $pdo = getDBConnection();
    $pdo->beginTransaction();

    $processed_supervisions = 0;
    $processed_visits = 0;
    $errors = [];

    // 1. Process Supervisions (Headers)
    if (isset($data->supervisions) && is_array($data->supervisions)) {
        $sql = "INSERT INTO supervisor_onboard_supervisions 
                (id, supervisor_id, supervisor_name, route_name, vendedor_id, vendedor_name, start_at, end_at, checklist_data, status, score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                supervisor_name = VALUES(supervisor_name),
                end_at = VALUES(end_at),
                checklist_data = VALUES(checklist_data),
                status = VALUES(status),
                score = VALUES(score)";
        
        $stmt = $pdo->prepare($sql);
        foreach ($data->supervisions as $s) {
            try {
                $stmt->execute([
                    $s->id,
                    $s->supervisor_id,
                    isset($s->supervisor_name) ? $s->supervisor_name : 'Supervisor',
                    $s->route_name,
                    isset($s->vendedor_id) ? $s->vendedor_id : null,
                    $s->vendedor_name,
                    normalizeMexicoDateTime(isset($s->start_at) ? $s->start_at : null, true),
                    normalizeMexicoDateTime(isset($s->end_at) ? $s->end_at : null, false),
                    isset($s->checklist_data) ? (is_string($s->checklist_data) ? $s->checklist_data : json_encode($s->checklist_data)) : null,
                    isset($s->status) ? $s->status : 'draft',
                    isset($s->score) ? $s->score : 0
                ]);
                $processed_supervisions++;
            } catch (Exception $e) {
                $errors[] = ["type" => "supervision", "id" => $s->id, "error" => $e->getMessage()];
            }
        }
    }

    // 2. Process Visits
    if (isset($data->visits) && is_array($data->visits)) {
        $sql = "INSERT INTO supervisor_onboard_visits 
                (id, supervision_id, client_id, client_name, client_code, survey_data, evaluation_pdv_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                survey_data = VALUES(survey_data),
                evaluation_pdv_id = VALUES(evaluation_pdv_id)";
        
        $stmt = $pdo->prepare($sql);
        foreach ($data->visits as $v) {
            try {
                $stmt->execute([
                    $v->id,
                    $v->supervision_id,
                    $v->client_id,
                    $v->client_name,
                    $v->client_code,
                    isset($v->survey_data) ? (is_string($v->survey_data) ? $v->survey_data : json_encode($v->survey_data)) : null,
                    isset($v->evaluation_pdv_id) ? $v->evaluation_pdv_id : null,
                    normalizeMexicoDateTime(isset($v->created_at) ? $v->created_at : null, true)
                ]);
                $processed_visits++;
            } catch (Exception $e) {
                $errors[] = ["type" => "visit", "id" => $v->id, "error" => $e->getMessage()];
            }
        }
    }

    $pdo->commit();
    echo json_encode([
        "processed_supervisions" => $processed_supervisions,
        "processed_visits" => $processed_visits,
        "errors" => $errors
    ]);

} catch (Exception $e) {
    if ($pdo) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["message" => "Critical error", "error" => $e->getMessage()]);
}
?>
