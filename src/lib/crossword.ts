export type Axis = 'across' | 'down';

export type GridMode = 'blocks' | 'bars';

export interface Square {
	black: boolean;
	letter: string;
	barRight: boolean;
	barBottom: boolean;
	circled: boolean;
	rebus: boolean;
}

export type Grid = Record<string, Square>;

export const MIN_SIZE = 5;
export const MAX_SIZE = 21;

export const REBUS_MAX = 5;

const SINGLE_LETTER = /^\p{L}$/u;
const REBUS_CHAR = /^[\p{L}\p{N}\p{P}\p{S}]$/u;

export const isLetter = (ch: string) => SINGLE_LETTER.test(ch);

export const isRebusChar = (ch: string) => REBUS_CHAR.test(ch);

export const needsRebus = (value: string) => value !== '' && !isLetter(value);

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

export const transposeKey = (key: string) => {
	const here = parseKey(key);
	return keyOf(here.col, here.row);
};

export const emptySquare = (): Square => ({
	black: false,
	letter: '',
	barRight: false,
	barBottom: false,
	circled: false,
	rebus: false
});

export function transposeGrid(grid: Grid, rows: number, cols: number): Grid {
	const flipped: Grid = {};
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const square = grid[keyOf(r, c)];
			flipped[keyOf(c, r)] = {
				black: square.black,
				letter: square.letter,
				barRight: square.barBottom,
				barBottom: square.barRight,
				circled: square.circled,
				rebus: square.rebus
			};
		}
	return flipped;
}

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

export function entryStart(
	key: string,
	axis: Axis,
	walls: Walls,
	rows: number,
	cols: number
): string {
	let { row, col } = parseKey(key);
	for (;;) {
		const [pr, pc] = axis === 'across' ? [row, col - 1] : [row - 1, col];
		if (pr < 0 || pc < 0 || pr >= rows || pc >= cols) break;
		if (walls.black(keyOf(pr, pc)) || walls.bar(pr, pc, axis)) break;
		[row, col] = [pr, pc];
	}
	return keyOf(row, col);
}

export const entryAt = (key: string, axis: Axis, walls: Walls, rows: number, cols: number) =>
	runFrom(entryStart(key, axis, walls, rows, cols), axis, walls, rows, cols);

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

export const otherAxis = (axis: Axis): Axis => (axis === 'across' ? 'down' : 'across');

export function transposeEntryId(id: string): string {
	const split = id.indexOf(':');
	if (split < 0) return id;
	const axis = id.slice(0, split) as Axis;
	const keys = id
		.slice(split + 1)
		.split('|')
		.map(transposeKey);
	return entryId({ axis: otherAxis(axis), keys });
}

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
