import React from 'react';
import VrmAvatar from '../../components/VrmAvatar';
import { MODELS, ANIMATIONS } from '../../utils/const'; // Assurez-vous que le chemin est correct

// Ce composant recevra les données d'un joueur distant et affichera son avatar
export default function RemotePlayer({ playerData }) {
  if (!playerData) {
    return null; 
  }

  // Extrait la rotation du serveur, avec une valeur par défaut
  const rotationData = playerData.rotation || { x: 0, y: 0, z: 0, w: 1 };

  // Assurez-vous que les données de position existent
  const position = playerData.position ? [playerData.position.x, playerData.position.y, playerData.position.z] : [0, -1, 0];
  const locomotion = playerData.locomotion || 'idle';

  return (
    <VrmAvatar
      // Chaque joueur distant pourrait avoir un modèle différent à l'avenir
      // Pour l'instant, on utilise le même modèle que le joueur local
      vrmUrl={MODELS['WomanSkirtCharacter']} 
      idleAnimationUrl={ANIMATIONS['breathing-idle']}
      walkAnimationUrl={ANIMATIONS['walking']}
      runAnimationUrl={ANIMATIONS['run']}
      locomotion={locomotion}
      // La direction du mouvement n'est pas nécessaire ici, la position est directement mise à jour
      // movementDirection={/* Pas nécessaire pour les joueurs distants */} 
      position={position}
      // Passe la rotation reçue au composant VrmAvatar
      rotation={rotationData}
      scale={1}
      // La rotation sera appliquée directement au groupe si nécessaire
    />
  );
}
