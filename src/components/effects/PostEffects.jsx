import { memo, useEffect, useMemo } from 'react';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { ColorGradeEffect } from './ColorGradeEffect';

function ColorGrade() {
  const effect = useMemo(() => new ColorGradeEffect(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive object={effect} dispose={null} />;
}

// Chaîne HDR : bloom sur les zones très lumineuses (soleil, lanternes), tone mapping filmique,
// étalonnage léger + vignette. Le composant ne doit pas se re-rendre souvent : chaque rendu
// reconstruit les passes de l'EffectComposer.
const PostEffects = memo(function PostEffects({ multisampling = 4 }) {
  return (
    <EffectComposer
      multisampling={multisampling}
      frameBufferType={THREE.HalfFloatType}
      stencilBuffer={false}
    >
      <Bloom
        mipmapBlur
        intensity={0.6}
        luminanceThreshold={1.0}
        luminanceSmoothing={0.35}
        radius={0.72}
        levels={6}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <ColorGrade />
    </EffectComposer>
  );
});

export default PostEffects;
