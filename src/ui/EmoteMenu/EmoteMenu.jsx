import React, { useEffect, useRef } from 'react';
import './EmoteMenu.css';

// Configuration des émotes disponibles
const EMOTES = [
  // Émotes avec animations FBX
  {
    id: 'salute',
    name: 'Salut',
    icon: '🫡',
    key: '1',
    type: 'animation',
    animation: 'salute'
  },
  
  // Émotes avec expressions faciales VRM
  {
    id: 'happy',
    name: 'Sourire',
    icon: '😊',
    key: '2',
    type: 'expression',
    expression: 'happy'
  },
  {
    id: 'sad',
    name: 'Tristesse',
    icon: '😢',
    key: '3',
    type: 'expression',
    expression: 'sad'
  },
  {
    id: 'angry',
    name: 'Colère',
    icon: '😠',
    key: '4',
    type: 'expression',
    expression: 'angry'
  },
  {
    id: 'surprised',
    name: 'Surprise',
    icon: '😲',
    key: '5',
    type: 'expression',
    expression: 'surprised'
  },
  {
    id: 'neutral',
    name: 'Neutre',
    icon: '😐',
    key: '6',
    type: 'expression',
    expression: 'neutral'
  },
  
  // On peut facilement ajouter d'autres émotes ici
  // {
  //   id: 'dance',
  //   name: 'Danse',
  //   icon: '💃',
  //   key: '7',
  //   type: 'animation',
  //   animation: 'dance'
  // },
];

export default function EmoteMenu({ 
  isOpen, 
  onClose, 
  onEmoteSelect, 
  currentEmote = null 
}) {
  const menuRef = useRef(null);

  // Fermer le menu avec la touche Echap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
      
      // Permettre de sélectionner une émote avec les touches numériques
      const keyPressed = event.key;
      const emote = EMOTES.find(e => e.key === keyPressed);
      if (emote) {
        onEmoteSelect(emote);
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onEmoteSelect]);

  // Fermer le menu en cliquant en dehors
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Gestion du clic sur une émote
  const handleEmoteClick = (emote) => {
    onEmoteSelect(emote);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="emote-menu-overlay" />
      <div className="emote-menu" ref={menuRef}>
        <div className="emote-menu-header">
          <h2 className="emote-menu-title">Émotes</h2>
          <p className="emote-menu-subtitle">Sélectionnez une émote ou utilisez les touches numériques</p>
        </div>
        
        <div className="emote-grid">
          {EMOTES.map((emote) => (
            <div
              key={emote.id}
              className={`emote-item ${currentEmote === emote.id ? 'active' : ''}`}
              onClick={() => handleEmoteClick(emote)}
              title={`${emote.name} (Touche ${emote.key})`}
            >
              <div className="emote-item-key">{emote.key}</div>
              <span className="emote-item-icon">{emote.icon}</span>
              <p className="emote-item-name">{emote.name}</p>
            </div>
          ))}
        </div>
        
        <div className="emote-menu-footer">
          <p className="emote-menu-close">Appuyez sur <strong>Échap</strong> pour fermer</p>
        </div>
      </div>
    </>
  );
} 