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
	allCards: AllCardsService,
): readonly DeckStat[] => {
	const groupedByDeck = groupByFunction((row: ConstructedMatchStatDbRow) => row.playerDecklist)(rows);
	rows = null;
	let i = 0;
	const deckStats: readonly DeckStat[] = Object.keys(groupedByDeck)
		// Legacy decklist truncated because of the database column size
		.filter((decklist) => decklist?.length !== 145)
		.map((decklist) => {
			let deckRows: readonly ConstructedMatchStatDbRow[] = groupedByDeck[decklist];
			groupedByDeck[decklist] = null;
			const { data: cardsData, validRows } = buildCardsDataForDeck(deckRows, allCards);
			if (!validRows?.length) {
				return null;
			}

			const totalGames: number = validRows.length;
			const totalWins: number = validRows.filter((row) => row.result === 'won').length;
			const matchupInfo = buildMatchupInfoForDeck(validRows, allCards);
			try {
				const result: DeckStat = {
					lastUpdate: validRows
						.filter((r) => r.creationDate)
						.map((d) => new Date(d.creationDate))
						.filter((date) => !isNaN(date.getTime()))
						.sort((a, b) => b.getTime() - a.getTime())[0],
					playerClass: validRows[0].playerClass,
					archetypeId: validRows[0].playerArchetypeId,
					decklist: validRows[0].playerDecklist,
					rankBracket: rankBracket,
					timePeriod: null,
					format: format,
					totalGames: totalGames,
					totalWins: totalWins,
					winrate: null,
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
		})
		.filter((deck) => !!deck);
	return deckStats;
};

const buildMatchupInfoForDeck = (
	rows: readonly ConstructedMatchStatDbRow[],
	allCards: AllCardsService,
): readonly ConstructedMatchupInfo[] => {
	const groupedByOpponent = groupByFunction((row: ConstructedMatchStatDbRow) => row.opponentClass)(rows);
	return allClasses.map((opponentClass) => {
		const opponentRows = groupedByOpponent[opponentClass] ?? [];
		const cardsDataWhenFightingClass = buildCardsDataForDeck(opponentRows, allCards);
		const totalGames = opponentRows.length ?? 0;
		const wins = opponentRows.filter((row) => row.result === 'won')?.length ?? 0;
		const result: ConstructedMatchupInfo = {
			opponentClass: opponentClass,
			totalGames: totalGames,
			wins: wins,
			losses: opponentRows.filter((row) => row.result === 'lost')?.length ?? 0,
			winrate: totalGames > 0 ? wins / totalGames : null,
			cardsData: cardsDataWhenFightingClass?.data ?? [],
		};
		return result;
	});
};
