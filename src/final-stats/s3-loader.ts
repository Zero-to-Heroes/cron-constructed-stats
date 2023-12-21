import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { ArchetypeStats, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats';
import { buildFileNames, computeHoursBackFromNow } from './hourly-utils';

export const getFileNamesToLoad = (timePeriod: TimePeriod, patchInfo: PatchInfo): readonly string[] => {
	const hoursBack: number = computeHoursBackFromNow(timePeriod, patchInfo);
	const fileNames: readonly string[] = buildFileNames(hoursBack);
	return fileNames;
};

// export const loadDailyDataDeckFromS3 = async (
// 	format: GameFormat,
// 	rankBracket: RankBracket,
// 	timePeriod: TimePeriod,
// 	patchInfo: PatchInfo,
// ): Promise<readonly DeckStats[]> => {
// 	const fileNames: readonly string[] = getFileNamesToLoad(timePeriod, patchInfo);
// 	const start = Date.now();
// 	console.debug('fileNames', format, rankBracket, timePeriod, fileNames.length);
// 	const fileResults = await Promise.all(
// 		fileNames.map((fileName) => loadHourlyDeckStatFromS3(format, rankBracket, fileName)),
// 	);
// 	console.debug('finished reading s3 content', Date.now() - start);
// 	// const gzipContent = await Promise.all(
// 	// 	fileNames.map((fileName) => loadHourlyDeckStatFromS3Gzip(format, rankBracket, fileName)),
// 	// );
// 	// const fileResults = gzipContent.map((content) => JSON.parse(content));
// 	return fileResults.filter((result) => !!result);
// };

export const loadHourlyDeckStatFromS3 = async (
	format: GameFormat,
	rankBracket: RankBracket,
	fileName: string,
): Promise<DeckStats> => {
	const start = Date.now();
	const fileKey = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${fileName}.gz.json`;
	const data = await s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300);
	console.debug('read gzip content', Date.now() - start);
	const result: DeckStats = JSON.parse(data);
	console.debug('loaded hourly deck', Date.now() - start, format, rankBracket, fileName, result?.deckStats?.length);
	return result;
};

export const loadRawHourlyDeckStatFromS3 = async (
	format: GameFormat,
	rankBracket: RankBracket,
	fileName: string,
): Promise<string> => {
	const start = Date.now();
	const fileKey = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${fileName}.gz.json`;
	const dataPromise = s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300);
	// console.debug('read gzip content', Date.now() - start);
	return dataPromise;
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
