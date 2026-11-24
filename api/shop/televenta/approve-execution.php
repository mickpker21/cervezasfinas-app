<?php
require_once '../common.php';
require_once '../points/ledger.php';

handleCORS();
requireSupabaseRole(['admin', 'televenta', 'supervisor', 'operaciones', 'jefe de operaciones']);

$pdo = getDB();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    sendJSON(['error' => 'Invalid JSON body'], 400);
}
$execution_id = intval($input['execution_id'] ?? 0);
$points_awarded = intval($input['points_awarded'] ?? 0);
$client_code_in = trim((string)($input['client_code'] ?? ''));
$photo_url_in = trim((string)($input['photo_url'] ?? ''));

if ($points_awarded < 0 || $points_awarded > 100000) {
    sendJSON(['error' => 'Invalid points parameter'], 400);
}

try {
    $pdo->beginTransaction();
    
    // 1. Obtener ejecuciÃ³n (por id, o respaldo por client_code si el id era 0)
    $execution = null;
    if ($execution_id > 0) {
        $execStmt = $pdo->prepare("SELECT * FROM shop_cooler_executions WHERE id = ? AND status = 'pending' FOR UPDATE");
        $execStmt->execute([$execution_id]);
        $execution = $execStmt->fetch();
    }

    if (!$execution && $client_code_in !== '') {
        $execStmt = $pdo->prepare("SELECT * FROM shop_cooler_executions WHERE client_code = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE");
        $execStmt->execute([$client_code_in]);
        $execution = $execStmt->fetch();
        if ($execution) {
            $execution_id = (int)$execution['id'];
        }
    }

    if (!$execution) {
        $pdo->rollBack();
        sendJSON(['error' => 'Execution not found or already processed'], 404);
    }

    // Si aÃºn tenÃ­a id <= 0, asignarle un ID positivo Ãºnico antes de aprobar
    if ($execution_id <= 0) {
        $execution_id = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_cooler_executions")->fetchColumn();
        if ($execution_id <= 0) $execution_id = 1;
        $fixStmt = $pdo->prepare("UPDATE shop_cooler_executions SET id = ? WHERE client_code = ? AND status = 'pending' AND id <= 0 LIMIT 1");
        $fixStmt->execute([$execution_id, $execution['client_code']]);
    }
    
    $client_code = $execution['client_code'];

    // Verificar si el cliente tiene habilitada la acumulación de puntos (points_enabled = 1)
    try {
        $peStmt = $pdo->prepare("SELECT COALESCE(points_enabled, 1) FROM shop_client_users WHERE client_code = ? AND is_active = 1 LIMIT 1");
        $peStmt->execute([$client_code]);
        $peVal = $peStmt->fetchColumn();
        if ($peVal === false || (int)$peVal !== 1) {
            $points_awarded = 0;
        }
    } catch (Throwable $e) {}
    
    // 2. Actualizar ejecuciÃ³n
    $updateStmt = $pdo->prepare("
        UPDATE shop_cooler_executions 
        SET status = 'approved', 
            points_awarded = ?,
            reviewed_at = NOW()
        WHERE id = ? AND status = 'pending'
    ");
    $updateStmt->execute([$points_awarded, $execution_id]);
    if ($updateStmt->rowCount() < 1) {
        $pdo->rollBack();
        sendJSON(['error' => 'Execution was already processed'], 409);
    }
    
    // 3. Otorgar puntos (expiran en 6 meses)
    if ($points_awarded > 0) {
        $expires_at = calculatePointsExpirationDate($pdo);
        $nextTxId = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_points_transactions")->fetchColumn();
        if ($nextTxId <= 0) $nextTxId = 1;
        
        $transStmt = $pdo->prepare("
            INSERT INTO shop_points_transactions 
            (id, client_code, type, points, reason, related_execution_id, expires_at)
            VALUES (?, ?, 'earned', ?, 'EjecuciÃ³n de enfriador aprobada', ?, ?)
        ");
        $transStmt->execute([$nextTxId, $client_code, $points_awarded, $execution_id, $expires_at]);
        
        // Actualizar balance
        $balanceStmt = $pdo->prepare("
            INSERT INTO shop_client_points (client_code, points_balance)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE 
                points_balance = points_balance + ?,
                updated_at = NOW()
        ");
        $balanceStmt->execute([$client_code, $points_awarded, $points_awarded]);
    }
    
    $pdo->commit();

    try {
        require_once __DIR__ . '/../notifications/push-helper.php';
        $ptsTxt = ($points_awarded > 0) ? " y ganaste +" . number_format($points_awarded) . " puntos" : "";
        sendShopPushToClient($pdo, $client_code, "ðŸ“¸ Â¡Foto de enfriador aprobada!", "Tu foto fue validada por Televenta{$ptsTxt}.", "/cooler-execution");
    } catch (Exception $e) {}
    
    sendJSON([
        'success' => true,
        'message' => 'Execution approved',
        'points_awarded' => $points_awarded
    ]);
    
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
}
?>
