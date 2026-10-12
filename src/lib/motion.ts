import { backOut, cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';
import {
	fade as svelteFade,
	fly as svelteFly,
	slide as svelteSlide,
	type FadeParams,
	type FlyParams,
	type SlideParams,
	type TransitionConfig
} from 'svelte/transition';

export const DURATION = { quick: 120, base: 180, slow: 280 } as const;

const still = () => prefersReducedMotion.current;

function calm<P extends { duration?: number; easing?: (t: number) => number }>(
	transition: (node: Element, params?: P) => TransitionConfig,
	defaults: P
) {
	return (node: Element, params?: P): TransitionConfig => {
		const merged = { ...defaults, ...params };
		return transition(node, { ...merged, duration: still() ? 0 : merged.duration });
	};
}

export const fade = calm<FadeParams>(svelteFade, { duration: DURATION.base, easing: cubicOut });

export const fly = calm<FlyParams>(svelteFly, {
	duration: DURATION.base,
	easing: cubicOut,
	y: 6,
	opacity: 0
});

export const slide = calm<SlideParams>(svelteSlide, {
	duration: DURATION.base,
	easing: cubicOut
});

export function pop(
	_node: Element,
	{ duration = DURATION.base, from = 0.55 }: { duration?: number; from?: number } = {}
): TransitionConfig {
	return {
		duration: still() ? 0 : duration,
		easing: backOut,
		css: (t) => `opacity: ${Math.min(1, t)}; transform: scale(${from + (1 - from) * t});`
	};
}

const expoOut = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function dropdown(
	_node: Element,
	{ duration = 260, y = -6, scale = 0.96 }: { duration?: number; y?: number; scale?: number } = {}
): TransitionConfig {
	return {
		duration: still() ? 0 : duration,
		easing: expoOut,
		css: (t, u) =>
			`opacity: ${Math.min(1, t * 1.6)};` +
			`transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t});`
	};
}

export function bloom(
	_node: Element,
	{ duration = DURATION.base, from = 0.9 }: { duration?: number; from?: number } = {}
): TransitionConfig {
	return {
		duration: still() ? 0 : duration,
		easing: cubicOut,
		css: (t) => `opacity: ${t}; transform: scale(${from + (1 - from) * t});`
	};
}

export function rise(
	_node: Element,
	{ duration = DURATION.base, y = 0.45 }: { duration?: number; y?: number } = {}
): TransitionConfig {
	return {
		duration: still() ? 0 : duration,
		easing: cubicOut,
		css: (t, u) => `opacity: ${t}; transform: translateY(${u * y}em);`
	};
}

export const flipDuration = () => (still() ? 0 : DURATION.base);

export function smoothWidth(node: HTMLElement) {
	let watched: Element | null = null;
	const ro = new ResizeObserver(([entry]) => {
		node.style.width = `${entry.borderBoxSize[0].inlineSize}px`;
	});
	const watch = () => {
		const child = node.firstElementChild;
		if (child === watched) return;
		if (watched) ro.unobserve(watched);
		watched = child;
		if (child) ro.observe(child);
	};
	const mo = new MutationObserver(watch);
	mo.observe(node, { childList: true });
	watch();
	return () => {
		mo.disconnect();
		ro.disconnect();
	};
}
