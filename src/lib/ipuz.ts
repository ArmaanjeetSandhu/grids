import {
	MAX_SIZE,
	MIN_SIZE,
	emptySquare,
	entryId,
	keyOf,
	numberEntries,
	validSize,
	wallsOf,
	type Axis,
	type Entry,
	type Grid,
	type GridMode
} from './crossword';

export interface Puzzle {
	rows: number;
	cols: number;
	mode: GridMode;
	grid: Grid;
	clues: Record<string, string>;
	title: string;
	extra: Record<string, unknown>;
}

const VERSION = 'http://ipuz.org/v2';
const KIND = 'http://ipuz.org/crossword#1';
const BLOCK = '#';
const EMPTY = 0;

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
	'styles'
]);

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

export function toIpuz(p: Puzzle) {
	const isBlack = (key: string) => p.grid[key].black;
	const { numbers, entries } = numberEntries(p.rows, p.cols, wallsOf(p.grid));
	const rowsOf = (cell: (key: string) => string | number) =>
		Array.from({ length: p.rows }, (_, r) =>
			Array.from({ length: p.cols }, (_, c) => {
				const key = keyOf(r, c);
				return isBlack(key) ? BLOCK : cell(key);
			})
		);
	const label = (key: string) => numbers.get(key) ?? EMPTY;
	const puzzle = Array.from({ length: p.rows }, (_, r) =>
		Array.from({ length: p.cols }, (_, c) => {
			const key = keyOf(r, c);
			const cell = isBlack(key) ? BLOCK : label(key);
			const barred = barsAt(p.grid, p.rows, p.cols, r, c);
			return barred ? { cell, style: { barred } } : cell;
		})
	);
	const cluesFor = (axis: Axis) =>
		entries
			.filter((e) => e.axis === axis)
			.map((e) => [e.number, toHtml(p.clues[entryId(e)] ?? '')]);
	const title = p.title.trim();
	return {
		version: VERSION,
		kind: [KIND],
		...(title && { title: toHtml(title) }),
		...p.extra,
		dimensions: { width: p.cols, height: p.rows },
		puzzle,
		solution: rowsOf((key) => p.grid[key].letter || EMPTY),
		clues: { Across: cluesFor('across'), Down: cluesFor('down') }
	};
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

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
	const sides = (r: number, c: number): string => {
		const style = isRecord(source[r]?.[c]) ? (source[r][c] as Record<string, unknown>).style : null;
		const spec = typeof style === 'string' ? named[style] : style;
		const barred = isRecord(spec) ? spec.barred : undefined;
		return typeof barred === 'string' ? barred.toUpperCase() : '';
	};
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
				barBottom: r + 1 < rows && (here.includes('B') || sides(r + 1, c).includes('T'))
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

	return {
		rows,
		cols,
		mode: barred ? 'bars' : 'squares',
		grid,
		clues,
		title: toText(data.title),
		extra: Object.fromEntries(Object.entries(data).filter(([name]) => !MANAGED.has(name)))
	};
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
