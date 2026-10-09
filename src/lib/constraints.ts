import { keyOf, type Walls } from './crossword';

export type ConstraintKey = 'interlock' | 'unches';

export interface Constraint {
	key: ConstraintKey;
	label: string;
	short: string;
	hint: string;
	ready: boolean;
}

export const CONSTRAINTS: readonly Constraint[] = [
	{
		key: 'interlock',
		label: 'All-over interlock',
		short: 'interlock',
		hint: 'Every white square should sit in one connected region.',
		ready: true
	},
	{
		key: 'unches',
		label: 'No unches',
		short: 'no unches',
		hint: 'Every white square should be both across and down.',
		ready: false
	}
];

const BY_KEY = new Map(CONSTRAINTS.map((c) => [c.key, c]));

export const constraintLabel = (key: ConstraintKey) => BY_KEY.get(key)!.label;

export const REGION_COLOURS = 4;

export interface Regions {
	of: Map<string, number>;
	sizes: number[];
	count: number;
}

const STEPS: readonly [number, number][] = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1]
];

const TOUCHING: readonly [number, number][] = [
	[-1, -1],
	[-1, 0],
	[-1, 1],
	[0, -1],
	[0, 1],
	[1, -1],
	[1, 0],
	[1, 1]
];

function barred(row: number, col: number, dr: number, dc: number, walls: Walls): boolean {
	if (dr === 0) return walls.bar(row, Math.min(col, col + dc), 'across');
	return walls.bar(Math.min(row, row + dr), col, 'down');
}

export function whiteRegions(rows: number, cols: number, walls: Walls): Regions {
	const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
	const white = (r: number, c: number) => inside(r, c) && !walls.black(keyOf(r, c));

	const of = new Map<string, number>();
	const sizes: number[] = [];

	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const start = keyOf(r, c);
			if (!white(r, c) || of.has(start)) continue;
			const region = sizes.length;
			let size = 0;
			of.set(start, region);
			const queue: [number, number][] = [[r, c]];
			for (const [qr, qc] of queue) {
				size++;
				for (const [dr, dc] of STEPS) {
					const nr = qr + dr;
					const nc = qc + dc;
					if (!white(nr, nc)) continue;
					if (barred(qr, qc, dr, dc, walls)) continue;
					const key = keyOf(nr, nc);
					if (of.has(key)) continue;
					of.set(key, region);
					queue.push([nr, nc]);
				}
			}
			sizes.push(size);
		}

	return { of, sizes, count: sizes.length };
}

function adjacency(regions: Regions, rows: number, cols: number): Set<number>[] {
	const adj = Array.from({ length: regions.count }, () => new Set<number>());
	const link = (a: number, b: number) => {
		if (a === b) return;
		adj[a].add(b);
		adj[b].add(a);
	};

	const around = (r: number, c: number) => {
		const found: number[] = [];
		for (const [dr, dc] of TOUCHING) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
			const region = regions.of.get(keyOf(nr, nc));
			if (region !== undefined && !found.includes(region)) found.push(region);
		}
		return found;
	};

	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const here = regions.of.get(keyOf(r, c));
			const near = around(r, c);
			if (here !== undefined) {
				for (const there of near) link(here, there);
				continue;
			}
			for (let i = 0; i < near.length; i++)
				for (let j = i + 1; j < near.length; j++) link(near[i], near[j]);
		}
	return adj;
}

const BUDGET = 200_000;

function fourColour(adj: Set<number>[]): number[] {
	const n = adj.length;
	const order = [...adj.keys()].sort((a, b) => adj[b].size - adj[a].size);
	const colour = new Array<number>(n).fill(-1);
	let budget = BUDGET;

	const search = (i: number): boolean => {
		if (i === n) return true;
		if (budget-- <= 0) return false;
		const v = order[i];
		const used = new Set<number>();
		for (const u of adj[v]) if (colour[u] >= 0) used.add(colour[u]);
		for (let c = 0; c < REGION_COLOURS; c++) {
			if (used.has(c)) continue;
			colour[v] = c;
			if (search(i + 1)) return true;
			colour[v] = -1;
		}
		return false;
	};

	if (search(0)) return colour;

	colour.fill(-1);
	for (const v of order) {
		const clashes = new Array<number>(REGION_COLOURS).fill(0);
		for (const u of adj[v]) if (colour[u] >= 0) clashes[colour[u]]++;
		let best = 0;
		for (let c = 1; c < REGION_COLOURS; c++) if (clashes[c] < clashes[best]) best = c;
		colour[v] = best;
	}
	return colour;
}

export function regionColours(regions: Regions, rows: number, cols: number): Map<string, number> {
	if (regions.count <= 1) return new Map();

	const colour = fourColour(adjacency(regions, rows, cols));

	let biggest = 0;
	for (let i = 1; i < regions.count; i++)
		if (regions.sizes[i] > regions.sizes[biggest]) biggest = i;

	const palette = [...new Array<number>(REGION_COLOURS).keys()];
	const white = colour[biggest];
	palette[white] = 0;
	palette[0] = white;

	const painted = new Map<string, number>();
	for (const [key, region] of regions.of) painted.set(key, palette[colour[region]]);
	return painted;
}

export function describeConstraints(
	chosen: Iterable<ConstraintKey>,
	regions: Regions | null
): string {
	const held = new Set(chosen);
	if (held.size === 0) return 'Off';
	if (held.has('interlock') && regions)
		return regions.count <= 1 ? 'Connected' : `${regions.count} regions`;
	return CONSTRAINTS.filter((c) => held.has(c.key))
		.map((c) => c.short)
		.join(' + ');
}
