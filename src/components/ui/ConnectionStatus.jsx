import { useContext } from 'react';
import { MultiplayerStateContext } from '../../experience/multiplayer/MultiplayerContext';
import './ConnectionStatus.css';

const LABELS = {
  connecting: 'Connexion…',
  offline: 'Hors-ligne · reconnexion…',
};

export default function ConnectionStatus() {
  const { players, connectionStatus } = useContext(MultiplayerStateContext);
  const count = players ? Object.keys(players).length : 0;

  const label = connectionStatus === 'online'
    ? `En ligne · ${Math.max(count, 1)} joueur${count > 1 ? 's' : ''}`
    : LABELS[connectionStatus] ?? LABELS.connecting;

  return (
    <div className={`connection-status connection-status--${connectionStatus}`} role="status">
      <span className="connection-status__dot" />
      {label}
    </div>
  );
}
