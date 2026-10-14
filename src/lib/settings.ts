import { CONSTRAINTS, type ConstraintKey } from './constraints';
import { allKeys, validSize, type Grid, type GridMode } from './crossword';
import type { Puzzle } from './ipuz';
import { SYMMETRIES, type SymmetryKey } from './symmetry';

export type Settings = {
	rows: number;
	cols: number;
	mode: GridMode;
	symmetry: SymmetryKey[];
	constraints: ConstraintKey[];
};

const STORAGE_KEY = 'grids:settings';
const PUZZLE_KEY = 'grids:puzzle';
const SYMMETRY_KEYS = new Set<string>(SYMMETRIES.map((s) => s.key));
const CONSTRAINT_KEYS = new Set<string>(CONSTRAINTS.map((c) => c.key));

function keysIn<K extends string>(value: unknown, allowed: Set<string>): K[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((k): k is K => typeof k === 'string' && allowed.has(k)))];
}

export function loadSettings(): Partial<Settings> {
	let raw: string | null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
	} catch {
		return {};
	}
	if (!raw) return {};

	let data: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return {};
		data = parsed as Record<string, unknown>;
	} catch {
		return {};
	}

	const settings: Partial<Settings> = {
		symmetry: keysIn<SymmetryKey>(data.symmetry, SYMMETRY_KEYS),
		constraints: keysIn<ConstraintKey>(data.constraints, CONSTRAINT_KEYS)
	};
	if (validSize(data.rows)) settings.rows = data.rows;
	if (validSize(data.cols)) settings.cols = data.cols;
	if (data.mode === 'blocks' || data.mode === 'bars') settings.mode = data.mode;
	return settings;
}

export function saveSettings(settings: Settings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Storage can be full, disabled or blocked; settings just won't persist.
	}
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function readJson(key: string): unknown {
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function writeJson(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage can be full, disabled or blocked; the puzzle just won't persist.
	}
}

export function loadPuzzle(): Puzzle | null {
	const data = readJson(PUZZLE_KEY);
	if (!isRecord(data)) return null;
	const { rows, cols, mode, grid: saved, clues: savedClues, title, extra } = data;
	if (!validSize(rows) || !validSize(cols)) return null;
	if (mode !== 'blocks' && mode !== 'bars') return null;
	if (!isRecord(saved)) return null;

	const grid: Grid = {};
	for (const key of allKeys(rows, cols)) {
		const sq = saved[key];
		if (!isRecord(sq)) return null;
		grid[key] = {
			black: sq.black === true,
			letter: typeof sq.letter === 'string' ? sq.letter : '',
			barRight: sq.barRight === true,
			barBottom: sq.barBottom === true,
			circled: sq.circled === true
		};
	}

	const clues: Record<string, string> = {};
	if (isRecord(savedClues))
		for (const [id, text] of Object.entries(savedClues))
			if (typeof text === 'string') clues[id] = text;

	return {
		rows,
		cols,
		mode,
		grid,
		clues,
		title: typeof title === 'string' ? title : '',
		extra: isRecord(extra) ? extra : {}
	};
}

export function savePuzzle(puzzle: Puzzle) {
	writeJson(PUZZLE_KEY, puzzle);
}

export function clearPuzzle() {
	try {
		localStorage.removeItem(PUZZLE_KEY);
	} catch {
		// Nothing to clear if storage is unavailable.
	}
}
