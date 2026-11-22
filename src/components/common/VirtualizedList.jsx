import * as ReactWindow from 'react-window';
import { useMemo } from 'react';

/**
 * Componente de lista virtualizada para renderizar grandes conjuntos de datos eficientemente.
 * Solo renderiza los elementos visibles en pantalla, mejorando el rendimiento dramáticamente.
 * 
 * @param {Array} items - Array de elementos a renderizar
 * @param {Function} renderItem - Función que renderiza cada item ({ index, style, data })
 * @param {Number} itemHeight - Altura de cada item en px (default: 80)
 * @param {Number} height - Altura total del contenedor (default: 600)
 * @param {String} className - Clases CSS adicionales
 */
export default function VirtualizedList({
  items = [],
  renderItem,
  itemHeight = 80,
  height = 600,
  className = "",
}) {
  // Memoizar para evitar re-renders innecesarios
  const itemData = useMemo(() => ({ items, renderItem }), [items, renderItem]);

  const Row = ({ index, style, data }) => {
    const item = data.items[index];
    return (
      <div style={style}>
        {data.renderItem({ item, index })}
      </div>
    );
  };

  if (!items || items.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
        No hay elementos para mostrar
      </div>
    );
  }

  const List = ReactWindow.FixedSizeList;

  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      width="100%"
      itemData={itemData}
      className={className}
    >
      {Row}
    </List>
  );
}
