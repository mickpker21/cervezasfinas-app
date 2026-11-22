<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

/**
 * Rutas de catálogo de productos.
 *
 * - GET  /api/products           Lista de productos (activos), opcional ?search=
 * - POST /api/products           Crea/actualiza producto
 * - DELETE /api/products/{id}    Desactiva producto (active = 0)
 *
 * @param string               $method
 * @param string               $path
 * @param array<string,mixed>  $user
 * @param PDO                  $pdo
 * @return bool true si la ruta fue manejada
 */
function um6_route_products(string $method, string $path, array $user, PDO $pdo): bool
{
    // Solo gerente / admin pueden gestionar catálogo
    $managerRoles = ['gerente', 'admin', 'administrador'];

    // GET /api/products
    if ($method === 'GET' && $path === '/api/products') {
        um6_require_role($user, $managerRoles);

        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';

        $sql = 'SELECT id, sku, ';
        // barcode puede no existir si el schema es viejo; lo tratamos defensivamente.
        $sql .= 'IFNULL(barcode, \'\') AS barcode, ';
        $sql .= 'name, category, uom, active, created_at FROM products';

        $params = [];
        if ($search !== '') {
            $sql .= ' WHERE active = 1 AND (LOWER(sku) LIKE ? OR LOWER(name) LIKE ?)';
            $like = '%' . mb_strtolower($search, 'UTF-8') . '%';
            $params[] = $like;
            $params[] = $like;
        } else {
            $sql .= ' WHERE active = 1';
        }

        $sql .= ' ORDER BY name ASC LIMIT 500';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        um6_json_response(200, $rows);
    }

    // POST /api/products
    if ($method === 'POST' && $path === '/api/products') {
        um6_require_role($user, $managerRoles);

        $body = um6_get_json_body();
        if (!is_array($body)) {
            um6_json_error(400, 'Payload inválido');
        }

        $id = isset($body['id']) ? (int) $body['id'] : null;
        $sku = isset($body['sku']) ? strtoupper(trim((string) $body['sku'])) : '';
        $name = isset($body['name']) ? trim((string) $body['name']) : '';
        $barcode = isset($body['barcode']) ? trim((string) $body['barcode']) : '';
        $category = isset($body['category']) ? trim((string) $body['category']) : null;
        $uom = isset($body['uom']) ? trim((string) $body['uom']) : 'caja';
        $active = array_key_exists('active', $body) ? (int) !!$body['active'] : 1;

        if ($sku === '' || $name === '') {
            um6_json_error(400, 'sku y name son requeridos');
        }

        if ($id !== null && $id <= 0) {
            $id = null;
        }

        if ($id !== null) {
            // UPDATE por id
            $sql = 'UPDATE products
                       SET sku = ?,
                           barcode = ?,
                           name = ?,
                           category = ?,
                           uom = ?,
                           active = ?
                     WHERE id = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $sku,
                $barcode !== '' ? $barcode : null,
                $name,
                $category !== '' ? $category : null,
                $uom !== '' ? $uom : 'caja',
                $active,
                $id,
            ]);

            if ($stmt->rowCount() === 0) {
                um6_json_error(404, 'Producto no encontrado');
            }
        } else {
            // INSERT / UPSERT por sku
            $sql = 'INSERT INTO products (sku, barcode, name, category, uom, active)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      barcode = VALUES(barcode),
                      name = VALUES(name),
                      category = VALUES(category),
                      uom = VALUES(uom),
                      active = VALUES(active)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $sku,
                $barcode !== '' ? $barcode : null,
                $name,
                $category !== '' ? $category : null,
                $uom !== '' ? $uom : 'caja',
                $active,
            ]);
        }

        // Recuperar el id final desde la tabla (sku es UNIQUE)
        $stmt = $pdo->prepare('SELECT id, sku, barcode, name, category, uom, active, created_at FROM products WHERE sku = ? LIMIT 1');
        $stmt->execute([$sku]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false) {
            um6_json_error(500, 'Producto guardado pero no se pudo recuperar');
        }

        um6_json_response(200, $row);
    }

    // DELETE /api/products/{id}
    if ($method === 'DELETE' && preg_match('#^/api/products/(\d+)$#', $path, $matches)) {
        um6_require_role($user, $managerRoles);
        $productId = (int) $matches[1];

        $stmt = $pdo->prepare('UPDATE products SET active = 0 WHERE id = ?');
        $stmt->execute([$productId]);

        if ($stmt->rowCount() === 0) {
            um6_json_error(404, 'Producto no encontrado');
        }

        um6_json_response(200, ['message' => 'Producto desactivado']);
    }

    return false;
}

