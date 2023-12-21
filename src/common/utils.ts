/* eslint-disable no-case-declarations */
import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { CardClass } from '@firestone-hs/reference-data';
import { TimePeriod } from '../model';
import { DECK_STATS_KEY_PREFIX } from './config';

// Build the list of all classes from the CardClass enum
export const allClasses: readonly string[] = Object.keys(CardClass)
	.map((key) => CardClass[key])
	.filter((value) => typeof value === 'string')
	.filter((value) => ![CardClass.INVALID, CardClass.NEUTRAL, CardClass.DREAM, CardClass.WHIZBANG].includes(value))
	.map((value) => value.toLowerCase());

export const getFileNamesToLoad = (timePeriod: TimePeriod, patchInfo: PatchInfo): readonly string[] => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	return fileNames;
};

export const computeHoursBackFromNow = (timePeriod: TimePeriod, patchInfo: PatchInfo): number => {
	switch (timePeriod) {
		case 'past-3':
			return 3 * 24;
		case 'past-7':
			return 7 * 24;
		case 'past-20':
			return 20 * 24;
		case 'current-season':
			// Get the day of the start of the month, then count the number of days from then to today
			const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
			return Math.floor((Date.now() - startOfMonth.getTime()) / (1000 * 60 * 60));
		case 'last-patch':
			const patchReleaseDate = new Date(patchInfo.date);
			return Math.floor((Date.now() - patchReleaseDate.getTime()) / (1000 * 60 * 60));
	}
};

export const buildFileNames = (hoursBack: number): readonly string[] => {
	// Build a list of file names, in the form YYYY-MM-dd (e.g. 2020-05-01)
	// that start from the day before the current date and go back in time
	const fileNames: string[] = [];
	const now = new Date();
	for (let i = 0; i < hoursBack; i++) {
		const date = new Date(now.getTime() - i * 60 * 60 * 1000);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		fileNames.push(`${dateStr}`);
	}
	return fileNames;
};

export const buildFileNamesForGivenDay = (targetDate: string): readonly string[] => {
	// Build the list of dates for the day before, one per hour
	// This should work indendently of the hour at which it is run
	// E.g. if we run this on 2023-12-12 at 13:00, we should get 24 files
	// starting from 2023-12-11 00:00 to 2023-12-11 23:00
	const fileNames: string[] = [];
	const yesterday = new Date(targetDate);
	yesterday.setMinutes(0);
	yesterday.setSeconds(0);
	yesterday.setMilliseconds(0);
	for (let i = 0; i < 24; i++) {
		const date = new Date(yesterday);
		date.setHours(i);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		fileNames.push(`${dateStr}`);
	}
	return fileNames;
};

export const buildFileKeys = (
	format: string,
	rankBracket: string,
	granularity: 'hourly' | 'daily',
	fileNames: readonly string[],
): readonly string[] => {
	const fileKeys: readonly string[] = fileNames.map(
		(fileName) => `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${granularity}/${fileName}.gz.json`,
	);
	return fileKeys;
};
