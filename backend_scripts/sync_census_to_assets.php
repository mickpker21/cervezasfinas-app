<?php
header("Content-Type: application/json; charset=UTF-8");
include_once 'db_config.php';
include_once 'asset-helpers.php';

$dry_run = isset($_GET['dry_run']) && $_GET['dry_run'] == '1';

try {
    $pdo = getDBConnection();
    
    // Fetch all censos
    $stmtCensos = $pdo->query("SELECT * FROM censos_supervisor");
    $censos = $stmtCensos->fetchAll(PDO::FETCH_ASSOC);

    $results = [
        'processed' => 0,
        'synced' => 0,
        'logs' => []
    ];

    foreach ($censos as $c) {
        $client_info = ($c['client_code'] ?: $c['client_id']);
        
        if ($dry_run) {
            $hasE = ($c['tiene_enfriador'] && !empty($c['serial']));
            $hasF = ($c['tiene_fachada']);
            if ($hasE || $hasF) {
                $results['logs'][] = "Would sync assets for Client $client_info" . ($hasE ? " (Enfriador)" : "") . ($hasF ? " (Fachada)" : "");
            }
        } else {
            if (registerAssetFromCensus($pdo, $c)) {
                $results['synced']++;
            }
        }
        $results['processed']++;
    }

    echo json_encode([
        'status' => 'success',
        'dry_run' => $dry_run,
        'results' => $results
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
