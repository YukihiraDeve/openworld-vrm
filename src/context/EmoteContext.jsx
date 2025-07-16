import React, { createContext, useContext } from 'react';
import useEmoteSystem from '../hooks/useEmoteSystem';

const EmoteContext = createContext();

export const EmoteProvider = ({ children }) => {
  const emoteSystem = useEmoteSystem();
  
  return (
    <EmoteContext.Provider value={emoteSystem}>
      {children}
    </EmoteContext.Provider>
  );
};

export const useEmoteContext = () => {
  const context = useContext(EmoteContext);
  if (!context) {
    throw new Error('useEmoteContext must be used within an EmoteProvider');
  }
  return context;
}; 