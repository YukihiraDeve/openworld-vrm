import React, { useState, useEffect } from 'react';

export default function LoadingScreen({ isLoaded, onFinished }) {
  const [currentImage, setCurrentImage] = useState(1);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Durée minimale en ms (7 secondes)
  const MIN_DURATION = 7000;
  // Nombre d'images
  const TOTAL_IMAGES = 5;
  // Temps par image
  const INTERVAL = MIN_DURATION / TOTAL_IMAGES;

  useEffect(() => {
    // Timer pour changer les images
    const imageTimer = setInterval(() => {
      setCurrentImage(prev => {
        if (prev < TOTAL_IMAGES) return prev + 1;
        return prev;
      });
    }, INTERVAL);

    // Timer pour la durée minimale globale
    const totalTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MIN_DURATION);

    return () => {
      clearInterval(imageTimer);
      clearTimeout(totalTimer);
    };
  }, []);

  // Surveiller la fin du chargement
  useEffect(() => {
    // On ne ferme que si :
    // 1. Les 7 secondes sont passées (minTimeElapsed)
    // 2. Le chargement réel des assets est fini (isLoaded)
    // 3. On n'est pas déjà en train de fermer
    if (minTimeElapsed && isLoaded && !isFadingOut) {
      setIsFadingOut(true);
      
      // Attendre la fin de l'animation de fade-out (1s) avant de démonter
      setTimeout(() => {
        setIsVisible(false);
        if (onFinished) onFinished();
      }, 1000);
    }
  }, [minTimeElapsed, isLoaded, isFadingOut, onFinished]);

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#FDFBF7', // Blanc cassé chaud
      zIndex: 9999, // Au-dessus de tout
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      transition: 'opacity 1s ease-in-out',
      opacity: isFadingOut ? 0 : 1,
      pointerEvents: 'all' // Bloque les clics/touch sur le jeu en dessous
    }}>
      {/* Conteneur de l'image pour éviter les sauts de mise en page */}
      <div style={{
        width: '300px',
        height: '300px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {/* On précharge toutes les images mais on n'affiche que la courante */}
        {[1, 2, 3, 4, 5].map((num) => (
          <img
            key={num}
            src={`/assets/loading/${num}.png`}
            alt={`Loading ${num}`}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              display: currentImage === num ? 'block' : 'none',
              objectFit: 'contain'
            }}
          />
        ))}
      </div>
      
      {/* Barre de progression optionnelle ou texte */}
      <div style={{
        marginTop: '20px',
        color: '#888',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        CHARGEMENT... {Math.round((currentImage / TOTAL_IMAGES) * 100)}%
      </div>
    </div>
  );
}

