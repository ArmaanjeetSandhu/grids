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

	function open(dialog: HTMLDialogElement) {
		dialog.showModal();
	}

	function leave(node: HTMLDialogElement) {
		node.dataset.leaving = '';
		if (node.open) node.close();
		return fade(node, { duration: DURATION.quick });
	}

	function oncancel(e: Event) {
		e.preventDefault();
		onclose();
	}

	function onDialogClose(e: Event) {
		if (!(e.currentTarget as HTMLDialogElement).hasAttribute('data-leaving')) onclose();
	}

	function onpointerdown(e: PointerEvent) {
		if (e.target !== e.currentTarget) return;
		e.preventDefault();
		onclose();
	}
</script>

<dialog
	role="alertdialog"
	aria-labelledby="{id}-title"
	aria-describedby="{id}-desc"
	{@attach open}
	in:fade={{ duration: DURATION.quick }}
	out:leave
	{oncancel}
	onclose={onDialogClose}
	{onpointerdown}
>
	<div class="modal" transition:fly={{ y: 8 }}>
		<h2 id="{id}-title">{title}</h2>
		<div class="body" id="{id}-desc">
			{@render children()}
		</div>
		<div class="actions">
			{@render actions()}
		</div>
	</div>
</dialog>

<style>
	dialog {
		position: fixed;
		inset: 0;
		z-index: 100;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 1rem;
		border: 0;
		place-items: center;
		background: rgb(0 0 0 / 0.45);
		color: inherit;
	}
	dialog[open],
	dialog:global([data-leaving]) {
		display: grid;
	}
	dialog:global([data-leaving]) {
		pointer-events: none;
	}
	dialog::backdrop {
		background: transparent;
	}
	.modal {
		box-sizing: border-box;
		width: min(24rem, 100%);
		padding: 1.75rem 1.75rem 1.5rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
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
