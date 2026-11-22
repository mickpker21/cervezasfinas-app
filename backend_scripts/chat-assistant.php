<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

include_once 'db_config.php';

// Obtener datos del payload JSON
$json = file_get_contents('php://input');
$data = json_decode($json, true);

$userMsg  = $data['message']   ?? '';
$role     = strtolower($data['role'] ?? 'usuario');
$userName = $data['user_name'] ?? 'Usuario';

if (empty($userMsg)) {
    echo json_encode(["success" => false, "message" => "El mensaje está vacío."]);
    exit();
}

// Verifica si la API Key está definida en db_config.php
if (!defined('GEMINI_API_KEY') || empty(GEMINI_API_KEY)) {
    echo json_encode([
        "success" => true,
        "reply"   => "**¡Hola! Soy Sofía.**\n\nPara que pueda ayudarte a responder preguntas inteligentemente, el Administrador del sistema necesita configurar mi conexión.\n\n**Instrucciones para el Admin:**\n1. Entra a [Google AI Studio](https://aistudio.google.com/app/apikey) y crea una API Key gratuita.\n2. Abre el archivo `db_config.php` en el servidor.\n3. Añade esta línea: `define('GEMINI_API_KEY', 'TU_CLAVE_AQUI');`\n4. ¡Listo! Podré empezar a responder."
    ]);
    exit();
}

// ---------------------------------------------------------
// 1. CONSTRUIR EL CONTEXTO (SYSTEM PROMPT) SEGÚN EL ROL
// ---------------------------------------------------------
$systemPrompt  = "Eres 'Sofía', la asistente virtual experta e integrada dentro del CRM de 'Cervezas Finas'.\n";
$systemPrompt .= "Estás hablando con $userName, cuyo rol en el sistema es: **$role**.\n";
$systemPrompt .= "REGLAS ESTRICTAS:\n";
$systemPrompt .= "- Responde SIEMPRE de forma amable, profesional, moderna y usando formato Markdown (negritas, listas, emojis).\n";
$systemPrompt .= "- Sé muy conciso y directo al punto. No des respuestas exageradamente largas.\n";
$systemPrompt .= "- Tu conocimiento debe limitarse estrictamente a lo que un '$role' puede hacer en la plataforma.\n";

if (strpos($role, 'admin') !== false) {
    $systemPrompt .= "- Eres Administrador. Puedes hablar de todo: configuraciones del sistema, inventarios, KPIs de todos, mapas de calor, y eliminar/crear usuarios.\n";
} elseif (strpos($role, 'supervisor') !== false) {
    $systemPrompt .= "- Eres Supervisor. Tus funciones son: Ver Dashboard, Ver Scorecards de Marcas, Evaluar puntos de venta, Monitorear rutas y asesores. NO puedes eliminar usuarios ni cambiar configuraciones globales.\n";
} elseif (strpos($role, 'televenta') !== false) {
    $systemPrompt .= "- Eres Televenta. Tus funciones son: Dashboard de Televentas, Alta de Clientes Nuevos, Panel de Tercerizados y Redenciones. NO puedes ver datos de Recursos Humanos ni Configuraciones Globales.\n";
} elseif (strpos($role, 'instalador') !== false) {
    $systemPrompt .= "- Eres Instalador. Tus funciones son: Ver Órdenes de Trabajo, Subir Evidencias Fotográficas de instalación de equipos (enfriadores), y escanear Códigos QR/Barras de activos. NO puedes ver ventas ni indicadores financieros.\n";
} else {
    $systemPrompt .= "- Como usuario estándar, solo ayúdalo con navegación básica o explícale que contacte a un administrador para más permisos.\n";
}

// ---------------------------------------------------------
// 2. PAYLOAD COMPARTIDO
// ---------------------------------------------------------
$payload = [
    "system_instruction" => [
        "parts" => [["text" => $systemPrompt]]
    ],
    "contents" => [
        ["parts" => [["text" => $userMsg]]]
    ],
    "generationConfig" => [
        "temperature"     => 0.4,
        "maxOutputTokens" => 800
    ]
];

// ---------------------------------------------------------
// 3. LLAMADA CON FALLBACK AUTOMÁTICO ENTRE MODELOS
// Prueba cada modelo; si falla con 429/404, pasa al siguiente
// ---------------------------------------------------------
$models = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
];

$httpCode  = 0;
$response  = '';
$lastError = '';
$modelUsed = '';

foreach ($models as $model) {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
         . $model . ':generateContent?key=' . GEMINI_API_KEY;

    for ($attempt = 1; $attempt <= 2; $attempt++) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 25);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200) {
            $modelUsed = $model;
            break 2; // Éxito — salir de ambos loops
        }

        // Capturar el mensaje de error real de Gemini para diagnóstico
        $errData   = json_decode($response, true);
        $lastError = $errData['error']['message'] ?? "HTTP $httpCode sin detalle";

        // Solo reintentar si es 429; para otros errores pasar al siguiente modelo
        if ($httpCode !== 429) break;
        if ($attempt < 2) sleep(2);
    }

    if ($httpCode === 200) break;
}

// ---------------------------------------------------------
// 4. MANEJO DE RESPUESTA FINAL
// ---------------------------------------------------------
if ($httpCode !== 200) {
    if ($httpCode === 429) {
        $friendlyMsg = "Sofía está muy ocupada en este momento 🙏. Por favor espera unos segundos e inténtalo de nuevo.";
    } elseif ($httpCode === 403) {
        $friendlyMsg = "La API Key no tiene permisos para los modelos disponibles. Contacta al administrador.";
    } elseif ($httpCode === 400) {
        $friendlyMsg = "Hubo un problema con la solicitud a la IA. Intenta de nuevo.";
    } else {
        $friendlyMsg = "No pude conectarme con la IA en este momento. Por favor intenta de nuevo.";
    }

    echo json_encode([
        "success" => false,
        "message" => $friendlyMsg,
        "_debug"  => "Último código: $httpCode | Error Gemini: $lastError | Modelos probados: " . implode(' → ', $models)
    ]);
    exit();
}

$responseData = json_decode($response, true);
$aiReply      = $responseData['candidates'][0]['content']['parts'][0]['text']
    ?? 'Lo siento, no pude generar una respuesta. Intenta de nuevo.';

echo json_encode([
    "success" => true,
    "reply"   => $aiReply
]);
?>
