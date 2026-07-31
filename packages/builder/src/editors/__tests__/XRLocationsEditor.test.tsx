/**
 * XRLocationsEditor — the GPS position-source toggle (fixed coordinates vs
 * dynamic point-set binding, v0.9.86). The runtime had supported `pointName`
 * expansion since v0.9.83, but the editor offered no field for it — the User
 * Guide had to document the binding as "project-file only". These pin the
 * authoring path end-to-end at the component level.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { XRLocationsEditor, type XRLocationEntry } from '../XRLocationsEditor';

const baseEntry = (over: Partial<XRLocationEntry> = {}): XRLocationEntry => ({
  id: 'loc_1',
  name: 'Front gate',
  lat: 51.5,
  lng: -0.12,
  target: 'beat_next',
  ...over,
});

const renderEditor = (locations: XRLocationEntry[], over: any = {}) => {
  const onChange = vi.fn();
  const utils = render(
    <XRLocationsEditor
      flavour="gps"
      locations={locations}
      onChange={onChange}
      availableTargets={[{ id: 'beat_next', name: 'Next' }]}
      {...over}
    />,
  );
  return { onChange, ...utils };
};

describe('XRLocationsEditor GPS point-set binding', () => {
  it('defaults to fixed coordinates and switches to dynamic with pointName: ""', () => {
    const { onChange, getByText, getByPlaceholderText } = renderEditor([baseEntry()]);
    expect(getByPlaceholderText('51.5074')).toBeTruthy(); // lat input visible

    fireEvent.click(getByText('Point set (dynamic)'));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'loc_1', pointName: '' }),
    ]);
  });

  it('shows the point-set name field instead of lat/lng when bound', () => {
    const { queryByPlaceholderText, getByPlaceholderText } = renderEditor([
      baseEntry({ pointName: 'treasure_spots' }),
    ]);
    expect(queryByPlaceholderText('51.5074')).toBeNull();
    const nameInput = getByPlaceholderText('e.g. treasure_spots') as HTMLInputElement;
    expect(nameInput.value).toBe('treasure_spots');
  });

  it('offers Set GPS Location point sets as datalist suggestions', () => {
    const { container } = renderEditor(
      [baseEntry({ pointName: '' })],
      { availablePointSets: ['treasure_spots', 'checkpoints'] },
    );
    const options = Array.from(container.querySelectorAll('datalist option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(['treasure_spots', 'checkpoints']);
  });

  it('switching back to fixed clears pointName (undefined, not "")', () => {
    const { onChange, getByText } = renderEditor([baseEntry({ pointName: 'spots' })]);
    fireEvent.click(getByText('Fixed coordinates'));
    const next = onChange.mock.calls[0][0][0];
    expect('pointName' in next && next.pointName === undefined).toBe(true);
  });

  it('does not render the toggle for the indoor flavour', () => {
    const { queryByText } = renderEditor(
      [{ id: 'l1', beaconUuid: 'beacon-a', target: 'beat_next' }],
      { flavour: 'indoor' },
    );
    expect(queryByText('Point set (dynamic)')).toBeNull();
  });
});
