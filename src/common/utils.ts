import { CardClass } from '@firestone-hs/reference-data';

// Build the list of all classes from the CardClass enum
export const allClasses: readonly string[] = Object.keys(CardClass)
	.map((key) => CardClass[key])
	.filter((value) => typeof value === 'string')
	.filter((value) => ![CardClass.INVALID, CardClass.NEUTRAL, CardClass.DREAM, CardClass.WHIZBANG].includes(value))
	.map((value) => value.toLowerCase());
