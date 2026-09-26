import React, { useEffect, useState } from 'react';
import { useControls } from '../../context/ControlsContext';
import './ControlsHint.css';

const AUTO_COLLAPSE_DELAY = 14000;

const CONTROLS = [
  { keys: ['Z', 'Q', 'S', 'D'], label: 'Se déplacer' },
  { keys: ['Maj'], label: 'Courir' },
  { keys: ['Espace'], label: 'Sauter' },
  { keys: ['B'], label: 'Émotes' },
  { keys: ['Clic + glisser'], label: 'Caméra' },
  { keys: ['Molette'], label: 'Zoom' },
];

export default function ControlsHint({ active }) {
  const { isMobile } = useControls();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => setExpanded(false), AUTO_COLLAPSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'KeyH' && !event.repeat) setExpanded((value) => !value);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isMobile || !active) return null;

  return (
    <div className={`controls-hint${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="controls-hint__toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={expanded ? "Masquer l'aide (H)" : "Afficher l'aide (H)"}
        title="Commandes (H)"
      >
        {expanded ? '×' : '?'}
      </button>

      {expanded && (
        <ul className="controls-hint__list">
          {CONTROLS.map(({ keys, label }) => (
            <li key={label}>
              <span className="controls-hint__keys">
                {keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
