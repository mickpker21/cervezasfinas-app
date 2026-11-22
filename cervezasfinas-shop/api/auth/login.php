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
    // Buscar usuario y unir con datos reales del cliente (tabla clients)
    // Corregido: La columna en BD es 'colony', no 'colonia'
    $stmt = $pdo->prepare("
        SELECT 
            u.*, 
            c.gec as master_gec,
            c.address, 
            c.phone, 
            c.colony as colonia, 
            c.city, 
            c.business_name, 
            c.name as contact_name
        FROM shop_client_users u
        LEFT JOIN clients c ON u.client_code = c.client_code
        WHERE u.client_code = ? AND u.is_active = 1
    ");
    $stmt->execute([$client_code]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'Invalid credentials'], 401);
    }
    
    // Verificar contraseña
    if (!password_verify($password, $user['password_hash'])) {
        sendJSON(['error' => 'Invalid credentials'], 401);
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
    
    sendJSON([
        'success' => true,
        'token' => $token,
        'user' => $user
    ]);
    
} catch (PDOException $e) {
    sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
}
?>
