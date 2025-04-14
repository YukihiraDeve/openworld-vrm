import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { MultiplayerContext } from './MultiplayerContext';

// Remplacez par l'URL de votre serveur Socket.IO
const SOCKET_SERVER_URL = 'http://localhost:3001'; 

export default function MultiplayerProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState({}); // { id: { position, rotation, locomotion, ... }, ... }
  const localPlayerIdRef = useRef(null);

  // Connexion et déconnexion
  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connecté au serveur Socket.IO avec ID:', newSocket.id);
      localPlayerIdRef.current = newSocket.id;
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Déconnecté du serveur Socket.IO:', reason);
      setPlayers({});
      localPlayerIdRef.current = null;
    });

    // Événement pour recevoir l'état de tous les joueurs (y compris soi-même au début)
    newSocket.on('updatePlayers', (serverPlayers) => {
        console.log('Mise à jour des joueurs:', serverPlayers); // Debug
      setPlayers(serverPlayers);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Fonction pour émettre le mouvement du joueur local
  const emitPlayerMove = useCallback((movementData) => {
    if (socket?.connected && movementData) {
     console.log("Emitting move:", movementData); // Debug
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


  const contextValue = {
    socket,
    players,
    localPlayerId: localPlayerIdRef.current,
    emitPlayerMove,
    emitPlayerAnimation
  };

  return (
    <MultiplayerContext.Provider value={contextValue}>
      {children}
    </MultiplayerContext.Provider>
  );
}
