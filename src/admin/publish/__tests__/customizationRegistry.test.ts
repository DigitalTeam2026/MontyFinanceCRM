import { describe, it, expect } from 'vitest';
import { CUSTOMIZATION_MODULES, moduleLabel, moduleRoute } from '../customizationRegistry';

describe('customizationRegistry', () => {
  it('covers the agreed v1 display-metadata modules', () => {
    const keys = CUSTOMIZATION_MODULES.map((m) => m.key);
    for (const k of ['forms', 'fields', 'views', 'rules', 'processflows', 'navigation', 'dashboards', 'optionsets', 'status']) {
      expect(keys).toContain(k);
    }
  });

  it('does NOT gate security modules (they stay immediate per decision)', () => {
    const keys = CUSTOMIZATION_MODULES.map((m) => m.key);
    for (const k of ['security', 'columnsecurity', 'teams', 'businessunits']) {
      expect(keys).not.toContain(k);
    }
  });

  it('every module lists at least one physical table', () => {
    for (const m of CUSTOMIZATION_MODULES) expect(m.tables.length).toBeGreaterThan(0);
  });

  it('resolves labels and falls back to the raw key', () => {
    expect(moduleLabel('forms')).toBe('Forms');
    expect(moduleLabel('nonexistent')).toBe('nonexistent');
    expect(moduleRoute('forms')).toBe('forms');
  });
});
