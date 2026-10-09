<script lang="ts">
	import { tick } from 'svelte';
	import Halftone from '$lib/Halftone.svelte';
	import {
		MAX_SIZE,
		MIN_SIZE,
		allKeys,
		barField,
		emptySquare,
		entryId,
		keyOf,
		numberEntries,
		otherAxis,
		parseKey,
		runFrom,
		transposeEntryId,
		transposeGrid,
		transposeKey,
		validSize,
		wallsOf,
		type Axis,
		type Grid,
		type GridMode
	} from '$lib/crossword';
	import {
		CONSTRAINTS,
		describeConstraints,
		regionColours,
		unchedSquares,
		whiteRegions,
		type ConstraintKey
	} from '$lib/constraints';
	import { parseIpuz, toIpuz, type Puzzle } from '$lib/ipuz';
	import { rewriteReferences, transposeReferences } from '$lib/references';
	import {
		barCounterparts,
		counterparts,
		describeSymmetry,
		fitsGrid,
		symmetryOptions,
		transposeSymmetry,
		type Bar,
		type SymmetryKey,
		type SymmetryOption
	} from '$lib/symmetry';

	type Pen = 'white' | 'black';

	const DIMS = [
		['cols', 'Columns'],
		['rows', 'Rows']
	] as const;

	const MODES = [
		['squares', 'Squares'],
		['bars', 'Bars']
	] as const satisfies readonly (readonly [GridMode, string])[];

	let sizeInput = $state({ rows: 15, cols: 15 });
	let modeInput = $state<GridMode>('squares');
	let size = $state.raw<{ rows: number; cols: number } | null>(null);
	let mode = $state<GridMode>('squares');
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
			total,
			dims: `${size.rows} × ${size.cols}`,
			white: total - black,
			black,
			whitePct: 100 - blackPct,
			blackPct,
			entries: entries.length,
			across,
			down: entries.length - across
		};
	});

	const BLANK = '·';

	type ClueRow = { id: string; number: number; word: string; keys: string[] };

	let clues = $state<Record<string, string>>({});
	let activeClue = $state<string | null>(null);
	let title = $state('');
	let extra = $state.raw<Record<string, unknown>>({});

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
	const clueText = (c: ClueRow) => clues[c.id] ?? `Clue for ${c.word}`;

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
		const puzzle = toIpuz({ ...size, mode, grid, clues, title, extra });
		const blob = new Blob([JSON.stringify(puzzle, null, 2) + '\n'], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName(title);
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	let pen = $state<Pen>('white');
	let axis = $state<Axis>('across');
	let editing = $state<{ keys: string[]; idx: number } | null>(null);
	let painting = false;
	let lastPaint = { key: '', time: 0 };
	let barStroke: boolean | null = null;

	let chosenSymmetry = $state<SymmetryKey[]>([]);
	let symmetryOpen = $state(false);
	let symmetryEl = $state<HTMLDivElement>();

	const symmetry = $derived(size ? symmetryOptions(chosenSymmetry, size.rows, size.cols) : []);
	const activeSymmetry = $derived(symmetry.filter((s) => s.checked).map((s) => s.key));
	const symmetryName = $derived(describeSymmetry(activeSymmetry));

	function toggleSymmetry(option: SymmetryOption) {
		if (!option.available || option.impliedBy) return;
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

	let chosenConstraints = $state<ConstraintKey[]>([]);
	let constraintsOpen = $state(false);
	let constraintsEl = $state<HTMLDivElement>();

	const interlock = $derived(chosenConstraints.includes('interlock'));
	const regions = $derived(size && interlock ? whiteRegions(size.rows, size.cols, walls) : null);
	const shades = $derived(
		size && regions ? regionColours(regions, size.rows, size.cols) : new Map<string, number>()
	);
	const noUnches = $derived(chosenConstraints.includes('unches'));
	const unched = $derived(size && noUnches ? unchedSquares(size.rows, size.cols, walls) : null);
	const constraintsName = $derived(describeConstraints(chosenConstraints, regions, unched));

	function toggleConstraint(key: ConstraintKey) {
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

	let dpr = $state(1);
	$effect(() => {
		let mq: MediaQueryList | undefined;
		const update = () => {
			mq?.removeEventListener('change', update);
			dpr = window.devicePixelRatio || 1;
			mq = matchMedia(`(resolution: ${dpr}dppx)`);
			mq.addEventListener('change', update);
		};
		update();
		return () => mq?.removeEventListener('change', update);
	});

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
	let layoutEl = $state<HTMLDivElement>();
	$effect(() => {
		void [cellDev, dpr, size, winW];
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

	const runSet = $derived(new Set(editing?.keys ?? []));
	const caretKey = $derived(editing ? editing.keys[editing.idx] : null);
	const caretPos = $derived(caretKey ? parseKey(caretKey) : null);

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
		extra = p.extra;
		pen = 'white';
		axis = 'across';
		editing = null;
		hoverKey = null;
		symmetryOpen = false;
		constraintsOpen = false;
		chosenSymmetry = chosenSymmetry.filter((k) => fitsGrid(k, p.rows, p.cols));
		sizeInput = { rows: p.rows, cols: p.cols };
		modeInput = p.mode;
		mode = p.mode;
		size = { rows: p.rows, cols: p.cols };
	}

	function start() {
		const rows = Math.round(Number(sizeInput.rows));
		const cols = Math.round(Number(sizeInput.cols));
		if (!validSize(rows) || !validSize(cols)) return;
		const fresh: Grid = {};
		for (const k of allKeys(rows, cols)) fresh[k] = emptySquare();
		load({ rows, cols, mode: modeInput, grid: fresh, clues: {}, title: '', extra: {} });
	}

	let importError = $state('');
	let importInput = $state<HTMLInputElement>();

	async function importFile(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const file = el.files?.[0];
		el.value = '';
		if (!file) return;
		importError = '';
		let p: Puzzle;
		try {
			p = parseIpuz(await file.text());
		} catch (err) {
			importError =
				err instanceof SyntaxError
					? 'That file isn’t valid IPUZ.'
					: err instanceof Error
						? err.message
						: 'Couldn’t read that file.';
			return;
		}
		load(p);
	}

	function newGrid() {
		const used =
			Object.values(grid).some((s) => s.black || s.letter || s.barRight || s.barBottom) ||
			Object.keys(clues).length > 0 ||
			title.trim() !== '';
		if (used && !confirm('Start a new grid? This clears the current puzzle.')) return;
		editing = null;
		size = null;
	}

	function transpose() {
		if (!size) return;
		const { rows, cols } = size;
		const flipped = transposeGrid(grid, rows, cols);
		const moved = transposeReferences(
			numberEntries(rows, cols, wallsOf(grid)),
			numberEntries(cols, rows, wallsOf(flipped))
		);
		grid = flipped;
		clues = Object.fromEntries(
			Object.entries(clues).map(([id, text]) => [
				transposeEntryId(id),
				rewriteReferences(text, moved)
			])
		);
		if (activeClue) activeClue = transposeEntryId(activeClue);
		if (editing) editing = { keys: editing.keys.map(transposeKey), idx: editing.idx };
		axis = otherAxis(axis);
		chosenSymmetry = transposeSymmetry(chosenSymmetry);
		hoverKey = null;
		symmetryOpen = false;
		constraintsOpen = false;
		sizeInput = { rows: cols, cols: rows };
		size = { rows: cols, cols: rows };
	}

	function paint(key: string) {
		if (!size) return;
		const black = pen === 'black';
		if (grid[key].black === black) return;
		const { row, col } = parseKey(key);
		for (const k of [key, ...counterparts(row, col, size.rows, size.cols, activeSymmetry)]) {
			grid[k].black = black;
			if (black) grid[k].letter = '';
		}
		lastPaint = { key, time: performance.now() };
		editing = null;
	}

	function setBar(bar: Bar, on: boolean) {
		if (!size) return;
		if (grid[keyOf(bar.row, bar.col)][barField(bar.axis)] === on) return;
		for (const b of [bar, ...barCounterparts(bar, size.rows, size.cols, activeSymmetry)])
			grid[keyOf(b.row, b.col)][barField(b.axis)] = on;
		editing = null;
	}

	function onBarDown(e: PointerEvent, bar: Bar) {
		e.preventDefault();
		if (e.button !== 0) return;
		editing = null;
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
		if (editing) {
			const i = editing.keys.indexOf(key);
			if (i >= 0 && (bars || pen === 'white')) {
				editing.idx = i;
				return;
			}
			editing = null;
		}
		if (bars) {
			openEditor(key, axis);
			return;
		}
		painting = true;
		paint(key);
	}

	function onCellEnter(e: PointerEvent, key: string) {
		hoverKey = key;
		if (!bars && painting && e.buttons & 1) paint(key);
	}

	function onCellDouble(key: string) {
		if (bars || grid[key].black) return;
		if (lastPaint.key === key && performance.now() - lastPaint.time < 600) return;
		openEditor(key, axis);
	}

	async function openEditor(key: string, a: Axis) {
		if (!size) return;
		axis = a;
		editing = { keys: runFrom(key, a, walls, size.rows, size.cols), idx: 0 };
		await tick();
		input?.focus({ preventScroll: true });
	}

	function toggleDirection() {
		const other = axis === 'across' ? 'down' : 'across';
		if (editing) openEditor(editing.keys[editing.idx], other);
		else axis = other;
	}

	function closeEditor() {
		editing = null;
	}

	function typeLetter(ch: string) {
		if (!editing) return;
		grid[editing.keys[editing.idx]].letter = ch.toLocaleUpperCase();
		if (editing.idx < editing.keys.length - 1) editing.idx++;
	}

	function backspace() {
		if (!editing) return;
		const k = editing.keys[editing.idx];
		if (grid[k].letter) grid[k].letter = '';
		else if (editing.idx > 0) {
			editing.idx--;
			grid[editing.keys[editing.idx]].letter = '';
		}
	}

	function onInputKey(e: KeyboardEvent) {
		if (!editing) return;
		if (e.key === 'Enter') {
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
			grid[editing.keys[editing.idx]].letter = '';
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			editing.idx = Math.max(0, editing.idx - 1);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			editing.idx = Math.min(editing.keys.length - 1, editing.idx + 1);
		} else if (e.key.length === 1 && /\p{L}/u.test(e.key) && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			typeLetter(e.key);
		}
	}

	function onInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		for (const ch of el.value) if (/\p{L}/u.test(ch)) typeLetter(ch);
		el.value = '';
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (symmetryOpen && !symmetryEl?.contains(e.target as Node)) symmetryOpen = false;
		if (constraintsOpen && !constraintsEl?.contains(e.target as Node)) constraintsOpen = false;
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && (symmetryOpen || constraintsOpen)) {
			symmetryOpen = false;
			constraintsOpen = false;
			return;
		}
		if (size === null || bars || e.code !== 'Space') return;
		const t = e.target as HTMLElement | null;
		if ((t instanceof HTMLInputElement && t !== input) || t instanceof HTMLTextAreaElement) return;
		e.preventDefault();
		pen = pen === 'white' ? 'black' : 'white';
	}

	function keepFocus(e: MouseEvent) {
		e.preventDefault();
	}

	const ARROWS: Record<Axis, [number, number][]> = {
		across: [
			[0.94, 0.5],
			[0.82, 0.39],
			[0.82, 0.61]
		],
		down: [
			[0.5, 0.94],
			[0.39, 0.82],
			[0.61, 0.82]
		]
	};
	const arrowPoints = (dir: Axis, x: number, y: number) =>
		ARROWS[dir].map(([a, b]) => `${x + a},${y + b}`).join(' ');
</script>

<svelte:head>
	<title>Grids</title>
</svelte:head>

<svelte:window
	bind:innerWidth={winW}
	onkeydown={onWindowKey}
	onpointerdown={onWindowPointerDown}
	onpointerup={() => {
		painting = false;
		barStroke = null;
	}}
/>

<main class="mat">
	<Halftone />
	{#if size === null}
		<section class="setup">
			<h1>Grids</h1>
			<p>A crossword on a plain rectangular grid.</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					start();
				}}
			>
				<div class="sizes">
					{#each DIMS as [dim, label] (dim)}
						<div>
							<label for="size-{dim}">{label}</label>
							<div class="size-row">
								<button
									type="button"
									class="step"
									aria-label="Fewer {label.toLowerCase()}"
									onclick={() => (sizeInput[dim] = Math.max(MIN_SIZE, sizeInput[dim] - 1))}
									>−</button
								>
								<input
									id="size-{dim}"
									type="number"
									min={MIN_SIZE}
									max={MAX_SIZE}
									bind:value={sizeInput[dim]}
								/>
								<button
									type="button"
									class="step"
									aria-label="More {label.toLowerCase()}"
									onclick={() => (sizeInput[dim] = Math.min(MAX_SIZE, sizeInput[dim] + 1))}
									>+</button
								>
							</div>
						</div>
					{/each}
				</div>
				<div class="create-row">
					<div class="segmented" role="radiogroup" aria-label="Divided by">
						{#each MODES as [value, label] (value)}
							<label class="segment" class:on={modeInput === value}>
								<input type="radio" name="mode" {value} bind:group={modeInput} />
								{label}
							</label>
						{/each}
					</div>
					<button
						type="submit"
						class="primary"
						disabled={!DIMS.every(
							([dim]) => sizeInput[dim] >= MIN_SIZE && sizeInput[dim] <= MAX_SIZE
						)}
					>
						Create
					</button>
				</div>
				<div class="or" aria-hidden="true">or</div>
				<button type="button" class="secondary" onclick={() => importInput?.click()}>
					Import IPUZ
				</button>
				<input bind:this={importInput} type="file" accept=".ipuz" hidden onchange={importFile} />
				{#if importError}
					<p class="import-error" role="alert">{importError}</p>
				{/if}
			</form>
		</section>
	{:else}
		<div class="main">
			<header class="bar">
				<div class="row">
					<div class="tools">
						<button class="chip quiet" onclick={newGrid}>New grid</button>

						{#if !bars}
							<button
								class="pen"
								onmousedown={keepFocus}
								onclick={() => (pen = pen === 'white' ? 'black' : 'white')}
								aria-label="Pen: {pen}. Press space to switch."
								title="Switch pen (Space)"
							>
								<span class="swatch white" class:on={pen === 'white'}></span>
								<span class="swatch black" class:on={pen === 'black'}></span>
								<span class="pen-label">{pen === 'white' ? 'White pen' : 'Black pen'}</span>
								<kbd>Space</kbd>
							</button>
						{/if}

						<button
							class="chip"
							onmousedown={keepFocus}
							onclick={toggleDirection}
							title="Switch typing direction (Enter while typing)"
						>
							<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
								{#if axis === 'across'}
									<path d="M2 8h11M9.5 4.5 13 8l-3.5 3.5" />
								{:else}
									<path d="M8 2v11M4.5 9.5 8 13l3.5-3.5" />
								{/if}
							</svg>
							{axis === 'across' ? 'Across' : 'Down'}
							<kbd>⏎</kbd>
						</button>

						<div class="symmetry" bind:this={symmetryEl}>
							<button
								class="chip"
								class:on={activeSymmetry.length > 0}
								aria-haspopup="true"
								aria-expanded={symmetryOpen}
								onmousedown={keepFocus}
								onclick={() => {
									symmetryOpen = !symmetryOpen;
									constraintsOpen = false;
								}}
								title={bars
									? 'Mirror bars as you place them'
									: 'Mirror black squares as you place them'}
							>
								<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
									<path d="M8 1.5v13" stroke-dasharray="2 2.2" />
									<path d="M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3" />
								</svg>
								Symmetry
								<span class="symmetry-name">{symmetryName}</span>
							</button>

							{#if symmetryOpen}
								<div class="symmetry-menu" role="group" aria-label="Symmetry">
									<p>
										{bars
											? 'Bars you add or remove are mirrored as you go.'
											: 'Squares you blacken or clear are mirrored as you go.'} Nothing already in the
										grid changes when you switch this on or off.
									</p>
									{#each symmetry as s (s.key)}
										{@const hint = symmetryHint(s)}
										<label
											class="option"
											class:locked={s.impliedBy !== null}
											class:unavailable={!s.available}
										>
											<input
												type="checkbox"
												checked={s.checked}
												disabled={!s.available || s.impliedBy !== null}
												onchange={() => toggleSymmetry(s)}
											/>
											<svg
												class="glyph"
												viewBox="0 0 16 16"
												width="16"
												height="16"
												aria-hidden="true"
											>
												{#if s.key === 'rot180'}
													<path d="M8 3a5 5 0 0 1 0 10M10.2 10.8 8 13l2.2 2.2" />
													<circle cx="8" cy="8" r="1" />
												{:else if s.key === 'rot90'}
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
														}[s.key]}
													/>
												{/if}
											</svg>
											<span class="option-text">
												<span class="option-label">{s.label}</span>
												{#if hint}<span class="option-hint">{hint}</span>{/if}
											</span>
										</label>
									{/each}
									<button
										class="symmetry-off"
										disabled={activeSymmetry.length === 0}
										onclick={() => (chosenSymmetry = [])}
									>
										Turn symmetry off
									</button>
								</div>
							{/if}
						</div>

						<div class="menu constraints" bind:this={constraintsEl}>
							<button
								class="chip"
								class:on={chosenConstraints.length > 0}
								aria-haspopup="true"
								aria-expanded={constraintsOpen}
								onmousedown={keepFocus}
								onclick={() => {
									constraintsOpen = !constraintsOpen;
									symmetryOpen = false;
								}}
								title="Check the grid against construction rules"
							>
								<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
									<rect x="2.5" y="2.5" width="11" height="11" />
									<path d="M2.5 8h11M8 2.5v11" />
								</svg>
								Constraints
								<span class="menu-name">{constraintsName}</span>
							</button>

							{#if constraintsOpen}
								<div class="menu-panel" role="group" aria-label="Constraints">
									<p>
										Constraints only flag what they find. Nothing in the grid is changed for you.
									</p>
									{#each CONSTRAINTS as c (c.key)}
										<label class="option">
											<input
												type="checkbox"
												checked={chosenConstraints.includes(c.key)}
												onchange={() => toggleConstraint(c.key)}
											/>
											<svg
												class="glyph"
												viewBox="0 0 16 16"
												width="16"
												height="16"
												aria-hidden="true"
											>
												{#if c.key === 'interlock'}
													<path d="M3 6.5h6.5V13" />
													<path class="axis" d="M6.5 3v6.5H13" />
												{:else}
													<rect x="3" y="3" width="10" height="10" />
													<path class="axis" d="M3 8h10" />
												{/if}
											</svg>
											<span class="option-text">
												<span class="option-label">{c.label}</span>
											</span>
										</label>
									{/each}
									{#if (interlock && regions && regions.count > 1) || (unched && unched.size > 0)}
										<p class="menu-note" role="status">
											{#if interlock && regions && regions.count > 1}
												The white squares fall into {regions.count} separate regions, shaded below.
											{/if}
											{#if unched && unched.size > 0}
												{unched.size === 1
													? 'One white square is unchecked'
													: `${unched.size} white squares are unchecked`}, flashing below.
											{/if}
										</p>
									{/if}
									<button
										class="menu-off"
										disabled={chosenConstraints.length === 0}
										onclick={() => (chosenConstraints = [])}
									>
										Turn constraints off
									</button>
								</div>
							{/if}
						</div>

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
							onmousedown={keepFocus}
							onclick={download}
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
				<div class="layout" class:narrow bind:this={layoutEl}>
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
									class:run={runSet.has(key) || clueSet.has(key)}
									class:caret={key === caretKey}
									onpointerdown={(e) => onCellDown(e, key)}
									onpointerenter={(e) => onCellEnter(e, key)}
									ondblclick={() => onCellDouble(key)}
								/>
								{#if unched?.has(key)}
									<rect class="unched" x={col} y={row} width="1" height="1" />
								{/if}
								{#if sq.letter && !sq.black}
									<text
										x={col + 0.5}
										y={row + (num ? 0.6 : 0.54)}
										style:font-size={sq.letter.length > 2 ? `${1.3 / sq.letter.length}px` : null}
										>{sq.letter}</text
									>
								{/if}
								{#if num}
									<text class="num" x={col + 0.06} y={row + 0.05}>{num}</text>
								{/if}
							{/each}

							<path class="lines" d={linesPath} />
							{#if barsPath}
								<path class="bars" d={barsPath} />
							{/if}

							{#each edges as e (`${e.row},${e.col},${e.axis}`)}
								{@const across = e.axis === 'across'}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<rect
									class="grab"
									x={across ? e.col + 1 - GRAB : e.col + GRAB}
									y={across ? e.row : e.row + 1 - GRAB}
									width={across ? GRAB * 2 : 1 - GRAB * 2}
									height={across ? 1 : GRAB * 2}
									onpointerdown={(ev) => onBarDown(ev, e)}
									onpointerenter={(ev) => onBarEnter(ev, e)}
								/>
							{/each}

							{#if caretPos}
								<polygon class="arrow" points={arrowPoints(axis, caretPos.col, caretPos.row)} />
							{/if}
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
							onblur={closeEditor}
						/>
					</div>

					<aside
						class="clues"
						aria-label="Clues"
						style:width="{panelW}px"
						style:height="{panelH}px"
						style:margin-top={narrow ? null : `${GUTTER.y}px`}
					>
						<div class="title-field">
							<input
								id="puzzle-title"
								type="text"
								placeholder="Untitled puzzle"
								autocomplete="off"
								spellcheck="true"
								bind:value={title}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === 'Escape') {
										e.preventDefault();
										e.currentTarget.blur();
									}
								}}
							/>
						</div>
						{#each [['across', 'Across'], ['down', 'Down']] as const as [ax, title] (ax)}
							<section class="clue-col">
								<h2>{title}</h2>
								{#if clueLists[ax].length === 0}
									<p class="empty">No {ax} entries.</p>
								{:else}
									<ol>
										{#each clueLists[ax] as c (c.id)}
											<li class:active={activeClue === c.id}>
												<label for="clue-{c.id}" class="clue-num">{c.number}</label>
												<textarea
													id="clue-{c.id}"
													rows="1"
													value={clueText(c)}
													aria-label="{c.number} {title}, {c.word}"
													spellcheck="true"
													oninput={(e) => (clues[c.id] = e.currentTarget.value)}
													onfocus={() => (activeClue = c.id)}
													onblur={() => {
														if (activeClue === c.id) activeClue = null;
													}}
													onkeydown={(e) => {
														if (e.key === 'Enter' || e.key === 'Escape') {
															e.preventDefault();
															e.currentTarget.blur();
														}
													}}></textarea>
												<span class="answer">{c.word} ({c.word.length})</span>
											</li>
										{/each}
									</ol>
								{/if}
							</section>
						{/each}
					</aside>
				</div>
			</div>

			{#if stats}
				<footer class="status" aria-label="Grid statistics">
					<div class="status-group">
						<span class="stat">
							<span class="stat-label">Total squares</span>
							<span class="stat-value">{stats.total}</span>
							<span class="stat-note" title="Rows × columns">({stats.dims})</span>
						</span>
						{#if !bars || stats.black > 0}
							<span class="stat">
								<span class="stat-label">White squares</span>
								<span class="stat-value">{stats.white}</span>
								<span class="stat-note">({stats.whitePct}%)</span>
							</span>
							<span class="stat">
								<span class="stat-label">Black squares</span>
								<span class="stat-value">{stats.black}</span>
								<span class="stat-note">({stats.blackPct}%)</span>
							</span>
						{/if}
					</div>

					<span class="status-split" aria-hidden="true"></span>

					<div class="status-group">
						<span class="stat">
							<span class="stat-label">Total entries</span>
							<span class="stat-value">{stats.entries}</span>
						</span>
						<span class="stat">
							<span class="stat-label">Across entries</span>
							<span class="stat-value">{stats.across}</span>
						</span>
						<span class="stat">
							<span class="stat-label">Down entries</span>
							<span class="stat-value">{stats.down}</span>
						</span>
					</div>
				</footer>
			{/if}
		</div>
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
		--run: #fff1a1;
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

	h1 {
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 0;
	}

	button {
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--rule);
		outline-offset: 2px;
	}

	.setup {
		--pair-gap: 0.5rem;
		--pair-cols: minmax(0, 1fr) minmax(0, 1fr);
		margin: auto;
		width: min(26rem, calc(100% - 2rem));
		box-sizing: border-box;
		padding: 2rem 2rem 1.75rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
	}
	.setup h1 {
		font-size: 1.75rem;
		line-height: 1.1;
	}
	.setup p {
		margin: 0.75rem 0 1.5rem;
		line-height: 1.5;
		color: #4a4f4c;
	}
	.setup label {
		display: block;
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.create-row {
		display: grid;
		grid-template-columns: var(--pair-cols);
		align-items: stretch;
		gap: var(--pair-gap);
	}
	.segmented {
		display: flex;
		min-width: 0;
	}
	.setup .segment {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		padding: 0 0.5rem;
		font-weight: 600;
		font-size: 0.8rem;
		color: var(--ink);
		background: var(--paper);
		border: 2px solid var(--ink);
		cursor: pointer;
	}
	.segment + .segment {
		margin-left: -2px;
	}
	.segment:hover {
		background: #f1f1ee;
	}
	.segment.on {
		background: var(--ink);
		color: var(--paper);
	}
	.segment input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.segment:has(input:focus-visible) {
		outline: 2px solid var(--rule);
		outline-offset: 2px;
	}

	.sizes {
		display: grid;
		grid-template-columns: var(--pair-cols);
		gap: 1rem var(--pair-gap);
		margin-bottom: 1.5rem;
	}
	.sizes > div {
		min-width: 0;
	}
	.size-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.size-row input {
		flex: 1 1 0;
		min-width: 0;
		height: 2.5rem;
		box-sizing: border-box;
		text-align: center;
		font: inherit;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--ink);
		background: var(--paper);
		border: 2px solid var(--ink);
		border-radius: 0;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.size-row input::-webkit-inner-spin-button,
	.size-row input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}
	.step {
		flex: none;
		width: 2.5rem;
		height: 2.5rem;
		border: 2px solid var(--ink);
		border-radius: 0;
		background: var(--paper);
		color: var(--ink);
		font-size: 1.25rem;
		line-height: 1;
	}
	.step:hover {
		background: #f1f1ee;
	}
	@media (max-width: 24rem) {
		.size-row {
			gap: 0.25rem;
		}
		.step {
			width: 2rem;
		}
	}
	.primary {
		min-width: 0;
		padding: 0.85rem 1rem;
		border: 0;
		background: var(--ink);
		color: var(--paper);
		font-weight: 600;
		font-size: 1rem;
	}
	.primary:hover {
		background: #000;
	}
	.or {
		margin: 0.6rem 0;
		text-align: center;
		font-size: 0.8rem;
		color: #6b706d;
	}
	.secondary {
		width: 100%;
		padding: 0.6rem 1rem;
		border: 2px solid var(--ink);
		background: var(--paper);
		color: var(--ink);
		font-weight: 600;
		font-size: 0.9rem;
	}
	.secondary:hover {
		background: #f1f1ee;
	}
	.setup .import-error {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: #b3261e;
	}
	.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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
	.pen,
	.chip {
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
	.pen:hover,
	.chip:hover {
		background: rgb(0 0 0 / 0.32);
	}
	.chip svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.quiet {
		background: transparent;
	}

	.symmetry,
	.menu {
		position: relative;
		display: inline-flex;
	}
	.symmetry-name,
	.menu-name {
		color: var(--on-mat-dim);
	}
	.chip.on .symmetry-name,
	.chip.on .menu-name {
		color: var(--rule);
		font-weight: 600;
	}
	.symmetry-menu,
	.menu-panel {
		position: absolute;
		z-index: 10;
		top: calc(100% + 6px);
		right: 0;
		width: 18rem;
		box-sizing: border-box;
		padding: 0.75rem;
		background: color-mix(in srgb, var(--mat) 55%, #000);
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 4px;
		box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
	}
	.symmetry-menu p,
	.menu-panel p {
		margin: 0 0.4rem 0.5rem;
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--on-mat-dim);
	}
	.option {
		display: grid;
		grid-template-columns: 1rem 1rem 1fr;
		align-items: center;
		column-gap: 0.6rem;
		min-height: 2.4rem;
		padding: 0 0.4rem;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.option:hover {
		background: rgb(255 255 255 / 0.08);
	}
	.option.locked,
	.option.unavailable {
		cursor: not-allowed;
		background: none;
	}
	.option input {
		appearance: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		box-sizing: border-box;
		display: grid;
		place-content: center;
		border: 1.5px solid var(--on-mat);
		border-radius: 2px;
		background: transparent;
		cursor: inherit;
	}
	.option input::before {
		content: '';
		width: 0.6rem;
		height: 0.6rem;
		background: var(--ink);
		clip-path: polygon(13% 52%, 0 66%, 38% 100%, 100% 22%, 86% 9%, 37% 70%);
		scale: 0;
	}
	.option input:checked {
		background: var(--rule);
		border-color: var(--rule);
	}
	.option input:checked::before {
		scale: 1;
	}
	.option.locked input {
		opacity: 0.5;
	}
	.option.unavailable input,
	.option.unavailable .glyph,
	.option.unavailable .option-label {
		opacity: 0.4;
	}
	.glyph {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.glyph rect {
		opacity: 0.5;
	}
	.glyph circle {
		fill: currentColor;
		stroke: none;
	}
	.glyph .axis {
		stroke: var(--rule);
	}
	.option-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		line-height: 1.2;
	}
	.option-hint {
		font-size: 0.72rem;
		color: var(--on-mat-dim);
	}
	.symmetry-off,
	.menu-off {
		width: 100%;
		height: 2rem;
		margin-top: 0.5rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 4px;
		background: transparent;
		font-size: 0.8rem;
		font-weight: 500;
	}
	.symmetry-off:hover,
	.menu-off:hover {
		background: rgb(255 255 255 / 0.08);
	}
	.symmetry-off:disabled,
	.menu-off:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: transparent;
	}

	.menu-panel p.menu-note {
		margin: 0.5rem 0.4rem 0;
		padding-top: 0.5rem;
		border-top: 1px solid rgb(255 255 255 / 0.18);
	}

	.swatch {
		width: 14px;
		height: 14px;
		box-sizing: border-box;
		border: 1.5px solid var(--on-mat);
		opacity: 0.45;
		transition:
			transform 120ms,
			opacity 120ms;
	}
	.swatch.white {
		background: #fff;
	}
	.swatch.black {
		background: #000;
		margin-left: -0.3rem;
	}
	.swatch.on {
		opacity: 1;
		transform: scale(1.2);
		outline: 2px solid var(--rule);
		outline-offset: 1px;
	}
	.pen-label {
		min-width: 4.6rem;
		text-align: left;
	}
	kbd {
		font: inherit;
		font-size: 0.72rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid rgb(255 255 255 / 0.35);
		border-radius: 3px;
		color: var(--on-mat-dim);
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

	.clues {
		flex: 0 0 auto;
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-content: start;
		gap: 1rem;
		padding: 0.75rem 1rem 1rem;
		overflow-y: auto;
		scrollbar-width: none;
		background: rgb(0 0 0 / 0.2);
		border: 1px solid rgb(255 255 255 / 0.14);
	}
	.clues::-webkit-scrollbar {
		display: none;
	}
	.clue-col {
		min-width: 0;
	}
	.title-field {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.title-field input {
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
	.clues h2 {
		margin: 0 0 0.5rem;
		padding-bottom: 0.35rem;
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
		grid-template-columns: 1.6rem 1fr;
		column-gap: 0.25rem;
		align-items: baseline;
		padding: 0.25rem 0.3rem;
		border-radius: 4px;
		border: 1px solid transparent;
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
		padding-right: 0.2rem;
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
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: auto;
	}
	.status {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		padding: 0.5rem 1.25rem;
		border-top: 1px solid rgb(255 255 255 / 0.14);
		background: rgb(0 0 0 / 0.2);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.4;
	}
	.status-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.55rem;
	}
	.status-split {
		width: 1px;
		align-self: stretch;
		min-height: 1rem;
		background: rgb(255 255 255 / 0.22);
	}
	.stat {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.stat + .stat::before {
		content: '';
		width: 1px;
		align-self: stretch;
		margin-right: 0.25rem;
		background: rgb(255 255 255 / 0.16);
	}
	.stat-label {
		color: var(--on-mat-dim);
	}
	.stat-value {
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.stat-note {
		color: var(--on-mat-dim);
		font-size: 0.72rem;
	}

	.sheet {
		position: relative;
		touch-action: manipulation;
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

	text {
		font-family: 'Libre Franklin', 'Helvetica Neue', Arial, sans-serif;
		font-weight: 600;
		font-size: 0.62px;
		fill: var(--ink);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	text.num {
		font-size: 0.27px;
		font-weight: 500;
		text-anchor: start;
		dominant-baseline: hanging;
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
		fill: transparent;
		cursor: pointer;
	}
	.grab:hover {
		fill: var(--caret);
		fill-opacity: 0.5;
	}

	.arrow {
		fill: var(--ink);
		opacity: 0.55;
		pointer-events: none;
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
		.symmetry,
		.menu {
			position: static;
		}
		.symmetry-menu,
		.menu-panel {
			top: 100%;
			left: 0.75rem;
			right: 0.75rem;
			width: auto;
		}
		.pen-label,
		kbd {
			display: none;
		}
		.status {
			padding: 0.5rem 0.75rem;
			font-size: 0.72rem;
		}
		.status-split {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.swatch {
			transition: none;
		}
	}
</style>
