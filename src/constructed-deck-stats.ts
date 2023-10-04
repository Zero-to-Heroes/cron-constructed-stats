import { S3, groupByFunction } from '@firestone-hs/aws-lambda-utils';
import serverlessMysql from 'serverless-mysql';
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX, GAMES_THRESHOLD } from './build-constructed-deck-stats';
import { buildCardsDataForDeck } from './constructed-card-data';
import { extractCardsForList } from './hs-utils';
import {
	ArchetypeStat,
	ConstructedMatchStatDbRow,
	DeckStat,
	DeckStats,
	GameFormat,
	RankBracket,
	TimePeriod,
} from './model';
import { round } from './utils';

export const buildDeckStats = (
	rows: readonly ConstructedMatchStatDbRow[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	archetypes: readonly ArchetypeStat[],
): readonly DeckStat[] => {
	return buildDeckStatsForRankBracket(rows, rankBracket, timePeriod, format, archetypes);
};

export const saveDeckStats = async (
	mysql: serverlessMysql.ServerlessMysql,
	deckStats: readonly DeckStat[],
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	const s3 = new S3();
	const result: DeckStats = {
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: deckStats,
		archetypeStats: archetypeStats,
	};
	const gzippedResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${timePeriod}/${rankBracket}.gz.json`,
		'application/json',
		'gzip',
	);
};

const buildDeckStatsForRankBracket = (
	rows: readonly ConstructedMatchStatDbRow[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	archetypes: readonly ArchetypeStat[],
): readonly DeckStat[] => {
	const groupedByDeck = groupByFunction((row: ConstructedMatchStatDbRow) => row.playerDecklist)(rows);
	const deckStats: readonly DeckStat[] = Object.keys(groupedByDeck)
		// Legacy decklist truncated because of the database column size
		.filter((decklist) => decklist?.length !== 145)
		.map((decklist) => {
			const deckRows: readonly ConstructedMatchStatDbRow[] = groupedByDeck[decklist];
			const totalGames: number = deckRows.length;
			const totalWins: number = deckRows.filter((row) => row.result === 'won').length;
			const winrate: number = totalWins / totalGames;
			const archetypeStat = archetypes.find((arch) => arch.id === deckRows[0].playerArchetypeId);
			const cardsData = buildCardsDataForDeck(deckRows);
			try {
				const cardVariations = buildCardVariations(decklist, archetypeStat?.coreCards);
				const result: DeckStat = {
					playerClass: deckRows[0].playerClass,
					archetypeId: deckRows[0].playerArchetypeId,
					archetypeName: archetypeStat?.name,
					// name: deckRows[0].playerDecklist,
					decklist: deckRows[0].playerDecklist,
					rankBracket: rankBracket,
					timePeriod: timePeriod,
					format: format,
					totalGames: totalGames,
					winrate: round(winrate),
					cardVariations: cardVariations,
					cardsData: cardsData,
					// archetypeCoreCards: archetypeStat?.coreCards,
				};
				return result;
			} catch (e) {
				console.error('Could not build card variations for decklist', decklist, e);
				return null;
			}
		})
		.filter((stat) => stat?.totalGames >= GAMES_THRESHOLD);
	return deckStats;
};

const buildCardVariations = (
	decklist: string,
	coreCards: readonly string[],
): {
	added: readonly string[];
	removed: readonly string[];
} => {
	const result: {
		added: string[];
		removed: string[];
	} = {
		added: [],
		removed: [],
	};
	const deckCards = extractCardsForList(decklist);
	if (!deckCards?.length) {
		throw new Error('Invalid decklist: ' + decklist);
	}

	const archetypeCards = [...coreCards];
	for (const card of deckCards) {
		if (!archetypeCards.includes(card)) {
			result.added.push(card);
		} else {
			archetypeCards.splice(archetypeCards.indexOf(card), 1);
		}
	}

	result.removed = archetypeCards;

	return result;
};
