import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { MultiplayerContext } from './MultiplayerContext';

// Remplacez par l'URL de votre serveur Socket.IO
// Adapte automatiquement l'URL du socket en fonction de l'URL du client
// Si on est sur localhost, utilise localhost. Si on est sur une IP (mobile), utilise cette IP.
const getSocketUrl = () => {
    const hostname = window.location.hostname;
    return `http://${hostname}:3002`;
};
const SOCKET_SERVER_URL = getSocketUrl();

export default function MultiplayerProvider({ children, initialConnectionDelay = null }) {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState({}); // { id: { position, rotation, locomotion, ... }, ... }
  const [localPlayerId, setLocalPlayerId] = useState(null);
  // Nouvel état pour stocker le modèle assigné au joueur local
  const [localPlayerModel, setLocalPlayerModel] = useState(null); 

  // Connexion et déconnexion
  useEffect(() => {
    // Si initialConnectionDelay est null, ne pas se connecter encore
    if (initialConnectionDelay === null) return;
    
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connecté au serveur Socket.IO avec ID:', newSocket.id);
      setLocalPlayerId(newSocket.id);
    });

    // Écouter l'événement 'welcome' pour recevoir le modèle assigné
    newSocket.on('welcome', ({ id, model }) => {
      console.log(`Modèle assigné par le serveur: ${model} pour l'ID: ${id}`);
      setLocalPlayerModel(model);
      // Note: L'ID local devrait déjà être défini par l'événement 'connect'
      // mais on pourrait aussi le définir ici si nécessaire.
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Déconnecté du serveur Socket.IO:', reason);
      setPlayers({});
      setLocalPlayerId(null);
    });

    // Événement pour recevoir l'état de tous les joueurs (y compris soi-même au début)
    newSocket.on('updatePlayers', (serverPlayers) => {
      setPlayers(serverPlayers);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [initialConnectionDelay]);

  // Fonction pour émettre le mouvement du joueur local
  const emitPlayerMove = useCallback((movementData) => {
    if (socket?.connected && movementData) {
      socket.emit('playerMove', movementData);
    }
  }, [socket]);
  
   // Fonction pour émettre l'état d'animation du joueur local
   const emitPlayerAnimation = useCallback((animationData) => {
    if (socket?.connected && animationData) {
     // console.log("Emitting animation:", animationData); // Debug
      socket.emit('playerAnimation', animationData);
    }
  }, [socket]);

  // Fonction pour émettre une émote
  const emitPlayerEmote = useCallback((emoteData) => {
    if (socket?.connected && emoteData) {
      console.log("Emitting emote:", emoteData); // Debug
      socket.emit('playerEmote', emoteData);
    }
  }, [socket]);

  const contextValue = {
    socket,
    players,
    localPlayerId: localPlayerId,
    localPlayerModel, // Ajouter le modèle local au contexte
    emitPlayerMove,
    emitPlayerAnimation,
    emitPlayerEmote,
  };

  return (
    <MultiplayerContext.Provider value={contextValue}>
      {children}
    </MultiplayerContext.Provider>
  );
}
