/* eslint-disable no-case-declarations */
import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { DECK_STATS_KEY_PREFIX } from '../common/config';
import { GameFormat, RankBracket, TimePeriod } from '../model';

export const getFileKeysToLoad = (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	playerClass: string,
	patchInfo: PatchInfo,
): readonly string[] => {
	// We want to load:
	// - the hourly data for the current day
	// - the daily data for the previous days
	// - if we're looking at the "last-patch" filter, we load the correct hourly data
	// for the patch day
	const currentDayHourlyKeys = getHourlyKeysForCurrentDay(format, rankBracket, playerClass);
	// console.debug('currentDayHourlyKeys', currentDayHourlyKeys);
	const previousDaysDailyKeys = getDailyKeysForPreviousDays(format, rankBracket, timePeriod, playerClass, patchInfo);
	// console.debug('previousDaysDailyKeys', previousDaysDailyKeys);
	const patchDayHourlyKeys = getHourlyKeysForPatchDay(format, rankBracket, timePeriod, playerClass, patchInfo);
	// console.debug('patchDayHourlyKeys', patchDayHourlyKeys);
	return [...currentDayHourlyKeys, ...previousDaysDailyKeys, ...patchDayHourlyKeys];
};

const getDailyKeysForPreviousDays = (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	playerClass: string,
	patchInfo: PatchInfo,
): readonly string[] => {
	const firstDate = computeStartDate(timePeriod, patchInfo);
	const keys: string[] = [];
	while (firstDate < new Date()) {
		firstDate.setDate(firstDate.getDate() + 1);
		const dateStr = firstDate.toISOString();
		keys.push(`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/daily/${dateStr}-${playerClass}.gz.json`);
	}
	return keys;
};

const computeStartDate = (timePeriod: TimePeriod, patchInfo: PatchInfo): Date => {
	const now = new Date();
	now.setHours(0);
	now.setMinutes(0);
	now.setSeconds(0);
	now.setMilliseconds(0);

	switch (timePeriod) {
		case 'past-3':
			// Start 3 days in the past
			const threeDaysAgo = new Date(now.getTime());
			threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
			return threeDaysAgo;
		case 'past-7':
			// Start 7 days in the past
			const sevenDaysAgo = new Date(now.getTime());
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			return sevenDaysAgo;
		case 'past-20':
			// Start 20 days in the past
			const twentyDaysAgo = new Date(now.getTime());
			twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
			return twentyDaysAgo;
		case 'current-season':
			// Get the day of the start of the month
			const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
			return startOfMonth;
		case 'last-patch':
			// This one is a bit different, as we want to start at the day following the patch release
			const patchReleaseDate = new Date(patchInfo.date);
			const dayAfterPatchRelease = new Date(patchReleaseDate);
			dayAfterPatchRelease.setDate(dayAfterPatchRelease.getDate() + 1);
			dayAfterPatchRelease.setHours(0);
			dayAfterPatchRelease.setMinutes(0);
			dayAfterPatchRelease.setSeconds(0);
			dayAfterPatchRelease.setMilliseconds(0);
			return dayAfterPatchRelease;
	}
};

const getHourlyKeysForCurrentDay = (
	format: GameFormat,
	rankBracket: RankBracket,
	playerClass: string,
): readonly string[] => {
	// Start with the current hour (at 00:00.000), and go back in time
	// until we get to 00:00 00:00.000 of the current day
	const now = new Date();
	const keys: string[] = [];
	for (let i = 0; i < now.getHours() + 1; i++) {
		const date = new Date(now.getTime() - i * 60 * 60 * 1000);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		keys.push(`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${dateStr}-${playerClass}.gz.json`);
	}
	return keys;
};

const getHourlyKeysForPatchDay = (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	playerClass: string,
	patchInfo: PatchInfo,
): readonly string[] => {
	if (timePeriod !== 'last-patch') {
		return [];
	}

	const patchDate = new Date(patchInfo.date);
	const keys: string[] = [];
	// The keys should start at the hour following the patch release, up until 23:00 of that day
	// E.g. if the patch was released at 2020-05-01 13:00, we want to load the data from
	// 2020-05-01 14:00 to 2020-05-01 23:00
	const startHour = patchDate.getHours() + 1;
	for (let i = startHour; i < 24; i++) {
		const date = new Date(patchDate.getTime());
		date.setHours(i);
		date.setMinutes(0);
		date.setSeconds(0);
		date.setMilliseconds(0);
		// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
		const dateStr = date.toISOString();
		keys.push(`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${dateStr}-${playerClass}.gz.json`);
	}
	return keys;
};
