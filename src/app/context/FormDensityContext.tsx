import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type FormDensity = 'comfortable' | 'compact';

interface FormDensityContextValue {
  density: FormDensity;
  setDensity: (d: FormDensity) => void;
}

const FormDensityContext = createContext<FormDensityContextValue>({
  density: 'comfortable',
  setDensity: () => {},
});

export function FormDensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<FormDensity>('comfortable');
  return (
    <FormDensityContext.Provider value={{ density, setDensity }}>
      {children}
    </FormDensityContext.Provider>
  );
}

export function useFormDensity() {
  return useContext(FormDensityContext);
}

export const densityStyles = {
  comfortable: {
    sectionPadding: 'p-4',
    sectionGap: 'gap-4',
    fieldGap: 'gap-1',
    label: 'text-[11px]',
    input: 'px-3 py-1.5 text-[13px]',
    textarea: 'min-h-[72px]',
    textareaRows: 3,
    sectionHeader: 'px-4 py-2.5',
    sectionHeaderText: 'text-[12px]',
  },
  compact: {
    sectionPadding: 'p-2.5',
    sectionGap: 'gap-2',
    fieldGap: 'gap-0.5',
    label: 'text-[10px]',
    input: 'px-2 py-1 text-[12px]',
    textarea: 'min-h-[52px]',
    textareaRows: 2,
    sectionHeader: 'px-3 py-1.5',
    sectionHeaderText: 'text-[11px]',
  },
};
