/* eslint-disable no-async-promise-executor */
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { ArchetypeStat, ArchetypeStats, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats';

export const persistData = async (
	archetypeStats: readonly ArchetypeStat[],
	deckStats: readonly DeckStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	playerClass: string,
): Promise<void> => {
	// console.time('save-global-archetypes');
	await saveGlobalArchetypeStats(archetypeStats, lastUpdate, rankBracket, timePeriod, format, playerClass);
	// console.timeEnd('save-global-archetypes');
	// console.log('saved global archetype stats', archetypeStats.length);

	// console.time('save-global-decks');
	await saveGlobalDeckStats(deckStats, lastUpdate, rankBracket, timePeriod, format, playerClass);
	// console.log('saved global deck stats', deckStats.length);
	// console.timeEnd('save-global-decks');

	// console.time('save-detailed-archetypes');
	await saveDetailedArchetypeStats(archetypeStats, lastUpdate, rankBracket, timePeriod, format);
	// console.log('saved detailed archetype stats', archetypeStats.length);
	// console.timeEnd('save-detailed-archetypes');

	// console.time('save-detailed-decks');
	await saveDetailedDeckStats(deckStats, lastUpdate, rankBracket, timePeriod, format, playerClass);
	// console.log('saved detailed deck stats', deckStats.length);
	// console.timeEnd('save-detailed-decks');
	// console.log('finished saving data');
};

const saveGlobalArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	playerClass: string,
): Promise<void> => {
	if (!archetypeStats?.length) {
		console.error('empty archetype stats', archetypeStats, rankBracket, timePeriod, format);
		return;
	}

	const minimalArchetypes: readonly ArchetypeStat[] = archetypeStats
		.map((d) => {
			const result: Mutable<ArchetypeStat> = { ...d };
			delete result.cardsData;
			delete result.discoverData;
			delete result.matchupInfo;
			return result;
		})
		.filter((d) => d.totalGames >= 50);
	const result: ArchetypeStats = {
		lastUpdated: lastUpdate,
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: archetypeStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		archetypeStats: minimalArchetypes,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/overview-from-hourly-${playerClass}.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveGlobalDeckStats = async (
	deckStats: readonly DeckStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	playerClass: string,
): Promise<void> => {
	if (!deckStats?.length) {
		console.error('empty deck stats', deckStats, rankBracket, timePeriod, format);
		return;
	}

	const minimalDecks: readonly DeckStat[] = deckStats
		.map((d) => {
			const result: Mutable<DeckStat> = { ...d };
			delete result.cardsData;
			delete result.discoverData;
			delete result.matchupInfo;
			delete result.coinPlayInfo;
			return result;
		})
		.filter((d) => d.totalGames >= 50);

	const result: DeckStats = {
		lastUpdated: lastUpdate,
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: minimalDecks,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/overview-from-hourly-${playerClass}.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveDetailedDeckStats = async (
	deckStats: readonly DeckStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	playerClass: string,
): Promise<void> => {
	// return;
	const workingCopy = deckStats
		.filter((d) => d.totalGames >= 50)
		.map((d) => {
			const result: DeckStat = {
				...d,
				cardsData: d.cardsData.filter((c) => c.inStartingDeck > d.totalGames / 50),
			};
			return result;
		})
		.sort((a, b) => b.totalGames - a.totalGames);
	// console.debug('saving detailed deck stats', workingCopy.length);
	// await saveDecksSql(workingCopy, lastUpdate, rankBracket, timePeriod, format);
	await saveDecksS3(workingCopy, lastUpdate, rankBracket, timePeriod, format, playerClass);
};

const saveDecksS3 = async (
	workingCopy: readonly DeckStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	playerClass: string,
) => {
	const gzippedResult = gzipSync(JSON.stringify(workingCopy));
	await s3.writeFile(
		gzippedResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/all-decks-${playerClass}.gz.json`,
		'application/json',
		'gzip',
	);

	const deckIds = workingCopy.map((deck) => deck.decklist.replaceAll('/', '-'));
	const gzippedDeckIds = gzipSync(JSON.stringify(deckIds));
	await s3.writeFile(
		gzippedDeckIds,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/all-decks-ids-${playerClass}.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveDetailedArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	// return;
	const workingCopy = archetypeStats.filter((d) => d.totalGames >= 50);
	// .filter((a) => a.id % 12 === currentHour);
	const result: readonly boolean[] = await Promise.all(
		workingCopy.map((archetype) => {
			const gzippedResult = gzipSync(JSON.stringify(archetype));
			return s3.writeFile(
				gzippedResult,
				DECK_STATS_BUCKET,
				`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/archetype/${archetype.id}.gz.json`,
				'application/json',
				'gzip',
			);
		}),
	);
	console.log('uploaded successfully', result.filter((r) => r).length, '/', workingCopy.length, 'archetypes');
};

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};
