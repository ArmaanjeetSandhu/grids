<script lang="ts">
	import { resolve } from '$app/paths';

	let { current }: { current?: 'terms' | 'privacy' } = $props();
</script>

<nav class="legal-links" aria-label="About Grids">
	<a href={resolve('/terms')} aria-current={current === 'terms' ? 'page' : undefined}>Terms</a>
	<span aria-hidden="true">⋅</span>
	<a href={resolve('/privacy')} aria-current={current === 'privacy' ? 'page' : undefined}>Privacy</a
	>
	<span aria-hidden="true">⋅</span>
	<a href="https://github.com/ArmaanjeetSandhu/grids" target="_blank" rel="noopener noreferrer"
		>GitHub</a
	>
</nav>

<style>
	.legal-links {
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--on-mat-dim, rgb(238 243 239 / 0.72));
	}
	a {
		color: inherit;
		text-decoration: none;
		text-underline-offset: 0.2em;
	}
	a:hover,
	a[aria-current='page'] {
		color: var(--on-mat, #eef3ef);
		text-decoration: underline;
	}
	a:focus-visible {
		outline: 2px solid var(--rule, #e6cf5c);
		outline-offset: 2px;
	}
</style>
