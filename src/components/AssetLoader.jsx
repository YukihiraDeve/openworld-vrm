import { useEffect } from 'react';

export default function AssetLoader({ children, onLoadComplete }) {
  useEffect(() => {
    if (onLoadComplete) onLoadComplete();
  }, [onLoadComplete]);

  return children;
}
