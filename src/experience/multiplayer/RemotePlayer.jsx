import React from 'react';
import VrmAvatar from '../../components/VrmAvatar';
import { MODELS, ANIMATIONS, MODEL_DIRECTION_OFFSETS } from '../../utils/const'; // Assurez-vous que le chemin est correct

// Ce composant recevra les données d'un joueur distant et affichera son avatar
export default function RemotePlayer({ playerData, audioListener, stepSoundBuffers, locomotion: remoteLocomotion }) {
  if (!playerData) {
    return null; 
  }

  // Extrait la rotation du serveur, avec une valeur par défaut
  const rotationData = playerData.rotation || { x: 0, y: 0, z: 0, w: 1 };

  // Assurez-vous que les données de position existent
  const position = playerData.position ? [playerData.position.x, playerData.position.y, playerData.position.z] : [0, -1, 0];
  
  // Utiliser le modèle du joueur distant s'il est spécifié, sinon utiliser un modèle par défaut
  const playerModel = playerData.model || 'WomanSkirtCharacter';
  
  // Obtenir le décalage d'orientation pour le modèle du joueur distant
  const modelDirectionOffset = MODEL_DIRECTION_OFFSETS[playerModel] || 0;


  return (
    <VrmAvatar
      // Clé unique incluant l'ID du joueur ET le modèle pour forcer la reconstruction si le modèle change
      key={`${playerData.id}-${playerModel}`}
      vrmUrl={MODELS[playerModel]}
      idleAnimationUrl={ANIMATIONS['breathing-idle']}
      walkAnimationUrl={ANIMATIONS['walking']}
      runAnimationUrl={ANIMATIONS['run']}
      locomotion={remoteLocomotion}
      position={position}
      rotation={rotationData}
      scale={1}
      modelDirectionOffset={modelDirectionOffset}
      audioListener={audioListener}
      stepSoundBuffers={stepSoundBuffers}
      capsuleCollider={false}
    />
  );
}
