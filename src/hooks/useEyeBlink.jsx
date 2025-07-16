import { useEffect, useRef } from 'react';

/**
 * Hook personnalisé pour gérer le clignement d'yeux automatique des avatars VRM
 * @param {Object} vrmRef - Référence vers l'instance VRM
 * @param {number} blinkInterval - Intervalle entre les clignements en millisecondes (défaut: 5000ms)
 * @param {number} blinkDuration - Durée du clignement en millisecondes (défaut: 150ms)
 * @param {number} initialDelay - Délai avant le premier clignement en millisecondes (défaut: 2000ms)
 */
export default function useEyeBlink(vrmRef, blinkInterval = 5000, blinkDuration = 150, initialDelay = 2000) {
  const blinkTimerRef = useRef(null);
  const isBlinkingRef = useRef(false);

  // Fonction pour contrôler les expressions faciales VRM
  const setVRMExpression = (expressionName, value) => {
    if (!vrmRef.current) return;
    
    try {
      // Pour les nouveaux modèles VRM 1.0
      if (vrmRef.current.expressionManager) {
        vrmRef.current.expressionManager.setValue(expressionName, value);
      }
      // Pour les anciens modèles VRM 0.x
      else if (vrmRef.current.blendShapeProxy) {
        vrmRef.current.blendShapeProxy.setValue(expressionName, value);
      }
    } catch (error) {
      // Essayer avec d'autres noms d'expressions possibles
      try {
        const alternatives = {
          'blink': ['blink', 'Blink', 'eye_close', 'EyeClose', 'BLINK', 'eyeCloseLeft', 'eyeCloseRight'],
          'happy': ['happy', 'Happy', 'smile', 'Smile', 'joy', 'Joy'],
          'sad': ['sad', 'Sad', 'sorrow', 'Sorrow']
        };
        
        if (alternatives[expressionName]) {
          for (const alt of alternatives[expressionName]) {
            try {
              if (vrmRef.current.expressionManager) {
                vrmRef.current.expressionManager.setValue(alt, value);
                return; // Succès, sortir de la boucle
              } else if (vrmRef.current.blendShapeProxy) {
                vrmRef.current.blendShapeProxy.setValue(alt, value);
                return; // Succès, sortir de la boucle
              }
            } catch (altError) {
              // Continuer avec l'alternative suivante
              continue;
            }
          }
        }
      } catch (innerError) {
        // Ignorer silencieusement si l'expression n'est pas supportée
        console.warn(`Expression "${expressionName}" non supportée pour ce modèle VRM`);
      }
    }
  };

  // Fonction pour déclencher un clignement d'yeux
  const triggerEyeBlink = () => {
    if (!vrmRef.current || isBlinkingRef.current) return;
    
    isBlinkingRef.current = true;
    
    // Fermer les yeux (clignement)
    setVRMExpression('blink', 1.0);
    
    // Ouvrir les yeux après la durée du clignement
    setTimeout(() => {
      setVRMExpression('blink', 0.0);
      isBlinkingRef.current = false;
    }, blinkDuration);
  };

  // Système de clignement d'yeux automatique
  useEffect(() => {
    if (!vrmRef.current) return;
    
    const startBlinkTimer = () => {
      // Déclencher le premier clignement après le délai initial
      blinkTimerRef.current = setTimeout(() => {
        triggerEyeBlink();
        
        // Programmer les clignements suivants à intervalles réguliers
        const blinkIntervalId = setInterval(() => {
          triggerEyeBlink();
        }, blinkInterval);
        
        // Stocker l'interval pour le nettoyage
        blinkTimerRef.current = blinkIntervalId;
      }, initialDelay);
    };
    
    startBlinkTimer();
    
    // Nettoyage
    return () => {
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
        clearInterval(blinkTimerRef.current);
      }
      // Réinitialiser l'état
      isBlinkingRef.current = false;
      // S'assurer que les yeux sont ouverts
      setVRMExpression('blink', 0.0);
    };
  }, [vrmRef.current, blinkInterval, blinkDuration, initialDelay]);

  // Retourner une fonction pour déclencher manuellement un clignement
  return {
    triggerEyeBlink,
    isBlinking: isBlinkingRef.current
  };
} 