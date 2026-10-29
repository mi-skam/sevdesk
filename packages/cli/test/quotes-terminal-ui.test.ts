import { consola } from 'consola';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terminalUI } from '../src/quotes/dialogue';

afterEach(() => vi.restoreAllMocks());
describe('quote terminal prompt boundary', () => {
  it('normalizes an empty result and prevents the renderer displaying undefined', async () => {
    const prompt = vi
      .spyOn(consola, 'prompt')
      .mockResolvedValueOnce(undefined as never);
    expect(await terminalUI.text('Search (Suchen)')).toBe('');
    expect(prompt).toHaveBeenCalledWith('Search (Suchen)', {
      type: 'text',
      initial: undefined,
      default: '',
      placeholder: '',
      cancel: 'symbol',
    });
  });
  it('keeps prefilled text when Enter returns its original value', async () => {
    vi.spyOn(consola, 'prompt').mockResolvedValueOnce('100.00');
    expect(await terminalUI.text('Price (Preis)', '100.00')).toBe('100.00');
  });
  it('distinguishes text cancellation from an intentionally empty value', async () => {
    vi.spyOn(consola, 'prompt').mockResolvedValueOnce(Symbol.for('cancel'));
    await expect(terminalUI.text('Search (Suchen)')).rejects.toThrow();
  });
  it('rejects missing or stale select results instead of passing undefined into the dialogue', async () => {
    const prompt = vi.spyOn(consola, 'prompt');
    for (const value of [
      undefined,
      'no-longer-available',
      Symbol.for('cancel'),
    ]) {
      prompt.mockResolvedValueOnce(value as never);
      await expect(
        terminalUI.choose('Action (Aktion)', [
          { value: 'back', label: 'Back (Zurück)' },
        ]),
      ).rejects.toThrow();
    }
  });
  it('does not open an empty select', async () => {
    const prompt = vi.spyOn(consola, 'prompt');
    await expect(terminalUI.choose('Action (Aktion)', [])).rejects.toThrow(
      'No available options',
    );
    expect(prompt).not.toHaveBeenCalled();
  });
  it('passes the current selection to the renderer', async () => {
    const prompt = vi.spyOn(consola, 'prompt').mockResolvedValueOnce('gross');
    const choices = [
      { value: 'net', label: 'Net (Netto)' },
      { value: 'gross', label: 'Gross (Brutto)' },
    ];
    expect(
      await terminalUI.choose('Price mode (Preisart)', choices, 'gross'),
    ).toBe('gross');
    expect(prompt).toHaveBeenCalledWith(
      'Price mode (Preisart)',
      expect.objectContaining({ initial: 'gross' }),
    );
  });
  it('only accepts an explicit true confirmation', async () => {
    const prompt = vi.spyOn(consola, 'prompt');
    for (const value of [undefined, Symbol.for('cancel'), false]) {
      prompt.mockResolvedValueOnce(value as never);
      expect(await terminalUI.confirm('Save (Speichern)')).toBe(false);
    }
    prompt.mockResolvedValueOnce(true);
    expect(await terminalUI.confirm('Save (Speichern)')).toBe(true);
  });
});
