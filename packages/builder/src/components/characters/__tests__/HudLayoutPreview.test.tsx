import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HudLayoutPreview } from '../HudLayoutPreview';

const character: any = {
  id: 'brandt', name: 'Tomas Brandt',
  counters: [{ name: 'suspBrandt', displayName: 'Suspicion', visible: true, min: 0, max: 5, value: 1 }],
  meterFrame: { dockMode: 'screen', screenPosition: 'screen-top-left' },
};

describe('HudLayoutPreview — phone toggle', () => {
  it('shows full cards on desktop and the compact strip on the phone stage', () => {
    render(<HudLayoutPreview character={character} hudOverlays={{ timerHud: { enabled: true, position: 'top-right' } }} />);
    expect(screen.getByText('Meters')).toBeTruthy();
    expect(screen.queryByText('Strip')).toBeNull();
    fireEvent.click(screen.getByText('📱 Phone'));
    expect(screen.getByText('Strip')).toBeTruthy();
    expect(screen.queryByText('Meters')).toBeNull();
    expect(screen.getByText('Timer')).toBeTruthy(); // global HUD keeps its own box
    expect(screen.getByText(/fold into a tap-to-expand strip/)).toBeTruthy();
    fireEvent.click(screen.getByText('Desktop'));
    expect(screen.getByText('Meters')).toBeTruthy();
  });

  it('honours Compact HUD = never', () => {
    render(<HudLayoutPreview character={character} hudOverlays={{ compactMode: 'never' }} />);
    fireEvent.click(screen.getByText('📱 Phone'));
    expect(screen.getByText('Meters')).toBeTruthy();
    expect(screen.getByText(/set to never/)).toBeTruthy();
  });

  it('honours Compact HUD = always on the desktop stage', () => {
    render(<HudLayoutPreview character={character} hudOverlays={{ compactMode: 'always' }} />);
    expect(screen.getByText('Strip')).toBeTruthy();
  });
});
