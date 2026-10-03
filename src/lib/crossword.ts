export type Axis = 'across' | 'down';

export interface Square {
	black: boolean;
	letter: string;
}

export type Grid = Record<string, Square>;

export const MIN_SIZE = 2;
export const MAX_SIZE = 40;

export const validSize = (n: unknown): n is number =>
	typeof n === 'number' && Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE;

export const keyOf = (row: number, col: number) => `${row},${col}`;

export function parseKey(key: string) {
	const [row, col] = key.split(',').map(Number);
	return { row, col };
}

export function allKeys(rows: number, cols: number): string[] {
	const keys: string[] = [];
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) keys.push(keyOf(r, c));
	return keys;
}

export function runFrom(
	start: string,
	axis: Axis,
	isBlack: (key: string) => boolean,
	rows: number,
	cols: number
): string[] {
	const { row, col } = parseKey(start);
	const dr = axis === 'down' ? 1 : 0;
	const dc = axis === 'across' ? 1 : 0;
	const keys = [start];
	for (let r = row + dr, c = col + dc; r < rows && c < cols; r += dr, c += dc) {
		const key = keyOf(r, c);
		if (isBlack(key)) break;
		keys.push(key);
	}
	return keys;
}

export interface Entry {
	number: number;
	axis: Axis;
	keys: string[];
}

export interface Numbering {
	numbers: Map<string, number>;
	entries: Entry[];
}

export const entryId = (e: Pick<Entry, 'axis' | 'keys'>) => `${e.axis}:${e.keys.join('|')}`;

export function numberEntries(
	rows: number,
	cols: number,
	isBlack: (key: string) => boolean
): Numbering {
	const white = (r: number, c: number) =>
		r >= 0 && c >= 0 && r < rows && c < cols && !isBlack(keyOf(r, c));

	const numbers = new Map<string, number>();
	const entries: Entry[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (!white(r, c)) continue;
			const across = !white(r, c - 1) && white(r, c + 1);
			const down = !white(r - 1, c) && white(r + 1, c);
			if (!across && !down) continue;
			const key = keyOf(r, c);
			const number = numbers.size + 1;
			numbers.set(key, number);
			if (across)
				entries.push({ number, axis: 'across', keys: runFrom(key, 'across', isBlack, rows, cols) });
			if (down)
				entries.push({ number, axis: 'down', keys: runFrom(key, 'down', isBlack, rows, cols) });
		}
	}
	return { numbers, entries };
}
