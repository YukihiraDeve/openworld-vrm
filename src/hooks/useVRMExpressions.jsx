import { useRef, useCallback } from 'react';

/**
 * Hook pour gérer les expressions faciales VRM
 * @param {Object} vrmRef - Référence vers l'instance VRM
 */
export default function useVRMExpressions(vrmRef) {
  const currentExpressionRef = useRef(null);
  const expressionTimeoutRef = useRef(null);

  // Fonction pour contrôler les expressions faciales VRM
  const setVRMExpression = useCallback((expressionName, value) => {
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
          'happy': ['happy', 'Happy', 'smile', 'Smile', 'joy', 'Joy', 'fun', 'Fun'],
          'sad': ['sad', 'Sad', 'sorrow', 'Sorrow', 'unhappy', 'Unhappy'],
          'angry': ['angry', 'Angry', 'anger', 'Anger', 'mad', 'Mad'],
          'surprised': ['surprised', 'Surprised', 'surprise', 'Surprise', 'shocked', 'Shocked'],
          'neutral': ['neutral', 'Neutral', 'relaxed', 'Relaxed'],
          'blink': ['blink', 'Blink', 'eye_close', 'EyeClose', 'BLINK', 'eyeCloseLeft', 'eyeCloseRight'],
          'lookUp': ['lookUp', 'LookUp', 'look_up', 'eyeLookUpLeft', 'eyeLookUpRight'],
          'lookDown': ['lookDown', 'LookDown', 'look_down', 'eyeLookDownLeft', 'eyeLookDownRight'],
          'lookLeft': ['lookLeft', 'LookLeft', 'look_left', 'eyeLookOutLeft', 'eyeLookInRight'],
          'lookRight': ['lookRight', 'LookRight', 'look_right', 'eyeLookInLeft', 'eyeLookOutRight']
        };
        
        if (alternatives[expressionName]) {
          for (const alt of alternatives[expressionName]) {
            try {
              if (vrmRef.current.expressionManager) {
                vrmRef.current.expressionManager.setValue(alt, value);
                return; // Succès
              } else if (vrmRef.current.blendShapeProxy) {
                vrmRef.current.blendShapeProxy.setValue(alt, value);
                return; // Succès
              }
            } catch (altError) {
              continue; // Essayer l'alternative suivante
            }
          }
        }
      } catch (innerError) {
        console.warn(`Expression "${expressionName}" non supportée pour ce modèle VRM`);
      }
    }
  }, [vrmRef]);

  // Fonction pour réinitialiser toutes les expressions
  const resetExpressions = useCallback(() => {
    const expressionsToReset = ['happy', 'sad', 'angry', 'surprised', 'neutral'];
    expressionsToReset.forEach(expr => {
      setVRMExpression(expr, 0.0);
    });
  }, [setVRMExpression]);

  // Fonction pour déclencher une expression avec durée
  const triggerExpression = useCallback((expressionName, intensity = 1.0, duration = 3000) => {
    if (!vrmRef.current) return;

    // Annuler l'expression précédente si elle existe
    if (expressionTimeoutRef.current) {
      clearTimeout(expressionTimeoutRef.current);
    }

    // Réinitialiser toutes les expressions
    resetExpressions();

    // Appliquer la nouvelle expression
    setVRMExpression(expressionName, intensity);
    currentExpressionRef.current = expressionName;

    // Programmer le retour à l'état neutre
    expressionTimeoutRef.current = setTimeout(() => {
      setVRMExpression(expressionName, 0.0);
      currentExpressionRef.current = null;
    }, duration);

    return expressionName;
  }, [vrmRef, setVRMExpression, resetExpressions]);

  // Fonction pour obtenir l'expression actuelle
  const getCurrentExpression = useCallback(() => {
    return currentExpressionRef.current;
  }, []);

  // Fonction pour arrêter l'expression en cours
  const stopExpression = useCallback(() => {
    if (expressionTimeoutRef.current) {
      clearTimeout(expressionTimeoutRef.current);
    }
    resetExpressions();
    currentExpressionRef.current = null;
  }, [resetExpressions]);

  return {
    setVRMExpression,
    resetExpressions,
    triggerExpression,
    getCurrentExpression,
    stopExpression
  };
} 