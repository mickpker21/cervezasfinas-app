<?php
// ventas-por-sku-read.php
//
// Devuelve filas de la tabla `ventas_por_sku` filtradas por fecha y zona.
// Respuesta: JSON { rows: [...], count: N }

// ====== CORS ======
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ====== CONFIGURACIÓN BASE DE DATOS ======
include_once 'db_config.php';

try {
    $pdo = getDBConnection();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "error"   => "db_connection_error",
        "message" => $e->getMessage()
    ]);
    exit;
}

// ====== PARÁMETROS GET ======
//
// from      = fecha mínima (YYYY-MM-DD)
// to        = fecha máxima (YYYY-MM-DD)  (si NO hay nextFrom)
// nextFrom  = fecha exclusiva superior (YYYY-MM-DD) cuando filtras por mes
// zona      = filtro de zona (string), opcional
//
$from     = isset($_GET['from']) ? trim($_GET['from']) : null;
$to       = isset($_GET['to']) ? trim($_GET['to']) : null;
$nextFrom = isset($_GET['nextFrom']) ? trim($_GET['nextFrom']) : null;
$zona      = isset($_GET['zona']) ? trim($_GET['zona']) : null;
$cve_cliente = isset($_GET['cve_cliente']) ? trim($_GET['cve_cliente']) : null;
$aggregate = isset($_GET['aggregate']) && $_GET['aggregate'] === 'true';

$validDate = function ($d) {
    if (!$d) return false;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
    [$y, $m, $day] = explode('-', $d);
    return checkdate((int)$m, (int)$day, (int)$y);
};

$where  = [];
$params = [];

// Filtro por rango de fechas (usa period_date, igual que el dashboard)
if ($from && $validDate($from)) {
    $where[]          = "period_date >= :from";
    $params[":from"]  = $from;
}

if ($nextFrom && $validDate($nextFrom)) {
    $where[]             = "period_date < :nextFrom";
    $params[":nextFrom"] = $nextFrom;
} elseif ($to && $validDate($to)) {
    $where[]        = "period_date <= :to";
    $params[":to"]  = $to;
}

// Filtro por zona (opcional)
if ($zona && $zona !== "__ALL__") {
    $where[]        = "zona LIKE :zona";
    $params[":zona"] = "%" . $zona . "%";
}

if ($cve_cliente) {
    $where[] = "cve_cliente = :cve_cliente";
    $params[":cve_cliente"] = $cve_cliente;
}

// Filtro por ruta (opcional)
$ruta = isset($_GET['ruta']) ? trim($_GET['ruta']) : null;
if ($ruta && $ruta !== "__ALL__") {
    $where[] = "ruta = :ruta";
    $params[":ruta"] = $ruta;
}

// ====== SQL ======
if ($aggregate) {
    $sql = "SELECT
                ruta,
                ruta_resuelta,
                cve_cliente,
                client_id,
                SUM(htls) as htls,
                SUM(htls_total) as htls_total,
                SUM(venta) as venta
            FROM ventas_por_sku";
} else {
    $sql = "SELECT
                id,
                period_date,
                ruta,
                cve_cliente,
                client_id,
                num_remision,
                cve_venta,
                cve_marca,
                unidades,
                unidades_obsequio,
                precio_venta_marca,
                descuento,
                sobreprecio_ingreso,
                sobreprecio_abono,
                ieps_venta,
                iva_venta,
                ruta_express,
                fecha_alta,
                sobreprecio_ahorro,
                sobreprecio_np,
                sobreprecio_envase,
                precio_compra_marca,
                ieps_compra,
                iva_compra,
                margen_operacion,
                importe_margen_operacion,
                venta,
                descuento_col,
                sp,
                htls,
                htls_total,
                vta_cajas,
                producto,
                created_at,
                zona,
                updated_at,
                ruta_resuelta,
                zona_u
            FROM ventas_por_sku";
}

if (!empty($where)) {
    $sql .= " WHERE " . implode(" AND ", $where);
}

if ($aggregate) {
    $sql .= " GROUP BY ruta, ruta_resuelta, cve_cliente, client_id";
    $sql .= " ORDER BY ruta";
} else {
    $sql .= " ORDER BY period_date, zona, ruta, cve_cliente";
}

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "rows"  => $rows,
        "count" => count($rows),
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "error"   => "query_error",
        "message" => $e->getMessage()
    ]);
}
