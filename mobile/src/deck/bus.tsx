// Lets voice reach into the card on screen: each interactive card registers what it can do.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

export interface CardHandlers {
  myth?: (answer: 'myth' | 'fact') => void;
  guess?: (value: number) => void;
  lockIn?: () => void;
  way?: (n: number) => void;
  play?: () => void;
  pin?: () => void;
}

type Registry = Map<number, { current: CardHandlers }>;
const Bus = createContext<Registry | null>(null);
const Index = createContext<number>(-1);

export function CardBusProvider({ registry, children }: { registry: Registry; children: ReactNode }) {
  return <Bus.Provider value={registry}>{children}</Bus.Provider>;
}

export function CardIndex({ index, children }: { index: number; children: ReactNode }) {
  return <Index.Provider value={index}>{children}</Index.Provider>;
}

/** Called by a card: the latest handlers are always the ones used. */
export function useCardHandlers(h: CardHandlers): void {
  const registry = useContext(Bus);
  const index = useContext(Index);
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    if (!registry || index < 0) return;
    registry.set(index, ref);
    return () => {
      if (registry.get(index) === ref) registry.delete(index);
    };
  }, [registry, index]);
}
