<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { devicePixelRatio } from 'svelte/reactivity/window';
	import Halftone from '$lib/Halftone.svelte';
	import LengthHistogram from '$lib/LengthHistogram.svelte';
	import Modal from '$lib/Modal.svelte';
	import OptionMenu from '$lib/OptionMenu.svelte';
	import SetupScreen from '$lib/SetupScreen.svelte';
	import StatusFooter from '$lib/StatusFooter.svelte';
	import smirk from '$lib/assets/smirk.svg';
	import {
		REBUS_MAX,
		allKeys,
		barField,
		emptySquare,
		entryAt,
		entryId,
		isLetter,
		isRebusChar,
		keyOf,
		numberEntries,
		otherAxis,
		parseKey,
		step,
		transposeEntryId,
		transposeGrid,
		transposeKey,
		upperChar,
		upperValue,
		validSize,
		wallsOf,
		type Axis,
		type Grid,
		type GridMode
	} from '$lib/crossword';
	import {
		CONSTRAINTS,
		cheaterSquares,
		consecutiveUnches,
		constraintApplies,
		constraintStatus,
		heldConstraints,
		impliedBy,
		regionColours,
		twoLetterEntries,
		unchedSquares,
		whiteRegions,
		type ConstraintKey
	} from '$lib/constraints';
	import { createHistory } from '$lib/history';
	import { MAX_AUTHORS, toIpuz, unchangedSinceImport, type Puzzle } from '$lib/ipuz';
	import { DURATION, fade, flipDuration, fly, pop } from '$lib/motion';
	import {
		citedReferences,
		linkedEntries,
		referenceKey,
		rewriteReferences,
		titled,
		transposeReferences
	} from '$lib/references';
	import {
		barTarget,
		blockLimit,
		brokenRules,
		hasRules,
		meanEntryLength,
		randomBars,
		randomBlocks,
		randomRules,
		type Rules
	} from '$lib/random';
	import { clearPuzzle, loadPuzzle, loadSettings, savePuzzle, saveSettings } from '$lib/settings';
	import {
		barCounterparts,
		counterparts,
		describeSymmetry,
		fitsGrid,
		symmetryObeyed,
		symmetryOptions,
		transposeSymmetry,
		type Bar,
		type SymmetryKey,
		type SymmetryOption
	} from '$lib/symmetry';

	type Pen = 'white' | 'black';

	let sizeInput = $state({ rows: 15, cols: 15 });
	let modeInput = $state<GridMode>('blocks');
	let size = $state.raw<{ rows: number; cols: number } | null>(null);
	let mode = $state<GridMode>('blocks');
	const bars = $derived(mode === 'bars');

	let grid = $state<Grid>({});

	const cells = $derived(
		size ? allKeys(size.rows, size.cols).map((key) => ({ key, ...parseKey(key) })) : []
	);

	const walls = $derived(wallsOf(grid));

	const numbering = $derived(size ? numberEntries(size.rows, size.cols, walls) : null);

	const stats = $derived.by(() => {
		if (!size) return null;
		const total = size.rows * size.cols;
		let black = 0;
		for (const { key } of cells) if (grid[key]?.black) black++;
		const blackPct = Math.round((black / total) * 100);
		const entries = numbering?.entries ?? [];
		const across = entries.filter((e) => e.axis === 'across').length;
		return {
			white: total - black,
			black,
			whitePct: 100 - blackPct,
			blackPct,
			entries: entries.length,
			across,
			down: entries.length - across
		};
	});

	const entryLengths = $derived(
		(numbering?.entries ?? []).map((e) => ({ axis: e.axis, length: e.keys.length }))
	);

	let statsOpen = $state(false);

	function toggleStats() {
		if (!statsOpen) {
			const active = document.activeElement;
			if (active instanceof HTMLElement && layoutEl?.contains(active)) active.blur();
			closeEditor();
			hoverKey = null;
		}
		statsOpen = !statsOpen;
	}

	const BLANK = '·';

	type ClueRow = { id: string; number: number; word: string; keys: string[] };

	let clues = $state<Record<string, string>>({});
	let activeClue = $state<string | null>(null);
	let title = $state('');
	let authors = $state<string[]>(['']);
	let intro = $state('');
	let notes = $state('');
	let cluePage = $state<'clues' | 'details'>('clues');
	let extra = $state.raw<Record<string, unknown>>({});
	let baseline = $state.raw<Record<string, string>>({});

	const clueLists = $derived.by(() => {
		const lists: Record<Axis, ClueRow[]> = { across: [], down: [] };
		for (const e of numbering?.entries ?? []) {
			lists[e.axis].push({
				id: entryId(e),
				number: e.number,
				word: e.keys.map((k) => grid[k].letter || BLANK).join(''),
				keys: e.keys
			});
		}
		return lists;
	});
	const clueSet = $derived(
		new Set([...clueLists.across, ...clueLists.down].find((c) => c.id === activeClue)?.keys ?? [])
	);
	const cluePlaceholder = (c: ClueRow) => `Clue for ${c.word}`;

	function showPage(page: 'clues' | 'details') {
		cluePage = page;
		cluesEl?.scrollTo({ top: 0 });
	}

	async function addAuthor() {
		if (authors.length >= MAX_AUTHORS) return;
		authors = [...authors, ''];
		commit();
		await tick();
		document.getElementById(`puzzle-author-${authors.length - 1}`)?.focus();
	}

	async function removeAuthor(i: number) {
		authors = authors.filter((_, j) => j !== i);
		commit();
		await tick();
		document.getElementById(`puzzle-author-${Math.min(i, authors.length - 1)}`)?.focus();
	}

	const isComposingKey = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;

	function blurOn(keys: string[]) {
		return (e: KeyboardEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
			if (isComposingKey(e) || !keys.includes(e.key)) return;
			e.preventDefault();
			e.currentTarget.blur();
		};
	}

	function fileName(t: string) {
		const safe = t
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '')
			.trim()
			.replace(/[.\s]+$/, '')
			.replace(/\s+/g, '_')
			.toLowerCase();
		return `${safe || 'crossword'}.ipuz`;
	}

	function download() {
		if (!size) return;
		const puzzle = toIpuz({
			...size,
			mode,
			grid,
			clues,
			title,
			authors,
			intro,
			notes,
			extra,
			baseline
		});
		const blob = new Blob([JSON.stringify(puzzle, null, 2) + '\n'], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName(title);
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	function downloadIssues(): string[] {
		if (!size) return [];
		const issues: string[] = [];
		if (
			unchangedSinceImport({
				...size,
				mode,
				grid,
				clues,
				title,
				authors,
				intro,
				notes,
				extra,
				baseline
			})
		)
			issues.push('Nothing has changed since this puzzle was imported.');
		if (symmetric === false) issues.push(`The grid breaks its symmetry (${symmetryName}).`);
		issues.push(...constraintNotes('behind'));
		const white = cells.filter(({ key }) => !grid[key].black);
		const vacant = white.filter(({ key }) => !grid[key].letter).length;
		if (vacant)
			issues.push(`${plural(vacant, 'white square is', 'white squares are')} still empty.`);
		if (!title.trim())
			issues.push(`The puzzle has no title. File will be saved as ${fileName('')}.`);
		const unclued = [...clueLists.across, ...clueLists.down].filter(
			(c) => !clues[c.id]?.trim()
		).length;
		if (unclued) issues.push(`${plural(unclued, 'clue is', 'clues are')} still empty.`);
		const entries = numbering?.entries ?? [];
		const answers = entries
			.filter((e) => e.keys.every((k) => grid[k].letter))
			.map((e) => e.keys.map((k) => upperValue(grid[k].letter)).join(''));
		const repeated = [...new Set(answers.filter((a, i) => answers.indexOf(a) !== i))];
		if (repeated.length)
			issues.push(
				`${plural(repeated.length, 'answer appears', 'answers appear')} more than once: ${repeated.join(', ')}.`
			);
		const present = new Set(entries.map((e) => referenceKey(e.axis, e.number)));
		const dangling = entries.map((e) =>
			citedReferences(clues[entryId(e)] ?? '')
				.filter((r) => !present.has(referenceKey(r.axis, r.number)))
				.map((r) => `${r.number}-${titled(r.axis)}`)
		);
		const citing = dangling.filter((refs) => refs.length > 0).length;
		const missing = [...new Set(dangling.flat())];
		if (citing)
			issues.push(
				`${plural(citing, 'clue refers', 'clues refer')} to ${missing.length === 1 ? 'an entry that doesn’t' : 'entries that don’t'} exist: ${missing.join(', ')}.`
			);
		const singleRebus = white.filter(
			({ key }) => grid[key].rebus && isLetter(grid[key].letter)
		).length;
		if (singleRebus)
			issues.push(
				`${plural(singleRebus, 'rebus square holds', 'rebus squares hold')} just one letter.`
			);
		return issues;
	}

	let confirmDownloadOpen = $state(false);
	let confirmDownloadIssues = $state<string[]>([]);

	function requestDownload() {
		const issues = downloadIssues();
		if (issues.length === 0) return download();
		confirmDownloadIssues = issues;
		confirmDownloadOpen = true;
	}

	function closeConfirmDownload(confirmed: boolean) {
		confirmDownloadOpen = false;
		if (confirmed) download();
	}

	let pen = $state<Pen>('white');
	let axis = $state<Axis>('across');
	let editing = $state<{ keys: string[]; idx: number; anchor: number } | null>(null);
	let selection = $state<string[]>([]);
	let painting = false;
	let barStroke: boolean | null = null;
	let selectStroke: boolean | null = null;

	let chosenSymmetry = $state<SymmetryKey[]>([]);
	let symmetryOpen = $state(false);

	const symmetry = $derived(size ? symmetryOptions(chosenSymmetry, size.rows, size.cols) : []);
	const activeSymmetry = $derived(symmetry.filter((s) => s.checked).map((s) => s.key));
	const symmetryName = $derived(describeSymmetry(activeSymmetry));
	const symmetric = $derived(
		size && activeSymmetry.length > 0
			? symmetryObeyed(size.rows, size.cols, walls, activeSymmetry)
			: null
	);

	function toggleSymmetry(key: SymmetryKey) {
		const option = symmetry.find((s) => s.key === key);
		if (!option || !option.available || option.impliedBy) return;
		chosenSymmetry = chosenSymmetry.includes(option.key)
			? chosenSymmetry.filter((k) => k !== option.key)
			: [...chosenSymmetry, option.key];
	}

	function symmetryHint(option: SymmetryOption) {
		if (!option.available) return 'Square grids only';
		if (!option.impliedBy) return '';
		const names = option.impliedBy.map((k) => symmetry.find((s) => s.key === k)?.short ?? k);
		return `Implied by ${names.join(' + ')}`;
	}

	const symmetryItems = $derived(
		symmetry.map((s) => ({
			key: s.key,
			label: s.label,
			checked: s.checked,
			disabled: !s.available || s.impliedBy !== null,
			locked: s.impliedBy !== null,
			unavailable: !s.available,
			hint: symmetryHint(s)
		}))
	);

	let chosenConstraints = $state<ConstraintKey[]>([]);
	let constraintsOpen = $state(false);

	let settingsRestored = $state(false);

	let confirmNewOpen = $state(false);

	onMount(() => {
		const saved = loadSettings();
		if (saved.rows) sizeInput.rows = saved.rows;
		if (saved.cols) sizeInput.cols = saved.cols;
		if (saved.mode) modeInput = saved.mode;
		if (saved.symmetry) chosenSymmetry = saved.symmetry;
		if (saved.constraints) chosenConstraints = saved.constraints;
		const puzzle = loadPuzzle();
		if (puzzle) load(puzzle);
		settingsRestored = true;
		delete document.documentElement.dataset.restoring;
	});

	$effect(() => {
		if (!settingsRestored) return;
		saveSettings({
			rows: sizeInput.rows,
			cols: sizeInput.cols,
			mode: modeInput,
			symmetry: [...chosenSymmetry],
			constraints: [...chosenConstraints]
		});
	});

	$effect(() => {
		if (!settingsRestored) return;
		if (size)
			savePuzzle({ ...size, mode, grid, clues, title, authors, intro, notes, extra, baseline });
		else clearPuzzle();
	});

	const offeredConstraints = $derived(
		CONSTRAINTS.filter((c) => constraintApplies(c.key, mode, (stats?.black ?? 0) > 0))
	);

	const activeConstraints = $derived(heldConstraints(chosenConstraints));

	const interlock = $derived(activeConstraints.includes('interlock'));
	const regions = $derived(size && interlock ? whiteRegions(size.rows, size.cols, walls) : null);
	const shades = $derived(
		size && regions ? regionColours(regions, size.rows, size.cols) : new Map<string, number>()
	);
	const noUnches = $derived(activeConstraints.includes('unches'));
	const noConsecutiveUnches = $derived(activeConstraints.includes('consecutiveUnches'));
	const unchecked = $derived(
		size && (noUnches || noConsecutiveUnches) ? unchedSquares(size.rows, size.cols, walls) : null
	);
	const unched = $derived(noUnches ? unchecked : null);
	const sequences = $derived(unchecked && consecutiveUnches(unchecked, walls));
	const consecutive = $derived(sequences && !noUnches ? new Set(sequences.flat()) : null);
	const flashing = $derived(unched ?? consecutive);
	const flagCheaters = $derived(activeConstraints.includes('cheaters'));
	const cheaters = $derived(
		size && flagCheaters ? cheaterSquares(size.rows, size.cols, walls) : null
	);
	const flagTwoLetters = $derived(activeConstraints.includes('twoLetters'));
	const twoLetters = $derived(
		numbering && flagTwoLetters ? twoLetterEntries(numbering.entries) : null
	);
	const twoLetterSquares = $derived(new Set(twoLetters?.flatMap((e) => e.keys)));
	const constraintsName = $derived(chosenConstraints.length > 0 ? 'On' : 'Off');

	function constraintNotes(where: 'below' | 'behind'): string[] {
		const notes: string[] = [];
		if (interlock && regions && regions.count > 1)
			notes.push(`The white squares fall into ${regions.count} separate regions, shaded ${where}.`);
		if (unched && unched.size > 0)
			notes.push(
				`${
					unched.size === 1
						? 'One white square is unchecked'
						: `${unched.size} white squares are unchecked`
				}, flashing ${where}.`
			);
		if (consecutive && consecutive.size > 0)
			notes.push(`${consecutive.size} white squares are consecutive unches, flashing ${where}.`);
		if (cheaters && cheaters.size > 0)
			notes.push(
				`${
					cheaters.size === 1
						? 'One block is a cheater square'
						: `${cheaters.size} blocks are cheater squares`
				}, smirking ${where}.`
			);
		if (twoLetters && twoLetters.length > 0)
			notes.push(
				`${
					twoLetters.length === 1
						? 'One entry is two letters long'
						: `${twoLetters.length} entries are two letters long`
				}, hatched ${where}.`
			);
		return notes;
	}
	const constraintNote = $derived(constraintNotes('below').join(' '));

	const constraintStats = $derived(
		constraintStatus(regions, unched, consecutive, cheaters, twoLetters)
	);

	const constraintItems = $derived(
		offeredConstraints.map((c) => {
			const implier = impliedBy(c.key, chosenConstraints);
			return {
				key: c.key,
				label: c.label,
				checked: activeConstraints.includes(c.key),
				disabled: implier !== null,
				locked: implier !== null,
				hint: implier ? `Implied by ${implier.label.toLowerCase()}` : ''
			};
		})
	);

	function toggleConstraint(key: ConstraintKey) {
		if (impliedBy(key, chosenConstraints)) return;
		chosenConstraints = chosenConstraints.includes(key)
			? chosenConstraints.filter((k) => k !== key)
			: [...chosenConstraints, key];
	}

	let winW = $state(1200);
	const narrow = $derived(winW <= 640);
	const PANEL_GAP = 24;
	const GUTTER = { x: 4, y: 4 };

	let stageW = $state(800);
	let stageH = $state(600);
	let input = $state<HTMLInputElement>();

	const dpr = $derived(devicePixelRatio.current ?? 1);

	const room: { w: number; h: number } = $derived.by(() => {
		const side = narrow ? 0 : panelW + PANEL_GAP;
		const below = narrow ? panelH + PANEL_GAP : 0;
		return { w: stageW - 48 - side - GUTTER.x, h: stageH - 48 - below - GUTTER.y };
	});

	const cellDev = $derived.by(() => {
		if (!size) return Math.round(32 * dpr);
		const fit = Math.min(room.w / size.cols, room.h / size.rows);
		return Math.max(Math.round(12 * dpr), Math.min(Math.round(64 * dpr), Math.floor(fit * dpr)));
	});
	const cell = $derived(cellDev / dpr);
	const labelSize = $derived(Math.max(9, Math.min(13, cell * 0.34)));

	const rowLabels = $derived(Array.from({ length: size?.rows ?? 0 }, (_, i) => i));
	const colLabels = $derived(Array.from({ length: size?.cols ?? 0 }, (_, i) => i));

	let hoverKey = $state<string | null>(null);
	const hoverPos = $derived(hoverKey ? parseKey(hoverKey) : null);

	const rule = (x: number, y: number, w: number, h: number, k: number) =>
		`M${x * k} ${y * k}h${w * k}v${h * k}h${-w * k}z`;

	const linesPath = $derived.by(() => {
		if (!size) return '';
		const k = 1 / cellDev;
		const lw = Math.max(1, Math.round(dpr));
		const lead = Math.ceil(lw / 2);
		let d = '';
		for (let c = 0; c <= size.cols; c++)
			d += rule(c * cellDev - lead, -lead, lw, size.rows * cellDev + lw, k);
		for (let r = 0; r <= size.rows; r++)
			d += rule(-lead, r * cellDev - lead, size.cols * cellDev + lw, lw, k);
		return d;
	});

	const edges = $derived.by(() => {
		if (!bars || !size) return [];
		const list: Bar[] = [];
		for (let r = 0; r < size.rows; r++)
			for (let c = 0; c < size.cols; c++) {
				if (c + 1 < size.cols) list.push({ row: r, col: c, axis: 'across' });
				if (r + 1 < size.rows) list.push({ row: r, col: c, axis: 'down' });
			}
		return list;
	});

	const barsPath = $derived.by(() => {
		if (!bars || !size) return '';
		const k = 1 / cellDev;
		const bw = Math.max(3, Math.round(dpr * 3));
		const half = Math.round(bw / 2);
		let d = '';
		for (const e of edges) {
			if (!grid[keyOf(e.row, e.col)][barField(e.axis)]) continue;
			if (e.axis === 'across')
				d += rule((e.col + 1) * cellDev - half, e.row * cellDev - half, bw, cellDev + bw, k);
			else d += rule(e.col * cellDev - half, (e.row + 1) * cellDev - half, cellDev + bw, bw, k);
		}
		return d;
	});

	const GRAB = 0.17;

	let sheet = $state<HTMLDivElement>();
	let shift = $state({ x: 0, y: 0 });
	function alignSheet() {
		const svg = sheet?.querySelector('svg');
		if (!svg) return;
		const r = svg.getBoundingClientRect();
		const snap = (v: number) => {
			const origin = Math.round(v) * dpr;
			return (Math.round(origin) - origin) / dpr;
		};
		const x = snap(r.left);
		const y = snap(r.top);
		if (Math.abs(x - shift.x) > 1e-3 || Math.abs(y - shift.y) > 1e-3) shift = { x, y };
	}
	$effect(() => {
		const el = sheet;
		if (!sequences || !el) return;
		for (const sequence of sequences) {
			const flashes = sequence.flatMap(
				(key) => el.querySelector(`rect.unched[data-key="${key}"]`)?.getAnimations() ?? []
			);
			const running = flashes.map((flash) => flash.startTime).filter((t) => typeof t === 'number');
			if (!running.length) continue;
			const start = Math.min(...running);
			for (const flash of flashes) if (flash.startTime !== start) flash.startTime = start;
		}
	});
	let layoutEl = $state<HTMLDivElement>();
	let layoutW = $state(0);
	let layoutH = $state(0);
	$effect(() => {
		void dpr;
		const els = [layoutEl, sheet].filter((e): e is HTMLDivElement => !!e);
		if (!els.length) return;
		let frame = 0;
		const queue = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(alignSheet);
		};
		const ro = new ResizeObserver(queue);
		for (const e of els) ro.observe(e);
		if (layoutEl?.parentElement) ro.observe(layoutEl.parentElement);
		queue();
		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
		};
	});

	const panelW = $derived(
		narrow ? Math.max(0, stageW - 48) : Math.round(Math.min(384, Math.max(256, stageW * 0.3)))
	);
	const panelH = $derived(narrow ? Math.round(stageH * 0.4) : size ? size.rows * cell : 0);

	const multi = $derived(selection.length > 0);
	const selectedSet = $derived(new Set(selection));
	const runSet = $derived(new Set(multi ? [] : (editing?.keys ?? [])));
	const caretKey = $derived(editing ? editing.keys[editing.idx] : null);
	const linkedSet = $derived.by(() => {
		const active = new Set([
			...(editing && !multi ? [entryId({ axis, keys: editing.keys })] : []),
			...(activeClue ? [activeClue] : [])
		]);
		if (!numbering || active.size === 0) return new Set<string>();
		return new Set(linkedEntries(numbering.entries, clues, active).flatMap((e) => e.keys));
	});
	const caretPos = $derived(caretKey ? parseKey(caretKey) : null);
	const gridClue = $derived.by(() => {
		if (!editing || multi) return null;
		const id = entryId({ axis, keys: editing.keys });
		return clueLists[axis].some((c) => c.id === id) ? id : null;
	});

	let cluesEl = $state<HTMLElement>();
	$effect(() => {
		const id = gridClue;
		if (!id || !cluesEl) return;
		const row = cluesEl.querySelector<HTMLElement>(`[data-clue="${CSS.escape(id)}"]`);
		if (!row) return;
		const panel = cluesEl.getBoundingClientRect();
		const box = row.getBoundingClientRect();
		const target = cluesEl.scrollTop + box.top - panel.top - (panel.height - box.height) / 2;
		cluesEl.scrollTo({ top: target, behavior: flipDuration() ? 'smooth' : 'auto' });
	});

	function cursorFor(p: Pen) {
		const arrow = 'M2 2 L2 19 L6.5 14.5 L9.5 21.5 L12.5 20.2 L9.6 13.4 L15.5 13.4 Z';
		const svg =
			`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>` +
			`<path d='${arrow}' fill='none' stroke='white' stroke-width='3.5' stroke-linejoin='round'/>` +
			`<path d='${arrow}' fill='${p}' stroke='black' stroke-width='1.5' stroke-linejoin='round'/>` +
			`</svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, default`;
	}

	function load(p: Puzzle) {
		grid = p.grid;
		clues = p.clues;
		activeClue = null;
		title = p.title;
		authors = p.authors.length ? p.authors.slice(0, MAX_AUTHORS) : [''];
		intro = p.intro;
		notes = p.notes;
		cluePage = 'clues';
		statsOpen = false;
		extra = p.extra;
		baseline = p.baseline;
		pen = 'white';
		axis = 'across';
		editing = null;
		selection = [];
		hoverKey = null;
		symmetryOpen = false;
		constraintsOpen = false;
		chosenSymmetry = chosenSymmetry.filter((k) => fitsGrid(k, p.rows, p.cols));
		const hasBlack = Object.values(p.grid).some((s) => s.black);
		chosenConstraints = chosenConstraints.filter((k) => constraintApplies(k, p.mode, hasBlack));
		sizeInput = { rows: p.rows, cols: p.cols };
		modeInput = p.mode;
		mode = p.mode;
		size = { rows: p.rows, cols: p.cols };
		resetHistory();
	}

	type GridSnapshot = { grid: Grid };
	type CluesSnapshot = { clues: Record<string, string> };
	type DetailsSnapshot = { title: string; authors: string[]; intro: string; notes: string };

	const histories = {
		grid: createHistory<GridSnapshot>(
			() => ({ grid }),
			(next, prev, forward) => {
				grid = next.grid;
				hoverKey = null;
				settleCaret(prev.grid, forward);
			}
		),
		clues: createHistory<CluesSnapshot>(
			() => ({ clues }),
			(next) => {
				clues = next.clues;
			}
		),
		details: createHistory<DetailsSnapshot>(
			() => ({ title, authors, intro, notes }),
			(next) => {
				title = next.title;
				authors = next.authors.length ? next.authors : [''];
				intro = next.intro;
				notes = next.notes;
			}
		)
	};
	type HistoryArea = keyof typeof histories;

	let lastArea: 'grid' | 'panel' | 'details' = 'grid';
	let clueSheetEl = $state<HTMLElement>();
	let titleFieldEl = $state<HTMLElement>();

	function noteArea(target: EventTarget | null) {
		if (!(target instanceof Node)) return;
		if (titleFieldEl?.contains(target)) lastArea = 'details';
		else if (clueSheetEl?.contains(target)) lastArea = 'panel';
		else if (sheet?.contains(target)) lastArea = 'grid';
	}

	function historyArea(): HistoryArea {
		return lastArea === 'panel' ? cluePage : lastArea;
	}

	function resetHistory() {
		lastArea = 'grid';
		for (const h of Object.values(histories)) h.reset();
	}

	function commit() {
		if (!size) return;
		for (const h of Object.values(histories)) h.commit();
	}

	const undo = () => {
		commit();
		histories[historyArea()].travel(false);
	};
	const redo = () => {
		commit();
		histories[historyArea()].travel(true);
	};

	function settleCaret(prev: Grid, forward: boolean) {
		if (!editing || !size) return;
		const { rows, cols } = size;
		const open = (k: string | undefined): k is string => !!k && !!grid[k] && !grid[k].black;
		const { keys } = editing;
		const changed = allKeys(rows, cols).find(
			(k) =>
				open(k) &&
				(grid[k].letter !== prev[k]?.letter ||
					grid[k].circled !== prev[k]?.circled ||
					grid[k].rebus !== prev[k]?.rebus)
		);
		const target = changed ?? keys[editing.idx];
		selection = [];
		if (!open(target)) {
			editing = null;
			input?.blur();
			return;
		}
		const ws = wallsOf(grid);
		const run = entryAt(keys[0], axis, ws, rows, cols);
		const intact =
			keys.every(open) && run.length === keys.length && run.every((k, i) => k === keys[i]);
		const entry = intact && keys.includes(target) ? keys : entryAt(target, axis, ws, rows, cols);
		const idx = entry.indexOf(target);
		const next = { keys: entry, idx, anchor: idx };
		if (forward && target === changed && grid[target].letter && !grid[target].rebus)
			next.idx = Math.min(next.idx + 1, next.keys.length - 1);
		editing = next;
	}

	function historyAction(e: KeyboardEvent): 'undo' | 'redo' | null {
		if (e.altKey || (isMac ? e.ctrlKey || !e.metaKey : e.metaKey || !e.ctrlKey)) return null;
		const k = e.key.toLowerCase();
		if (k === 'z') return e.shiftKey ? (isMac ? 'redo' : null) : 'undo';
		if (k === 'y' && !e.shiftKey && !isMac) return 'redo';
		return null;
	}

	function start() {
		const rows = Math.round(Number(sizeInput.rows));
		const cols = Math.round(Number(sizeInput.cols));
		if (!validSize(rows) || !validSize(cols)) return;
		const fresh: Grid = {};
		for (const k of allKeys(rows, cols)) fresh[k] = emptySquare();
		load({
			rows,
			cols,
			mode: modeInput,
			grid: fresh,
			clues: {},
			title: '',
			authors: [],
			intro: '',
			notes: '',
			extra: {},
			baseline: {}
		});
	}

	function newGrid() {
		const used =
			Object.values(grid).some(
				(s) => s.black || s.letter || s.barRight || s.barBottom || s.circled || s.rebus
			) ||
			Object.keys(clues).length > 0 ||
			title.trim() !== '' ||
			authors.some((a) => a.trim() !== '') ||
			intro.trim() !== '' ||
			notes.trim() !== '';
		if (used) {
			confirmNewOpen = true;
			return;
		}
		startNewGrid();
	}

	function startNewGrid() {
		editing = null;
		selection = [];
		size = null;
	}

	function closeConfirmNew(confirmed: boolean) {
		confirmNewOpen = false;
		if (confirmed) startNewGrid();
	}

	type ReferenceMap = ReturnType<typeof transposeReferences>;

	function transposeClues(c: Record<string, string>, moved: ReferenceMap) {
		return Object.fromEntries(
			Object.entries(c).map(([id, text]) => [transposeEntryId(id), rewriteReferences(text, moved)])
		);
	}

	function transpose() {
		if (!size) return;
		commit();
		const { rows, cols } = size;
		const flipped = transposeGrid(grid, rows, cols);
		const moved = transposeReferences(
			numberEntries(rows, cols, wallsOf(grid)),
			numberEntries(cols, rows, wallsOf(flipped))
		);
		grid = flipped;
		clues = transposeClues(clues, moved);
		if (activeClue) activeClue = transposeEntryId(activeClue);
		if (editing) editing = { ...editing, keys: editing.keys.map(transposeKey) };
		selection = selection.map(transposeKey);
		axis = otherAxis(axis);
		chosenSymmetry = transposeSymmetry(chosenSymmetry);
		hoverKey = null;
		symmetryOpen = false;
		constraintsOpen = false;
		sizeInput = { rows: cols, cols: rows };
		size = { rows: cols, cols: rows };
		histories.grid.map((s) => ({ grid: transposeGrid(s.grid, rows, cols) }));
		histories.clues.map((s) => ({ clues: transposeClues(s.clues, moved) }));
	}

	let confirmRandomOpen = $state(false);
	let confirmRandomLetters = $state(false);
	let randomSetOpen = $state(false);

	const randomRulesNow = $derived(
		randomRules(mode, activeSymmetry, activeConstraints, (stats?.black ?? 0) > 0)
	);
	const canRandomise = $derived(hasRules(randomRulesNow));

	function requestRandom() {
		if (!size || !canRandomise) return;
		symmetryOpen = false;
		constraintsOpen = false;
		const rules = randomRulesNow;
		if (brokenRules(size.rows, size.cols, walls, rules).length === 0)
			return randomise(rules, false);
		confirmRandomLetters = cells.some(({ key }) => grid[key].letter !== '');
		confirmRandomOpen = true;
	}

	function closeConfirmRandom(confirmed: boolean) {
		confirmRandomOpen = false;
		if (confirmed && canRandomise) randomise(randomRulesNow, true);
	}

	function showRandomSet() {
		randomSetOpen = true;
	}

	function closeRandomSet() {
		randomSetOpen = false;
	}

	function randomise(rules: Rules, fresh: boolean) {
		if (!size) return;
		const { rows, cols } = size;
		const next = $state.snapshot(grid) as Grid;
		if (fresh)
			for (const sq of Object.values(next)) {
				sq.black = false;
				sq.barRight = false;
				sq.barBottom = false;
				sq.letter = '';
				sq.rebus = false;
			}
		const ws = wallsOf(next);
		const lettered = (key: string) => next[key].letter !== '';

		if (bars) {
			const { lo, hi } = barTarget(rows, cols);
			const mean = meanEntryLength(rows, cols, ws);
			if (!fresh && mean <= lo) return showRandomSet();
			const added = randomBars({
				rows,
				cols,
				walls: ws,
				rules,
				target: lo + (Math.min(hi, mean) - lo) * Math.random(),
				locked: (b) =>
					lettered(keyOf(b.row, b.col)) && lettered(keyOf(...step(b.row, b.col, b.axis)))
			});
			if (added.length === 0 && !fresh) return showRandomSet();
			for (const b of added) next[keyOf(b.row, b.col)][barField(b.axis)] = true;
		} else {
			const limit = blockLimit(rows, cols);
			const black = Object.values(next).filter((sq) => sq.black).length;
			if (black >= limit) return showRandomSet();
			const added = randomBlocks({ rows, cols, walls: ws, rules, limit, locked: lettered });
			if (added.length === 0 && !fresh) return showRandomSet();
			for (const k of added) {
				next[k].black = true;
				next[k].letter = '';
				next[k].circled = false;
				next[k].rebus = false;
			}
		}

		commit();
		grid = next;
		editing = null;
		selection = [];
		hoverKey = null;
		lastArea = 'grid';
		commit();
	}

	function paint(key: string) {
		if (!size) return;
		const black = pen === 'black';
		if (grid[key].black === black) return;
		const { row, col } = parseKey(key);
		for (const k of [key, ...counterparts(row, col, size.rows, size.cols, activeSymmetry)]) {
			grid[k].black = black;
			if (black) {
				grid[k].letter = '';
				grid[k].circled = false;
				grid[k].rebus = false;
			}
		}
		editing = null;
		selection = [];
	}

	function setBar(bar: Bar, on: boolean) {
		if (!size) return;
		if (grid[keyOf(bar.row, bar.col)][barField(bar.axis)] === on) return;
		for (const b of [bar, ...barCounterparts(bar, size.rows, size.cols, activeSymmetry)])
			grid[keyOf(b.row, b.col)][barField(b.axis)] = on;
		editing = null;
		selection = [];
	}

	function onBarDown(e: PointerEvent, bar: Bar) {
		e.preventDefault();
		if (e.button !== 0) return;
		editing = null;
		selection = [];
		painting = true;
		barStroke = !grid[keyOf(bar.row, bar.col)][barField(bar.axis)];
		setBar(bar, barStroke);
	}

	function onBarEnter(e: PointerEvent, bar: Bar) {
		hoverKey = keyOf(bar.row, bar.col);
		if (painting && barStroke !== null && e.buttons & 1) setBar(bar, barStroke);
	}

	function onCellDown(e: PointerEvent, key: string) {
		e.preventDefault();
		if (e.button !== 0) return;
		if (isMac ? e.metaKey : e.ctrlKey) {
			toggleSelected(key);
			selectStroke = grid[key].black || selection.includes(key);
			return;
		}
		selection = [];
		if (editing) {
			const i = editing.keys.indexOf(key);
			if (i >= 0 && (bars || pen === 'white')) {
				if (i === editing.idx) toggleDirection();
				else editing.idx = editing.anchor = i;
				return;
			}
			editing = null;
		}
		if (bars) {
			openEditor(key, entryAxis(key, axis));
			return;
		}
		painting = true;
		if (pen === 'white' && !grid[key].black) openEditor(key, entryAxis(key, axis));
		else paint(key);
	}

	const isMac =
		typeof navigator !== 'undefined' &&
		/mac|iphone|ipad|ipod/i.test(
			(navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
				navigator.platform
		);

	function toggleSelected(key: string) {
		if (grid[key].black) return;
		const base = selection.length > 0 ? selection : caretKey && caretKey !== key ? [caretKey] : [];
		const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
		if (next.length === 0) {
			input?.blur();
			return;
		}
		openEditor(next.includes(key) ? key : next[next.length - 1], axis);
		selection = next;
	}

	function onCellEnter(e: PointerEvent, key: string) {
		hoverKey = key;
		if (selectStroke !== null) {
			if (e.buttons & 1 && !grid[key].black && selection.includes(key) !== selectStroke)
				toggleSelected(key);
			return;
		}
		if (!bars && painting && e.buttons & 1) paint(key);
	}

	function entryAxis(key: string, preferred: Axis): Axis {
		if (!size) return preferred;
		const { rows, cols } = size;
		const other = otherAxis(preferred);
		const formsEntry = (a: Axis) => entryAt(key, a, walls, rows, cols).length > 1;
		return !formsEntry(preferred) && formsEntry(other) ? other : preferred;
	}

	async function openEditor(key: string, a: Axis) {
		if (!size) return;
		axis = a;
		selection = [];
		const keys = entryAt(key, a, walls, size.rows, size.cols);
		const idx = keys.indexOf(key);
		editing = { keys, idx, anchor: idx };
		await tick();
		input?.focus({ preventScroll: true });
	}

	function toggleDirection() {
		const other = otherAxis(axis);
		if (editing) {
			const key = editing.keys[editing.idx];
			const next = entryAxis(key, other);
			if (next !== axis) openEditor(key, next);
		} else axis = other;
	}

	function closeEditor() {
		editing = null;
		selection = [];
	}

	function enter(key: string, ch: string): boolean {
		const sq = grid[key];
		const value = upperChar(ch);
		if (sq.rebus) {
			if (!isRebusChar(ch)) return false;
			if ([...sq.letter].length < REBUS_MAX) sq.letter += value;
			return true;
		}
		if (!isLetter(ch)) return false;
		sq.letter = value;
		return true;
	}

	function typeLetter(ch: string) {
		if (!editing) return;
		if (multi) {
			for (const k of selection) enter(k, ch);
			return;
		}
		const key = editing.keys[editing.idx];
		if (!enter(key, ch) || grid[key].rebus) return;
		const next = (editing.idx + 1) % editing.keys.length;
		if (next !== editing.anchor) editing.idx = next;
	}

	function typeable(ch: string) {
		if (!editing || [...ch].length !== 1) return false;
		const keys = multi ? selection : [editing.keys[editing.idx]];
		return keys.some((k) => (grid[k].rebus ? isRebusChar(ch) : isLetter(ch)));
	}

	function toggleRebus() {
		if (!editing) return;
		const keys = (multi ? selection : [editing.keys[editing.idx]]).filter((k) => !grid[k].black);
		if (keys.length === 0) return;
		const rebus = !keys.every((k) => grid[k].rebus);
		for (const k of keys) {
			grid[k].rebus = rebus;
			if (!rebus && !isLetter(grid[k].letter)) grid[k].letter = '';
		}
	}

	function toggleCircles() {
		if (!editing) return;
		const keys = (multi ? selection : [editing.keys[editing.idx]]).filter((k) => !grid[k].black);
		if (keys.length === 0) return;
		const circled = !keys.every((k) => grid[k].circled);
		for (const k of keys) grid[k].circled = circled;
	}

	function clearSelected() {
		for (const k of selection) grid[k].letter = '';
	}

	function backspace() {
		if (!editing) return;
		if (multi) return clearSelected();
		const k = editing.keys[editing.idx];
		if (grid[k].rebus && grid[k].letter) grid[k].letter = [...grid[k].letter].slice(0, -1).join('');
		else if (grid[k].letter) grid[k].letter = '';
		else if (editing.idx > 0) {
			editing.idx = editing.anchor = editing.idx - 1;
			grid[editing.keys[editing.idx]].letter = '';
		}
	}

	function selectionFocus(keys: string[], idx: number): number {
		if (selection.length === 0) return idx;
		const indices = selection.map((k) => keys.indexOf(k)).sort((a, b) => a - b);
		const lo = indices[0];
		const hi = indices[indices.length - 1];
		if (lo < 0 || hi - lo + 1 !== indices.length) return idx;
		if (lo === idx) return hi;
		if (hi === idx) return lo;
		return idx;
	}

	function onInputKey(e: KeyboardEvent) {
		if (!editing || composing || isComposingKey(e)) return;
		if (e.code === 'KeyC' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			toggleCircles();
		} else if (e.code === 'KeyR' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			toggleRebus();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			toggleDirection();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			input?.blur();
		} else if (e.key === 'Backspace') {
			e.preventDefault();
			backspace();
		} else if (e.key === 'Delete') {
			e.preventDefault();
			if (multi) clearSelected();
			else grid[editing.keys[editing.idx]].letter = '';
		} else if (e.key.startsWith('Arrow')) {
			e.preventDefault();
			const [back, ahead] =
				axis === 'across' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
			if (e.key !== back && e.key !== ahead) return;
			if (e.shiftKey) {
				const { keys, idx } = editing;
				const focus = selectionFocus(keys, idx);
				const next = Math.max(0, Math.min(keys.length - 1, focus + (e.key === back ? -1 : 1)));
				selection = next === idx ? [] : keys.slice(Math.min(idx, next), Math.max(idx, next) + 1);
			} else {
				selection = [];
				const n = editing.keys.length;
				editing.idx = editing.anchor = (editing.idx + (e.key === back ? n - 1 : 1)) % n;
			}
		} else if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			const home = e.key === 'Home';
			if (e.shiftKey) {
				const { keys, idx } = editing;
				selection = home ? keys.slice(0, idx + 1) : keys.slice(idx);
			} else {
				selection = [];
				editing.idx = editing.anchor = home ? 0 : editing.keys.length - 1;
			}
		} else if (typeable(e.key) && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			typeLetter(e.key);
		}
		commit();
	}

	let composing = false;

	function consumeTyped(el: HTMLInputElement) {
		for (const ch of el.value) if (typeable(ch)) typeLetter(ch);
		el.value = '';
		commit();
	}

	function onInput(e: Event) {
		if (composing || (e as InputEvent).isComposing) return;
		consumeTyped(e.currentTarget as HTMLInputElement);
	}

	function onCompositionEnd(e: CompositionEvent) {
		composing = false;
		consumeTyped(e.currentTarget as HTMLInputElement);
	}

	function onWindowPointerUp() {
		if (painting) commit();
		painting = false;
		barStroke = null;
		selectStroke = null;
	}

	function onWindowPointerMove(e: PointerEvent) {
		if ((!painting && selectStroke === null) || e.pointerType === 'mouse') return;
		const hit = document
			.elementFromPoint(e.clientX, e.clientY)
			?.closest('[data-cell], [data-edge]');
		if (!(hit instanceof SVGElement)) return;
		const { cell, edge } = hit.dataset;
		if (cell) onCellEnter(e, cell);
		else if (edge) onBarEnter(e, edges[Number(edge)]);
	}

	function onWindowPointerDown(e: PointerEvent) {
		noteArea(e.target);
	}

	const CONTROLS = 'button, input, select, textarea, a[href], [contenteditable], [role]';

	function onWindowKey(e: KeyboardEvent) {
		if (isComposingKey(e)) return;
		if (confirmNewOpen || confirmDownloadOpen || confirmRandomOpen || randomSetOpen) return;
		const action = size && historyAction(e);
		if (action) {
			const t = e.target as HTMLElement | null;
			if ((t instanceof HTMLInputElement && t !== input) || t instanceof HTMLTextAreaElement)
				return;
			e.preventDefault();
			if (!painting) (action === 'undo' ? undo : redo)();
			return;
		}
		if (e.key === 'Escape' && (symmetryOpen || constraintsOpen)) {
			symmetryOpen = false;
			constraintsOpen = false;
			return;
		}
		if (e.key === 'Escape' && statsOpen) {
			statsOpen = false;
			return;
		}
		if (size === null || bars || statsOpen || e.code !== 'Space') return;
		const t = e.target;
		if (t instanceof Element && t !== input && t.closest(CONTROLS)) return;
		e.preventDefault();
		pen = pen === 'white' ? 'black' : 'white';
	}

	function keepFocus(e: MouseEvent) {
		e.preventDefault();
	}

	const REBUS_MARK = 0.28;
	const rebusPoints = (x: number, y: number) =>
		`${x + 1 - REBUS_MARK},${y + 1} ${x + 1},${y + 1} ${x + 1},${y + 1 - REBUS_MARK}`;

	const NUM = { x: 0.06, y: 0.05, size: 0.27 };
	const NUM_INK = 0.74;
	const NUM_CLEARANCE = 0.035;

	let numWidths = $state<Record<string, number>>({});
	const numWidth = (label: string) => numWidths[label] ?? label.length * NUM.size * 0.56;

	function measureNum(label: string) {
		return (node: SVGTextElement) => {
			const update = () => {
				const width = node.getBBox().width;
				if (width > 0 && Math.abs(untrack(() => numWidths[label] ?? 0) - width) > 1e-4)
					numWidths[label] = width;
			};
			update();
			document.fonts?.addEventListener('loadingdone', update);
			return () => document.fonts?.removeEventListener('loadingdone', update);
		};
	}

	const ringWidth = $derived(Math.max(1, cell * 0.035) / cell);

	function ringPath(col: number, row: number, label: string | null): string {
		const r = 0.5 - ringWidth / 2;
		const cx = col + 0.5;
		const cy = row + 0.5;
		const at = (t: number) => `${cx + r * Math.cos(t)} ${cy + r * Math.sin(t)}`;
		const full = `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
		if (!label) return full;
		const right = NUM.x + numWidth(label) + NUM_CLEARANCE + ringWidth / 2 - 0.5;
		const bottom = NUM.y + NUM.size * NUM_INK + NUM_CLEARANCE + ringWidth / 2 - 0.5;
		if (right * right + bottom * bottom >= r * r) return full;
		const from = Math.min(2 * Math.PI - Math.acos(right / r), 2 * Math.PI + Math.asin(bottom / r));
		const to = 3 * Math.PI - Math.asin(bottom / r);
		const large = to - from > Math.PI ? 1 : 0;
		return `M${at(from)}A${r} ${r} 0 ${large} 1 ${at(to)}`;
	}
</script>

<svelte:head>
	<title>Grids</title>
</svelte:head>

<svelte:window
	bind:innerWidth={winW}
	onkeydown={onWindowKey}
	onpointerdown={onWindowPointerDown}
	onfocusin={(e) => noteArea(e.target)}
	onpointermove={onWindowPointerMove}
	onpointerup={onWindowPointerUp}
	onpointercancel={onWindowPointerUp}
/>

<main class="mat">
	<Halftone />
	{#if size === null}
		<SetupScreen bind:size={sizeInput} bind:mode={modeInput} onstart={start} onimport={load} />
	{:else}
		<div class="main" in:fade={{ duration: DURATION.slow }}>
			<header class="bar">
				<div class="row">
					<div class="tools">
						<button class="chip quiet" onclick={newGrid}>New grid</button>

						<OptionMenu
							label="Symmetry"
							value={symmetryName}
							on={activeSymmetry.length > 0}
							title={bars ? 'Mirror bars as you place them' : 'Mirror blocks as you place them'}
							intro="{bars
								? 'Bars you add or remove are mirrored as you go.'
								: 'Squares you blacken or clear are mirrored as you go.'} Nothing already in the grid changes when you switch this on or off."
							options={symmetryItems}
							offLabel="Turn symmetry off"
							offDisabled={activeSymmetry.length === 0}
							open={symmetryOpen}
							ontoggle={() => {
								symmetryOpen = !symmetryOpen;
								constraintsOpen = false;
							}}
							onclose={() => (symmetryOpen = false)}
							onchange={toggleSymmetry}
							onoff={() => (chosenSymmetry = [])}
						>
							{#snippet icon()}
								<path d="M8 1.5v13" stroke-dasharray="2 2.2" />
								<path d="M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3" />
							{/snippet}
							{#snippet glyph(key)}
								{#if key === 'rot180'}
									<path d="M8 3a5 5 0 0 1 0 10M10.2 10.8 8 13l2.2 2.2" />
									<circle cx="8" cy="8" r="1" />
								{:else if key === 'rot90'}
									<path d="M8 3a5 5 0 0 1 5 5M10.8 5.8 13 8l2.2-2.2" />
									<circle cx="8" cy="8" r="1" />
								{:else}
									<rect x="3" y="3" width="10" height="10" />
									<path
										class="axis"
										d={{
											vertical: 'M8 1v14',
											horizontal: 'M1 8h14',
											diagonal: 'M1.5 1.5l13 13',
											antidiagonal: 'M14.5 1.5l-13 13'
										}[key]}
									/>
								{/if}
							{/snippet}
						</OptionMenu>

						<OptionMenu
							label="Constraints"
							value={constraintsName}
							on={chosenConstraints.length > 0}
							title="Check the grid against construction rules"
							intro="Constraints only flag what they find. Nothing in the grid is changed for you."
							options={constraintItems}
							note={constraintNote}
							offLabel="Turn constraints off"
							offDisabled={chosenConstraints.length === 0}
							open={constraintsOpen}
							ontoggle={() => {
								constraintsOpen = !constraintsOpen;
								symmetryOpen = false;
							}}
							onclose={() => (constraintsOpen = false)}
							onchange={toggleConstraint}
							onoff={() => (chosenConstraints = [])}
						>
							{#snippet icon()}
								<rect x="2.5" y="2.5" width="11" height="11" />
								<path d="M2.5 8h11M8 2.5v11" />
							{/snippet}
							{#snippet glyph(key)}
								{#if key === 'interlock'}
									<path d="M3 6.5h6.5V13" />
									<path class="axis" d="M6.5 3v6.5H13" />
								{:else if key === 'cheaters'}
									<rect x="3" y="3" width="10" height="10" />
									<path class="axis" d="M5.5 9.3q3 1.6 5-1.3" />
								{:else if key === 'twoLetters'}
									<rect x="2" y="5" width="12" height="6" />
									<path class="axis" d="M8 5v6" />
								{:else if key === 'consecutiveUnches'}
									<rect x="1.5" y="5" width="6.5" height="6" />
									<rect x="8" y="5" width="6.5" height="6" />
									<path class="axis" d="M1.5 8h13" />
								{:else}
									<rect x="3" y="3" width="10" height="10" />
									<path class="axis" d="M3 8h10" />
								{/if}
							{/snippet}
						</OptionMenu>

						{#if canRandomise}
							<button
								class="chip"
								onmousedown={keepFocus}
								onclick={requestRandom}
								title={bars
									? 'Add bars that follow your symmetry and constraints'
									: 'Add blocks that follow your symmetry and constraints'}
							>
								<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
									<rect x="2.5" y="2.5" width="11" height="11" rx="2" />
									<circle class="pip" cx="5.6" cy="5.6" r="1.3" />
									<circle class="pip" cx="8" cy="8" r="1.3" />
									<circle class="pip" cx="10.4" cy="10.4" r="1.3" />
								</svg>
								Random
							</button>
						{/if}

						<button
							class="chip"
							onmousedown={keepFocus}
							onclick={transpose}
							title="Flip the grid about its main diagonal"
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<path d="M2.5 2.5l11 11" stroke-dasharray="2 2.2" />
								<path d="M12.5 4.5h-7M8 2 5.5 4.5 8 7" />
								<path d="M4.5 12.5v-7M2 8l2.5-2.5L7 8" />
							</svg>
							Transpose
						</button>

						<button
							class="chip"
							class:on={statsOpen}
							aria-pressed={statsOpen}
							onclick={toggleStats}
							title={statsOpen ? 'Back to the grid' : 'Show a histogram of entry lengths'}
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<path d="M2.5 13.5h11M4 13.5v-4M7 13.5V4M10 13.5V7M13 13.5v-2" />
							</svg>
							Stats
						</button>

						<button
							class="chip"
							onmousedown={keepFocus}
							onclick={requestDownload}
							title="Download the puzzle as IPUZ"
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								<path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
							</svg>
							Download
						</button>
					</div>
				</div>
			</header>

			<div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
				<div
					class="layout"
					class:narrow
					class:away={statsOpen}
					inert={statsOpen}
					bind:this={layoutEl}
					bind:clientWidth={layoutW}
					bind:clientHeight={layoutH}
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						bind:this={sheet}
						class="sheet"
						style:width="{size.cols * cell}px"
						style:height="{size.rows * cell}px"
						style:margin="{GUTTER.y}px 0 0 {GUTTER.x}px"
						style:cursor={bars ? 'default' : cursorFor(pen)}
						style:--cell="{cell}px"
						style:--label-size="{labelSize}px"
						onmousedown={keepFocus}
						onpointerleave={() => (hoverKey = null)}
					>
						<div class="ruler cols" aria-hidden="true">
							{#each colLabels as c (c)}
								<span class:on={hoverPos?.col === c}>{c + 1}</span>
							{/each}
						</div>
						<div class="ruler rows" aria-hidden="true">
							{#each rowLabels as r (r)}
								<span class:on={hoverPos?.row === r}>{r + 1}</span>
							{/each}
						</div>

						<svg
							width={size.cols * cell}
							height={size.rows * cell}
							viewBox="{-shift.x / cell} {-shift.y / cell} {size.cols} {size.rows}"
							aria-label="Crossword grid, {size.cols} by {size.rows}"
							role="img"
						>
							<defs>
								<pattern
									id="two-letter-hatch"
									width="0.2"
									height="0.2"
									patternUnits="userSpaceOnUse"
									patternTransform="rotate(45)"
								>
									<rect width="0.08" height="0.2" />
								</pattern>
							</defs>
							{#each cells as { key, row, col } (key)}
								{@const sq = grid[key]}
								{@const num = numbering?.numbers.get(key)}
								{@const shade = shades.get(key) ?? 0}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<rect
									x={col}
									y={row}
									width="1"
									height="1"
									class="sq"
									class:black={sq.black}
									class:shade1={shade === 1}
									class:shade2={shade === 2}
									class:shade3={shade === 3}
									class:linked={linkedSet.has(key)}
									class:run={runSet.has(key) || clueSet.has(key)}
									class:caret={multi ? selectedSet.has(key) : key === caretKey}
									data-cell={key}
									onpointerdown={(e) => onCellDown(e, key)}
									onpointerenter={(e) => onCellEnter(e, key)}
								/>
								{#if flashing?.has(key)}
									<rect class="unched" data-key={key} x={col} y={row} width="1" height="1" />
								{/if}
								{#if cheaters?.has(key)}
									<image
										class="cheater"
										href={smirk}
										x={col}
										y={row}
										width="1"
										height="1"
										transition:pop={{ from: 0.3 }}
									/>
								{/if}
								{#if twoLetterSquares.has(key)}
									<rect
										class="two-letter"
										x={col}
										y={row}
										width="1"
										height="1"
										transition:fade={{ duration: DURATION.quick }}
									/>
								{/if}
								{#if sq.circled && !sq.black}
									<path
										class="ring"
										d={ringPath(col, row, num ? String(num) : null)}
										stroke-width={ringWidth}
										transition:fade={{ duration: DURATION.quick }}
									/>
								{/if}
								{#if sq.rebus && !sq.black}
									<polygon
										class="rebus"
										points={rebusPoints(col, row)}
										transition:fade={{ duration: DURATION.quick }}
									/>
								{/if}
								{#if sq.letter && !sq.black}
									{#key sq.letter}
										<text
											class="letter"
											x={col + 0.5}
											y={row + 0.6}
											style:font-size={sq.letter.length > 2 ? `${1.3 / sq.letter.length}px` : null}
											in:pop|global>{sq.letter}</text
										>
									{/key}
								{/if}
								{#if num}
									<text
										class="num"
										x={col + NUM.x}
										y={row + NUM.y}
										style:font-size="{NUM.size}px"
										{@attach sq.circled && !sq.black ? measureNum(String(num)) : null}
										in:fade>{num}</text
									>
								{/if}
							{/each}

							<path class="lines" d={linesPath} />
							{#if barsPath}
								<path class="bars" d={barsPath} />
							{/if}

							{#each edges as e, i (`${e.row},${e.col},${e.axis}`)}
								{@const across = e.axis === 'across'}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<rect
									class="grab"
									data-edge={i}
									x={across ? e.col + 1 - GRAB : e.col + GRAB}
									y={across ? e.row : e.row + 1 - GRAB}
									width={across ? GRAB * 2 : 1 - GRAB * 2}
									height={across ? 1 : GRAB * 2}
									onpointerdown={(ev) => onBarDown(ev, e)}
									onpointerenter={(ev) => onBarEnter(ev, e)}
								/>
							{/each}
						</svg>

						<input
							bind:this={input}
							class="typer"
							style:left="{(caretPos?.col ?? 0) * cell}px"
							style:top="{(caretPos?.row ?? 0) * cell}px"
							style:width="{cell}px"
							style:height="{cell}px"
							aria-label="Letters"
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							tabindex={editing ? 0 : -1}
							onkeydown={onInputKey}
							oninput={onInput}
							oncompositionstart={() => (composing = true)}
							oncompositionend={onCompositionEnd}
							onblur={(e) => {
								composing = false;
								if (document.activeElement === e.currentTarget) return;
								closeEditor();
							}}
						/>
					</div>

					<div
						bind:this={clueSheetEl}
						class="clue-sheet"
						style:width="{panelW}px"
						style:height="{panelH}px"
						style:margin-top={narrow ? null : `${GUTTER.y}px`}
					>
						<aside
							class="clues"
							class:on-details={cluePage === 'details'}
							aria-label={cluePage === 'details' ? 'Puzzle details' : 'Clues'}
							bind:this={cluesEl}
						>
							<div class="title-field" bind:this={titleFieldEl}>
								<input
									id="puzzle-title"
									aria-label="Title"
									type="text"
									placeholder="Untitled puzzle"
									autocomplete="off"
									spellcheck="true"
									bind:value={title}
									onblur={commit}
									onkeydown={blurOn(['Enter', 'Escape'])}
								/>
							</div>
							{#if cluePage === 'details'}
								<section class="details" aria-label="Puzzle details">
									<div class="detail" role="group" aria-labelledby="details-by">
										<span class="detail-label" id="details-by">By</span>
										<div class="authors">
											{#each authors, i (i)}
												<div class="author-row" in:fade>
													<input
														id="puzzle-author-{i}"
														type="text"
														placeholder={i === 0 ? 'Author' : 'Another author'}
														aria-label="Author {i + 1}"
														autocomplete="off"
														spellcheck="false"
														bind:value={authors[i]}
														onblur={commit}
														onkeydown={blurOn(['Enter', 'Escape'])}
													/>
													{#if i > 0}
														<button
															type="button"
															class="author-button"
															aria-label="Remove author {i + 1}"
															title="Remove this author"
															onclick={() => removeAuthor(i)}>&minus;</button
														>
													{/if}
													{#if i === authors.length - 1 && authors.length < MAX_AUTHORS}
														<button
															type="button"
															class="author-button"
															aria-label="Add another author"
															title="Add another author"
															onclick={addAuthor}>+</button
														>
													{/if}
												</div>
											{/each}
										</div>
									</div>
									<label class="detail">
										<span class="detail-label">Intro</span>
										<textarea
											rows="3"
											placeholder="Shown to solvers before they start: a theme description, special instructions, an explanation of how the puzzle works, or anything else that helps them get going."
											spellcheck="true"
											bind:value={intro}
											onblur={commit}
											onkeydown={blurOn(['Escape'])}></textarea>
									</label>
									<label class="detail">
										<span class="detail-label">Notes</span>
										<textarea
											rows="3"
											placeholder="Free-form notes about the puzzle: constructor comments, background information, dedications, errata, or other details."
											spellcheck="true"
											bind:value={notes}
											onblur={commit}
											onkeydown={blurOn(['Escape'])}></textarea>
									</label>
								</section>
							{:else}
								{#each [['across', 'Across'], ['down', 'Down']] as const as [ax, title] (ax)}
									<section class="clue-col">
										<h2>{title}</h2>
										{#if clueLists[ax].length === 0}
											<p class="empty">No {ax} entries.</p>
										{:else}
											<ol style:--num-digits={String(clueLists[ax].at(-1)?.number ?? 1).length}>
												{#each clueLists[ax] as c (c.id)}
													<li
														class:active={activeClue === c.id || gridClue === c.id}
														data-clue={c.id}
														animate:flip={{ duration: flipDuration() }}
														in:fade
													>
														<label for="clue-{c.id}" class="clue-num">{c.number}</label>
														<textarea
															id="clue-{c.id}"
															rows="1"
															value={clues[c.id] ?? ''}
															placeholder={cluePlaceholder(c)}
															aria-label="{c.number} {title}, {c.word}"
															spellcheck="true"
															oninput={(e) => (clues[c.id] = e.currentTarget.value)}
															onfocus={() => (activeClue = c.id)}
															onblur={() => {
																if (activeClue === c.id) activeClue = null;
																commit();
															}}
															onkeydown={blurOn(['Enter', 'Escape'])}></textarea>
														<span class="answer">{c.word} ({c.word.length})</span>
													</li>
												{/each}
											</ol>
										{/if}
									</section>
								{/each}
							{/if}
						</aside>
						<button
							type="button"
							class="page-curl"
							class:left={cluePage === 'details'}
							aria-label={cluePage === 'details' ? 'Back to clues' : 'Turn to puzzle details'}
							title={cluePage === 'details' ? 'Back to clues' : 'Puzzle details'}
							onclick={() => showPage(cluePage === 'details' ? 'clues' : 'details')}
						></button>
					</div>
				</div>
				{#if statsOpen}
					<div class="stats-view" transition:fly={{ y: 16, duration: DURATION.slow }}>
						<div class="stats-sheet" style:width="{layoutW}px" style:height="{layoutH}px">
							<LengthHistogram entries={entryLengths} />
						</div>
					</div>
				{/if}
			</div>

			{#if stats}
				<StatusFooter {stats} {bars} {symmetric} {constraintStats} />
			{/if}
		</div>
	{/if}

	{#if confirmNewOpen}
		<Modal title="Start a new grid?" onclose={() => closeConfirmNew(false)}>
			<p>This clears the current puzzle.</p>
			{#snippet actions()}
				<button
					type="button"
					class="secondary"
					onclick={() => closeConfirmNew(false)}
					{@attach (el) => el.focus()}
				>
					Cancel
				</button>
				<button type="button" class="primary" onclick={() => closeConfirmNew(true)}>
					New grid
				</button>
			{/snippet}
		</Modal>
	{/if}

	{#if confirmDownloadOpen}
		<Modal title="Download anyway?" onclose={() => closeConfirmDownload(false)}>
			<p>This puzzle may not be ready yet:</p>
			<ul class="issues">
				{#each confirmDownloadIssues as issue (issue)}
					<li>{issue}</li>
				{/each}
			</ul>
			{#snippet actions()}
				<button
					type="button"
					class="secondary"
					onclick={() => closeConfirmDownload(false)}
					{@attach (el) => el.focus()}
				>
					Cancel
				</button>
				<button type="button" class="primary" onclick={() => closeConfirmDownload(true)}>
					Download
				</button>
			{/snippet}
		</Modal>
	{/if}

	{#if confirmRandomOpen}
		<Modal title="Are you sure?" onclose={() => closeConfirmRandom(false)}>
			<p>
				This will generate a new grid. Existing {bars ? 'bars' : 'blocks'} will be removed{confirmRandomLetters
					? ', along with the entered letters'
					: ''}.
			</p>
			{#snippet actions()}
				<button
					type="button"
					class="secondary"
					onclick={() => closeConfirmRandom(false)}
					{@attach (el) => el.focus()}
				>
					Cancel
				</button>
				<button type="button" class="primary" onclick={() => closeConfirmRandom(true)}>
					Generate
				</button>
			{/snippet}
		</Modal>
	{/if}

	{#if randomSetOpen}
		<Modal title="The grid is already set" onclose={closeRandomSet}>
			<p>No more {bars ? 'bars' : 'blocks'} can be added.</p>
			{#snippet actions()}
				<button type="button" class="primary" onclick={closeRandomSet} {@attach (el) => el.focus()}>
					OK
				</button>
			{/snippet}
		</Modal>
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
	}
	:global(*) {
		scrollbar-width: none;
	}
	:global(*::-webkit-scrollbar) {
		display: none;
	}
	:global(body) {
		font-family: 'Libre Franklin', 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	.mat {
		--mat: #2f5b4c;
		--halftone-strength: 0.1;
		--rule: #e6cf5c;
		--paper: #ffffff;
		--ink: #161616;
		--shade-1: #ff8fa3;
		--shade-2: #74c0f0;
		--shade-3: #8fdc9b;
		--unched: #d7263d;
		--two-letter: #6a32d6;
		--rebus: #0b7285;
		--run: #fff1a1;
		--linked: #fffbdc;
		--caret: #f4c430;
		--on-mat: #eef3ef;
		--on-mat-dim: rgb(238 243 239 / 0.72);

		height: 100vh;
		height: 100dvh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		color: var(--on-mat);
		background-color: var(--mat);
		position: relative;
		isolation: isolate;
	}

	@media (prefers-color-scheme: dark) {
		.mat {
			--mat: #1f3d33;
		}
	}

	:global(.mat button) {
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.mat {
		--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
		--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
		--t-quick: 120ms;
		--t-base: 180ms;
	}
	:global(.mat .primary),
	:global(.mat .secondary),
	:global(.mat .chip) {
		transition:
			background-color var(--t-quick) var(--ease-out),
			color var(--t-quick) var(--ease-out),
			border-color var(--t-quick) var(--ease-out),
			opacity var(--t-quick) var(--ease-out),
			transform var(--t-quick) var(--ease-out);
	}
	:global(.mat .primary:active:not(:disabled)),
	:global(.mat .secondary:active),
	:global(.mat .chip:active) {
		transform: scale(0.97);
	}
	:global(.mat button:focus-visible),
	:global(.mat input:focus-visible) {
		outline: 2px solid var(--rule);
		outline-offset: 2px;
	}

	:global(.mat .primary) {
		min-width: 0;
		padding: 0.85rem 1rem;
		border: 0;
		background: var(--ink);
		color: var(--paper);
		font-weight: 600;
		font-size: 1rem;
	}
	:global(.mat .primary:hover) {
		background: #000;
	}
	:global(.mat .secondary) {
		width: 100%;
		padding: 0.6rem 1rem;
		border: 2px solid var(--ink);
		background: var(--paper);
		color: var(--ink);
		font-weight: 600;
		font-size: 0.9rem;
	}
	:global(.mat .secondary:hover) {
		background: #f1f1ee;
	}
	:global(.mat .primary:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.issues {
		margin: 0.4rem 0 0;
		padding-left: 1.25rem;
	}

	.main {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.bar {
		padding: 0.75rem 1.25rem 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.tools {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	:global(.mat .chip) {
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		background: rgb(0 0 0 / 0.18);
		border-radius: 4px;
		padding: 0 0.7rem;
		font-size: 0.875rem;
		font-weight: 500;
	}
	:global(.mat .chip:hover) {
		background: rgb(0 0 0 / 0.32);
	}
	:global(.mat .chip svg) {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.chip svg .pip {
		fill: currentColor;
		stroke: none;
	}
	.quiet {
		background: transparent;
	}

	.layout {
		display: flex;
		align-items: flex-start;
		gap: 24px;
	}
	.layout.narrow {
		flex-direction: column;
		align-items: center;
	}
	.layout {
		transition:
			opacity var(--t-base) var(--ease-out),
			transform var(--t-base) var(--ease-out),
			visibility 0s;
	}
	.layout.away {
		opacity: 0;
		transform: translateY(-16px) scale(0.98);
		visibility: hidden;
		pointer-events: none;
		transition:
			opacity var(--t-base) var(--ease-out),
			transform var(--t-base) var(--ease-out),
			visibility 0s linear var(--t-base);
	}
	.stats-view {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		box-sizing: border-box;
	}
	.stats-sheet {
		max-width: 100%;
		max-height: 100%;
	}
	.chip.on {
		border-color: var(--rule);
		color: var(--rule);
		font-weight: 600;
	}

	.clue-sheet {
		--curl: 1.6rem;
		flex: 0 0 auto;
		position: relative;
	}
	.clues {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-content: start;
		gap: 1rem;
		padding: 0 1rem 1rem;
		overflow-y: auto;
		scrollbar-width: none;
		background: rgb(0 0 0 / 0.2);
		border: 1px solid rgb(255 255 255 / 0.14);
	}
	.clues::-webkit-scrollbar {
		display: none;
	}
	.clue-col {
		--row-inset: calc(0.3rem + 1px);
		min-width: 0;
	}
	.title-field {
		grid-column: 1 / -1;
		padding-top: 0.75rem;
		display: flex;
		align-items: flex-end;
		padding-right: calc(var(--curl) - 0.5rem);
	}
	.clues.on-details .title-field {
		padding-right: 0;
		padding-left: calc(var(--curl) - 0.5rem);
	}
	.title-field input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		font: inherit;
		font-size: 1rem;
		font-weight: 600;
		color: inherit;
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgb(255 255 255 / 0.3);
		border-radius: 0;
		padding: 0.2rem 0;
		transition: border-color var(--t-quick) var(--ease-out);
	}
	.title-field input::placeholder {
		color: var(--on-mat-dim);
		font-weight: 500;
	}
	.title-field input:hover {
		border-bottom-color: rgb(255 255 255 / 0.6);
	}
	.title-field input:focus-visible {
		outline: none;
		border-bottom: 1px solid var(--rule);
	}
	.page-curl {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 2;
		width: var(--curl);
		height: var(--curl);
		padding: 0;
		border: 0;
		background: linear-gradient(225deg, var(--mat) 50%, transparent 50%);
		transition:
			width var(--t-base) var(--ease-out),
			height var(--t-base) var(--ease-out);
	}
	.page-curl::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			225deg,
			transparent 50%,
			rgb(255 255 255 / 0.92) 50%,
			rgb(214 226 219 / 0.85) 75%,
			rgb(168 186 176 / 0.8) 100%
		);
		border-bottom-left-radius: 45% 45%;
		filter: drop-shadow(-2px 2px 2px rgb(0 0 0 / 0.35));
	}
	.page-curl.left {
		right: auto;
		left: 0;
		transform: scaleX(-1);
	}
	.page-curl:hover,
	.page-curl:focus-visible {
		--curl: 2.1rem;
	}
	.page-curl:focus-visible {
		outline-offset: 0;
	}
	.details {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		padding-top: 0.25rem;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.detail-label {
		padding-bottom: 0.35rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.authors {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.author-row {
		display: flex;
		align-items: flex-end;
		gap: 0.4rem;
	}
	.author-row input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.85rem;
		color: inherit;
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgb(255 255 255 / 0.3);
		border-radius: 0;
		padding: 0.15rem 0;
		transition: border-color var(--t-quick) var(--ease-out);
	}
	.author-row input::placeholder,
	.details textarea::placeholder,
	.clues textarea::placeholder {
		color: var(--on-mat-dim);
	}
	.author-row input:hover {
		border-bottom-color: rgb(255 255 255 / 0.6);
	}
	.author-row input:focus-visible {
		outline: none;
		border-bottom: 1px solid var(--rule);
	}
	.author-button {
		flex: 0 0 auto;
		width: 1.5rem;
		height: 1.5rem;
		display: grid;
		place-items: center;
		padding: 0;
		font-size: 1rem;
		line-height: 1;
		background: transparent;
		border: 1px solid rgb(255 255 255 / 0.35);
		border-radius: 4px;
		transition:
			background-color var(--t-quick) var(--ease-out),
			border-color var(--t-quick) var(--ease-out),
			color var(--t-quick) var(--ease-out);
	}
	.author-button:hover {
		border-color: var(--rule);
		color: var(--rule);
	}
	.details textarea {
		min-height: 4.2em;
	}
	.clues h2 {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: -1rem calc(-1 * var(--row-inset)) 0.5rem;
		padding: 1rem var(--row-inset) 0.35rem;
		background: color-mix(in srgb, var(--mat) 80%, #000);
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.clues ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.clues li {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 0.35rem;
		align-items: baseline;
		margin-inline: calc(-1 * var(--row-inset));
		padding: 0.25rem calc(var(--row-inset) - 1px);
		border-radius: 4px;
		border: 1px solid transparent;
		transition:
			background-color var(--t-base) var(--ease-out),
			border-color var(--t-base) var(--ease-out);
	}
	.clues li.active {
		background: rgb(0 0 0 / 0.22);
		border-color: var(--rule);
	}
	.clue-num {
		font-weight: 700;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
		min-width: calc(var(--num-digits, 2) * 1ch);
	}
	.clues textarea {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		resize: none;
		field-sizing: content;
		font: inherit;
		font-size: 0.85rem;
		line-height: 1.35;
		color: inherit;
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgb(255 255 255 / 0.3);
		border-radius: 0;
		padding: 0.1rem 0;
		overflow: hidden;
		transition: border-color var(--t-quick) var(--ease-out);
	}
	.clues textarea:hover {
		border-bottom-color: rgb(255 255 255 / 0.6);
	}
	.clues textarea:focus-visible {
		outline: none;
		border-bottom: 1px solid var(--rule);
	}
	.answer {
		grid-column: 2;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--on-mat-dim);
		overflow-wrap: anywhere;
	}
	.empty {
		margin: 0;
		font-size: 0.8rem;
		color: var(--on-mat-dim);
	}

	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: auto;
	}
	.sheet {
		position: relative;
		touch-action: pinch-zoom;
		user-select: none;
		-webkit-user-select: none;
	}
	.sheet svg {
		position: relative;
		display: block;
		overflow: visible;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
	}

	.ruler {
		position: absolute;
		display: flex;
		font-size: var(--label-size);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--on-mat-dim);
		pointer-events: none;
	}
	.ruler span {
		flex: 0 0 var(--cell);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			color var(--t-quick) var(--ease-out),
			font-size var(--t-quick) var(--ease-out);
	}
	.ruler.cols {
		left: 0;
		bottom: 100%;
		padding-bottom: 6px;
		align-items: flex-end;
	}
	.ruler.rows {
		top: 0;
		right: 100%;
		padding-right: 7px;
		flex-direction: column;
	}
	.ruler.rows span {
		justify-content: flex-end;
	}
	.ruler span.on {
		font-size: calc(var(--label-size) * 1.25);
		font-weight: 800;
		color: var(--rule);
	}

	.sq {
		fill: var(--paper);
		transition: fill var(--t-quick) var(--ease-out);
	}
	.sq.black {
		fill: #000;
	}
	.sq.shade1 {
		fill: var(--shade-1);
	}
	.sq.shade2 {
		fill: var(--shade-2);
	}
	.sq.shade3 {
		fill: var(--shade-3);
	}
	.sq.linked {
		fill: var(--linked);
	}
	.sq.run {
		fill: var(--run);
	}
	.sq.caret {
		fill: var(--caret);
	}

	rect.unched {
		fill: var(--unched);
		pointer-events: none;
		animation: unched-flash 1s ease-in-out infinite;
	}
	@keyframes unched-flash {
		0%,
		100% {
			opacity: 0.12;
		}
		50% {
			opacity: 0.85;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		rect.unched {
			animation: none;
			opacity: 0.6;
		}
	}

	image.cheater {
		pointer-events: none;
		transform-box: fill-box;
		transform-origin: center;
	}

	pattern rect {
		fill: var(--two-letter);
	}
	rect.two-letter {
		fill: url(#two-letter-hatch);
		opacity: 0.6;
		pointer-events: none;
	}

	text {
		font-family: 'Libre Franklin', 'Helvetica Neue', Arial, sans-serif;
		font-weight: 600;
		font-size: 0.62px;
		fill: var(--ink);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	text.letter {
		transform-box: fill-box;
		transform-origin: center;
	}
	text.num {
		font-weight: 500;
		text-anchor: start;
		dominant-baseline: hanging;
	}

	polygon.rebus {
		fill: var(--rebus);
		pointer-events: none;
	}

	path.ring {
		fill: none;
		stroke: var(--ink);
		stroke-linecap: round;
		pointer-events: none;
	}

	path.lines {
		fill: #000;
		pointer-events: none;
	}

	path.bars {
		fill: #000;
		pointer-events: none;
	}

	.grab {
		fill: var(--caret);
		fill-opacity: 0;
		cursor: pointer;
		transition: fill-opacity var(--t-quick) var(--ease-out);
	}
	.grab:hover {
		fill-opacity: 0.5;
	}

	.typer {
		position: absolute;
		box-sizing: border-box;
		padding: 0;
		border: 0;
		opacity: 0;
		font-size: 16px;
		pointer-events: none;
		caret-color: transparent;
	}

	@media (max-width: 640px) {
		.bar {
			position: relative;
			padding: 0.75rem 0.75rem 0.25rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mat,
		.mat :global(*),
		.mat :global(*::before) {
			transition-duration: 0s !important;
		}
	}
</style>
