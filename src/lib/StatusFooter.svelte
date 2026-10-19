<script module lang="ts">
	export type GridStats = {
		white: number;
		black: number;
		whitePct: number;
		blackPct: number;
		entries: number;
		across: number;
		down: number;
	};
</script>

<script lang="ts">
	import { flip } from 'svelte/animate';
	import type { ConstraintStatus } from '$lib/constraints';
	import { bloom, flipDuration, rise } from '$lib/motion';

	let {
		stats,
		bars,
		symmetric,
		constraintStats
	}: {
		stats: GridStats;
		bars: boolean;
		symmetric: boolean | null;
		constraintStats: ConstraintStatus[];
	} = $props();

	type StatusGroup = 'squares' | 'entries' | 'symmetry' | 'constraints';
	const statusGroups: StatusGroup[] = $derived([
		...(!bars || stats.black > 0 ? (['squares'] as const) : []),
		'entries',
		...(symmetric !== null ? (['symmetry'] as const) : []),
		...(constraintStats.length > 0 ? (['constraints'] as const) : [])
	]);
</script>

<footer class="status" aria-label="Grid statistics">
	{#each statusGroups as group, i (group)}
		<div class="status-cell" animate:flip={{ duration: flipDuration() }} transition:bloom>
			{#if i > 0}
				<span class="status-split" aria-hidden="true"></span>
			{/if}
			<div class="status-group">
				{#if group === 'squares'}
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
				{:else if group === 'entries'}
					<span class="stat">
						<span class="stat-label">Total entries</span>
						<span class="stat-value">{stats.entries}</span>
						<span class="stat-note">
							(Across <span class="stat-value">{stats.across}</span>, Down
							<span class="stat-value">{stats.down}</span>)
						</span>
					</span>
				{:else if group === 'symmetry'}
					<span class="stat">
						<span class="stat-label">Symmetry</span>
						<span class="stat-value swap">
							{#key symmetric}
								<span in:rise>{symmetric ? 'Obeyed' : 'Violated'}</span>
							{/key}
						</span>
					</span>
				{:else}
					{#each constraintStats as s (s.key)}
						<span class="stat" animate:flip={{ duration: flipDuration() }} transition:bloom>
							<span class="stat-label">{s.label}</span>
							<span class="stat-value swap">
								{#key s.value}
									<span in:rise>{s.value}</span>
								{/key}
							</span>
						</span>
					{/each}
				{/if}
			</div>
		</div>
	{/each}
</footer>

<style>
	.status {
		--status-pad: 0.5rem;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		padding: var(--status-pad) 1.25rem;
		border-top: 1px solid rgb(255 255 255 / 0.14);
		background: rgb(0 0 0 / 0.2);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.4;
		position: relative;
	}
	.status-cell {
		align-self: stretch;
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.status-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 1.1rem;
	}
	.status-split {
		width: 1px;
		align-self: stretch;
		margin-block: calc(-1 * var(--status-pad));
		background: rgb(255 255 255 / 0.22);
	}
	.stat {
		position: relative;
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.stat + .stat::before {
		content: '';
		position: absolute;
		inset-block: 0;
		left: -0.55rem;
		width: 1px;
		background: rgb(255 255 255 / 0.16);
	}
	.stat-label {
		color: var(--on-mat-dim);
	}
	.stat-value {
		color: var(--on-mat);
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.stat-note {
		color: var(--on-mat-dim);
	}
	.swap > span {
		display: inline-block;
	}

	@media (max-width: 640px) {
		.status {
			padding: var(--status-pad) 0.75rem;
			font-size: 0.72rem;
			flex-wrap: nowrap;
			justify-content: flex-start;
			overflow-x: auto;
		}
		.status > :first-child {
			margin-left: auto;
		}
		.status > :last-child {
			margin-right: auto;
		}
		.status-cell,
		.status-group {
			flex: 0 0 auto;
			flex-wrap: nowrap;
		}
		.status-split {
			display: none;
		}
	}
</style>
