<?php
require_once '../common.php';
require_once '../points/ledger.php';

handleCORS();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Only staff that can create/handle sales may award points for one.
requireSupabaseRole(['admin', 'televenta', 'autoventa', 'preventa', 'supervisor', 'operaciones', 'jefe de operaciones']);

$input = json_decode(file_get_contents('php://input'), true);
$saleId = trim((string)($input['sale_id'] ?? ''));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $saleId)) {
    sendJSON(['error' => 'A valid sale_id is required'], 400);
}

$baseUrl = rtrim(requiredEnv('SUPABASE_URL'), '/');
$anonKey = requiredEnv('SUPABASE_ANON_KEY');
$token = getBearerToken();
$headers = ["apikey: $anonKey", "Authorization: Bearer $token", 'Accept: application/json'];

// Read the sale from the authenticated Supabase project. Never trust an amount
// or client code supplied by the browser when awarding loyalty points.
$saleResult = supabaseGet(
    $baseUrl . '/rest/v1/direct_sales?id=eq.' . rawurlencode($saleId) . '&select=id,client_id,total_amount,status',
    $headers
);
if ($saleResult['status'] !== 200 || !is_array($saleResult['json']) || empty($saleResult['json'][0])) {
    error_log('Direct sale points: sale lookup failed for ' . $saleId . ' (HTTP ' . $saleResult['status'] . ')');
    sendJSON(['error' => 'Unable to verify direct sale'], 502);
}
$sale = $saleResult['json'][0];
if (!in_array(strtoupper((string)($sale['status'] ?? '')), ['COMPLETED', 'DELIVERED'], true)) {
    sendJSON(['error' => 'Direct sale is not completed'], 409);
}

$clientId = trim((string)($sale['client_id'] ?? ''));
if ($clientId === '') sendJSON(['error' => 'Direct sale has no client'], 422);

$pdo = getDB();
$clientCode = '';
try {
    $clientStmt = $pdo->prepare('SELECT client_code FROM clients WHERE id = ? LIMIT 1');
    $clientStmt->execute([$clientId]);
    $client = $clientStmt->fetch();
    if ($client && trim((string)($client['client_code'] ?? '')) !== '') {
        $clientCode = trim((string)$client['client_code']);
    }
} catch (Throwable $e) {}

if ($clientCode === '') {
    $sbClient = supabaseGet(
        $baseUrl . '/rest/v1/clients?id=eq.' . rawurlencode($clientId) . '&select=client_code',
        $headers
    );
    if ($sbClient['status'] === 200 && is_array($sbClient['json']) && !empty($sbClient['json'][0]['client_code'])) {
        $clientCode = trim((string)$sbClient['json'][0]['client_code']);
    }
}

if ($clientCode === '') {
    error_log('Direct sale points: client lookup failed for sale ' . $saleId . ', client ' . $clientId);
    sendJSON(['error' => 'Unable to verify sale client'], 502);
}

// RESTRICCIÓN: Solo otorgar puntos a clientes activos en la Shop CON acumulación de puntos habilitada (points_enabled = 1)
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
    // El cliente NO tiene cuenta en la Shop. No se le otorgan puntos.
    try {
        $skipStmt = $pdo->prepare('INSERT INTO shop_direct_sale_point_awards (direct_sale_id, client_code, points_awarded) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE points_awarded = 0');
        $skipStmt->execute([$saleId, $clientCode]);
    } catch (Throwable $e) {}

    sendJSON([
        'success' => true,
        'data' => [
            'points_awarded' => 0,
            'skipped' => true,
            'reason' => 'Cliente no registrado o inactivo en Shop (puntos limitados solo a usuarios de la Shop)'
        ]
    ]);
}

$itemsResult = supabaseGet(
    $baseUrl . '/rest/v1/direct_sales_items?sale_id=eq.' . rawurlencode($saleId) . '&select=cve_marca,quantity',
    $headers
);
if ($itemsResult['status'] !== 200 || !is_array($itemsResult['json'])) {
    error_log('Direct sale points: item lookup failed for ' . $saleId . ' (HTTP ' . $itemsResult['status'] . ')');
    sendJSON(['error' => 'Unable to verify sale items'], 502);
}

try {
    $pdo->beginTransaction();

    $existingStmt = $pdo->prepare('SELECT points_awarded FROM shop_direct_sale_point_awards WHERE direct_sale_id = ? FOR UPDATE');
    $existingStmt->execute([$saleId]);
    $existing = $existingStmt->fetch();
    if ($existing) {
        $pdo->commit();
        sendJSON(['success' => true, 'data' => ['points_awarded' => (int)$existing['points_awarded'], 'already_awarded' => true]]);
    }

    $configStmt = $pdo->query('SELECT points_per_peso, min_purchase_for_points FROM shop_points_config LIMIT 1');
    $config = $configStmt->fetch();
    $pointsPerPeso = $config ? max(0, (float)$config['points_per_peso']) : 1.0;
    $minimumPurchase = $config ? max(0, (float)$config['min_purchase_for_points']) : 0.0;
    $totalAmount = max(0, (float)($sale['total_amount'] ?? 0));
    $basePoints = (int)floor(($totalAmount * $pointsPerPeso) + 0.000001);

    $bonusPoints = 0;
    try {
        $productPointsStmt = $pdo->prepare('SELECT points_awarded FROM shop_products WHERE sku = ? LIMIT 1');
        foreach ($itemsResult['json'] as $item) {
            $quantity = max(0, (int)($item['quantity'] ?? 0));
            $sku = trim((string)($item['cve_marca'] ?? ''));
            if ($quantity === 0 || $sku === '') continue;
            $productPointsStmt->execute([$sku]);
            $bonusPoints += $quantity * max(0, (int)$productPointsStmt->fetchColumn());
        }
    } catch (PDOException $e) {
        // SKU bonuses are optional; base purchase points must still be awarded.
        error_log('Direct sale points: SKU bonus lookup failed: ' . $e->getMessage());
        $bonusPoints = 0;
    }

    $pointsAwarded = $totalAmount >= $minimumPurchase ? $basePoints + $bonusPoints : 0;
    $awardStmt = $pdo->prepare('INSERT INTO shop_direct_sale_point_awards (direct_sale_id, client_code, points_awarded) VALUES (?, ?, ?)');
    $awardStmt->execute([$saleId, $clientCode, $pointsAwarded]);

    if ($pointsAwarded > 0) {
        $nextTxId = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_points_transactions")->fetchColumn();
        $expiresAt = date('Y-m-d H:i:s', strtotime('+6 months'));
        $reason = "Venta directa ({$basePoints} base + {$bonusPoints} extra SKU)";
        $transactionStmt = $pdo->prepare("INSERT INTO shop_points_transactions (id, client_code, type, points, reason, description, expires_at) VALUES (?, ?, 'earned', ?, ?, ?, ?)");
        $transactionStmt->execute([$nextTxId, $clientCode, $pointsAwarded, $reason, $reason, $expiresAt]);

        $ledger = getClientPointsLedger($pdo, $clientCode);
        $newBalance = (int)($ledger['points_balance'] ?? 0);

        $balanceStmt = $pdo->prepare(
            'INSERT INTO shop_client_points (client_code, points_balance) VALUES (?, ?) ' .
            'ON DUPLICATE KEY UPDATE points_balance = ?, updated_at = NOW()'
        );
        $balanceStmt->execute([$clientCode, $newBalance, $newBalance]);
    }

    $pdo->commit();

    if ($pointsAwarded > 0) {
        try {
            require_once __DIR__ . '/../notifications/push-helper.php';
            $ptsFmt = number_format($pointsAwarded);
            sendShopPushToClient(
                $pdo,
                $clientCode,
                "🏆 ¡Ganaste +{$ptsFmt} puntos!",
                "Se acreditaron {$ptsFmt} puntos en tu cuenta por tu compra directa.",
                '/points'
            );
        } catch (Exception $e) {}
    }

    sendJSON(['success' => true, 'data' => ['points_awarded' => $pointsAwarded, 'base_points' => $basePoints, 'bonus_points' => $bonusPoints]]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    // The unique sale ID makes concurrent/retried requests idempotent.
    if ($e->getCode() === '23000') {
        $existingStmt = $pdo->prepare('SELECT points_awarded FROM shop_direct_sale_point_awards WHERE direct_sale_id = ?');
        $existingStmt->execute([$saleId]);
        $existing = $existingStmt->fetch();
        if ($existing) {
            sendJSON(['success' => true, 'data' => ['points_awarded' => (int)$existing['points_awarded'], 'already_awarded' => true]]);
        }
    }
    error_log('Direct sale points award failed for ' . $saleId . ': ' . $e->getMessage());
    sendJSON(['error' => 'Unable to award points'], 500);
}
?>
