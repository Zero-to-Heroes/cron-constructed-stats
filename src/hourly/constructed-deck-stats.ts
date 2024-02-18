import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { allClasses } from '../common/utils';
import { ConstructedMatchStatDbRow, ConstructedMatchupInfo, DeckStat, GameFormat, RankBracket } from '../model';
import { buildCardsDataForDeck } from './constructed-card-data';

export const buildDeckStats = (
	rows: readonly ConstructedMatchStatDbRow[],
	rankBracket: RankBracket,
	format: GameFormat,
	// archetypes: readonly ArchetypeStat[],
	allCards: AllCardsService,
): readonly DeckStat[] => {
	return buildDeckStatsForRankBracket(rows, rankBracket, format, allCards);
};

const buildDeckStatsForRankBracket = (
	rows: readonly ConstructedMatchStatDbRow[],
	rankBracket: RankBracket,
	format: GameFormat,
	// archetypes: readonly ArchetypeStat[],
	allCards: AllCardsService,
): readonly DeckStat[] => {
	const groupedByDeck = groupByFunction((row: ConstructedMatchStatDbRow) => row.playerDecklist)(rows);
	// console.debug(
	// 	'memory usage',
	// 	'after grouped by deck',
	// 	formatMemoryUsage(process.memoryUsage().heapUsed),
	// 	'/',
	// 	formatMemoryUsage(process.memoryUsage().heapTotal),
	// );
	rows = null;
	// console.debug(
	// 	'memory usage',
	// 	'before building deck stats',
	// 	formatMemoryUsage(process.memoryUsage().heapUsed),
	// 	'/',
	// 	formatMemoryUsage(process.memoryUsage().heapTotal),
	// );
	let i = 0;
	const deckStats: readonly DeckStat[] = Object.keys(groupedByDeck)
		// Legacy decklist truncated because of the database column size
		.filter((decklist) => decklist?.length !== 145)
		.map((decklist) => {
			if (i % 20000 === 0) {
				// console.debug(
				// 	'memory usage',
				// 	`after built ${i} decks`,
				// 	formatMemoryUsage(process.memoryUsage().heapUsed),
				// 	'/',
				// 	formatMemoryUsage(process.memoryUsage().heapTotal),
				// );
			}
			let deckRows: readonly ConstructedMatchStatDbRow[] = groupedByDeck[decklist];
			groupedByDeck[decklist] = null;
			const totalGames: number = deckRows.length;
			const totalWins: number = deckRows.filter((row) => row.result === 'won').length;
			// const winrate: number = totalWins / totalGames;
			// const archetypeStat = archetypes.find((arch) => arch.id === deckRows[0].playerArchetypeId);
			const cardsData = buildCardsDataForDeck(deckRows, allCards);
			const matchupInfo = buildMatchupInfoForDeck(deckRows);

			// Sanity checks
			// Can't do that anymore, since we filter out the rows where the cards data misses some card ids
			// if (cardsData.some((d) => d.inStartingDeck !== totalGames)) {
			// 	console.error(
			// 		decklist,
			// 		deckRows.length,
			// 		totalGames,
			// 		cardsData.filter((d) => d.inStartingDeck !== totalGames),
			// 	);
			// 	throw new Error('Invalid cards data for deck: totalGames');
			// }
			// if (cardsData.some((d) => d.wins !== totalWins)) {
			// 	console.error(
			// 		decklist,
			// 		deckRows.length,
			// 		totalWins,
			// 		cardsData.filter((d) => d.wins !== totalWins),
			// 	);
			// 	throw new Error('Invalid cards data for deck: wins');
			// }

			try {
				// const cardVariations = buildCardVariations(decklist, archetypeStat?.coreCards ?? [], allCards);
				const result: DeckStat = {
					lastUpdate: deckRows
						.filter((r) => r.creationDate)
						.map((d) => new Date(d.creationDate))
						.filter((date) => !isNaN(date.getTime()))
						.sort((a, b) => b.getTime() - a.getTime())[0],
					playerClass: deckRows[0].playerClass,
					archetypeId: deckRows[0].playerArchetypeId,
					// archetypeName: archetypeStat?.name,
					// name: deckRows[0].playerDecklist,
					decklist: deckRows[0].playerDecklist,
					rankBracket: rankBracket,
					timePeriod: null,
					format: format,
					totalGames: totalGames,
					totalWins: totalWins,
					winrate: null,
					// cardVariations: cardVariations,
					// archetypeCoreCards: archetypeStat?.coreCards,
					cardsData: cardsData,
					matchupInfo: matchupInfo,
				} as DeckStat;
				deckRows = null;
				return result;
			} catch (e) {
				console.error('Could not build card variations for decklist', decklist, e);
				return null;
			} finally {
				i++;
			}
		});
	// .filter((stat) => stat?.totalGames >= GAMES_THRESHOLD)
	// .filter((stat) => stat.winrate >= 0.3);
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
