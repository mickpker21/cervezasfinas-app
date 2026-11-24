<?php
require_once '../common.php';

handleCORS();
requireSupabaseRole(['admin', 'operaciones', 'jefe de operaciones', 'televenta', 'supervisor']);
$pdo = getDB();

try {
    $pdo->exec("ALTER TABLE shop_client_users ADD COLUMN phone VARCHAR(30) NULL");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE shop_client_users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE shop_client_users ADD COLUMN points_enabled TINYINT(1) NOT NULL DEFAULT 1");
} catch (Exception $e) {}
try {
    $pdo->exec("ALTER TABLE clients ADD COLUMN name VARCHAR(255) NULL");
} catch (Exception $e) {}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $sql = "SELECT u.id, u.client_code, c.gec, COALESCE(NULLIF(u.phone, ''), c.phone) AS phone, c.business_name, c.business_name AS contact_name, u.is_active, COALESCE(u.points_enabled, 1) AS points_enabled, COALESCE(u.must_change_password, 1) AS must_change_password, u.created_at, u.last_login 
                FROM shop_client_users u
                LEFT JOIN (
                    SELECT client_code,
                           MAX(gec) AS gec,
                           MAX(phone) AS phone,
                           MAX(business_name) AS business_name
                    FROM clients
                    GROUP BY client_code
                ) c ON u.client_code = c.client_code
                ORDER BY u.client_code ASC";
        $stmt = $pdo->query($sql);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        sendJSON(['success' => true, 'data' => $users]);
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        if (isset($data['id']) || !empty($data['client_code']) && !isset($data['password'])) {
            $id = isset($data['id']) ? (int)$data['id'] : 0;
            $client_code = trim((string)($data['client_code'] ?? ''));

            // Si el ID viene en 0 o vacío, resolverlo buscando por client_code
            if ($id <= 0 && $client_code !== '') {
                $lookup = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ? LIMIT 1");
                $lookup->execute([$client_code]);
                $id = (int)$lookup->fetchColumn();
            }

            $phone = isset($data['phone']) ? trim((string)$data['phone']) : null;
            $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;

            // Si el cliente aún no tiene fila en shop_client_users pero sí tiene client_code y phone, actualizar tabla clients y shop_client_users por client_code
            if ($id <= 0 && $client_code !== '' && $phone !== null) {
                try {
                    $stmtClientPh = $pdo->prepare("UPDATE clients SET phone = ? WHERE client_code = ?");
                    $stmtClientPh->execute([$phone, $client_code]);
                } catch (Exception $e) {}
                try {
                    $stmtShopPh = $pdo->prepare("UPDATE shop_client_users SET phone = ? WHERE client_code = ?");
                    $stmtShopPh->execute([$phone, $client_code]);
                } catch (Exception $e) {}
                sendJSON(['success' => true, 'message' => 'Client phone updated']);
            }

            if ($id <= 0) {
                sendJSON(['error' => 'No se encontró el ID del cliente para actualizar'], 400);
            }

            $pointsEnabled = isset($data['points_enabled']) ? ((int)$data['points_enabled'] === 1 ? 1 : 0) : 1;

            // Update
            $sql = "UPDATE shop_client_users SET is_active = ?, points_enabled = ? WHERE id = ?";
            $params = [$isActive, $pointsEnabled, $id];
            
            // Password reset if provided (marca que debe cambiarla al entrar)
            if (!empty($data['password'])) {
                $sql = "UPDATE shop_client_users SET is_active = ?, points_enabled = ?, password_hash = ?, must_change_password = 1 WHERE id = ?";
                $params = [$isActive, $pointsEnabled, password_hash($data['password'], PASSWORD_DEFAULT), $id];
            }
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if ($phone !== null) {
                $stmtPh = $pdo->prepare("UPDATE shop_client_users SET phone = ? WHERE id = ?");
                $stmtPh->execute([$phone, $id]);
                if (!empty($client_code)) {
                    try {
                        $stmtClientPh = $pdo->prepare("UPDATE clients SET phone = ? WHERE client_code = ?");
                        $stmtClientPh->execute([$phone, $client_code]);
                    } catch (Exception $e) {}
                }
            }

            sendJSON(['success' => true, 'message' => 'Client updated']);
        } else {
            // Create
            $client_code = trim((string)($data['client_code'] ?? ''));
            $password = (string)($data['password'] ?? '');

            if ($client_code === '' || $password === '') {
                sendJSON(['error' => 'Código de cliente y contraseña son requeridos'], 400);
            }

            // Check existence
            $check = $pdo->prepare("SELECT id FROM shop_client_users WHERE client_code = ?");
            $check->execute([$client_code]);
            if ($check->fetch()) {
                sendJSON(['error' => 'El código de cliente ya existe en la Shop'], 400);
            }

            $phone = isset($data['phone']) ? trim((string)$data['phone']) : null;
            $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;
            $pointsEnabled = isset($data['points_enabled']) ? ((int)$data['points_enabled'] === 1 ? 1 : 0) : 1;

            $sql = "INSERT INTO shop_client_users (client_code, password_hash, phone, is_active, points_enabled, must_change_password) VALUES (?, ?, ?, ?, ?, 1)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $client_code,
                password_hash($password, PASSWORD_DEFAULT),
                $phone,
                $isActive,
                $pointsEnabled
            ]);

            $newId = (int)$pdo->lastInsertId();
            // Salvaguarda: si MySQL asignó 0, asignar inmediatamente el siguiente ID disponible
            if ($newId <= 0) {
                $maxId = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) + 1 FROM shop_client_users WHERE client_code != " . $pdo->quote($client_code))->fetchColumn();
                if ($maxId <= 0) $maxId = 1;
                $pdo->prepare("UPDATE shop_client_users SET id = ? WHERE client_code = ? AND (id <= 0 OR id IS NULL)")->execute([$maxId, $client_code]);
            }

            if ($phone !== null && $phone !== '') {
                try {
                    $stmtClientPh = $pdo->prepare("UPDATE clients SET phone = ? WHERE client_code = ?");
                    $stmtClientPh->execute([$phone, $client_code]);
                } catch (Exception $e) {}
            }

            sendJSON(['success' => true, 'message' => 'Client created']);
        }
    } catch (PDOException $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}
?>
