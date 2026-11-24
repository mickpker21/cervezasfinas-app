<?php
require_once '../common.php';
require_once '../points/ledger.php';

handleCORS();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

requireSupabaseRole(['admin', 'televenta', 'autoventa', 'preventa', 'chofer', 'supervisor', 'operaciones', 'jefe de operaciones']);

$input = json_decode(file_get_contents('php://input'), true);
$preventaId = trim((string)($input['preventa_id'] ?? ''));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $preventaId)) {
    sendJSON(['error' => 'A valid preventa_id is required'], 400);
}

$pdo = getDB();

$baseUrl = rtrim(requiredEnv('SUPABASE_URL'), '/');
$anonKey = requiredEnv('SUPABASE_ANON_KEY');
$headers = [
    "apikey: $anonKey",
    'Authorization: Bearer ' . getBearerToken(),
    'Accept: application/json'
];

// Consultar override en MySQL (si se modificaron precios/cantidades o se marcó entregado en MySQL)
$override = null;
try {
    $ovStmt = $pdo->prepare("SELECT * FROM shop_preventa_overrides WHERE preventa_id = ? LIMIT 1");
    $ovStmt->execute([$preventaId]);
    $override = $ovStmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {}

$preventaResult = supabaseGet(
    $baseUrl . '/rest/v1/preventa?id=eq.' . rawurlencode($preventaId) . '&select=id,client_id,total_amount,status',
    $headers
);
$preventa = ($preventaResult['status'] === 200 && is_array($preventaResult['json']) && !empty($preventaResult['json'][0]))
    ? $preventaResult['json'][0]
    : null;

$effectiveStatus = strtolower((string)($override['status'] ?? $preventa['status'] ?? 'entregado'));
if ($effectiveStatus !== 'entregado' && $effectiveStatus !== 'delivered') {
    try {
        $pdo->prepare("INSERT INTO shop_preventa_overrides (preventa_id, status) VALUES (?, 'entregado') ON DUPLICATE KEY UPDATE status = 'entregado'")->execute([$preventaId]);
    } catch (Throwable $e) {}
}

$clientId = trim((string)($preventa['client_id'] ?? ''));
$clientCode = trim((string)($input['client_code'] ?? ''));

if ($clientCode === '' && $clientId !== '') {
    try {
        $clientStmt = $pdo->prepare('SELECT client_code FROM clients WHERE id = ? LIMIT 1');
        $clientStmt->execute([$clientId]);
        $client = $clientStmt->fetch();
        if ($client && trim((string)($client['client_code'] ?? '')) !== '') {
            $clientCode = trim((string)$client['client_code']);
        }
    } catch (Throwable $e) {}
}

if ($clientCode === '' && $clientId !== '') {
    $sbClient = supabaseGet(
        $baseUrl . '/rest/v1/clients?id=eq.' . rawurlencode($clientId) . '&select=client_code',
        $headers
    );
    if ($sbClient['status'] === 200 && is_array($sbClient['json']) && !empty($sbClient['json'][0]['client_code'])) {
        $clientCode = trim((string)$sbClient['json'][0]['client_code']);
    }
}

if ($clientCode === '') {
    error_log('Preventa points: client lookup failed for ' . $preventaId . ', client ' . $clientId);
    sendJSON(['error' => 'Unable to verify preventa client'], 502);
}

// RESTRICCIÓN ESTRICTA: Solo otorgar puntos a clientes activos en Shop CON acumulación de puntos habilitada (points_enabled = 1)
$shopUser = false;
try {
    $shopUserStmt = $pdo->prepare("SELECT id, COALESCE(points_enabled, 1) AS points_enabled FROM shop_client_users WHERE client_code = ? AND is_active = 1 LIMIT 1");
    $shopUserStmt->execute([$clientCode]);
    $rowShop = $shopUserStmt->fetch(PDO::FETCH_ASSOC);
    $shopUser = ($rowShop && (int)($rowShop['points_enabled'] ?? 1) === 1);
} catch (Throwable $e) {
    $shopUserStmt = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ? AND is_active = 1 LIMIT 1");
    $shopUserStmt->execute([$clientCode]);
    $shopUser = (bool)$shopUserStmt->fetch();
}

if (!$shopUser) {
    // El cliente NO está registrado en la Shop -> NO se otorgan puntos.
    try {
        $skipStmt = $pdo->prepare('INSERT INTO shop_preventa_point_awards (preventa_id, client_code, points_awarded) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE points_awarded = 0');
        $skipStmt->execute([$preventaId, $clientCode]);
    } catch (Throwable $e) {}

    sendJSON([
        'success' => true,
        'data' => [
            'points_awarded' => 0,
            'skipped' => true,
            'reason' => 'El cliente no está registrado en UM6 SHOP (solo los clientes dados de alta en la Shop acumulan puntos).'
        ]
    ]);
}

$itemsList = [];
if (!empty($override['items_json'])) {
    $decoded = json_decode($override['items_json'], true);
    if (is_array($decoded)) {
        $itemsList = $decoded;
    }
}

if (empty($itemsList)) {
    $itemsResult = supabaseGet(
        $baseUrl . '/rest/v1/preventa_items?preventa_id=eq.' . rawurlencode($preventaId) . '&select=cve_marca,quantity',
        $headers
    );
    if ($itemsResult['status'] === 200 && is_array($itemsResult['json'])) {
        $itemsList = $itemsResult['json'];
    } elseif (!empty($input['items']) && is_array($input['items'])) {
        $itemsList = $input['items'];
    }
}

$totalAmount = 0.0;
if ($override && $override['total_amount'] !== null) {
    $totalAmount = max(0, (float)$override['total_amount']);
} elseif ($preventa && isset($preventa['total_amount'])) {
    $totalAmount = max(0, (float)$preventa['total_amount']);
} elseif (isset($input['total_amount'])) {
    $totalAmount = max(0, (float)$input['total_amount']);
}

try {
    $pdo->beginTransaction();
    $existingStmt = $pdo->prepare('SELECT points_awarded FROM shop_preventa_point_awards WHERE preventa_id = ? FOR UPDATE');
    $existingStmt->execute([$preventaId]);
    $existing = $existingStmt->fetch();
    if ($existing) {
        $pdo->commit();
        sendJSON(['success' => true, 'data' => ['points_awarded' => (int)$existing['points_awarded'], 'already_awarded' => true]]);
    }

    $config = $pdo->query('SELECT points_per_peso, min_purchase_for_points FROM shop_points_config LIMIT 1')->fetch();
    $pointsPerPeso = $config ? max(0, (float)$config['points_per_peso']) : 1.0;
    $minimumPurchase = $config ? max(0, (float)$config['min_purchase_for_points']) : 0.0;
    $basePoints = (int)floor(($totalAmount * $pointsPerPeso) + 0.000001);

    $bonusPoints = 0;
    try {
        $skuPointsStmt = $pdo->prepare('SELECT points_awarded FROM shop_products WHERE sku = ? LIMIT 1');
        foreach ($itemsList as $item) {
            $sku = trim((string)($item['cve_marca'] ?? $item['sku'] ?? ''));
            $quantity = max(0, (int)($item['quantity'] ?? 0));
            if ($sku === '' || $quantity === 0) continue;
            $skuPointsStmt->execute([$sku]);
            $bonusPoints += $quantity * max(0, (int)$skuPointsStmt->fetchColumn());
        }
    } catch (PDOException $e) {
        error_log('Preventa points: optional SKU bonus lookup failed: ' . $e->getMessage());
        $bonusPoints = 0;
    }

    $pointsAwarded = $totalAmount >= $minimumPurchase ? $basePoints + $bonusPoints : 0;
    $awardStmt = $pdo->prepare('INSERT INTO shop_preventa_point_awards (preventa_id, client_code, points_awarded) VALUES (?, ?, ?)');
    $awardStmt->execute([$preventaId, $clientCode, $pointsAwarded]);
    if ($pointsAwarded > 0) {
        $nextTxId = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_points_transactions")->fetchColumn();
        $expiresAt = date('Y-m-d H:i:s', strtotime('+6 months'));
        $reason = "Preventa entregada ({$basePoints} base + {$bonusPoints} extra SKU)";
        $transactionStmt = $pdo->prepare("
            INSERT INTO shop_points_transactions (id, client_code, type, points, reason, description, expires_at)
            VALUES (?, ?, 'earned', ?, ?, ?, ?)
        ");
        $transactionStmt->execute([$nextTxId, $clientCode, $pointsAwarded, $reason, $reason, $expiresAt]);

        $ledger = getClientPointsLedger($pdo, $clientCode);
        $newBalance = (int)($ledger['points_balance'] ?? $ledger['balance'] ?? 0);

        $balanceStmt = $pdo->prepare(
            'INSERT INTO shop_client_points (client_code, points_balance) VALUES (?, ?) ' .
            'ON DUPLICATE KEY UPDATE points_balance = ?, updated_at = NOW()'
        );
        $balanceStmt->execute([$clientCode, $newBalance, $newBalance]);
    }

    $pdo->commit();

    try {
        require_once __DIR__ . '/../notifications/push-helper.php';
        $ptsTxt = ($pointsAwarded > 0) ? " ¡Ganaste +" . number_format($pointsAwarded) . " puntos!" : "";
        sendShopPushToClient($pdo, $clientCode, "🚚 Pedido entregado", "Tu pedido fue entregado exitosamente.{$ptsTxt}", "/points");
    } catch (Exception $e) {}

    sendJSON(['success' => true, 'data' => ['points_awarded' => $pointsAwarded, 'base_points' => $basePoints, 'bonus_points' => $bonusPoints]]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($e->getCode() === '23000') {
        $existingStmt = $pdo->prepare('SELECT points_awarded FROM shop_preventa_point_awards WHERE preventa_id = ?');
        $existingStmt->execute([$preventaId]);
        $existing = $existingStmt->fetch();
        if ($existing) sendJSON(['success' => true, 'data' => ['points_awarded' => (int)$existing['points_awarded'], 'already_awarded' => true]]);
    }
    error_log('Preventa points award failed for ' . $preventaId . ': ' . $e->getMessage());
    sendJSON(['error' => 'Unable to award points'], 500);
}
?>