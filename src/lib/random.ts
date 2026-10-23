import {
	cheaterSquares,
	constraintApplies,
	consecutiveUnches,
	unchedSquares,
	whiteRegions,
	type ConstraintKey
} from './constraints';
import {
	AXES,
	allKeys,
	keyOf,
	lattice,
	parseKey,
	step,
	type Axis,
	type GridMode,
	type Walls
} from './crossword';
import {
	barCounterparts,
	barKey,
	counterparts,
	describeSymmetry,
	symmetryObeyed,
	type Bar,
	type SymmetryKey
} from './symmetry';

const RULE_NAMES: Record<ConstraintKey, string> = {
	interlock: 'all-over interlock',
	unches: 'no unches',
	consecutiveUnches: 'no consecutive unches',
	cheaters: 'no cheater squares',
	twoLetters: 'no two-letter entries'
};

export interface Rules {
	symmetry: SymmetryKey[];
	constraints: ConstraintKey[];
}

export function randomRules(
	mode: GridMode,
	symmetry: readonly SymmetryKey[],
	constraints: readonly ConstraintKey[],
	hasBlack: boolean
): Rules {
	return {
		symmetry: [...symmetry],
		constraints: constraints.filter((k) => constraintApplies(k, mode, hasBlack))
	};
}

export const blockLimit = (rows: number, cols: number) => Math.floor((rows * cols) / 6);

export function barTarget(rows: number, cols: number) {
	const hi = Math.min(7, Math.max(rows, cols) * 0.8);
	return { lo: Math.min(5.5, hi), hi };
}

interface Runs {
	across: Int16Array;
	down: Int16Array;
	entries: number;
	letters: number;
}

function runLengths(rows: number, cols: number, walls: Walls): Runs {
	const across = new Int16Array(rows * cols);
	const down = new Int16Array(rows * cols);
	const { white } = lattice(rows, cols, walls);
	let entries = 0;
	let letters = 0;
	const sweep = (axis: Axis, lines: number, length: number, out: Int16Array) => {
		const at = (line: number, i: number) => (axis === 'across' ? [line, i] : [i, line]);
		for (let line = 0; line < lines; line++) {
			let start = 0;
			for (let i = 0; i < length; i++) {
				const [r, c] = at(line, i);
				if (!white(r, c)) {
					start = i + 1;
					continue;
				}
				const [nr, nc] = step(r, c, axis);
				if (white(nr, nc) && !walls.bar(r, c, axis)) continue;
				const len = i - start + 1;
				for (let j = start; j <= i; j++) {
					const [jr, jc] = at(line, j);
					out[jr * cols + jc] = len;
				}
				if (len >= 2) {
					entries++;
					letters += len;
				}
				start = i + 1;
			}
		}
	};
	sweep('across', rows, cols, across);
	sweep('down', cols, rows, down);
	return { across, down, entries, letters };
}

const meanLength = (runs: Runs) => (runs.entries === 0 ? Infinity : runs.letters / runs.entries);

function orphans(runs: Runs): number {
	let n = 0;
	for (let i = 0; i < runs.across.length; i++) if (runs.across[i] === 1 && runs.down[i] === 1) n++;
	return n;
}

function brokenConstraints(
	rows: number,
	cols: number,
	walls: Walls,
	constraints: readonly ConstraintKey[],
	runs: Runs,
	firstOnly: boolean
): ConstraintKey[] {
	const held = new Set(constraints);
	const broken: ConstraintKey[] = [];
	const done = () => firstOnly && broken.length > 0;

	if (held.has('twoLetters') || held.has('unches')) {
		let two = false;
		let unch = false;
		for (let i = 0; i < runs.across.length; i++) {
			const a = runs.across[i];
			const d = runs.down[i];
			if (a === 0) continue;
			if (a === 2 || d === 2) two = true;
			if (a === 1 || d === 1) unch = true;
		}
		if (held.has('twoLetters') && two) broken.push('twoLetters');
		if (held.has('unches') && unch) broken.push('unches');
		if (done()) return broken;
	}
	if (held.has('interlock') && whiteRegions(rows, cols, walls).count > 1) {
		broken.push('interlock');
		if (done()) return broken;
	}
	if (
		held.has('consecutiveUnches') &&
		!broken.includes('unches') &&
		consecutiveUnches(unchedSquares(rows, cols, walls), walls).length > 0
	) {
		broken.push('consecutiveUnches');
		if (done()) return broken;
	}
	if (
		held.has('cheaters') &&
		cheaterSquares(rows, cols, walls, held.has('unches'), held.has('consecutiveUnches')).size > 0
	)
		broken.push('cheaters');
	return broken;
}

export const hasRules = (rules: Rules) => rules.symmetry.length > 0 || rules.constraints.length > 0;

export function brokenRules(rows: number, cols: number, walls: Walls, rules: Rules): string[] {
	const broken: string[] = [];
	if (rules.symmetry.length > 0 && !symmetryObeyed(rows, cols, walls, rules.symmetry))
		broken.push(`symmetry (${describeSymmetry(rules.symmetry)})`);
	const runs = runLengths(rows, cols, walls);
	for (const key of brokenConstraints(rows, cols, walls, rules.constraints, runs, false))
		broken.push(RULE_NAMES[key]);
	return broken;
}

export const meanEntryLength = (rows: number, cols: number, walls: Walls) =>
	meanLength(runLengths(rows, cols, walls));

function weightedOrder<T>(items: readonly T[], weight: (item: T) => number, random: () => number) {
	return items
		.map((item) => ({ item, rank: Math.log(1 - random()) / Math.max(weight(item), 1e-6) }))
		.sort((a, b) => b.rank - a.rank)
		.map((x) => x.item);
}

interface Search<T> {
	rows: number;
	cols: number;
	orbits: T[][];
	walls: (placed: ReadonlySet<T>) => Walls;
	weight: (orbit: readonly T[], runs: Runs) => number;
	allowed: (orbit: readonly T[], placed: ReadonlySet<T>) => boolean;
	finished: (runs: Runs, placed: ReadonlySet<T>) => boolean;
	better: (a: { runs: Runs; added: T[] }, b: { runs: Runs; added: T[] }) => boolean;
	constraints: readonly ConstraintKey[];
	budget: number;
	random: () => number;
}

const MAX_ATTEMPTS = 200;

function search<T>(s: Search<T>): T[] {
	const { rows, cols } = s;
	const start = new Set<T>();
	const startRuns = runLengths(rows, cols, s.walls(start));
	const orphanCap = orphans(startRuns);
	const deadline = Date.now() + s.budget;
	let best = { runs: startRuns, added: [] as T[] };

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (attempt > 0 && Date.now() > deadline) break;
		const placed = new Set<T>();
		const walls = s.walls(placed);
		const added: T[] = [];
		let runs = startRuns;
		let pool = s.orbits;

		while (pool.length > 0 && !s.finished(runs, placed)) {
			const tried = new Set<T[]>();
			let moved = false;
			for (const orbit of weightedOrder(pool, (o) => s.weight(o, runs), s.random)) {
				tried.add(orbit);
				if (!s.allowed(orbit, placed)) continue;
				for (const t of orbit) placed.add(t);
				const next = runLengths(rows, cols, walls);
				if (
					orphans(next) <= orphanCap &&
					brokenConstraints(rows, cols, walls, s.constraints, next, true).length === 0
				) {
					runs = next;
					added.push(...orbit);
					moved = true;
					break;
				}
				for (const t of orbit) placed.delete(t);
			}
			pool = pool.filter((o) => !tried.has(o));
			if (!moved) break;
		}

		const result = { runs, added };
		if (s.better(result, best)) best = result;
		if (s.finished(runs, placed)) return added;
	}
	return best.added;
}

export interface BlockOptions {
	rows: number;
	cols: number;
	walls: Walls;
	rules: Rules;
	locked: (key: string) => boolean;
	limit: number;
	budget?: number;
	random?: () => number;
}

export function randomBlocks(o: BlockOptions): string[] {
	const { rows, cols, rules } = o;
	const keys = allKeys(rows, cols);
	const base = new Set(keys.filter((k) => o.walls.black(k)));
	const room = o.limit - base.size;
	if (room <= 0) return [];

	const seen = new Set<string>();
	const orbits: string[][] = [];
	for (const key of keys) {
		if (base.has(key) || seen.has(key)) continue;
		const { row, col } = parseKey(key);
		const orbit = [key, ...counterparts(row, col, rows, cols, rules.symmetry)];
		for (const k of orbit) seen.add(k);
		if (orbit.some((k) => base.has(k) || o.locked(k))) continue;
		orbits.push(orbit);
	}
	if (orbits.length === 0) return [];
	const smallest = Math.min(...orbits.map((orbit) => orbit.length));

	const index = (key: string) => {
		const { row, col } = parseKey(key);
		return row * cols + col;
	};

	return search<string>({
		rows,
		cols,
		orbits,
		walls: (placed) => ({
			black: (k) => base.has(k) || placed.has(k),
			bar: o.walls.bar
		}),
		weight: (orbit, runs) =>
			orbit.reduce((w, k) => {
				const i = index(k);
				return w + runs.across[i] ** 2 + runs.down[i] ** 2;
			}, 0),
		allowed: (orbit, placed) => placed.size + orbit.length <= room,
		finished: (_, placed) => room - placed.size < smallest,
		better: (a, b) => a.added.length > b.added.length,
		constraints: rules.constraints,
		budget: o.budget ?? 500,
		random: o.random ?? Math.random
	});
}

export interface BarOptions {
	rows: number;
	cols: number;
	walls: Walls;
	rules: Rules;
	locked: (bar: Bar) => boolean;
	target: number;
	budget?: number;
	random?: () => number;
}

export function randomBars(o: BarOptions): Bar[] {
	const { rows, cols, rules } = o;
	const seen = new Set<string>();
	const orbits: string[][] = [];
	const bars = new Map<string, Bar>();

	const usable = (b: Bar) => {
		const [nr, nc] = step(b.row, b.col, b.axis);
		return (
			nr < rows &&
			nc < cols &&
			!o.walls.bar(b.row, b.col, b.axis) &&
			!o.walls.black(keyOf(b.row, b.col)) &&
			!o.walls.black(keyOf(nr, nc)) &&
			!o.locked(b)
		);
	};

	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++)
			for (const axis of AXES) {
				const bar: Bar = { row: r, col: c, axis };
				const [nr, nc] = step(r, c, axis);
				if (nr >= rows || nc >= cols || seen.has(barKey(bar))) continue;
				const orbit = [bar, ...barCounterparts(bar, rows, cols, rules.symmetry)];
				for (const b of orbit) seen.add(barKey(b));
				if (!orbit.every(usable)) continue;
				for (const b of orbit) bars.set(barKey(b), b);
				orbits.push(orbit.map(barKey));
			}
	if (orbits.length === 0) return [];

	const added = search<string>({
		rows,
		cols,
		orbits,
		walls: (placed) => ({
			black: o.walls.black,
			bar: (row, col, axis) => o.walls.bar(row, col, axis) || placed.has(barKey({ row, col, axis }))
		}),
		weight: (orbit, runs) =>
			orbit.reduce((w, k) => {
				const b = bars.get(k)!;
				const i = b.row * cols + b.col;
				return w + (b.axis === 'across' ? runs.across[i] : runs.down[i]) ** 2;
			}, 0),
		allowed: () => true,
		finished: (runs) => meanLength(runs) <= o.target,
		better: (a, b) => meanLength(a.runs) < meanLength(b.runs),
		constraints: rules.constraints,
		budget: o.budget ?? 500,
		random: o.random ?? Math.random
	});
	return added.map((k) => bars.get(k)!);
}
