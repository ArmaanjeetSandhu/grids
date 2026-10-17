<script lang="ts">
	import LegalLinks from '$lib/LegalLinks.svelte';
	import { MAX_SIZE, MIN_SIZE, type GridMode } from '$lib/crossword';
	import { parseIpuz, type Puzzle } from '$lib/ipuz';
	import { DURATION, fly, slide } from '$lib/motion';

	let {
		size = $bindable(),
		mode = $bindable(),
		onstart,
		onimport
	}: {
		size: Record<'rows' | 'cols', number>;
		mode: GridMode;
		onstart: () => void;
		onimport: (p: Puzzle) => void;
	} = $props();

	const DIMS = [
		['cols', 'Columns'],
		['rows', 'Rows']
	] as const;

	const MODES = [
		['blocks', 'Blocks'],
		['bars', 'Bars']
	] as const satisfies readonly (readonly [GridMode, string])[];

	function nudge(dim: 'rows' | 'cols', by: number) {
		const n = Math.round(Number(size[dim]) || 0) + by;
		size[dim] = Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
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
		onimport(p);
	}
</script>

<div class="setup-stack" in:fly={{ y: 16, duration: DURATION.slow }}>
	<section class="setup">
		<h1>Grids</h1>
		<p>Free, open-source crossword maker</p>
		<form
			autocomplete="off"
			onsubmit={(e) => {
				e.preventDefault();
				onstart();
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
								onclick={() => nudge(dim, -1)}>−</button
							>
							<input
								id="size-{dim}"
								type="number"
								min={MIN_SIZE}
								max={MAX_SIZE}
								bind:value={size[dim]}
							/>
							<button
								type="button"
								class="step"
								aria-label="More {label.toLowerCase()}"
								onclick={() => nudge(dim, 1)}>+</button
							>
						</div>
					</div>
				{/each}
			</div>
			<div class="create-row">
				<div
					class="segmented"
					class:second={mode === MODES[1][0]}
					role="radiogroup"
					aria-label="Divided by"
				>
					<span class="segment-thumb" aria-hidden="true"></span>
					{#each MODES as [value, label] (value)}
						<label class="segment" class:on={mode === value}>
							<input type="radio" name="mode" {value} bind:group={mode} />
							{label}
						</label>
					{/each}
				</div>
				<button
					type="submit"
					class="primary"
					disabled={!DIMS.every(([dim]) => size[dim] >= MIN_SIZE && size[dim] <= MAX_SIZE)}
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
				<p class="import-error" role="alert" transition:slide>{importError}</p>
			{/if}
		</form>
	</section>
	<LegalLinks />
</div>

<style>
	h1 {
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.step,
	.segment {
		transition:
			background-color var(--t-quick) var(--ease-out),
			color var(--t-quick) var(--ease-out),
			border-color var(--t-quick) var(--ease-out),
			opacity var(--t-quick) var(--ease-out),
			transform var(--t-quick) var(--ease-out);
	}
	.step:active:not(:disabled) {
		transform: scale(0.97);
	}

	.setup-stack {
		margin: auto;
		width: min(26rem, calc(100% - 2rem));
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.setup {
		--pair-gap: 0.5rem;
		--pair-cols: minmax(0, 1fr) minmax(0, 1fr);
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
		position: relative;
		isolation: isolate;
		display: flex;
		min-width: 0;
		background: var(--paper);
	}
	.segment-thumb {
		position: absolute;
		inset-block: 0;
		left: 0;
		width: calc(50% + 1px);
		background: var(--ink);
		pointer-events: none;
		transition: translate 320ms var(--ease-out);
	}
	.segmented.second .segment-thumb {
		translate: calc(100% - 2px) 0;
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
		background: transparent;
		border: 2px solid var(--ink);
		cursor: pointer;
		z-index: 1;
	}
	.setup .segment {
		transition:
			background-color var(--t-quick) var(--ease-out),
			color 160ms var(--ease-out) 50ms,
			transform var(--t-quick) var(--ease-out);
	}
	.segment + .segment {
		margin-left: -2px;
	}
	.segment:not(.on):hover {
		background: #f1f1ee;
	}
	.segment:active {
		transform: scale(0.97);
	}
	.segment.on {
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
	.or {
		margin: 0.6rem 0;
		text-align: center;
		font-size: 0.8rem;
		color: #6b706d;
	}
	.setup .import-error {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: #b3261e;
	}
</style>
