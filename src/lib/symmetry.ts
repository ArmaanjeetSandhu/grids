import { keyOf, step, type Axis } from './crossword';

export type SymmetryKey =
	'diagonal' | 'antidiagonal' | 'vertical' | 'horizontal' | 'rot180' | 'rot90';

type Transform = (r: number, c: number, rows: number, cols: number) => [number, number];

export interface Symmetry {
	key: SymmetryKey;
	label: string;
	short: string;
	squareOnly: boolean;
	transform: Transform;
}

export const SYMMETRIES: readonly Symmetry[] = [
	{
		key: 'diagonal',
		label: 'Diagonal mirror',
		short: 'diagonal',
		squareOnly: true,
		transform: (r, c) => [c, r]
	},
	{
		key: 'antidiagonal',
		label: 'Anti-diagonal mirror',
		short: 'anti-diagonal',
		squareOnly: true,
		transform: (r, c, rows, cols) => [cols - 1 - c, rows - 1 - r]
	},
	{
		key: 'vertical',
		label: 'Vertical mirror',
		short: 'vertical',
		squareOnly: false,
		transform: (r, c, rows, cols) => [r, cols - 1 - c]
	},
	{
		key: 'horizontal',
		label: 'Horizontal mirror',
		short: 'horizontal',
		squareOnly: false,
		transform: (r, c, rows) => [rows - 1 - r, c]
	},
	{
		key: 'rot180',
		label: '180° rotation',
		short: '180°',
		squareOnly: false,
		transform: (r, c, rows, cols) => [rows - 1 - r, cols - 1 - c]
	},
	{
		key: 'rot90',
		label: '90° rotation',
		short: '90°',
		squareOnly: true,
		transform: (r, c, rows) => [c, rows - 1 - r]
	}
];

const BY_KEY = new Map(SYMMETRIES.map((s) => [s.key, s]));

const CORNERS = [
	[0, 0],
	[0, 1],
	[1, 1],
	[1, 0]
];
const IDENTITY = [0, 1, 2, 3];
const PERMS = new Map(
	SYMMETRIES.map((s) => [
		s.key,
		CORNERS.map(([r, c]) => {
			const [tr, tc] = s.transform(r, c, 2, 2);
			return CORNERS.findIndex(([cr, cc]) => cr === tr && cc === tc);
		})
	])
);

const TRANSPOSED: Partial<Record<SymmetryKey, SymmetryKey>> = {
	vertical: 'horizontal',
	horizontal: 'vertical'
};

export const transposeSymmetry = (keys: readonly SymmetryKey[]): SymmetryKey[] => [
	...new Set(keys.map((k) => TRANSPOSED[k] ?? k))
];

export function closure(keys: Iterable<SymmetryKey>): Set<SymmetryKey> {
	const generators = [...new Set(keys)].map((k) => PERMS.get(k)!);
	const seen = new Set([IDENTITY.join()]);
	const queue = [IDENTITY];
	for (const p of queue) {
		for (const g of generators) {
			const next = p.map((i) => g[i]);
			if (seen.has(next.join())) continue;
			seen.add(next.join());
			queue.push(next);
		}
	}
	return new Set(SYMMETRIES.filter((s) => seen.has(PERMS.get(s.key)!.join())).map((s) => s.key));
}

function reason(key: SymmetryKey, keys: SymmetryKey[]): SymmetryKey[] | null {
	let best: SymmetryKey[] | null = null;
	for (let mask = 1; mask < 1 << keys.length; mask++) {
		const subset = keys.filter((_, i) => mask & (1 << i));
		if (best && subset.length >= best.length) continue;
		if (closure(subset).has(key)) best = subset;
	}
	return best;
}

export const fitsGrid = (key: SymmetryKey, rows: number, cols: number) =>
	rows === cols || !BY_KEY.get(key)!.squareOnly;

export interface SymmetryOption extends Symmetry {
	available: boolean;
	checked: boolean;
	impliedBy: SymmetryKey[] | null;
}

export function symmetryOptions(
	chosen: readonly SymmetryKey[],
	rows: number,
	cols: number
): SymmetryOption[] {
	const usable = chosen.filter((k) => fitsGrid(k, rows, cols));
	const active = closure(usable);
	return SYMMETRIES.map((s) => {
		const available = fitsGrid(s.key, rows, cols);
		const checked = available && active.has(s.key);
		const impliedBy = checked
			? reason(
					s.key,
					usable.filter((k) => k !== s.key)
				)
			: null;
		return { ...s, available, checked, impliedBy };
	});
}

const GROUP_NAMES: Record<string, string> = {
	'': 'Off',
	rot180: '180°',
	vertical: 'Vertical',
	horizontal: 'Horizontal',
	diagonal: 'Diagonal',
	antidiagonal: 'Anti-diagonal',
	'vertical,horizontal,rot180': 'Both mirrors',
	'diagonal,antidiagonal,rot180': 'Both diagonals',
	'rot180,rot90': '90°',
	'diagonal,antidiagonal,vertical,horizontal,rot180,rot90': 'Full'
};

export function describeSymmetry(active: Iterable<SymmetryKey>): string {
	const held = new Set(active);
	const id = SYMMETRIES.filter((s) => held.has(s.key))
		.map((s) => s.key)
		.join();
	return GROUP_NAMES[id] ?? `${held.size} symmetries`;
}

const activeTransforms = (active: Iterable<SymmetryKey>, rows: number, cols: number) =>
	[...active].filter((k) => fitsGrid(k, rows, cols)).map((k) => BY_KEY.get(k)!.transform);

export function counterparts(
	row: number,
	col: number,
	rows: number,
	cols: number,
	active: Iterable<SymmetryKey>
): string[] {
	const transforms = activeTransforms(active, rows, cols);
	const start = keyOf(row, col);
	const seen = new Set([start]);
	const queue: [number, number][] = [[row, col]];
	for (const [r, c] of queue) {
		for (const t of transforms) {
			const [tr, tc] = t(r, c, rows, cols);
			const key = keyOf(tr, tc);
			if (seen.has(key)) continue;
			seen.add(key);
			queue.push([tr, tc]);
		}
	}
	seen.delete(start);
	return [...seen];
}

export interface Bar {
	row: number;
	col: number;
	axis: Axis;
}

const barKey = ({ row, col, axis }: Bar) => `${row},${col},${axis}`;

function mapBar(transform: Transform, bar: Bar, rows: number, cols: number): Bar {
	const [nr, nc] = step(bar.row, bar.col, bar.axis);
	const [ar, ac] = transform(bar.row, bar.col, rows, cols);
	const [br, bc] = transform(nr, nc, rows, cols);
	return ar === br
		? { row: ar, col: Math.min(ac, bc), axis: 'across' }
		: { row: Math.min(ar, br), col: ac, axis: 'down' };
}

export function barCounterparts(
	bar: Bar,
	rows: number,
	cols: number,
	active: Iterable<SymmetryKey>
): Bar[] {
	const transforms = activeTransforms(active, rows, cols);
	const start = barKey(bar);
	const seen = new Map([[start, bar]]);
	const queue: Bar[] = [bar];
	for (const b of queue) {
		for (const t of transforms) {
			const next = mapBar(t, b, rows, cols);
			const key = barKey(next);
			if (seen.has(key)) continue;
			seen.set(key, next);
			queue.push(next);
		}
	}
	seen.delete(start);
	return [...seen.values()];
}
