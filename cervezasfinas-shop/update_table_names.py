# Script para actualizar nombres de tablas en APIs PHP
# Agrega prefijo shop_ a todas las tablas

import os
import re

# Directorio de APIs
api_dir = r"c:\Users\Usuario\OneDrive\Documentos\CERVEZASFINAS\cervezasfinas-shop\api"

# Mapeo de nombres de tablas
table_mapping = {
    'client_users': 'shop_client_users',
    'products': 'shop_products',
    'promotions': 'shop_promotions',
    'gec_discounts': 'shop_gec_discounts',
    'special_prices': 'shop_special_prices',
    'orders': 'shop_orders',
    'order_items': 'shop_order_items',
    'client_points': 'shop_client_points',
    'points_config': 'shop_points_config',
    'points_transactions': 'shop_points_transactions',
    'cooler_executions': 'shop_cooler_executions',
    'cooler_reference_photos': 'shop_cooler_reference_photos',
    'point_redemption_products': 'shop_point_redemption_products',
    'point_redemptions': 'shop_point_redemptions',
    'televenta_contacts': 'shop_televenta_contacts'
}

def replace_table_names(content):
    """Reemplaza nombres de tablas en el contenido SQL"""
    for old_name, new_name in table_mapping.items():
        # Patrones comunes en SQL
        patterns = [
            (rf'\bFROM\s+{old_name}\b', f'FROM {new_name}'),
            (rf'\bINTO\s+{old_name}\b', f'INTO {new_name}'),
            (rf'\bJOIN\s+{old_name}\b', f'JOIN {new_name}'),
            (rf'\bUPDATE\s+{old_name}\b', f'UPDATE {new_name}'),
            (rf'\bTABLE\s+{old_name}\b', f'TABLE {new_name}'),
            (rf'\bEXISTS\s+{old_name}\b', f'EXISTS {new_name}'),
        ]
        
        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    
    return content

def process_php_file(filepath):
    """Procesa un archivo PHP"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Reemplazar nombres de tablas
        new_content = replace_table_names(content)
        
        # Guardar si hubo cambios
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"✓ Actualizado: {filepath}")
            return True
        else:
            print(f"- Sin cambios: {filepath}")
            return False
    except Exception as e:
        print(f"✗ Error en {filepath}: {e}")
        return False

def main():
    """Procesa todos los archivos PHP en el directorio de APIs"""
    updated_count = 0
    
    for root, dirs, files in os.walk(api_dir):
        for file in files:
            if file.endswith('.php'):
                filepath = os.path.join(root, file)
                if process_php_file(filepath):
                    updated_count += 1
    
    print(f"\n{'='*50}")
    print(f"Total de archivos actualizados: {updated_count}")
    print(f"{'='*50}")

if __name__ == '__main__':
    main()
