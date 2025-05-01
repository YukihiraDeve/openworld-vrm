import { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import VrmAvatar from '../components/VrmAvatar';
import useKeyboardController from './controller/KeyboardController';
import useMouseController from './controller/MouseController';
import usePlayerMovement from '../hooks/usePlayerMovement';
import FollowCamera from './camera/FollowCamera';
import { MODELS, ANIMATIONS, MODEL_DIRECTION_OFFSETS } from '../utils/const';
import { MultiplayerContext } from './multiplayer/MultiplayerContext';
// Variable statique pour suivre si un modèle a déjà été chargé
const modelLoaded = { current: false };

export default function Player() {
  const [avatarLoadedRef, setAvatarLoadedRef] = useState(null);
  const avatarObjectRef = useRef(null);
  const initialModelLoggedRef = useRef(false);
  
  // Le modèle est choisi aléatoirement ici pour l'affichage local,
  // mais ce choix n'est plus envoyé au serveur.
  const [currentModel, setCurrentModel] = useState(() => {
    const modelKeys = Object.keys(MODELS);
    const randomIndex = Math.floor(Math.random() * modelKeys.length);
    const initialModel = modelKeys[randomIndex];
    console.log(`Modèle initial choisi localement : ${initialModel}`);
    return initialModel;
  });
  
  // Afficher le modèle choisi une seule fois
  useEffect(() => {
    if (!initialModelLoggedRef.current && !modelLoaded.current) {
      console.log(`Modèle aléatoire choisi : ${currentModel}`);
      initialModelLoggedRef.current = true;
      modelLoaded.current = true;
    } else if (!initialModelLoggedRef.current && modelLoaded.current) {
      // Éviter l'affichage en double lors d'un remontage du composant
      initialModelLoggedRef.current = true;
    }
  }, [currentModel]);

  const { 
    emitPlayerMove, 
    emitPlayerAnimation, 
  } = useContext(MultiplayerContext);

  const {
    locomotion,
    movementDirection,
    cameraAngle,
    setCameraAngle,
    cameraAngleRef,
    updateMovement,
    updateCameraAngleRef
  } = usePlayerMovement(emitPlayerMove, emitPlayerAnimation, avatarObjectRef);

  const keysPressed = useKeyboardController(cameraAngleRef, () => updateMovement(keysPressed));
  useMouseController(setCameraAngle);

  useEffect(() => {
    updateCameraAngleRef();
  }, [cameraAngle, updateCameraAngleRef]);

  const handleAvatarLoad = useCallback((ref) => {
    avatarObjectRef.current = ref;
    setAvatarLoadedRef(ref);
  }, []);

  useFrame(() => {
    if (avatarObjectRef.current) {
      // Faire suivre la cible de la lumière au personnage
      const playerPosition = avatarObjectRef.current.position;
      const directionalLights = [];
      
      // Trouver toutes les lumières directionnelles dans la scène
      avatarObjectRef.current.parent.traverse((object) => {
        if (object.isDirectionalLight) {
          directionalLights.push(object);
        }
      });
      
      // Si des lumières sont trouvées, mettre à jour leurs cibles
      if (directionalLights.length > 0) {
        directionalLights.forEach(light => {
          light.target.position.copy(playerPosition);
          light.target.updateMatrixWorld();
        });
      }
    }
  });

  // Obtenir le décalage d'orientation pour le modèle actuel (local)
  const modelDirectionOffset = MODEL_DIRECTION_OFFSETS[currentModel] || 0;

  return (
    <>
  
     
      <VrmAvatar 
        key={currentModel} // La clé est toujours utile pour forcer le rechargement local
        vrmUrl={MODELS[currentModel]} 
        idleAnimationUrl={ANIMATIONS['breathing-idle']}
        walkAnimationUrl={ANIMATIONS['walking']}
        runAnimationUrl={ANIMATIONS['run']}
        locomotion={locomotion}
        movementDirection={movementDirection}
        scale={1}
        onLoad={handleAvatarLoad}
        castShadow={true}
        receiveShadow={true}
        capsuleCollider={true}
        modelDirectionOffset={modelDirectionOffset}
        position={[0, 2, 0]} // Position initiale légèrement au-dessus du sol
      />    
      
      {avatarObjectRef.current && <FollowCamera targetRef={avatarObjectRef} angle={cameraAngle} />}
      
    </>
  );
}