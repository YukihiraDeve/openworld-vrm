import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  MultiplayerActionsContext,
  MultiplayerContext,
  MultiplayerStateContext,
} from './MultiplayerContext';
import { MODELS } from '../../utils/const';

// Sans réponse du serveur, on joue en solo avec un avatar local (reconnexion en arrière-plan)
const OFFLINE_FALLBACK_DELAY = 5000;

const pickLocalModel = () => {
  const models = Object.keys(MODELS);
  return models[Math.floor(Math.random() * models.length)];
};

// Remplacez par l'URL de votre serveur Socket.IO
// Adapte automatiquement l'URL du socket en fonction de l'URL du client
// Si on est sur localhost, utilise localhost. Si on est sur une IP (mobile), utilise cette IP.
const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3002`;
};
const SOCKET_SERVER_URL = getSocketUrl();

export default function MultiplayerProvider({ children, initialConnectionDelay = null }) {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState({}); // { id: { position, rotation, locomotion, ... }, ... }
  const [localPlayerId, setLocalPlayerId] = useState(null);
  // Nouvel état pour stocker le modèle assigné au joueur local
  const [localPlayerModel, setLocalPlayerModel] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const localModelRef = useRef(null);

  // Connexion et déconnexion
  useEffect(() => {
    // Si initialConnectionDelay est null, ne pas se connecter encore
    if (initialConnectionDelay === null) return;

    const assignModel = (model) => {
      if (localModelRef.current || !MODELS[model]) return;
      localModelRef.current = model;
      setLocalPlayerModel(model);
    };

    // Le modèle déjà affiché est redemandé à chaque (re)connexion pour ne pas changer d'avatar en jeu
    const newSocket = io(SOCKET_SERVER_URL, {
      auth: (callback) => callback(localModelRef.current ? { model: localModelRef.current } : {}),
      reconnectionDelayMax: 10000,
    });
    setSocket(newSocket);

    const fallbackTimer = window.setTimeout(() => {
      if (localModelRef.current) return;
      console.warn('Serveur multijoueur injoignable : démarrage en mode solo.');
      assignModel(pickLocalModel());
      setConnectionStatus('offline');
    }, OFFLINE_FALLBACK_DELAY);

    newSocket.on('connect', () => {
      console.log('Connecté au serveur Socket.IO avec ID:', newSocket.id);
      setLocalPlayerId(newSocket.id);
      setConnectionStatus('online');
    });

    // Écouter l'événement 'welcome' pour recevoir le modèle assigné
    newSocket.on('welcome', ({ id, model }) => {
      console.log(`Modèle assigné par le serveur: ${model} pour l'ID: ${id}`);
      window.clearTimeout(fallbackTimer);
      assignModel(model);
    });

    newSocket.on('connect_error', () => {
      if (localModelRef.current) setConnectionStatus('offline');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Déconnecté du serveur Socket.IO:', reason);
      setPlayers({});
      setLocalPlayerId(null);
      setConnectionStatus('offline');
    });

    // Événement pour recevoir l'état de tous les joueurs (y compris soi-même au début)
    newSocket.on('updatePlayers', (serverPlayers) => {
      if (serverPlayers && typeof serverPlayers === 'object') {
        setPlayers(serverPlayers);
      }
    });

    newSocket.on('playerMoved', ({ id, position, rotation, seq }) => {
      if (!id || !position) return;

      setPlayers((currentPlayers) => {
        const currentPlayer = currentPlayers[id];
        if (!currentPlayer || (seq && currentPlayer._seq >= seq)) {
          return currentPlayers;
        }

        return {
          ...currentPlayers,
          [id]: {
            ...currentPlayer,
            position,
            rotation: rotation || currentPlayer.rotation,
            _seq: seq || currentPlayer._seq,
          },
        };
      });
    });

    newSocket.on('playerAnimationChanged', ({ id, locomotion }) => {
      if (!id || !locomotion) return;
      setPlayers((currentPlayers) => {
        const currentPlayer = currentPlayers[id];
        if (!currentPlayer || currentPlayer.locomotion === locomotion) {
          return currentPlayers;
        }
        return {
          ...currentPlayers,
          [id]: { ...currentPlayer, locomotion },
        };
      });
    });

    newSocket.on('playerEmoteChanged', ({
      id,
      currentEmote,
      currentEmoteType,
    }) => {
      if (!id) return;
      setPlayers((currentPlayers) => {
        const currentPlayer = currentPlayers[id];
        if (!currentPlayer) return currentPlayers;
        return {
          ...currentPlayers,
          [id]: {
            ...currentPlayer,
            currentEmote,
            currentEmoteType,
          },
        };
      });
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      newSocket.disconnect();
    };
  }, [initialConnectionDelay]);

  // Fonction pour émettre le mouvement du joueur local
  const emitPlayerMove = useCallback((movementData) => {
    if (socket?.connected && movementData) {
      socket.volatile.emit('playerMove', movementData);
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

  const contextValue = useMemo(() => ({
    socket,
    players,
    localPlayerId,
    localPlayerModel,
    connectionStatus,
    emitPlayerMove,
    emitPlayerAnimation,
    emitPlayerEmote,
  }), [
    socket,
    players,
    localPlayerId,
    localPlayerModel,
    connectionStatus,
    emitPlayerMove,
    emitPlayerAnimation,
    emitPlayerEmote,
  ]);

  const actionsValue = useMemo(() => ({
    socket,
    localPlayerId,
    localPlayerModel,
    emitPlayerMove,
    emitPlayerAnimation,
    emitPlayerEmote,
  }), [
    socket,
    localPlayerId,
    localPlayerModel,
    emitPlayerMove,
    emitPlayerAnimation,
    emitPlayerEmote,
  ]);

  const stateValue = useMemo(() => ({
    players,
    localPlayerId,
    connectionStatus,
  }), [players, localPlayerId, connectionStatus]);

  return (
    <MultiplayerActionsContext.Provider value={actionsValue}>
      <MultiplayerStateContext.Provider value={stateValue}>
        <MultiplayerContext.Provider value={contextValue}>
          {children}
        </MultiplayerContext.Provider>
      </MultiplayerStateContext.Provider>
    </MultiplayerActionsContext.Provider>
  );
}
