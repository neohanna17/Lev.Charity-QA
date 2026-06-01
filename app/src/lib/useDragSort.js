import { useState } from 'react';

// Move an item within an array, returning a new array.
export function moveItem(arr, from, to) {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Native HTML5 drag-to-reorder, no external dependency.
//
// Spread `itemProps(i)` onto each row and `handleProps(i)` onto a small grab
// handle inside it. A row only becomes draggable while its handle is pressed,
// so clicks (to expand) and text selection inside the row still work normally.
// `onReorder(from, to)` fires once on a successful drop.
export function useDragSort(onReorder) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [armed, setArmed] = useState(null);

  const reset = () => {
    setDragIndex(null);
    setOverIndex(null);
    setArmed(null);
  };

  function handleProps(i) {
    return {
      onMouseDown: () => setArmed(i),
      onMouseUp: () => setArmed(null),
      onTouchStart: () => setArmed(i),
      onTouchEnd: () => setArmed(null),
    };
  }

  function itemProps(i) {
    return {
      draggable: armed === i,
      onDragStart: (e) => {
        setDragIndex(i);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox won't start a drag unless some data is set.
        try {
          e.dataTransfer.setData('text/plain', String(i));
        } catch {
          /* ignore */
        }
      },
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (overIndex !== i) setOverIndex(i);
      },
      onDrop: (e) => {
        e.preventDefault();
        if (dragIndex != null && dragIndex !== i) onReorder(dragIndex, i);
        reset();
      },
      onDragEnd: reset,
    };
  }

  return { dragIndex, overIndex, itemProps, handleProps };
}
