import { useState, useCallback, useRef } from 'react';

export default function useEmoteSystem() {
  const [currentEmote, setCurrentEmote] = useState(null);
  const [currentEmoteType, setCurrentEmoteType] = useState(null);
  const [isEmoteMenuOpen, setIsEmoteMenuOpen] = useState(false);
  const emoteTimeoutRef = useRef(null);

  // Ouvrir/fermer le menu d'émotes
  const toggleEmoteMenu = useCallback(() => {
    setIsEmoteMenuOpen(prev => !prev);
  }, []);

  const closeEmoteMenu = useCallback(() => {
    setIsEmoteMenuOpen(false);
  }, []);

  // Déclencher une émote
  const triggerEmote = useCallback((emote) => {
    // Annuler l'émote précédente si elle existe
    if (emoteTimeoutRef.current) {
      clearTimeout(emoteTimeoutRef.current);
    }

    // Définir l'émote actuelle
    setCurrentEmote(emote.id);
    setCurrentEmoteType(emote.type);
    
    // Programmer l'arrêt de l'émote après un délai
    // Les expressions faciales durent moins longtemps que les animations
    const duration = emote.type === 'expression' ? 3000 : 4000; // 3s pour expressions, 4s pour animations
    emoteTimeoutRef.current = setTimeout(() => {
      setCurrentEmote(null);
      setCurrentEmoteType(null);
    }, duration);

    // Retourner l'animation ou l'expression à jouer
    return emote.animation || emote.expression;
  }, []);

  // Arrêter l'émote actuellement en cours
  const stopEmote = useCallback(() => {
    if (emoteTimeoutRef.current) {
      clearTimeout(emoteTimeoutRef.current);
    }
    setCurrentEmote(null);
    setCurrentEmoteType(null);
  }, []);

  return {
    currentEmote,
    currentEmoteType,
    isEmoteMenuOpen,
    toggleEmoteMenu,
    closeEmoteMenu,
    triggerEmote,
    stopEmote
  };
} 