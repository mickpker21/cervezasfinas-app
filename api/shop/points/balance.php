<?php
require_once '../common.php';
require_once __DIR__ . '/ledger.php';

handleCORS();

$pdo = getDB();
$auth = requireAuth();

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    $client_code = $auth['client_code'];

    // Verificar si el cliente tiene habilitada la acumulación de puntos
    $pointsEnabled = 1;
    try {
        $peStmt = $pdo->prepare("SELECT COALESCE(points_enabled, 1) FROM shop_client_users WHERE client_code = ? LIMIT 1");
        $peStmt->execute([$client_code]);
        $peVal = $peStmt->fetchColumn();
        if ($peVal !== false) {
            $pointsEnabled = ((int)$peVal === 1) ? 1 : 0;
        }
    } catch (Exception $e) {}

    // Calcular el saldo real en vivo (descontando lotes expirados y canjes)
    $ledger = getClientPointsLedger($pdo, $client_code);
    $balance = (int)($ledger['balance'] ?? 0);
    $expiringSoon = (int)($ledger['expiring_soon'] ?? 0);
    $nextExpiresAt = $ledger['next_expires_at'] ?? null;
    $expiredPoints = (int)($ledger['expired_points'] ?? 0);

    sendJSON([
        'success' => true,
        'data' => [
            'balance' => $balance,
            'points_balance' => $balance,
            'points_enabled' => $pointsEnabled,
            'expiring_soon' => $expiringSoon,
            'next_expires_at' => $nextExpiresAt,
            'expired_points' => $expiredPoints,
            'updated_at' => date('Y-m-d H:i:s')
        ]
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error'], 500);
}
?>
