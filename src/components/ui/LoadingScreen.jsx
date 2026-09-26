import React, { useEffect, useRef, useState } from 'react';
import './LoadingScreen.css';

// Durée minimale d'affichage pour éviter un flash quand tout est déjà en cache
const MIN_DURATION = 2200;
const FADE_DURATION = 900;
const TOTAL_IMAGES = 5;
const TIP_INTERVAL = 3200;

const TIPS = [
  'Z Q S D ou W A S D pour se déplacer',
  'Maintiens Maj pour courir',
  'Espace pour sauter',
  'B pour ouvrir le menu des émotes',
  'Clic-glisser pour tourner la caméra, molette pour zoomer',
];

export default function LoadingScreen({ isLoaded, error = null, onFinished }) {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    const handleProgress = (event) => {
      const value = Number(event.detail?.progress);
      if (Number.isFinite(value)) setProgress((current) => Math.max(current, value));
    };
    window.addEventListener('loading-progress', handleProgress);

    const minTimer = window.setTimeout(() => setMinTimeElapsed(true), MIN_DURATION);
    const tipTimer = window.setInterval(
      () => setTipIndex((index) => (index + 1) % TIPS.length),
      TIP_INTERVAL,
    );

    return () => {
      window.removeEventListener('loading-progress', handleProgress);
      window.clearTimeout(minTimer);
      window.clearInterval(tipTimer);
    };
  }, []);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (minTimeElapsed && isLoaded && !error) setIsFadingOut(true);
  }, [minTimeElapsed, isLoaded, error]);

  useEffect(() => {
    if (!isFadingOut) return undefined;
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      onFinishedRef.current?.();
    }, FADE_DURATION);
    return () => window.clearTimeout(timer);
  }, [isFadingOut]);

  if (!isVisible) return null;

  const displayed = isLoaded ? 100 : Math.min(progress, 96);
  const frame = Math.min(TOTAL_IMAGES, 1 + Math.floor((displayed / 100) * TOTAL_IMAGES));

  return (
    <div
      className={`loading-screen${isFadingOut ? ' loading-screen--hidden' : ''}`}
      style={{ '--fade-duration': `${FADE_DURATION}ms` }}
      role="status"
      aria-live="polite"
    >
      <div className="loading-screen__glow" />

      <div className="loading-screen__runner">
        {Array.from({ length: TOTAL_IMAGES }, (_, index) => (
          <img
            key={index}
            src={`/assets/loading/${index + 1}.png`}
            alt=""
            draggable={false}
            className={frame === index + 1 ? 'is-active' : undefined}
          />
        ))}
      </div>

      <h1 className="loading-screen__title">OpenWorld VRM</h1>

      {error ? (
        <div className="loading-screen__error">
          <p>Impossible de charger ton avatar.</p>
          <small>{error}</small>
          <button type="button" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div
            className="loading-screen__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayed)}
          >
            <div className="loading-screen__fill" style={{ transform: `scaleX(${displayed / 100})` }} />
          </div>
          <div className="loading-screen__percent">{Math.round(displayed)}%</div>
          <p key={tipIndex} className="loading-screen__tip">{TIPS[tipIndex]}</p>
        </>
      )}
    </div>
  );
}
