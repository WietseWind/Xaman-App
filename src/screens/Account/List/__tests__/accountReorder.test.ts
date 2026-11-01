import { edgeScrollSpeed, insertionIndex, moveAccount } from '../accountReorder';

it('inserts a moved account without swapping or dropping the intervening accounts', () => {
    const original = ['A', 'B', 'C', 'D'];
    expect(moveAccount(original, 0, 3)).toEqual(['B', 'C', 'D', 'A']);
    expect(moveAccount(original, 3, 0)).toEqual(['D', 'A', 'B', 'C']);
    expect(original).toEqual(['A', 'B', 'C', 'D']);
});

it.each([0, 1, 2, 3])('starts row %i at its original position with mixed font and label heights', (index) => {
    const rows = [100, 220, 80, 130].map((height, i) => ({ key: String(i), height }));
    const top = rows.slice(0, index).reduce((sum, row) => sum + row.height, 0);
    expect(insertionIndex(rows, String(index), top)).toBe(index);
    expect(insertionIndex(rows, String(index), 0)).toBe(0);
    expect(insertionIndex(rows, String(index), 530 - rows[index].height)).toBe(3);
});

it('waits until the held top crosses a neighbour’s midpoint', () => {
    const rows = ['A', 'B', 'C'].map((key) => ({ key, height: 100 }));
    expect(insertionIndex(rows, 'B', 149)).toBe(1);
    expect(insertionIndex(rows, 'B', 151)).toBe(2);
    expect(insertionIndex(rows, 'B', 51)).toBe(1);
    expect(insertionIndex(rows, 'B', 49)).toBe(0);
});

it('uses edge proximity, so a still finger keeps scrolling in either direction', () => {
    expect(edgeScrollSpeed(0, 600)).toBe(-480);
    expect(edgeScrollSpeed(40, 600)).toBe(-240);
    expect(edgeScrollSpeed(300, 600)).toBe(0);
    expect(edgeScrollSpeed(560, 600)).toBe(240);
    expect(edgeScrollSpeed(600, 600)).toBe(480);
    expect(edgeScrollSpeed(-100, 600)).toBe(-480);
    expect(edgeScrollSpeed(1000, 600)).toBe(480);
    expect(edgeScrollSpeed(0, 0)).toBe(0);
});
