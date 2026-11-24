<?php
require_once '../common.php';

handleCORS();

// Permitir roles de staff
requireSupabaseRole(['admin', 'televenta', 'supervisor', 'autoventa', 'preventa', 'chofer', 'operaciones', 'jefe de operaciones', 'sistemas']);

$pdo = getDB();

$clientCode = trim($_GET['client_code'] ?? '');
if ($clientCode === '') {
    sendJSON(['error' => 'client_code is required'], 400);
}

try {
    // 1. Obtener datos del cliente usando SELECT * para evitar fallos si alguna columna opcional no existe
    $client = null;
    try {
        $cliStmt = $pdo->prepare("SELECT * FROM clients WHERE client_code = ? LIMIT 1");
        $cliStmt->execute([$clientCode]);
        $row = $cliStmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $client = [
                'client_code' => $row['client_code'] ?? $clientCode,
                'client_name' => $row['business_name'] ?? ($row['name'] ?? $clientCode),
                'phone' => $row['phone'] ?? ($row['telefono'] ?? ''),
                'client_active' => isset($row['is_active']) ? (int)$row['is_active'] : 1
            ];
        }
    } catch (Exception $e) {}

    // 2. Verificar si el cliente está REGISTRADO, ACTIVO y con PUNTOS HABILITADOS en la Shop (shop_client_users)
    $userRow = null;
    try {
        $userStmt = $pdo->prepare("
            SELECT id, is_active, COALESCE(points_enabled, 1) AS points_enabled, phone
            FROM shop_client_users
            WHERE client_code = ?
            ORDER BY is_active DESC, id DESC
            LIMIT 1
        ");
        $userStmt->execute([$clientCode]);
        $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        try {
            $userStmt = $pdo->prepare("
                SELECT id, is_active, phone
                FROM shop_client_users
                WHERE client_code = ?
                ORDER BY is_active DESC, id DESC
                LIMIT 1
            ");
            $userStmt->execute([$clientCode]);
            $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
        } catch (Exception $e2) {}
    }

    // REGLA DE NEGOCIO: Solo los clientes activos en shop_client_users CON points_enabled = 1 acumulan y muestran puntos
    $pointsEnabled = !isset($userRow['points_enabled']) || (int)$userRow['points_enabled'] === 1;
    $isRegisteredInShop = ($userRow && isset($userRow['is_active']) && (int)$userRow['is_active'] === 1 && $pointsEnabled);

    // 3. Obtener saldo de puntos (solo si está registrado en la Shop)
    $balance = 0;
    $updatedAt = null;
    if ($isRegisteredInShop) {
        try {
            $ptsStmt = $pdo->prepare("
                SELECT points_balance, updated_at
                FROM shop_client_points
                WHERE client_code = ?
                ORDER BY points_balance DESC, id DESC
                LIMIT 1
            ");
            $ptsStmt->execute([$clientCode]);
            $pointsRow = $ptsStmt->fetch(PDO::FETCH_ASSOC);
            if ($pointsRow) {
                $balance = (int)$pointsRow['points_balance'];
                $updatedAt = $pointsRow['updated_at'] ?? null;
            }
        } catch (Exception $e) {}

        if ($balance <= 0) {
            try {
                $txStmt = $pdo->prepare("
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN type IN ('redeemed', 'expired') THEN points ELSE 0 END), 0) AS calc_balance
                    FROM shop_points_transactions
                    WHERE client_code = ?
                ");
                $txStmt->execute([$clientCode]);
                $calcBal = (int)$txStmt->fetchColumn();
                if ($calcBal > $balance) {
                    $balance = $calcBal;
                }
            } catch (Exception $e) {}
        }
    }

    $resolvedPhone = $client['phone'] ?? '';
    if ($resolvedPhone === '' && !empty($userRow['phone'])) {
        $resolvedPhone = $userRow['phone'];
    }

    // 4. Obtener últimos movimientos de puntos
    $recentTransactions = [];
    if ($isRegisteredInShop) {
        try {
            $txStmt = $pdo->prepare("
                SELECT type, points, reason, created_at
                FROM shop_points_transactions
                WHERE client_code = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 5
            ");
            $txStmt->execute([$clientCode]);
            $recentTransactions = $txStmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}
    }

    sendJSON([
        'success' => true,
        'client_code' => $clientCode,
        'client_name' => $client ? $client['client_name'] : $clientCode,
        'phone' => $resolvedPhone,
        'is_active' => $isRegisteredInShop,
        'is_registered_in_shop' => $isRegisteredInShop,
        'accumulates_points' => $isRegisteredInShop,
        'points_balance' => $balance,
        'updated_at' => $updatedAt,
        'recent_transactions' => $recentTransactions
    ]);

} catch (PDOException $e) {
    sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
}
?>