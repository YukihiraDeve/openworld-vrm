import { FOG, SKY_COLORS } from './environment';

// La couleur réelle du brouillard est calculée dans le shader (voir atmosphere.js) ;
// FogExp2 active les chunks de brouillard et fournit la densité.
export default function Fog() {
  return <fogExp2 attach="fog" args={[SKY_COLORS.horizon, FOG.density]} />;
}
