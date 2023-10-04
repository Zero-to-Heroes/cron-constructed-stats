export const round = (input: number, decimals = 2): number => {
	const multiplier = Math.pow(10, decimals);
	return Math.round(input * multiplier) / multiplier;
};

export const arraysEqual = (a: readonly any[] | any, b: readonly any[] | any): boolean => {
	if (a == null && b == null) {
		return true;
	}
	if ((a == null && b != null) || (a != null && b == null)) {
		return false;
	}
	if (a === b) {
		return true;
	}
	if (!Array.isArray(a) || !Array.isArray(b)) {
		return false;
	}
	return (
		a.length === b.length &&
		// deepEqual is pretty fast, so we can check for full equality here, especially since a non-equality usually means
		// rerendering something, which is much more costly
		a.every((el, ix) => {
			return Array.isArray(el) ? arraysEqual(el, b[ix]) : el == b[ix];
		})
	);
};
