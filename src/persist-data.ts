import { S3 } from '@firestone-hs/aws-lambda-utils';
import serverlessMysql from 'serverless-mysql';
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from './build-constructed-deck-stats';
import { ArchetypeStat, ArchetypeStats, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from './model';

export const saveDeckStats = async (
	mysql: serverlessMysql.ServerlessMysql,
	deckStats: readonly DeckStat[],
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	const s3 = new S3();
	// The idea here is to build two global files (one for decks, one for archetypes) with the minimal data needed
	// to display the overviews, and then one file for each detailed deck/archetype, that contains all the data
	await saveGlobalDeckStats(deckStats, archetypeStats, rankBracket, timePeriod, format, s3);
	await saveGlobalArchetypeStats(archetypeStats, rankBracket, timePeriod, format, s3);
	await saveDetailedDeckStats(deckStats, rankBracket, timePeriod, format, s3);
	await saveDetailedArchetypeStats(archetypeStats, rankBracket, timePeriod, format, s3);
};

const saveGlobalDeckStats = async (
	deckStats: readonly DeckStat[],
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	s3: S3,
): Promise<void> => {
	// Backwad-compatibility
	const result: DeckStats = {
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: deckStats,
		archetypeStats: archetypeStats,
	} as DeckStats;
	const gzippedResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${timePeriod}/${rankBracket}.gz.json`,
		'application/json',
		'gzip',
	);

	const minimalDecks: readonly DeckStat[] = deckStats.map((d) => {
		const result: Mutable<DeckStat> = { ...d };
		delete result.cardsData;
		delete result.matchupInfo;
		return result;
	});
	const minResult: DeckStats = {
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: minimalDecks.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: minimalDecks,
	} as DeckStats;
	const gzippedMinResult = gzipSync(JSON.stringify(minResult));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${timePeriod}/${rankBracket}/overview.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveGlobalArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	s3: S3,
): Promise<void> => {
	const minimalArchetypes: readonly ArchetypeStat[] = archetypeStats.map((d) => {
		const result: Mutable<ArchetypeStat> = { ...d };
		delete result.cardsData;
		delete result.matchupInfo;
		return result;
	});
	const minResult: ArchetypeStats = {
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: minimalArchetypes.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		archetypeStats: minimalArchetypes,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(minResult));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${timePeriod}/${rankBracket}/overview.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveDetailedDeckStats = async (
	deckStats: readonly DeckStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	s3: S3,
): Promise<void> => {
	await Promise.all(
		deckStats.map(async (deck) => {
			const gzippedResult = gzipSync(JSON.stringify(deck));
			const deckId = deck.decklist.replace('/', '-');
			s3.writeFile(
				gzippedResult,
				DECK_STATS_BUCKET,
				`${DECK_STATS_KEY_PREFIX}/decks/${format}/${timePeriod}/${rankBracket}/deck/${deckId}.gz.json`,
				'application/json',
				'gzip',
			);
		}),
	);
};

const saveDetailedArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	s3: S3,
): Promise<void> => {
	await Promise.all(
		archetypeStats.map(async (archetype) => {
			const gzippedResult = gzipSync(JSON.stringify(archetype));
			s3.writeFile(
				gzippedResult,
				DECK_STATS_BUCKET,
				`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${timePeriod}/${rankBracket}/archetype/${archetype.id}.gz.json`,
				'application/json',
				'gzip',
			);
		}),
	);
};

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};
