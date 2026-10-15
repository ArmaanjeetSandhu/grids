import { entryId, transposeEntryId, type Axis, type Entry, type Numbering } from './crossword';

export interface Reference {
	axis: Axis;
	number: number;
}

export type ReferenceMap = Map<string, Reference>;

export const referenceKey = (axis: Axis, number: number) => `${axis}:${number}`;

export function transposeReferences(before: Numbering, after: Numbering): ReferenceMap {
	const arrived = new Map(after.entries.map((e) => [entryId(e), e]));
	const map: ReferenceMap = new Map();
	for (const e of before.entries) {
		const next = arrived.get(transposeEntryId(entryId(e)));
		if (next) map.set(referenceKey(e.axis, e.number), { axis: next.axis, number: next.number });
	}
	return map;
}

const SEPARATOR = String.raw`(?:\s*,\s*(?:(?:and|or|&)\s+)?|\s+(?:and|or|&)\s+)`;

const REFERENCE_RUN = new RegExp(
	String.raw`(?<![\w-])((?:\d+\s*-${SEPARATOR})*)(\d+)(\s*-?\s*)(Across|Down)\b`,
	'gi'
);

const DIGITS = /\d+/g;

const matchCase = (word: string, model: string) => {
	if (model === model.toUpperCase()) return word.toUpperCase();
	if (model === model.toLowerCase()) return word.toLowerCase();
	return word;
};

export const titled = (axis: Axis) => (axis === 'across' ? 'Across' : 'Down');

const axisOf = (word: string): Axis => (word.toLowerCase() === 'across' ? 'across' : 'down');

const citedIn = (leading: string, last: string) => [
	...[...leading.matchAll(DIGITS)].map((m) => Number(m[0])),
	Number(last)
];

export function citedReferences(text: string): Reference[] {
	const seen = new Map<string, Reference>();
	for (const [, leading, last, , word] of text.matchAll(REFERENCE_RUN)) {
		const axis = axisOf(word);
		for (const number of citedIn(leading, last))
			seen.set(referenceKey(axis, number), { axis, number });
	}
	return [...seen.values()];
}

export function rewriteReferences(text: string, map: ReferenceMap): string {
	return text.replace(
		REFERENCE_RUN,
		(run: string, leading: string, last: string, gap: string, word: string) => {
			const axis = axisOf(word);
			const found = citedIn(leading, last).map((n) => map.get(referenceKey(axis, n)));
			if (found.includes(undefined)) return run;

			const moved = found as Reference[];
			const landing = moved.at(-1)!.axis;
			if (moved.some((r) => r.axis !== landing)) return run;

			const numbers = moved.map((r) => String(r.number));
			const head = leading.replace(DIGITS, () => numbers.shift()!);
			return `${head}${numbers[0]}${gap}${matchCase(titled(landing), word)}`;
		}
	);
}

export function linkedEntries(
	entries: Entry[],
	clues: Record<string, string>,
	active: Set<string>
): Entry[] {
	const byNumber = new Map(entries.map((e) => [referenceKey(e.axis, e.number), e]));
	const cites = (e: Entry) =>
		new Set(citedReferences(clues[entryId(e)] ?? '').map((r) => referenceKey(r.axis, r.number)));
	const sources = entries.filter((e) => active.has(entryId(e)));
	const targets = new Set(sources.map((e) => referenceKey(e.axis, e.number)));
	const linked = new Set<Entry>();
	for (const e of sources)
		for (const key of cites(e)) {
			const cited = byNumber.get(key);
			if (cited) linked.add(cited);
		}
	for (const e of entries) if ([...cites(e)].some((key) => targets.has(key))) linked.add(e);
	return [...linked].filter((e) => !active.has(entryId(e)));
}
