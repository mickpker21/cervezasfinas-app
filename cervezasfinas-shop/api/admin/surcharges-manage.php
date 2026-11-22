<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

$method = $_SERVER['REQUEST_METHOD'];

// Helper to check/create table if not exists (support both prefixed and NOT prefixed to be safe)
// We will try to write to 'shop_surcharges_config' first as per other admin files, 
// but also 'surcharges_config' if the first fails or to keep sync.
function updateSurcharges($pdo, $returnable, $disposable) {
    // Try shop_ prefix first (Standard for this app)
    $tableName = 'shop_surcharges_config';
    
    try {
        // Upsert logic for MySQL: INSERT ... ON DUPLICATE KEY UPDATE
        // Assuming table has id=1 or single row usage.
        // First check if table exists or just try insert.
        $sql = "INSERT INTO $tableName (id, returnable_amount, disposable_amount) VALUES (1, ?, ?) 
                ON DUPLICATE KEY UPDATE returnable_amount = VALUES(returnable_amount), disposable_amount = VALUES(disposable_amount)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$returnable, $disposable]);
        return true;
    } catch (Exception $e) {
        // If specific table fails, maybe try without prefix (as per initial schema.sql)
        $tableName = 'surcharges_config';
        try {
            $sql = "INSERT INTO $tableName (id, returnable_amount, disposable_amount) VALUES (1, ?, ?) 
                    ON DUPLICATE KEY UPDATE returnable_amount = VALUES(returnable_amount), disposable_amount = VALUES(disposable_amount)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$returnable, $disposable]);
            return true;
        } catch (Exception $e2) {
            throw $e2;
        }
    }
}

if ($method === 'GET') {
    try {
        // Try getting data
        $data = null;
        try {
            $stmt = $pdo->query("SELECT * FROM shop_surcharges_config LIMIT 1");
            $data = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}
        
        if (!$data) {
             try {
                $stmt = $pdo->query("SELECT * FROM surcharges_config LIMIT 1");
                $data = $stmt->fetch(PDO::FETCH_ASSOC);
            } catch (Exception $e) {}
        }

        // Return default if empty
        if (!$data) {
            $data = ['returnable_amount' => 0, 'disposable_amount' => 0];
        } else {
             // Ensure numbers
             $data['returnable_amount'] = floatval($data['returnable_amount']);
             $data['disposable_amount'] = floatval($data['disposable_amount']);
        }

        // Return as array of 1 item to match generic frontend expectation if needed, or just object.
        // Admin frontend expected array for consistency in `loadData`: `setData(res.data || [])`
        // But renderSurcharges uses `data[0]`. So we wrap in array.
        sendJSON(['success' => true, 'data' => [$data]]);

    } catch (Exception $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        $returnable = $data['returnable_amount'] ?? 0;
        $disposable = $data['disposable_amount'] ?? 0;

        updateSurcharges($pdo, $returnable, $disposable);

        sendJSON(['success' => true, 'message' => 'Surcharges updated']);
    } catch (Exception $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>
