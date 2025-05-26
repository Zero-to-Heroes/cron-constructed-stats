import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { mergeCardsData, mergeDiscoverData } from '../common/cards';
import { mergeCoinPlayInfo } from '../common/coin-play';
import { mergeMatchupInfo } from '../common/matchup';
import { ArchetypeStat, ArchetypeStats, DeckStat, DeckStats } from '../model';
import { buildCardVariations } from './utils';

export const aggregateDeckData = (
	dailyData: readonly DeckStats[],
	archetypeData: ArchetypeStats,
	allCards: AllCardsService,
	format: GameFormat,
): DeckStats => {
	const result: DeckStats = {
		lastUpdated: new Date(),
		rankBracket: dailyData[0].rankBracket,
		timePeriod: dailyData[0].timePeriod,
		format: dailyData[0].format,
		dataPoints: dailyData.map((d) => d.dataPoints).reduce((a, b) => a + b, 0),
		deckStats: mergeDeckStats(
			dailyData.flatMap((d) => d.deckStats),
			archetypeData,
			allCards,
			format,
		),
	};
	return result;
};

const mergeDeckStats = (
	deckStats: readonly DeckStat[],
	archetypeData: ArchetypeStats,
	allCards: AllCardsService,
	format: GameFormat,
): readonly DeckStat[] => {
	const groupedByDecklist = groupByFunction((a: DeckStat) => a.decklist)(deckStats);
	return Object.values(groupedByDecklist).map((group) =>
		mergeDeckStatsForDecklist(
			group,
			archetypeData.archetypeStats.find((a) => a.id === group[0].archetypeId),
			allCards,
			format,
		),
	);
};

const mergeDeckStatsForDecklist = (
	deckStats: readonly DeckStat[],
	archetypeData: ArchetypeStat,
	allCards: AllCardsService,
	format: GameFormat,
): DeckStat => {
	const totalGames = deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins = deckStats.map((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const cardsData = mergeCardsData(
		deckStats.flatMap((d) => d.cardsData),
		format,
		allCards,
	);
	const discoverData = mergeDiscoverData(
		deckStats.flatMap((d) => d.discoverData),
		format,
		allCards,
	);
	const result: DeckStat = {
		lastUpdate: deckStats
			.map((d) => new Date(d.lastUpdate))
			.filter((date) => !isNaN(date.getTime()))
			.sort((a, b) => b.getTime() - a.getTime())[0],
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
		discoverData: discoverData,
		cardVariations: buildCardVariations(deckStats[0].decklist, archetypeData.coreCards, allCards),
		archetypeCoreCards: archetypeData.coreCards,
		matchupInfo: mergeMatchupInfo(
			deckStats.flatMap((d) => d.matchupInfo),
			format,
			allCards,
		),
		coinPlayInfo: mergeCoinPlayInfo(
			deckStats.flatMap((d) => d.coinPlayInfo),
			format,
			allCards,
		),
	};
	return result;
};
