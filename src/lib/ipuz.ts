import {
	MAX_SIZE,
	MIN_SIZE,
	emptySquare,
	entryId,
	keyOf,
	needsRebus,
	numberEntries,
	validSize,
	wallsOf,
	type Axis,
	type Entry,
	type Grid,
	type GridMode
} from './crossword';
import { citedReferences, referenceKey, titled } from './references';

export interface Puzzle {
	rows: number;
	cols: number;
	mode: GridMode;
	grid: Grid;
	clues: Record<string, string>;
	title: string;
	extra: Record<string, unknown>;
	baseline: Record<string, string>;
}

const VERSION = 'http://ipuz.org/v2';
const KIND = 'http://ipuz.org/crossword#1';
const BLOCK = '#';
const EMPTY = 0;
const CIRCLE = 'circle';

const BLOCK_FALLBACKS = ['@', '%', '~'];
const EMPTY_FALLBACKS = ['.', '_', '-'];

const REBUS_FIELD = 'io.github.armaanjeetsandhu.grids:rebus';
const REBUS_VOLATILITY = 'dimensions,puzzle,solution';

const MANAGED = new Set([
	'version',
	'kind',
	'title',
	'dimensions',
	'puzzle',
	'solution',
	'clues',
	'block',
	'empty',
	'saved',
	'checksum',
	'styles',
	REBUS_FIELD
]);

const TRACKED = [
	'title',
	'dimensions',
	'puzzle',
	'solution',
	'clues',
	'saved',
	'checksum',
	REBUS_FIELD
];
const GRID = ['dimensions', 'puzzle', 'solution'];

const DEPENDS: Record<string, string[]> = {
	zones: ['dimensions', 'puzzle'],
	answer: ['solution'],
	answers: ['solution'],
	enumeration: ['solution'],
	enumerations: ['solution'],
	misses: ['solution'],
	uniqueid: GRID,
	url: GRID
};

const ORIGIN = 'armaanjeetsandhu.github.io/grids';

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const toHtml = (text: string) =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function toText(html: unknown): string {
	if (typeof html !== 'string') return '';
	if (!/[&<]/.test(html)) return html.trim();
	const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, ' '), 'text/html');
	return (doc.body.textContent ?? '').trim();
}

function barsAt(grid: Grid, rows: number, cols: number, r: number, c: number): string {
	const at = (row: number, col: number, side: 'barRight' | 'barBottom') =>
		row >= 0 && col >= 0 && row < rows && col < cols && grid[keyOf(row, col)][side];
	return (
		(at(r - 1, c, 'barBottom') ? 'T' : '') +
		(at(r, c - 1, 'barRight') ? 'L' : '') +
		(at(r, c, 'barBottom') ? 'B' : '') +
		(at(r, c, 'barRight') ? 'R' : '')
	);
}

const numeric = (v: string) => /^\d+$/.test(v);

const sameValue = (a: string, b: string) =>
	a === b || (numeric(a) && numeric(b) && Number(a) === Number(b));

function marker<T extends string | number>(preferred: T, fallbacks: string[], taken: string[]) {
	const free = (token: string) => !taken.some((value) => sameValue(value, token));
	if (free(String(preferred))) return preferred;
	const spare = fallbacks.find(free);
	if (spare !== undefined) return spare;
	let token = fallbacks[0];
	while (!free(token)) token += fallbacks[0];
	return token;
}

function content(p: Puzzle) {
	const isBlack = (key: string) => p.grid[key].black;
	const { numbers, entries } = numberEntries(p.rows, p.cols, wallsOf(p.grid));
	const values = Object.values(p.grid).flatMap((s) => (s.black || !s.letter ? [] : [s.letter]));
	const block = marker(BLOCK, BLOCK_FALLBACKS, values);
	const empty = marker(EMPTY, EMPTY_FALLBACKS, [...values, String(block)]);
	const rowsOf = (cell: (key: string) => string | number) =>
		Array.from({ length: p.rows }, (_, r) =>
			Array.from({ length: p.cols }, (_, c) => {
				const key = keyOf(r, c);
				return isBlack(key) ? block : cell(key);
			})
		);
	const label = (key: string) => numbers.get(key) ?? empty;
	const puzzle = Array.from({ length: p.rows }, (_, r) =>
		Array.from({ length: p.cols }, (_, c) => {
			const key = keyOf(r, c);
			const black = isBlack(key);
			const cell = black ? block : label(key);
			const barred = barsAt(p.grid, p.rows, p.cols, r, c);
			const circled = !black && p.grid[key].circled;
			if (!barred && !circled) return cell;
			return {
				cell,
				style: { ...(circled && { shapebg: CIRCLE }), ...(barred && { barred }) }
			};
		})
	);
	const present = new Set(entries.map((e) => referenceKey(e.axis, e.number)));
	const cluesFor = (axis: Axis) =>
		entries
			.filter((e) => e.axis === axis)
			.map((e) => {
				const text = p.clues[entryId(e)] ?? '';
				const self = referenceKey(e.axis, e.number);
				const references = citedReferences(text)
					.filter((r) => {
						const key = referenceKey(r.axis, r.number);
						return key !== self && present.has(key);
					})
					.map((r) => ({ direction: titled(r.axis), number: r.number }));
				const clue = toHtml(text);
				return references.length ? { number: e.number, clue, references } : [e.number, clue];
			});
	const title = p.title.trim();
	const rebuses: [number, number][] = [];
	for (let r = 0; r < p.rows; r++)
		for (let c = 0; c < p.cols; c++) {
			const square = p.grid[keyOf(r, c)];
			if (!square.black && square.rebus && !needsRebus(square.letter)) rebuses.push([c, r]);
		}
	return {
		...(title && { title: toHtml(title) }),
		...(block !== BLOCK && { block }),
		...(empty !== EMPTY && { empty }),
		dimensions: { width: p.cols, height: p.rows },
		puzzle,
		solution: rowsOf((key) => p.grid[key].letter || empty),
		clues: { Across: cluesFor('across'), Down: cluesFor('down') },
		...(rebuses.length && { [REBUS_FIELD]: rebuses })
	};
}

const serialise = (fields: Record<string, unknown>) =>
	Object.fromEntries(TRACKED.map((name) => [name, JSON.stringify(fields[name] ?? null)]));

const CONTENT = ['title', ...GRID, 'clues', REBUS_FIELD];

export function unchangedSinceImport(p: Puzzle): boolean {
	if (Object.keys(p.baseline).length === 0) return false;
	const now = serialise(content(p));
	return CONTENT.every((name) => p.baseline[name] === now[name]);
}

const stale = (volatility: unknown, changed: Set<string>) =>
	typeof volatility !== 'string' || volatility.trim() === '*'
		? changed.size > 0
		: volatility.split(',').some((name) => changed.has(name.trim()));

function carry(extra: Record<string, unknown>, changed: Set<string>, letters: string[]) {
	const volatiles = isRecord(extra.volatile) ? extra.volatile : {};
	const namespace = (name: string) => name.slice(0, name.indexOf(':'));
	const kept: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(extra)) {
		if (name === 'volatile') continue;
		if (name.includes(':')) {
			const volatility = volatiles[name] ?? volatiles[namespace(name)] ?? '*';
			if (stale(volatility, changed)) continue;
		} else if (name in DEPENDS && DEPENDS[name].some((f) => changed.has(f))) continue;
		kept[name] = value;
	}
	if (typeof kept.charset === 'string' && changed.has('solution')) {
		const charset = kept.charset;
		kept.charset = charset + [...new Set(letters)].filter((ch) => !charset.includes(ch)).join('');
	}
	if (changed.size) kept.origin = ORIGIN;
	const names = Object.keys(kept).filter((name) => name.includes(':'));
	const declared = Object.entries(volatiles).filter(([key]) =>
		key.includes(':') ? key in kept : names.some((name) => namespace(name) === key)
	);
	if (declared.length) kept.volatile = Object.fromEntries(declared);
	return kept;
}

export function toIpuz(p: Puzzle) {
	const body = content(p);
	const now = serialise(body);
	const changed = new Set(TRACKED.filter((name) => p.baseline[name] !== now[name]));
	const letters = Object.values(p.grid).flatMap((s) => (s.black ? [] : [...s.letter]));
	const { title, ...rest } = body;
	const kept = carry(p.extra, changed, letters);
	if (REBUS_FIELD in rest)
		kept.volatile = {
			...(isRecord(kept.volatile) ? kept.volatile : {}),
			[REBUS_FIELD]: REBUS_VOLATILITY
		};
	return {
		version: VERSION,
		kind: [KIND],
		...(title && { title }),
		...kept,
		...rest
	};
}

const field = (v: unknown, name: string) => (isRecord(v) ? v[name] : v);

const scalar = (v: unknown) =>
	typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;

const AXES: Record<string, Axis> = { across: 'across', down: 'down' };

export function fromIpuz(data: unknown): Puzzle {
	if (!isRecord(data)) throw new Error('That file isn’t a puzzle.');
	const kinds = Array.isArray(data.kind) ? data.kind : [data.kind];
	if (!kinds.some((k) => typeof k === 'string' && /^https?:\/\/ipuz\.org\/crossword\b/.test(k)))
		throw new Error('That file isn’t an IPUZ crossword.');

	const source = data.puzzle;
	if (!Array.isArray(source) || !Array.isArray(source[0])) throw new Error('The grid is missing.');
	const rows = source.length;
	const cols = source[0].length;
	if (source.some((row) => !Array.isArray(row) || row.length !== cols))
		throw new Error('The grid is incomplete.');
	if (isRecord(data.dimensions)) {
		const { width, height } = data.dimensions;
		if (width !== cols || height !== rows)
			throw new Error('The grid doesn’t match its dimensions.');
	}
	if (!validSize(rows) || !validSize(cols))
		throw new Error(`Grids must be between ${MIN_SIZE} and ${MAX_SIZE} squares on each side.`);

	const block = scalar(data.block) ?? BLOCK;
	const empty = scalar(data.empty) ?? String(EMPTY);
	const solution = Array.isArray(data.solution) ? data.solution : [];
	const named = isRecord(data.styles) ? data.styles : {};
	const styleOf = (r: number, c: number): Record<string, unknown> => {
		const style = isRecord(source[r]?.[c]) ? (source[r][c] as Record<string, unknown>).style : null;
		const spec = typeof style === 'string' ? named[style] : style;
		return isRecord(spec) ? spec : {};
	};
	const sides = (r: number, c: number): string => {
		const barred = styleOf(r, c).barred;
		return typeof barred === 'string' ? barred.toUpperCase() : '';
	};
	const circledAt = (r: number, c: number) => {
		const shape = styleOf(r, c).shapebg;
		return typeof shape === 'string' && shape.trim().toLowerCase() === CIRCLE;
	};
	const flagged = new Set<string>();
	if (Array.isArray(data[REBUS_FIELD]))
		for (const at of data[REBUS_FIELD]) {
			if (!Array.isArray(at)) continue;
			const [c, r] = at;
			if (Number.isInteger(c) && Number.isInteger(r)) flagged.add(keyOf(r, c));
		}
	const grid: Grid = {};
	const labelled = new Map<string, string>();
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const key = keyOf(r, c);
			const cell = field(source[r][c], 'cell');
			const label = scalar(cell);
			const black = cell === null || label === block;
			const answers: unknown = solution[r];
			const value = field(Array.isArray(answers) ? answers[c] : undefined, 'value');
			const filled = scalar(value)?.trim() ?? '';
			const letter = black || filled === empty || filled === block ? '' : filled;
			const here = sides(r, c);
			grid[key] = {
				...emptySquare(),
				black,
				letter: letter.toLocaleUpperCase(),
				barRight: c + 1 < cols && (here.includes('R') || sides(r, c + 1).includes('L')),
				barBottom: r + 1 < rows && (here.includes('B') || sides(r + 1, c).includes('T')),
				circled: !black && circledAt(r, c),
				rebus: !black && (flagged.has(key) || needsRebus(letter))
			};
			if (black || label === undefined) continue;
			if (label !== empty && !labelled.has(label)) labelled.set(label, key);
		}
	}

	const barred = Object.values(grid).some((s) => s.barRight || s.barBottom);
	const { entries } = numberEntries(rows, cols, wallsOf(grid));
	const clues: Record<string, string> = {};
	for (const [direction, list] of Object.entries(isRecord(data.clues) ? data.clues : {})) {
		const axis = AXES[direction.split(':')[0].trim().toLowerCase()];
		if (!axis || !Array.isArray(list)) continue;
		const inAxis = entries.filter((e) => e.axis === axis);
		const numbered = (num: unknown) => {
			const label = scalar(num);
			if (label === undefined) return undefined;
			const start = labelled.get(label);
			return (
				inAxis.find((e) => e.keys[0] === start) ?? inAxis.find((e) => String(e.number) === label)
			);
		};
		const resolve = (clue: unknown, i: number): [entry: Entry | undefined, html: unknown] => {
			if (typeof clue === 'string') return [inAxis[i], clue];
			if (Array.isArray(clue)) return [numbered(clue[0]), clue[1]];
			if (isRecord(clue)) return [numbered(clue.number), clue.clue];
			return [undefined, undefined];
		};
		list.forEach((clue, i) => {
			const [entry, html] = resolve(clue, i);
			const text = toText(html);
			if (entry && text) clues[entryId(entry)] = text;
		});
	}

	const puzzle: Puzzle = {
		rows,
		cols,
		mode: barred ? 'bars' : 'blocks',
		grid,
		clues,
		title: toText(data.title),
		extra: Object.fromEntries(Object.entries(data).filter(([name]) => !MANAGED.has(name))),
		baseline: {}
	};
	puzzle.baseline = serialise({ ...content(puzzle), saved: data.saved, checksum: data.checksum });
	return puzzle;
}

const CALLBACK = 'ipuz';

function unwrap(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith(CALLBACK)) return text;
	let body = trimmed.slice(CALLBACK.length).trimStart();
	if (body.endsWith(';')) body = body.slice(0, -1).trimEnd();
	return body.startsWith('(') && body.endsWith(')') ? body.slice(1, -1) : text;
}

export function parseIpuz(text: string): Puzzle {
	return fromIpuz(JSON.parse(unwrap(text)));
}
