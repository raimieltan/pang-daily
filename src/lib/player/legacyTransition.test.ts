import { describe, expect, it, vi } from 'vitest';
import { LEGACY_SAVES, TRANSITION_KEY, inspectLegacy, retireLegacy, type BrowserStorage } from './legacyTransition';
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }) };
}
const vehicleKey = LEGACY_SAVES[0].key;
describe('development save version detection', () => {
  it.each([1, 2])('detects vehicle save version %i independently of the key suffix', version => {
    const local = storage(), session = storage({ [vehicleKey]: JSON.stringify({ version, walletPhp: 5000 }) });
    expect(inspectLegacy({ local, session }).find(save => save.area === 'session' && save.key === vehicleKey)).toMatchObject({ status: 'recognized', version });
  });
  it.each([1, 2, 3, 4])('detects social save version %i', version => {
    expect(inspectLegacy({ local: storage({ 'pang-daily.social-session.v1': JSON.stringify({ version }) }), session: storage() })[4]).toMatchObject({ status: 'recognized', version });
  });
  it.each(['{', 'null', '[]', '42', '{}', '{"version":"1"}', '{"version":1.5}', '{"version":1e400}'])('handles malformed envelope %s', raw => {
    expect(inspectLegacy({ local: storage({ [vehicleKey]: raw }), session: storage() })[0].status).toBe('corrupt');
  });
  it.each([0, 99])('identifies unsupported old/future version %i without restoring it', version => {
    expect(inspectLegacy({ local: storage({ [vehicleKey]: JSON.stringify({ version }) }), session: storage() })[0]).toMatchObject({ status: 'unsupported', version });
  });
});
describe('one-time retirement after confirmed server hydration', () => {
  it('marks a fresh browser complete without touching presentation settings', () => {
    const local = storage({ 'pang-daily.audio.v1': '{"master":0.4}', 'other-app': 'keep' }), session = storage();
    expect(retireLegacy({ local, session })).toMatchObject({ status: 'complete', hadLegacy: false, marked: true });
    expect(local.values.get('pang-daily.audio.v1')).toBe('{"master":0.4}');
    expect(local.values.get('other-app')).toBe('keep');
  });
  it.each(['matched', 'conflicting', 'corrupt', 'unsupported'])('retires %s development data with the same server-wins policy', kind => {
    const raw = kind === 'corrupt' ? '{' : JSON.stringify({ version: kind === 'unsupported' ? 99 : 2, walletPhp: kind === 'conflicting' ? 999999999 : 5000, vehicles: { arbitrary: { condition: 500 } } });
    const local = storage({ [vehicleKey]: raw }), session = storage({ [vehicleKey]: raw });
    expect(retireLegacy({ local, session })).toMatchObject({ status: 'complete', hadLegacy: true });
    expect(local.values.has(vehicleKey)).toBe(false); expect(session.values.has(vehicleKey)).toBe(false);
    // Retirement never receives a server writer; unsafe browser values cannot enter a save.
  });
  it('records completion before deleting any key and is idempotent on retry', () => {
    const local = storage(), session = storage({ [vehicleKey]: '{"version":1}' });
    session.removeItem.mockImplementation(key => { expect(local.values.has(TRANSITION_KEY)).toBe(true); session.values.delete(key); });
    retireLegacy({ local, session }); retireLegacy({ local, session });
    expect(local.setItem).toHaveBeenCalledOnce(); expect(session.removeItem).toHaveBeenCalledOnce();
  });
  it('preserves all legacy blobs if writing completion fails, then recovers on retry', () => {
    const local = storage({ [vehicleKey]: '{"version":2}' }), session = storage();
    local.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    expect(retireLegacy({ local, session })).toMatchObject({ status: 'storage-unavailable', marked: false });
    expect(local.values.has(vehicleKey)).toBe(true); expect(local.removeItem).not.toHaveBeenCalled();
    expect(retireLegacy({ local, session }).status).toBe('complete');
  });
  it('keeps the completion marker when final cleanup fails and retries only cleanup', () => {
    const local = storage(), session = storage({ [vehicleKey]: '{"version":2}' });
    session.removeItem.mockImplementationOnce(() => { throw new Error('Blocked'); });
    expect(retireLegacy({ local, session })).toMatchObject({ status: 'cleanup-pending', marked: true });
    expect(local.values.has(TRANSITION_KEY)).toBe(true); expect(session.values.has(vehicleKey)).toBe(true);
    expect(retireLegacy({ local, session }).status).toBe('complete');
    expect(local.setItem).toHaveBeenCalledOnce();
  });
  it('can retire fixture data written after completion without replaying a migration', () => {
    const local = storage(), session = storage();
    retireLegacy({ local, session }); session.values.set(vehicleKey, '{"version":1}');
    expect(retireLegacy({ local, session }).status).toBe('complete');
    expect(local.setItem).toHaveBeenCalledOnce(); expect(session.values.has(vehicleKey)).toBe(false);
  });
  it('handles unavailable storage and malformed markers without throwing', () => {
    expect(retireLegacy({})).toMatchObject({ status: 'storage-unavailable', marked: false });
    const blocked: BrowserStorage = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); }, removeItem() { throw new Error('Denied'); } };
    expect(() => retireLegacy({ local: blocked, session: blocked })).not.toThrow();
    const local = storage({ [TRANSITION_KEY]: 'corrupt' });
    expect(retireLegacy({ local, session: storage() }).status).toBe('complete');
  });
  it('preserves a concurrently replaced blob and offers another cleanup attempt', () => {
    const local = storage(), session = storage({ [vehicleKey]: '{"version":1}' });
    local.setItem.mockImplementation((key, value) => { local.values.set(key, value); session.values.set(vehicleKey, '{"version":2}'); });
    expect(retireLegacy({ local, session }).status).toBe('cleanup-pending');
    expect(session.values.get(vehicleKey)).toBe('{"version":2}');
    expect(retireLegacy({ local, session }).status).toBe('complete');
  });
});
