import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { allClasses } from './archetype-stats';
import { GAMES_THRESHOLD } from './build-constructed-deck-stats';
import { buildCardsDataForDeck } from './constructed-card-data';
import { extractCardsForList } from './hs-utils';
import {
	ArchetypeStat,
	ConstructedMatchStatDbRow,
	ConstructedMatchupInfo,
	DeckStat,
	GameFormat,
	RankBracket,
	TimePeriod,
} from './model';
import { formatMemoryUsage, round } from './utils';

export const buildDeckStats = (
	rows: readonly ConstructedMatchStatDbRow[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	archetypes: readonly ArchetypeStat[],
): readonly DeckStat[] => {
	return buildDeckStatsForRankBracket(rows, rankBracket, timePeriod, format, archetypes);
};

const buildDeckStatsForRankBracket = (
	rows: readonly ConstructedMatchStatDbRow[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
	archetypes: readonly ArchetypeStat[],
): readonly DeckStat[] => {
	const groupedByDeck = groupByFunction((row: ConstructedMatchStatDbRow) => row.playerDecklist)(rows);
	console.debug(
		'memory usage',
		'after grouped by deck',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	rows = null;
	console.debug(
		'memory usage',
		'before building deck stats',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	let i = 0;
	const deckStats: readonly DeckStat[] = Object.keys(groupedByDeck)
		// Legacy decklist truncated because of the database column size
		.filter((decklist) => decklist?.length !== 145)
		.map((decklist) => {
			if (i % 20000 === 0) {
				console.debug(
					'memory usage',
					`after built ${i} decks`,
					formatMemoryUsage(process.memoryUsage().heapUsed),
					'/',
					formatMemoryUsage(process.memoryUsage().heapTotal),
				);
			}
			let deckRows: readonly ConstructedMatchStatDbRow[] = groupedByDeck[decklist];
			groupedByDeck[decklist] = null;
			const totalGames: number = deckRows.length;
			const totalWins: number = deckRows.filter((row) => row.result === 'won').length;
			const winrate: number = totalWins / totalGames;
			const archetypeStat = archetypes.find((arch) => arch.id === deckRows[0].playerArchetypeId);
			const cardsData = buildCardsDataForDeck(deckRows);
			const matchupInfo = buildMatchupInfoForDeck(deckRows);
			try {
				const cardVariations = buildCardVariations(decklist, archetypeStat?.coreCards ?? []);
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
					archetypeCoreCards: archetypeStat?.coreCards,
					cardsData: cardsData,
					matchupInfo: matchupInfo,
				};
				deckRows = null;
				return result;
			} catch (e) {
				console.error('Could not build card variations for decklist', decklist, e);
				return null;
			} finally {
				i++;
			}
		})
		.filter((stat) => stat?.totalGames >= GAMES_THRESHOLD)
		.filter((stat) => stat.winrate >= 0.3);
	return deckStats;
};

const buildMatchupInfoForDeck = (rows: readonly ConstructedMatchStatDbRow[]): readonly ConstructedMatchupInfo[] => {
	const groupedByOpponent = groupByFunction((row: ConstructedMatchStatDbRow) => row.opponentClass)(rows);
	return allClasses.map((opponentClass) => {
		const result: ConstructedMatchupInfo = {
			opponentClass: opponentClass,
			totalGames: groupedByOpponent[opponentClass]?.length ?? 0,
			wins: groupedByOpponent[opponentClass]?.filter((row) => row.result === 'won')?.length ?? 0,
			losses: groupedByOpponent[opponentClass]?.filter((row) => row.result === 'lost')?.length ?? 0,
		};
		return result;
	});
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
