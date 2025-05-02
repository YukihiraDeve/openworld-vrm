import React from 'react';
import { useAudioContext } from '../../context/AudioContext';
import './Soundbar.css'; // Nous créerons ce fichier CSS ensuite pour le style
import soundIcon from '/assets/ui/sound/sound.png';

function Soundbar() {
  const { globalVolume, setGlobalVolume } = useAudioContext();

  const handleVolumeChange = (event) => {
    setGlobalVolume(event.target.value);
    // La logique de changement de volume se fait maintenant dans les composants audio via le contexte
  };

  // TODO: Ajouter une logique pour le mute/unmute en cliquant sur l'icône ?
  // const toggleMute = () => { setGlobalVolume(globalVolume > 0 ? 0 : 1); };

  return (
    <div className="soundbar-container">
      <img 
        src={soundIcon} 
        alt="Sound Icon" 
        className="sound-icon" 
        // onClick={toggleMute} // Décommenter si vous ajoutez le mute
      />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={globalVolume}
        onChange={handleVolumeChange}
        className="volume-slider"
      />
    </div>
  );
}

export default Soundbar; 