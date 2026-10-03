<script lang="ts">
	import { tick } from 'svelte';
	import Halftone from '$lib/Halftone.svelte';
	import {
		MAX_SIZE,
		MIN_SIZE,
		allKeys,
		entryId,
		numberEntries,
		parseKey,
		runFrom,
		validSize,
		type Axis,
		type Grid
	} from '$lib/crossword';
	import { parseIpuz, toIpuz, type Puzzle } from '$lib/ipuz';

	type Pen = 'white' | 'black';

	const DIMS = [
		['cols', 'Columns'],
		['rows', 'Rows']
	] as const;

	let sizeInput = $state({ rows: 15, cols: 15 });
	let size = $state.raw<{ rows: number; cols: number } | null>(null);

	let grid = $state<Grid>({});

	const cells = $derived(
		size ? allKeys(size.rows, size.cols).map((key) => ({ key, ...parseKey(key) })) : []
	);

	const complete = $derived(
		size !== null && Object.values(grid).every((sq) => sq.black || sq.letter !== '')
	);
	const numbering = $derived(
		complete && size ? numberEntries(size.rows, size.cols, (k) => grid[k].black) : null
	);

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
				word: e.keys.map((k) => grid[k].letter).join(''),
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
		if (!numbering || !size) return;
		const puzzle = toIpuz({ ...size, grid, clues, title, extra });
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
		const side = numbering && !narrow ? panelW + PANEL_GAP : 0;
		const below = numbering && narrow ? panelH + PANEL_GAP : 0;
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

	const linesPath = $derived.by(() => {
		if (!size) return '';
		const k = 1 / cellDev;
		const lw = Math.max(1, Math.round(dpr));
		const lead = Math.ceil(lw / 2);
		const bar = (x: number, y: number, w: number, h: number) =>
			`M${x * k} ${y * k}h${w * k}v${h * k}h${-w * k}z`;
		let d = '';
		for (let c = 0; c <= size.cols; c++)
			d += bar(c * cellDev - lead, -lead, lw, size.rows * cellDev + lw);
		for (let r = 0; r <= size.rows; r++)
			d += bar(-lead, r * cellDev - lead, size.cols * cellDev + lw, lw);
		return d;
	});

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
		void [cellDev, dpr, size, numbering, winW];
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
		sizeInput = { rows: p.rows, cols: p.cols };
		size = { rows: p.rows, cols: p.cols };
	}

	function start() {
		const rows = Math.round(Number(sizeInput.rows));
		const cols = Math.round(Number(sizeInput.cols));
		if (!validSize(rows) || !validSize(cols)) return;
		const fresh: Grid = {};
		for (const k of allKeys(rows, cols)) fresh[k] = { black: false, letter: '' };
		load({ rows, cols, grid: fresh, clues: {}, title: '', extra: {} });
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
			Object.values(grid).some((s) => s.black || s.letter) ||
			Object.keys(clues).length > 0 ||
			title.trim() !== '';
		if (used && !confirm('Start a new grid? This clears the current puzzle.')) return;
		editing = null;
		size = null;
	}

	function paint(key: string) {
		const sq = grid[key];
		if (pen === 'black' && !sq.black) {
			sq.black = true;
			sq.letter = '';
		} else if (pen === 'white' && sq.black) {
			sq.black = false;
		} else return;
		lastPaint = { key, time: performance.now() };
		editing = null;
	}

	function onCellDown(e: PointerEvent, key: string) {
		e.preventDefault();
		if (e.button !== 0) return;
		if (editing) {
			const i = editing.keys.indexOf(key);
			if (i >= 0 && pen === 'white') {
				editing.idx = i;
				return;
			}
			editing = null;
		}
		painting = true;
		paint(key);
	}

	function onCellEnter(e: PointerEvent, key: string) {
		hoverKey = key;
		if (painting && e.buttons & 1) paint(key);
	}

	function onCellDouble(key: string) {
		if (grid[key].black) return;
		if (lastPaint.key === key && performance.now() - lastPaint.time < 600) return;
		openEditor(key, axis);
	}

	async function openEditor(key: string, a: Axis) {
		if (!size) return;
		axis = a;
		editing = { keys: runFrom(key, a, (k) => grid[k].black, size.rows, size.cols), idx: 0 };
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

	function onWindowKey(e: KeyboardEvent) {
		if (size === null || e.code !== 'Space') return;
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
	onpointerup={() => (painting = false)}
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
				<button
					type="submit"
					class="primary"
					disabled={!DIMS.every(
						([dim]) => sizeInput[dim] >= MIN_SIZE && sizeInput[dim] <= MAX_SIZE
					)}
				>
					Create
				</button>
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

						{#if numbering}
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
						{/if}
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
						style:cursor={cursorFor(pen)}
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
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<rect
									x={col}
									y={row}
									width="1"
									height="1"
									class="sq"
									class:black={sq.black}
									class:run={runSet.has(key) || clueSet.has(key)}
									class:caret={key === caretKey}
									onpointerdown={(e) => onCellDown(e, key)}
									onpointerenter={(e) => onCellEnter(e, key)}
									ondblclick={() => onCellDouble(key)}
								/>
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

					{#if numbering}
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
					{/if}
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
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
	.sizes {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 1.5rem;
		margin-bottom: 1.5rem;
	}
	.size-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.size-row input {
		width: 3.5rem;
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
	.primary {
		width: 100%;
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
	.sq.run {
		fill: var(--run);
	}
	.sq.caret {
		fill: var(--caret);
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
			padding: 0.75rem 0.75rem 0.25rem;
		}
		.pen-label,
		kbd {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.swatch {
			transition: none;
		}
	}
</style>
