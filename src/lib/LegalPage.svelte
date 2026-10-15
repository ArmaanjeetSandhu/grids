<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import Halftone from '$lib/Halftone.svelte';
	import LegalLinks from '$lib/LegalLinks.svelte';

	let {
		title,
		updated,
		current,
		children
	}: {
		title: string;
		updated: string;
		current: 'terms' | 'privacy';
		children: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{title} · Grids</title>
</svelte:head>

<main class="mat">
	<Halftone />
	<a class="back" href={resolve('/')}>← Back to Grids</a>
	<article class="sheet">
		<header>
			<h1>{title}</h1>
			<p class="updated">Last updated {updated}</p>
		</header>
		{@render children()}
	</article>
	<LegalLinks {current} />
</main>

<style>
	:global(html) {
		background: #2f5b4c;
	}
	@media (prefers-color-scheme: dark) {
		:global(html) {
			background: #1f3d33;
		}
	}
	:global(body) {
		margin: 0;
		font-family: 'Libre Franklin', 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	.mat {
		--mat: #2f5b4c;
		--halftone-strength: 0.1;
		--rule: #e6cf5c;
		--on-mat: #eef3ef;
		--on-mat-dim: rgb(238 243 239 / 0.72);

		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem 1rem 2rem;
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

	.back {
		align-self: center;
		width: min(42rem, 100%);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--on-mat-dim);
		text-decoration: none;
	}
	.back:hover {
		color: var(--on-mat);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.back:focus-visible {
		outline: 2px solid var(--rule);
		outline-offset: 2px;
	}

	.sheet {
		width: min(42rem, 100%);
		box-sizing: border-box;
		padding: 1.75rem 1.75rem 1.5rem;
		background: rgb(0 0 0 / 0.2);
		border: 1px solid rgb(255 255 255 / 0.14);
		color: var(--on-mat);
		line-height: 1.6;
		font-size: 0.9rem;
	}
	@media (max-width: 30rem) {
		.sheet {
			padding: 1.25rem 1rem;
		}
	}

	header {
		padding-bottom: 1rem;
		margin-bottom: 0.25rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.01em;
	}
	.updated {
		margin: 0.4rem 0 0;
		font-size: 0.8rem;
		color: var(--on-mat-dim);
	}

	.sheet :global(h2) {
		margin: 1.75rem 0 0.6rem;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid rgb(255 255 255 / 0.18);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		line-height: 1.3;
		text-transform: uppercase;
	}
	.sheet :global(p),
	.sheet :global(ul) {
		margin: 0 0 0.75rem;
	}
	.sheet :global(ul) {
		padding-left: 1.25rem;
	}
	.sheet :global(li + li) {
		margin-top: 0.35rem;
	}
	.sheet :global(li::marker) {
		color: var(--on-mat-dim);
	}
	.sheet :global(a) {
		color: inherit;
		text-decoration-color: rgb(255 255 255 / 0.45);
		text-underline-offset: 0.2em;
		transition: text-decoration-color var(--t-quick, 120ms) ease-out;
	}
	.sheet :global(a:hover) {
		text-decoration-color: var(--rule);
	}
	.sheet :global(a:focus-visible) {
		outline: 2px solid var(--rule);
		outline-offset: 2px;
	}
	.sheet :global(strong) {
		font-weight: 600;
	}
</style>
