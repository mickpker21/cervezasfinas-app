<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    $supervisor_id = isset($_GET['supervisor_id']) && $_GET['supervisor_id'] !== 'all' ? $_GET['supervisor_id'] : null;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;

    // 1. Fetch Supervisions
    $conditions = [];
    $params = [];
    
    if ($supervisor_id) {
        $conditions[] = "supervisor_id = ?";
        $params[] = $supervisor_id;
    }

    $whereSql = !empty($conditions) ? "WHERE " . implode(" AND ", $conditions) : "";
    
    $sql = "SELECT * FROM supervisor_onboard_supervisions 
            $whereSql 
            ORDER BY start_at DESC 
            LIMIT " . (int)$limit;
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $supervisions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($supervisions)) {
        echo json_encode(["rows" => [], "count" => 0]);
        exit;
    }

    // 2. Fetch related visits for these supervisions
    $sup_ids = array_column($supervisions, 'id');
    $placeholders = implode(',', array_fill(0, count($sup_ids), '?'));
    
    $sql_visits = "SELECT * FROM supervisor_onboard_visits WHERE supervision_id IN ($placeholders) ORDER BY created_at ASC";
    $stmt_v = $pdo->prepare($sql_visits);
    $stmt_v->execute($sup_ids);
    $all_visits = $stmt_v->fetchAll(PDO::FETCH_ASSOC);

    // Group visits by supervision_id
    $visits_by_sup = [];
    foreach ($all_visits as $v) {
        $sid = $v['supervision_id'];
        if (!isset($visits_by_sup[$sid])) $visits_by_sup[$sid] = [];
        $visits_by_sup[$sid][] = $v;
    }

    // Combine results
    foreach ($supervisions as &$s) {
        $s['visits'] = isset($visits_by_sup[$s['id']]) ? $visits_by_sup[$s['id']] : [];
    }

    echo json_encode([
        "rows" => $supervisions,
        "count" => count($supervisions)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["message" => "Critical error", "error" => $e->getMessage()]);
}
?>
