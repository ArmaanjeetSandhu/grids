export type Axis = 'across' | 'down';

export type GridMode = 'squares' | 'bars';

export interface Square {
	black: boolean;
	letter: string;
	barRight: boolean;
	barBottom: boolean;
}

export type Grid = Record<string, Square>;

export const MIN_SIZE = 5;
export const MAX_SIZE = 21;

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

export const emptySquare = (): Square => ({
	black: false,
	letter: '',
	barRight: false,
	barBottom: false
});

export const barField = (axis: Axis): 'barRight' | 'barBottom' =>
	axis === 'across' ? 'barRight' : 'barBottom';

export interface Walls {
	black: (key: string) => boolean;
	bar: (row: number, col: number, axis: Axis) => boolean;
}

export const wallsOf = (grid: Grid): Walls => ({
	black: (key) => grid[key].black,
	bar: (row, col, axis) => grid[keyOf(row, col)][barField(axis)]
});

export const step = (row: number, col: number, axis: Axis): [number, number] =>
	axis === 'across' ? [row, col + 1] : [row + 1, col];

export function runFrom(
	start: string,
	axis: Axis,
	walls: Walls,
	rows: number,
	cols: number
): string[] {
	const keys = [start];
	let { row, col } = parseKey(start);
	for (;;) {
		if (walls.bar(row, col, axis)) break;
		[row, col] = step(row, col, axis);
		if (row >= rows || col >= cols) break;
		const key = keyOf(row, col);
		if (walls.black(key)) break;
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

export function numberEntries(rows: number, cols: number, walls: Walls): Numbering {
	const white = (r: number, c: number) =>
		r >= 0 && c >= 0 && r < rows && c < cols && !walls.black(keyOf(r, c));

	const joined = (r: number, c: number, axis: Axis) => {
		const [nr, nc] = step(r, c, axis);
		return white(r, c) && white(nr, nc) && !walls.bar(r, c, axis);
	};
	const joinedBefore = (r: number, c: number, axis: Axis) =>
		axis === 'across' ? joined(r, c - 1, axis) : joined(r - 1, c, axis);

	const numbers = new Map<string, number>();
	const entries: Entry[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (!white(r, c)) continue;
			const across = !joinedBefore(r, c, 'across') && joined(r, c, 'across');
			const down = !joinedBefore(r, c, 'down') && joined(r, c, 'down');
			if (!across && !down) continue;
			const key = keyOf(r, c);
			const number = numbers.size + 1;
			numbers.set(key, number);
			if (across)
				entries.push({ number, axis: 'across', keys: runFrom(key, 'across', walls, rows, cols) });
			if (down)
				entries.push({ number, axis: 'down', keys: runFrom(key, 'down', walls, rows, cols) });
		}
	}
	return { numbers, entries };
}
