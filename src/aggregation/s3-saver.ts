import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../legacy/build-constructed-deck-stats';
import { ArchetypeStat, ArchetypeStats, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats';

export const persistData = async (
	archetypeStats: ArchetypeStats,
	deckStats: DeckStats,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	await saveGlobalArchetypeStats(archetypeStats.archetypeStats, rankBracket, timePeriod, format);
	console.log('saved global archetype stats', archetypeStats.archetypeStats.length);
	await saveGlobalDeckStats(deckStats.deckStats, rankBracket, timePeriod, format);
	console.log('saved global deck stats', deckStats.deckStats.length);
	await saveDetailedDeckStats(deckStats.deckStats, rankBracket, timePeriod, format);
	console.log('saved detailed deck stats', deckStats.deckStats.length);
	await saveDetailedArchetypeStats(archetypeStats.archetypeStats, rankBracket, timePeriod, format);
	console.log('saved detailed archetype stats', archetypeStats.archetypeStats.length);
	console.log('finished saving data');
};

const saveGlobalArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	if (!archetypeStats?.length) {
		console.error('empty archetype stats', archetypeStats, rankBracket, timePeriod, format);
		return;
	}

	const minimalArchetypes: readonly ArchetypeStat[] = archetypeStats.map((d) => {
		const result: Mutable<ArchetypeStat> = { ...d };
		delete result.cardsData;
		delete result.matchupInfo;
		return result;
	});
	const result: ArchetypeStats = {
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: minimalArchetypes.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		archetypeStats: minimalArchetypes,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/overview.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveGlobalDeckStats = async (
	deckStats: readonly DeckStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	if (!deckStats?.length) {
		console.error('empty archetype stats', deckStats, rankBracket, timePeriod, format);
		return;
	}

	const minimalDecks: readonly DeckStat[] = deckStats.map((d) => {
		const result: Mutable<DeckStat> = { ...d };
		delete result.cardsData;
		delete result.matchupInfo;
		return result;
	});

	const result: DeckStats = {
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: minimalDecks.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: minimalDecks,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/overview.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveDetailedDeckStats = async (
	deckStats: readonly DeckStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	const workingCopy = deckStats;
	const result: readonly boolean[] = await Promise.all(
		workingCopy.map((deck) => {
			const gzippedResult = gzipSync(JSON.stringify(deck));
			const deckId = deck.decklist.replaceAll('/', '-');
			return s3.writeFile(
				gzippedResult,
				DECK_STATS_BUCKET,
				`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/deck/${deckId}.gz.json`,
				'application/json',
				'gzip',
			);
		}),
	);
	console.log('uploaded successfully', result.filter((r) => r).length, '/', workingCopy.length, 'decks');
};

const saveDetailedArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	const workingCopy = archetypeStats;
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
