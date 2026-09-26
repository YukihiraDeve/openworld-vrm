import React, { useRef } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import './Soundbar.css';
import soundIcon from '/assets/ui/sound/sound.png';

function Soundbar() {
  const { globalVolume, setGlobalVolume } = useAudioContext();
  const previousVolumeRef = useRef(0.5);
  const volume = Number(globalVolume) || 0;
  const isMuted = volume <= 0;

  const handleVolumeChange = (event) => {
    setGlobalVolume(Number(event.target.value));
  };

  const toggleMute = () => {
    if (isMuted) {
      setGlobalVolume(previousVolumeRef.current || 0.5);
    } else {
      previousVolumeRef.current = volume;
      setGlobalVolume(0);
    }
  };

  return (
    <div className="soundbar-container" style={{ '--volume': `${volume * 100}%` }}>
      <button
        type="button"
        className={`sound-toggle${isMuted ? ' is-muted' : ''}`}
        onClick={toggleMute}
        aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
        title={isMuted ? 'Activer le son' : 'Couper le son'}
      >
        <img src={soundIcon} alt="" draggable={false} />
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={handleVolumeChange}
        className="volume-slider"
        aria-label="Volume"
      />
    </div>
  );
}

export default Soundbar;
