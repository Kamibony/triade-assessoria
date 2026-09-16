import React, { createContext, useContext, useState, useEffect } from 'react';

export interface OscOption {
  id: string;
  name: string;
}

interface ActiveOscContextType {
  activeOscId: string | null;
  setActiveOscId: (id: string | null) => void;
  oscOptions: OscOption[];
  setOscOptions: (options: OscOption[]) => void;
}

const ActiveOscContext = createContext<ActiveOscContextType | undefined>(undefined);

export const useActiveOsc = () => {
  const context = useContext(ActiveOscContext);
  if (context === undefined) {
    throw new Error('useActiveOsc must be used within an ActiveOscProvider');
  }
  return context;
};

export const ActiveOscProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeOscId, setActiveOscIdState] = useState<string | null>(() => {
    return localStorage.getItem('portal_active_osc_id');
  });
  const [oscOptions, setOscOptions] = useState<OscOption[]>([]);

  const setActiveOscId = (id: string | null) => {
    setActiveOscIdState(id);
    if (id) {
      localStorage.setItem('portal_active_osc_id', id);
    } else {
      localStorage.removeItem('portal_active_osc_id');
    }
  };

  useEffect(() => {
    // If the active ID is not in the options (and options are loaded), we might want to clear it,
    // but for now we just keep it simple.
  }, [oscOptions, activeOscId]);

  return (
    <ActiveOscContext.Provider value={{ activeOscId, setActiveOscId, oscOptions, setOscOptions }}>
      {children}
    </ActiveOscContext.Provider>
  );
};
