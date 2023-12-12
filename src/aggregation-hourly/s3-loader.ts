import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../daily/build-constructed-deck-stats';
import { ArchetypeStats, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats';
import { buildFileNames, computeHoursBackFromNow } from './hourly-utils';

export const loadDailyDataDeckFromS3 = async (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	patchInfo: PatchInfo,
): Promise<readonly DeckStats[]> => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	console.debug('fileNames', format, rankBracket, timePeriod, fileNames);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadHourlyDeckStatFromS3(format, rankBracket, fileName)),
	);
	return fileResults.filter((result) => !!result);
};

const loadHourlyDeckStatFromS3 = async (
	format: GameFormat,
	rankBracket: RankBracket,
	fileName: string,
): Promise<DeckStats> => {
	const fileKey = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${fileName}.gz.json`;
	const data = await s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false);
	const result: DeckStats = JSON.parse(data);
	// console.debug('loaded daily deck', fileKey, result?.deckStats?.length, data?.length);
	return result;
};

export const loadDailyDataArchetypeFromS3 = async (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	patchInfo: PatchInfo,
): Promise<readonly ArchetypeStats[]> => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	const fileResults = await Promise.all(
		fileNames.map((fileName) => loadDailyArchetypeStatFromS3(format, rankBracket, fileName)),
	);
	return fileResults.filter((result) => !!result);
};

const loadDailyArchetypeStatFromS3 = async (
	format: GameFormat,
	rankBracket: RankBracket,
	fileName: string,
): Promise<ArchetypeStats> => {
	const fileKey = `${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/hourly/${fileName}.gz.json`;
	const data = await s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false);
	const result: ArchetypeStats = JSON.parse(data);
	// console.debug('loaded daily archetype', fileKey, result?.archetypeStats?.length, data?.length);
	return result;
};
