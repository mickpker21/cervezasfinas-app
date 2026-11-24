<?php
require_once '../common.php';

handleCORS();

$pdo = getDB();

// Solo POST permitido
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Obtener datos del body
$input = json_decode(file_get_contents('php://input'), true);
$client_code = $input['client_code'] ?? '';
$password = $input['password'] ?? '';

if (empty($client_code) || empty($password)) {
    sendJSON(['error' => 'client_code and password are required'], 400);
}

try {
    // 1. Buscar usuario en shop_client_users
    $stmt = $pdo->prepare("
        SELECT *
        FROM shop_client_users
        WHERE client_code = ? AND is_active = 1
        LIMIT 1
    ");
    $stmt->execute([$client_code]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        sendJSON(['error' => 'Invalid credentials'], 401);
    }
    
    // Verificar contraseña
    if (!password_verify($password, $user['password_hash'])) {
        sendJSON(['error' => 'Invalid credentials'], 401);
    }

    // 2. Unir de forma segura con datos reales del cliente (tabla clients) usando SELECT * para evitar fallos si alguna columna opcional no existe
    try {
        $cliStmt = $pdo->prepare("SELECT * FROM clients WHERE client_code = ? LIMIT 1");
        $cliStmt->execute([$client_code]);
        $clientRow = $cliStmt->fetch(PDO::FETCH_ASSOC);
        if ($clientRow) {
            $user['master_gec'] = $clientRow['gec'] ?? null;
            $user['address'] = $clientRow['address'] ?? ($clientRow['direccion'] ?? null);
            $user['master_phone'] = $clientRow['phone'] ?? ($clientRow['telefono'] ?? null);
            $user['colonia'] = $clientRow['colony'] ?? ($clientRow['colonia'] ?? null);
            $user['city'] = $clientRow['city'] ?? ($clientRow['ciudad'] ?? ($clientRow['municipio'] ?? null));
            $user['business_name'] = $clientRow['business_name'] ?? ($clientRow['name'] ?? null);
            $user['contact_name'] = $clientRow['name'] ?? ($clientRow['contact_name'] ?? ($clientRow['business_name'] ?? null));
            $user['zona_comercial'] = $clientRow['zona_comercial'] ?? null;
            $user['sales_route'] = $clientRow['sales_route'] ?? null;
        }
    } catch (Exception $e) {
        // Ignorar si la tabla clients tiene diferencias de esquema
    }
    
    // Actualizar last_login
    $updateStmt = $pdo->prepare("UPDATE shop_client_users SET last_login = NOW() WHERE id = ?");
    $updateStmt->execute([$user['id']]);
    
    // Generar token JWT
    $token = generateJWT($client_code);
    
    // Retornar datos del usuario (sin password_hash)
    unset($user['password_hash']);
    if (isset($user['master_gec'])) {
        $user['gec'] = $user['master_gec'];
    }
    if (empty($user['phone']) && !empty($user['master_phone'])) {
        $user['phone'] = $user['master_phone'];
    }
    
    // Bandera de cambio obligatorio de contraseña en primer acceso
    $mustChange = isset($user['must_change_password']) ? ((int)$user['must_change_password'] === 1) : false;
    $user['must_change_password'] = $mustChange ? 1 : 0;
    $user['points_enabled'] = isset($user['points_enabled']) ? ((int)$user['points_enabled'] === 1 ? 1 : 0) : 1;
    
    sendJSON([
        'success' => true,
        'token' => $token,
        'must_change_password' => $mustChange,
        'user' => $user
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
}
?>
