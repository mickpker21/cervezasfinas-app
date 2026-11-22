<?php
require_once '../common.php';

handleCORS();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Check for file upload
if (!isset($_FILES['csv']) || $_FILES['csv']['error'] !== UPLOAD_ERR_OK) {
    sendJSON(['error' => 'CSV file required'], 400);
}

$file = $_FILES['csv']['tmp_name'];
$handle = fopen($file, 'r');

if (!$handle) {
    sendJSON(['error' => 'Could not read CSV file'], 500);
}

// Read header
$header = fgetcsv($handle);
// Expected columns: client_code, password, (optional) is_active
$colIndices = array_flip(array_map('trim', $header));

$stats = [
    'created' => 0,
    'updated' => 0,
    'errors' => 0,
    'details' => []
];

try {
    $pdo->beginTransaction();

    while (($row = fgetcsv($handle)) !== false) {
        $client_code = trim($row[$colIndices['client_code']] ?? $row[0] ?? '');
        $password = trim($row[$colIndices['password']] ?? $row[1] ?? '');
        $is_active = trim($row[$colIndices['is_active']] ?? $row[2] ?? 1);

        if (empty($client_code)) continue;

        try {
            // Check if user exists
            $stmt = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ?");
            $stmt->execute([$client_code]);
            $user = $stmt->fetch();

            if ($user) {
                // Update
                if (!empty($password)) {
                    $sql = "UPDATE shop_client_users SET password_hash = ?, is_active = ? WHERE id = ?";
                    $stmtUpdate = $pdo->prepare($sql);
                    $stmtUpdate->execute([password_hash($password, PASSWORD_DEFAULT), $is_active, $user['id']]);
                } else {
                    $sql = "UPDATE shop_client_users SET is_active = ? WHERE id = ?";
                    $stmtUpdate = $pdo->prepare($sql);
                    $stmtUpdate->execute([$is_active, $user['id']]);
                }
                $stats['updated']++;
            } else {
                // Create
                if (empty($password)) {
                    throw new Exception("Password required for new client: $client_code");
                }
                $sql = "INSERT INTO shop_client_users (client_code, password_hash, is_active) VALUES (?, ?, ?)";
                $stmtInsert = $pdo->prepare($sql);
                $stmtInsert->execute([$client_code, password_hash($password, PASSWORD_DEFAULT), $is_active]);
                $stats['created']++;
            }
        } catch (Exception $e) {
            $stats['errors']++;
            $stats['details'][] = "Error for $client_code: " . $e->getMessage();
        }
    }

    $pdo->commit();
    fclose($handle);

    sendJSON([
        'success' => true,
        'message' => 'Bulk upload completed',
        'stats' => $stats
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($handle) fclose($handle);
    sendJSON(['error' => $e->getMessage()], 500);
}
?>
