import { entryId, transposeEntryId, type Axis, type Numbering } from './crossword';

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

const titled = (axis: Axis) => (axis === 'across' ? 'Across' : 'Down');

export function rewriteReferences(text: string, map: ReferenceMap): string {
	return text.replace(
		REFERENCE_RUN,
		(run: string, leading: string, last: string, gap: string, word: string) => {
			const axis: Axis = word.toLowerCase() === 'across' ? 'across' : 'down';
			const cited = [...leading.matchAll(DIGITS)].map((m) => Number(m[0]));
			cited.push(Number(last));
			const found = cited.map((n) => map.get(referenceKey(axis, n)));
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
