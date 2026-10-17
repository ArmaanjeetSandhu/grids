<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DURATION, fade, fly } from '$lib/motion';

	let {
		title,
		onclose,
		children,
		actions
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
		actions: Snippet;
	} = $props();

	const id = $props.id();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key !== 'Tab') return;
		const focusable = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button');
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<div
	class="scrim"
	role="presentation"
	transition:fade={{ duration: DURATION.quick }}
	onpointerdown={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div
		class="modal"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="{id}-title"
		aria-describedby="{id}-desc"
		tabindex="-1"
		transition:fly={{ y: 8 }}
		{onkeydown}
	>
		<h2 id="{id}-title">{title}</h2>
		<div class="body" id="{id}-desc">
			{@render children()}
		</div>
		<div class="actions">
			{@render actions()}
		</div>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(0 0 0 / 0.45);
	}
	.modal {
		box-sizing: border-box;
		width: min(24rem, 100%);
		padding: 1.75rem 1.75rem 1.5rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
	}
	.modal:focus {
		outline: none;
	}
	h2 {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1.15;
	}
	.body {
		margin: 0.6rem 0 1.5rem;
		line-height: 1.5;
		color: #4a4f4c;
	}
	.body :global(p) {
		margin: 0;
	}
	.actions {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 0.5rem;
	}
	.actions :global(button) {
		padding: 0.6rem 1rem;
		font-size: 0.9rem;
	}
</style>
