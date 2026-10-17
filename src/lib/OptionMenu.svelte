<script module lang="ts">
	export type MenuOption<K extends string> = {
		key: K;
		label: string;
		checked: boolean;
		disabled: boolean;
		locked: boolean;
		unavailable?: boolean;
		hint: string;
	};
</script>

<script lang="ts" generics="K extends string">
	import type { Snippet } from 'svelte';
	import { DURATION, dropdown, rise, slide, smoothWidth } from '$lib/motion';

	let {
		label,
		value,
		on,
		title,
		intro,
		options,
		note = '',
		offLabel,
		offDisabled,
		open,
		ontoggle,
		onclose,
		onchange,
		onoff,
		icon,
		glyph
	}: {
		label: string;
		value: string;
		on: boolean;
		title: string;
		intro: string;
		options: MenuOption<K>[];
		note?: string;
		offLabel: string;
		offDisabled: boolean;
		open: boolean;
		ontoggle: () => void;
		onclose: () => void;
		onchange: (key: K) => void;
		onoff: () => void;
		icon: Snippet;
		glyph: Snippet<[K]>;
	} = $props();

	let root = $state<HTMLDivElement>();
</script>

<svelte:window
	onpointerdown={(e) => {
		if (open && !root?.contains(e.target as Node)) onclose();
	}}
/>

<div class="menu" bind:this={root}>
	<button
		class="chip"
		class:on
		aria-haspopup="true"
		aria-expanded={open}
		onmousedown={(e) => e.preventDefault()}
		onclick={ontoggle}
		{title}
	>
		<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
			{@render icon()}
		</svg>
		{label}
		<span class="name swap sized" {@attach smoothWidth}>
			{#key value}
				<span in:rise>{value}</span>
			{/key}
		</span>
	</button>

	{#if open}
		<div class="panel" role="group" aria-label={label} in:dropdown out:dropdown={{ duration: 160 }}>
			<p>{intro}</p>
			{#each options as o (o.key)}
				<label class="option" class:locked={o.locked} class:unavailable={o.unavailable}>
					<input
						type="checkbox"
						checked={o.checked}
						disabled={o.disabled}
						onchange={() => onchange(o.key)}
					/>
					<svg class="glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
						{@render glyph(o.key)}
					</svg>
					<span class="option-text">
						<span class="option-label">{o.label}</span>
						{#if o.hint}
							<span class="option-hint" transition:slide={{ duration: DURATION.quick }}>
								{o.hint}
							</span>
						{/if}
					</span>
				</label>
			{/each}
			{#if note}
				<p class="note" role="status" transition:slide>
					{note}
				</p>
			{/if}
			<button class="off" disabled={offDisabled} onclick={onoff}>
				{offLabel}
			</button>
		</div>
	{/if}
</div>

<style>
	.option,
	.off {
		transition:
			background-color var(--t-quick) var(--ease-out),
			color var(--t-quick) var(--ease-out),
			border-color var(--t-quick) var(--ease-out),
			opacity var(--t-quick) var(--ease-out),
			transform var(--t-quick) var(--ease-out);
	}
	.off:active:not(:disabled) {
		transform: scale(0.97);
	}

	.menu {
		position: relative;
		display: inline-flex;
	}
	.name {
		color: var(--on-mat-dim);
		transition: color var(--t-base) var(--ease-out);
	}
	.swap > span {
		display: inline-block;
	}
	.swap.sized {
		display: inline-block;
		white-space: nowrap;
		overflow-x: clip;
		overflow-y: visible;
		transition: width 280ms var(--ease-out);
	}
	.chip.on .name {
		color: var(--rule);
		font-weight: 600;
	}
	.panel {
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
		transform-origin: top right;
	}
	.panel > * {
		animation: menu-item 360ms var(--ease-out) both;
	}
	.panel > :nth-child(2) {
		animation-delay: 25ms;
	}
	.panel > :nth-child(3) {
		animation-delay: 45ms;
	}
	.panel > :nth-child(4) {
		animation-delay: 65ms;
	}
	.panel > :nth-child(5) {
		animation-delay: 85ms;
	}
	.panel > :nth-child(6) {
		animation-delay: 105ms;
	}
	.panel > :nth-child(n + 7) {
		animation-delay: 125ms;
	}
	@keyframes menu-item {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.panel p {
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
		transition:
			background-color var(--t-quick) var(--ease-out),
			border-color var(--t-quick) var(--ease-out);
	}
	.option input::before {
		content: '';
		width: 0.6rem;
		height: 0.6rem;
		background: var(--ink);
		clip-path: polygon(13% 52%, 0 66%, 38% 100%, 100% 22%, 86% 9%, 37% 70%);
		scale: 0;
		transition: scale var(--t-base) var(--ease-spring);
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
	.glyph :global(rect) {
		opacity: 0.5;
	}
	.glyph :global(circle) {
		fill: currentColor;
		stroke: none;
	}
	.glyph :global(.axis) {
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
	.off {
		width: 100%;
		height: 2rem;
		margin-top: 0.5rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 4px;
		background: transparent;
		font-size: 0.8rem;
		font-weight: 500;
	}
	.off:hover {
		background: rgb(255 255 255 / 0.08);
	}
	.off:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: transparent;
	}
	.panel p.note {
		margin: 0.5rem 0.4rem 0;
		padding-top: 0.5rem;
		border-top: 1px solid rgb(255 255 255 / 0.18);
	}

	@media (max-width: 640px) {
		.menu {
			position: static;
		}
		.panel {
			top: 100%;
			left: 0.75rem;
			right: 0.75rem;
			width: auto;
			transform-origin: top center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel > * {
			animation: none;
		}
	}
</style>
