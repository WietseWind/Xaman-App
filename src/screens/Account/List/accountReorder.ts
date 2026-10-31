export interface RowLayout {
    key: string;
    height: number;
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// Compare the dragged top against the centres in the list with its own gap removed.
// This remains symmetric at both ends even when large text gives rows different heights.
export function insertionIndex(rows: RowLayout[], activeKey: string, top: number): number {
    let offset = 0;
    let index = 0;
    rows.forEach((row) => {
        if (row.key === activeKey) return;
        if (top > offset + row.height / 2) index += 1;
        offset += row.height;
    });
    return index;
}

export function edgeScrollSpeed(y: number, viewportHeight: number): number {
    const edge = Math.min(80, viewportHeight / 4);
    if (edge <= 0) return 0;
    if (y < edge) return -480 * clamp((edge - y) / edge, 0, 1);
    if (y > viewportHeight - edge) return 480 * clamp((y - viewportHeight + edge) / edge, 0, 1);
    return 0;
}

export function moveAccount<T>(items: T[], from: number, to: number): T[] {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}
