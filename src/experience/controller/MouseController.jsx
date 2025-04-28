import { useEffect, useRef } from 'react';

export default function useMouseController(setCameraAngle) {
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseDown = (event) => {
      if (event.button === 0) {
        isDragging.current = true;
        previousMousePosition.current = { x: event.clientX, y: event.clientY };
        document.body.style.cursor = 'grabbing';
      }
    };

    const handleMouseUp = (event) => {
      if (event.button === 0) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging.current) return;

      const deltaX = event.clientX - previousMousePosition.current.x;
      const deltaY = event.clientY - previousMousePosition.current.y;

      setCameraAngle(prevAngle => {
        const horizontal = prevAngle.horizontal - deltaX * 0.005;
        let vertical = prevAngle.vertical - deltaY * 0.005;
        return { horizontal, vertical };
      });

      previousMousePosition.current = { x: event.clientX, y: event.clientY };
    };

    const canvasElement = document.querySelector('canvas');
    if (canvasElement) {
      canvasElement.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (canvasElement) {
        canvasElement.removeEventListener('mousedown', handleMouseDown);
      }
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      document.body.style.cursor = 'default';
    };
  }, [setCameraAngle]);
}