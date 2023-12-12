/* eslint-disable no-case-declarations */
import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { TimePeriod } from '../model';

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
