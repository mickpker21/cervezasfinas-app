<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db_config.php';
$pdo = getDBConnection();

$supervisor_id = $_GET['supervisor_id'] ?? null;
$client_code   = $_GET['client_code']   ?? null;
$from          = $_GET['from']          ?? date('Y-m-01');
$to            = $_GET['to']            ?? date('Y-m-d');
$limit         = min((int)($_GET['limit']  ?? 500), 2000);
$offset        = (int)($_GET['offset'] ?? 0);

$where  = ['cs.created_at >= :from', 'cs.created_at <= :to_end'];
$params = [':from' => $from . ' 00:00:00', ':to_end' => $to . ' 23:59:59'];

if ($supervisor_id) { $where[] = 'cs.supervisor_id = :sup_id'; $params[':sup_id'] = $supervisor_id; }
if ($client_code)   { $where[] = 'cs.client_code = :ccode';    $params[':ccode']  = $client_code; }

$whereStr = implode(' AND ', $where);

$sql = "
    SELECT
        cs.*,
        c.name         AS client_name_live,
        c.business_name,
        c.coords,
        c.lat          AS client_lat,
        c.lng          AS client_lng
    FROM censos_supervisor cs
    LEFT JOIN clients c ON cs.client_code = c.client_code
    WHERE $whereStr
    ORDER BY cs.created_at DESC
    LIMIT :limit OFFSET :offset
";

$stmt = $pdo->prepare($sql);
foreach ($params as $k => $v) $stmt->bindValue($k, $v);
$stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Parse booleans
foreach ($rows as &$row) {
    $row['tiene_enfriador'] = (bool)$row['tiene_enfriador'];
    $row['invadido']        = (bool)$row['invadido'];
}
unset($row);

echo json_encode($rows);
