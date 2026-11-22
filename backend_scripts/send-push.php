<?php
/**
 * send-push.php
 * 
 * Envía una notificación push via Firebase Cloud Messaging (FCM) HTTP v1 API.
 * 
 * Requiere:
 *  - Archivo de credenciales de Service Account de Firebase (JSON)
 *    colocado en la misma carpeta que este script como: firebase-service-account.json
 * 
 * Uso (POST):
 *  {
 *    "token": "fcm_device_token_aqui",
 *    "title": "Nuevo Ticket Asignado",
 *    "body": "Se te ha asignado el ticket #123",
 *    "data": { "url": "/admin/helpdesk" }   // opcional
 *  }
 * 
 * También acepta envío por user_id (busca el token en Supabase profiles):
 *  {
 *    "user_id": "uuid-del-usuario",
 *    "title": "...",
 *    "body": "...",
 *    "data": {}
 *  }
 */

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Only POST allowed"]);
    exit;
}

// ====== CONFIG ======
$SERVICE_ACCOUNT_FILE = __DIR__ . '/firebase-service-account.json';
$FCM_PROJECT_ID = 'cervezas-finas'; // Tu project_id de Firebase

// ====== LEER BODY ======
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON body"]);
    exit;
}

$token = $input['token'] ?? null;
$userId = $input['user_id'] ?? null;
$broadcast = $input['broadcast'] ?? false;
$title = $input['title'] ?? 'Notificación';
$body = $input['body'] ?? '';
$data = $input['data'] ?? [];

// Lista de tokens a los que enviaremos
$targetTokens = [];

if ($broadcast) {
    // Obtener tokens de la base de datos (con múltiples filtros posibles)
    $role = $input['role'] ?? null;
    $jobTitle = $input['job_title'] ?? null;
    $department = $input['department'] ?? null;
    
    $targetTokens = getAllTokensFromSupabase($role, $jobTitle, $department);
    if (empty($targetTokens)) {
        echo json_encode(["error" => "No registered tokens found for this audience"]);
        exit;
    }
} elseif ($token) {
    $targetTokens[] = $token;
} elseif ($userId) {
    $foundToken = getTokenFromSupabase($userId);
    if ($foundToken) {
        $targetTokens[] = $foundToken;
    } else {
        echo json_encode(["error" => "No FCM token found for user", "user_id" => $userId]);
        exit;
    }
}

if (empty($targetTokens)) {
    http_response_code(400);
    echo json_encode(["error" => "Missing 'token', 'user_id' or 'broadcast'"]);
    exit;
}

// ====== OBTENER ACCESS TOKEN DE GOOGLE ======
$accessToken = getGoogleAccessToken($SERVICE_ACCOUNT_FILE);
if (!$accessToken) {
    http_response_code(500);
    echo json_encode(["error" => "Could not obtain Google access token"]);
    exit;
}

// ====== ENVIAR NOTIFICACIONES VIA FCM v1 ======
$results = [];
foreach ($targetTokens as $currentToken) {
    $url = "https://fcm.googleapis.com/v1/projects/{$FCM_PROJECT_ID}/messages:send";

    // Convertir data values a strings
    $dataStrings = [];
    foreach ($data as $k => $v) {
        $dataStrings[$k] = is_string($v) ? $v : json_encode($v);
    }

    $message = [
        "message" => [
            "token" => $currentToken,
            "notification" => [
                "title" => $title,
                "body" => $body
            ],
            "data" => (object) $dataStrings,
            "android" => [
                "priority" => "high",
                "notification" => [
                    "sound" => "default",
                    "channel_id" => "default"
                ]
            ]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer " . $accessToken,
        "Content-Type: application/json"
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($message));
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $results[] = [
        "token" => $currentToken,
        "http_code" => $httpCode,
        "response" => json_decode($response, true)
    ];
}

echo json_encode(["success" => true, "results" => $results]);
exit; 

// ====== FUNCIONES AUXILIARES ======

/**
 * Genera un OAuth2 access token usando el Service Account de Firebase.
 * Implementa JWT manualmente sin librerías externas.
 */
function getGoogleAccessToken($serviceAccountFile) {
    if (!file_exists($serviceAccountFile)) {
        error_log("[send-push] Service account file not found: " . $serviceAccountFile);
        return null;
    }

    $sa = json_decode(file_get_contents($serviceAccountFile), true);
    if (!$sa || !isset($sa['private_key']) || !isset($sa['client_email'])) {
        error_log("[send-push] Invalid service account file");
        return null;
    }

    $now = time();
    $header = base64url_encode(json_encode(["alg" => "RS256", "typ" => "JWT"]));
    $payload = base64url_encode(json_encode([
        "iss" => $sa['client_email'],
        "scope" => "https://www.googleapis.com/auth/firebase.messaging",
        "aud" => "https://oauth2.googleapis.com/token",
        "iat" => $now,
        "exp" => $now + 3600
    ]));

    $toSign = "$header.$payload";
    $signature = '';
    openssl_sign($toSign, $signature, $sa['private_key'], OPENSSL_ALGO_SHA256);
    $jwt = $toSign . "." . base64url_encode($signature);

    // Exchange JWT for access token
    $ch = curl_init("https://oauth2.googleapis.com/token");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        "grant_type" => "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion" => $jwt
    ]));
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $tokenResponse = curl_exec($ch);
    curl_close($ch);

    $tokenData = json_decode($tokenResponse, true);
    return $tokenData['access_token'] ?? null;
}

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/**
 * Busca el FCM token de un usuario en Supabase.
 */
function getTokenFromSupabase($userId) {
    // Usar variables de entorno o archivo de config para Supabase
    $supabaseUrl = getenv('SUPABASE_URL') ?: 'https://eskqnlzcswxszlicjppe.supabase.co';
    $supabaseKey = getenv('SUPABASE_SERVICE_KEY') ?: '';
    
    if (!$supabaseKey) {
        // Intentar leer de archivo local
        $configFile = __DIR__ . '/supabase_config.php';
        if (file_exists($configFile)) {
            include $configFile;
            $supabaseKey = $SUPABASE_SERVICE_KEY ?? '';
        }
    }

    if (!$supabaseKey) {
        error_log("[send-push] No Supabase service key configured");
        return null;
    }

    $url = $supabaseUrl . "/rest/v1/profiles?id=eq." . urlencode($userId) . "&select=fcm_token";
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "apikey: " . $supabaseKey,
        "Authorization: Bearer " . $supabaseKey
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($response, true);
    return $data[0]['fcm_token'] ?? null;
}

/**
 * Busca tokens registrados en Supabase filtrando por Rol, Puesto o Departamento.
 */
function getAllTokensFromSupabase($role = null, $jobTitle = null, $department = null) {
    $supabaseUrl = getenv('SUPABASE_URL') ?: 'https://eskqnlzcswxszlicjppe.supabase.co';
    $supabaseKey = getenv('SUPABASE_SERVICE_KEY') ?: '';
    
    if (!$supabaseKey) {
        $configFile = __DIR__ . '/supabase_config.php';
        if (file_exists($configFile)) {
            include $configFile;
            $supabaseKey = $SUPABASE_SERVICE_KEY ?? '';
        }
    }

    if (!$supabaseKey) return [];

    // Base de la consulta: solo usuarios con token
    $url = $supabaseUrl . "/rest/v1/profiles?select=fcm_token&fcm_token=not.is.null";
    
    // Filtro por ROL (incluyendo sinónimos)
    if ($role && $role !== 'all') {
        $roleMap = [
            'installer' => ['installer', 'instalador', 'jefe-operaciones', 'jefe operaciones', 'jefeoperaciones'],
            'rh'        => ['rh', 'hr', 'rrhh'],
            'warehouse' => ['warehouse', 'almacen', 'almacenista'],
            'conquista' => ['conquista', 'coorcon', 'coordinador conquista'],
            'asesor-dinamico' => ['asesor-dinamico', 'asesor_dinamico', 'preventa'],
            'autoventa' => ['autoventa', 'chofer'],
            'jefe-um6'  => ['jefe-um6', 'jefeum6', 'jefe um6']
        ];
        if (isset($roleMap[$role])) {
            $rolesList = implode(',', $roleMap[$role]);
            $url .= "&role=in.(" . urlencode($rolesList) . ")";
        } else {
            $url .= "&role=eq." . urlencode($role);
        }
    }

    // Filtro por PUESTO (Búsqueda parcial/ilike)
    if ($jobTitle && $jobTitle !== '') {
        $url .= "&job_title=ilike.*" . urlencode($jobTitle) . "*";
    }

    // Filtro por DEPARTAMENTO (Exacto)
    if ($department && $department !== '') {
        $url .= "&department=eq." . urlencode($department);
    }
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "apikey: " . $supabaseKey,
        "Authorization: Bearer " . $supabaseKey
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($response, true);
    if (!is_array($data)) return [];

    $tokens = [];
    foreach ($data as $row) {
        if (!empty($row['fcm_token'])) {
            $tokens[] = $row['fcm_token'];
        }
    }
    return array_unique($tokens);
}

