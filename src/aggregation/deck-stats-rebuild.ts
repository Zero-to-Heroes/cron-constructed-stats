import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { buildCardVariations } from '../daily/constructed-deck-stats';
import { ArchetypeStat, DeckStat, DeckStats } from '../model';
import { mergeCardsData, mergeMatchupInfo } from './data-aggregattion-archetype';

export const buildDecksStats = (
	dailyData: readonly DeckStats[],
	archetypeData: readonly ArchetypeStat[],
	allCards: AllCardsService,
): readonly DeckStat[] => {
	const deckStats = buildDeckStats(
		dailyData.flatMap((d) => d.deckStats),
		archetypeData,
		allCards,
	);
	return deckStats;
};

const buildDeckStats = (
	deckStats: readonly DeckStat[],
	archetypeData: readonly ArchetypeStat[],
	allCards: AllCardsService,
): readonly DeckStat[] => {
	const groupedByDecklist = groupByFunction((a: DeckStat) => a.decklist)(deckStats);
	return Object.values(groupedByDecklist).map((group) =>
		mergeDeckStatsForDecklist(
			group,
			archetypeData.find((a) => a.id === group[0].archetypeId),
			allCards,
		),
	);
};

const mergeDeckStatsForDecklist = (
	deckStats: readonly DeckStat[],
	archetypeData: ArchetypeStat,
	allCards: AllCardsService,
): DeckStat => {
	const totalGames = deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins = deckStats.map((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const cardsData = mergeCardsData(deckStats.flatMap((d) => d.cardsData));
	const result: DeckStat = {
		decklist: deckStats[0].decklist,
		archetypeId: deckStats[0].archetypeId,
		archetypeName: deckStats[0].archetypeName,
		playerClass: deckStats[0].playerClass,
		format: deckStats[0].format,
		rankBracket: deckStats[0].rankBracket,
		timePeriod: deckStats[0].timePeriod,
		totalGames: totalGames,
		totalWins: totalWins,
		winrate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) / 100 : 0,
		cardsData: cardsData,
		cardVariations: buildCardVariations(deckStats[0].decklist, archetypeData.coreCards, allCards),
		archetypeCoreCards: archetypeData.coreCards,
		matchupInfo: mergeMatchupInfo(deckStats.flatMap((d) => d.matchupInfo)),
	};
	return result;
};
