const HISTORY_LIMIT = 500;

export type History<T> = {
	reset(): void;
	commit(): void;
	travel(forward: boolean): void;
	map(f: (s: T) => T): void;
};

export function createHistory<T>(
	read: () => T,
	write: (next: T, prev: T, forward: boolean) => void
): History<T> {
	const past: string[] = [];
	const future: string[] = [];
	let present = '';
	const commit = () => {
		const next = JSON.stringify(read());
		if (next === present) return;
		past.push(present);
		if (past.length > HISTORY_LIMIT) past.shift();
		future.length = 0;
		present = next;
	};
	return {
		reset() {
			past.length = 0;
			future.length = 0;
			present = JSON.stringify(read());
		},
		commit,
		travel(forward) {
			commit();
			const [from, to] = forward ? [future, past] : [past, future];
			const target = from.pop();
			if (target === undefined) return;
			to.push(present);
			const prev: T = JSON.parse(present);
			present = target;
			write(JSON.parse(target), prev, forward);
		},
		map(f) {
			for (const stack of [past, future])
				for (let i = 0; i < stack.length; i++) stack[i] = JSON.stringify(f(JSON.parse(stack[i])));
			present = JSON.stringify(read());
		}
	};
}
