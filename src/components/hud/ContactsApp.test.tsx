// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GameBridge } from '@/game/bridge';
import { createSocialState } from '@/game-core/social/SocialSession';
import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
import { socialView } from '@/game-core/social/presentation';
import { BANWA_DALAGAN_1996 } from '@/game-core/vehicles/catalog';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { bindGameUiStore } from '@/state/gameUiStore';
import { useMaintenanceStore } from '@/state/maintenanceStore';
import { useSocialStore } from '@/state/socialStore';
import { ContactsApp } from './ContactsApp';

afterEach(() => { vi.unstubAllGlobals(); });

it('quotes a relationship-based tow and requires confirmation before dispatching it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const bridge = new GameBridge();
  const release = bindGameUiStore(bridge.ui);
  const social = createSocialState(SOCIAL_CONTENT);
  social.npcs.mang_boy.introduced = true;
  social.npcs.mang_boy.trust = 60;
  useSocialStore.setState({ contactsOpen: true, view: socialView(social) });
  useMaintenanceStore.setState({ summary: new VehicleSession().summary(BANWA_DALAGAN_1996) });
  const tow = vi.fn();
  bridge.runtime.handle('towVehicle', tow);
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const click = async (label: string) => {
    const button = [...element.querySelectorAll('button')].find(item => item.textContent?.includes(label));
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); });
  };
  try {
    await act(async () => root.render(<ContactsApp />));
    expect(element.textContent).toContain('First tow is on Tito Jun');
    await click('Call tow');
    expect(tow).not.toHaveBeenCalled();
    await click('Confirm tow');
    expect(tow).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    release(); bridge.dispose(); element.remove();
  }
});
