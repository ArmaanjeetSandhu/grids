<script lang="ts">
	import type { Axis } from '$lib/crossword';
	import { DURATION, fade } from '$lib/motion';
	import { devicePixelRatio } from 'svelte/reactivity/window';

	let { entries }: { entries: { axis: Axis; length: number }[] } = $props();

	type Bin = { length: number; across: number; down: number; total: number };

	const bins: Bin[] = $derived.by(() => {
		if (entries.length === 0) return [];
		const lengths = entries.map((e) => e.length);
		const min = Math.min(...lengths);
		const max = Math.max(...lengths);
		const list: Bin[] = Array.from({ length: max - min + 1 }, (_, i) => ({
			length: min + i,
			across: 0,
			down: 0,
			total: 0
		}));
		for (const e of entries) {
			const bin = list[e.length - min];
			bin[e.axis]++;
			bin.total++;
		}
		return list;
	});

	const peak = $derived(Math.max(1, ...bins.map((b) => b.total)));
	const mean = $derived(
		entries.length ? entries.reduce((sum, e) => sum + e.length, 0) / entries.length : 0
	);
	const median = $derived.by(() => {
		const sorted = entries.map((e) => e.length).sort((a, b) => a - b);
		const mid = sorted.length >> 1;
		return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	});
	const modes = $derived(bins.filter((b) => b.total === peak).map((b) => b.length));

	const GAP = 3;

	let plotEl = $state<HTMLOListElement>();
	let plotX = $state(0);
	let plotW = $state(0);
	const dpr = $derived(devicePixelRatio.current ?? 1);

	$effect(() => {
		const el = plotEl;
		if (!el) return;
		void dpr;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			plotX = rect.left;
			plotW = rect.width;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		window.addEventListener('resize', measure);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	const layout = $derived.by(() => {
		const n = bins.length;
		if (n === 0 || plotW <= 0) return null;
		const width = Math.floor(plotW * dpr);
		const gap = Math.max(1, Math.round(GAP * dpr));
		const bar = Math.floor((width - gap * (n - 1)) / n);
		if (bar < 1) return null;
		const used = bar * n + gap * (n - 1);
		const left = plotX * dpr;
		const start = Math.round(left + (width - used) / 2) - left;
		return { start, bar, step: bar + gap };
	});

	const describe = (b: Bin) =>
		`Length ${b.length}: ${b.total} ${b.total === 1 ? 'entry' : 'entries'}` +
		(b.total ? ` (${b.across} across, ${b.down} down)` : '');
</script>

<section class="histogram" aria-label="Entry lengths">
	<header>
		<h2>Entry lengths</h2>
		{#if entries.length}
			<p class="summary">
				<span>mean <b>{mean.toFixed(2)}</b></span>
				<span>median <b>{median}</b></span>
				<span>{modes.length > 1 ? 'modes' : 'mode'} <b>{modes.join(', ')}</b></span>
			</p>
		{/if}
	</header>

	{#if bins.length === 0}
		<p class="empty">No entries yet.</p>
	{:else}
		<div class="chart">
			<span class="y-title" aria-hidden="true">No. of entries</span>
			<div class="plot-area">
				<span class="legend" aria-hidden="true">
					<span><i class="swatch across"></i>Across</span>
					<span><i class="swatch down"></i>Down</span>
				</span>
				<ol class="plot" class:pinned={layout} style:--bins={bins.length} bind:this={plotEl}>
					{#each bins as b, i (b.length)}
						<li
							class="bin"
							title={describe(b)}
							aria-label={describe(b)}
							style:left={layout ? `${(layout.start + i * layout.step) / dpr}px` : null}
							style:width={layout ? `${layout.bar / dpr}px` : null}
							in:fade
						>
							<div class="track">
								<span class="count">{b.total || ''}</span>
								<div
									class="bar"
									style:height="{(b.total / peak) * 100}%"
									style:--grow="{DURATION.slow * 2}ms"
								>
									{#if b.down}
										<span class="seg down" style:flex-grow={b.down}></span>
									{/if}
									{#if b.across}
										<span class="seg across" style:flex-grow={b.across}></span>
									{/if}
								</div>
							</div>
							<span class="len" aria-hidden="true">{b.length}</span>
						</li>
					{/each}
				</ol>
			</div>
			<span class="x-title" aria-hidden="true">Length</span>
		</div>
	{/if}
</section>

<style>
	.histogram {
		--across: var(--paper, #fff);
		--down: var(--rule, #e6cf5c);
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.25rem 1.1rem;
		background: rgb(0 0 0 / 0.2);
		border: 1px solid rgb(255 255 255 / 0.14);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
	}
	h2 {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.summary {
		margin: 0;
		display: flex;
		gap: 1rem;
		font-size: 0.8rem;
		color: var(--on-mat-dim);
		font-variant-numeric: tabular-nums;
	}
	.summary b {
		color: var(--on-mat);
		font-weight: 600;
	}
	.empty {
		margin: auto;
		font-size: 0.85rem;
		color: var(--on-mat-dim);
	}

	.chart {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		column-gap: 0.6rem;
	}
	.y-title,
	.x-title {
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--on-mat-dim);
	}
	.y-title {
		align-self: center;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}
	.x-title {
		grid-column: 2;
		justify-self: center;
		padding-top: 1.6rem;
	}
	.plot-area {
		position: relative;
		min-width: 0;
		min-height: 0;
		display: flex;
	}
	.plot {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(var(--bins), minmax(0, 1fr));
		gap: 3px;
		border-bottom: 1px solid rgb(255 255 255 / 0.4);
		padding-bottom: 0;
	}
	.plot.pinned {
		position: relative;
		display: block;
	}
	.pinned > .bin {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	.bin {
		min-width: 0;
		display: flex;
		flex-direction: column;
		position: relative;
	}
	.track {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: stretch;
		padding-top: 1.2rem;
	}
	.count {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		padding-bottom: 0.3rem;
	}
	.bar {
		display: flex;
		flex-direction: column;
		width: 100%;
		transform-origin: bottom;
		transition: height var(--t-base, 180ms) var(--ease-out, ease-out);
		animation: grow var(--grow) var(--ease-out, ease-out) both;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.25);
	}
	.seg {
		flex-basis: 0;
		min-height: 0;
		transition: flex-grow var(--t-base, 180ms) var(--ease-out, ease-out);
	}
	.seg.across {
		background: var(--across);
	}
	.seg.down {
		background: var(--down);
	}
	.bin:hover .bar {
		filter: brightness(1.08);
	}
	.len {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		padding-top: 0.35rem;
		text-align: center;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--on-mat-dim);
	}
	@keyframes grow {
		from {
			transform: scaleY(0);
		}
	}

	.legend {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 1;
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--on-mat-dim);
	}
	.legend > span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.swatch {
		width: 0.7rem;
		height: 0.7rem;
	}
	.swatch.across {
		background: var(--across);
	}
	.swatch.down {
		background: var(--down);
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
		}
	}
</style>
