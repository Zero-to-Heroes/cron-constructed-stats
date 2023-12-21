import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import {
	ConstructedCardData,
	ConstructedMatchupInfo,
	DeckStat,
	DeckStats,
	GameFormat,
	RankBracket,
	TimePeriod,
} from '../model';

export interface DeckStatOptim {
	readonly pClass: string;
	readonly aId: number;
	readonly aName: string;
	readonly updt: Date;
	readonly dList: string;
	readonly rank: RankBracket;
	readonly time: TimePeriod;
	readonly format: GameFormat;
	readonly games: number;
	readonly wins: number;
	readonly wr: number;
	readonly cVar: {
		readonly added: readonly string[];
		readonly removed: readonly string[];
	};
	readonly cCore?: readonly string[];
	readonly cData: readonly ConstructedCardDataOptim[];
	readonly mInf: readonly ConstructedMatchupInfoOptim[];
}

export interface ConstructedCardDataOptim {
	id: string;
	start: number;
	wins: number;
	// Kept%
	drawnBM: number;
	keptM: number;
	// Mulligan WR
	handAM: number;
	handAMWin: number;
	// Draw WR
	drawn: number;
	drawnWin: number;
}

export interface ConstructedMatchupInfoOptim {
	readonly oClass: string;
	readonly games: number;
	readonly wins: number;
	readonly losses: number;
}

export const optimFromDeckStats = (deckStats: DeckStats): readonly DeckStatOptim[] => {
	if (!deckStats?.deckStats?.length) {
		return [];
	}
	return deckStats.deckStats.map((deckStat) => optimFromDeckStat(deckStat));
};

const optimFromDeckStat = (deckStat: DeckStat): DeckStatOptim => {
	const result: DeckStatOptim = {
		pClass: deckStat.playerClass,
		aId: deckStat.archetypeId,
		aName: deckStat.archetypeName,
		updt: deckStat.lastUpdate,
		dList: deckStat.decklist,
		rank: deckStat.rankBracket,
		time: deckStat.timePeriod,
		format: deckStat.format,
		games: deckStat.totalGames,
		wins: deckStat.totalWins,
		wr: deckStat.winrate,
		cVar: deckStat.cardVariations,
		cCore: deckStat.archetypeCoreCards,
		cData: deckStat.cardsData.map((cardData) => optimFromCardData(cardData)),
		mInf: deckStat.matchupInfo.map((matchupInfo) => optimFromMatchupInfo(matchupInfo)),
	};
	return result;
};

const optimFromCardData = (cardData: ConstructedCardData): ConstructedCardDataOptim => {
	const result: ConstructedCardDataOptim = {
		id: cardData.cardId,
		start: cardData.inStartingDeck,
		wins: cardData.wins,
		drawnBM: cardData.drawnBeforeMulligan,
		keptM: cardData.keptInMulligan,
		handAM: cardData.inHandAfterMulligan,
		handAMWin: cardData.inHandAfterMulliganThenWin,
		drawn: cardData.drawn,
		drawnWin: cardData.drawnThenWin,
	};
	return result;
};

const optimFromMatchupInfo = (matchupInfo: ConstructedMatchupInfo): ConstructedMatchupInfoOptim => {
	const result: ConstructedMatchupInfoOptim = {
		oClass: matchupInfo.opponentClass,
		games: matchupInfo.totalGames,
		wins: matchupInfo.wins,
		losses: matchupInfo.losses,
	};
	return result;
};

export const mergeDeckStatsData = (
	currentData: { [decklist: string]: DeckStat },
	newData: readonly DeckStatOptim[],
) => {
	if (!newData?.length) {
		return currentData;
	}

	console.time('groupByFunction');
	const groupedByList = groupByFunction((stat: DeckStatOptim) => stat.dList)(newData);
	console.timeEnd('groupByFunction');
	console.time('mergeDeckStats');
	for (const decklist of Object.keys(groupedByList)) {
		const stats = groupedByList[decklist];
		const mergedStat = mergeDeckStats(stats);
		currentData[decklist] = mergedStat;
	}
	console.timeEnd('mergeDeckStats');

	// for (const newStat of newData) {
	// 	const existingStat = currentData[newStat.decklist];
	// 	if (!existingStat) {
	// 		currentData[newStat.decklist] = newStat;
	// 	} else {
	// 		currentData[newStat.decklist] = mergeDeckStats(existingStat, newStat);
	// 	}
	// }
};

const mergeDeckStats = (stats: readonly DeckStatOptim[]): DeckStat => {
	const cardsData = mergeCardsData(stats.flatMap((d) => d.cData));
	const matchupInfo = mergeMatchupInfo(stats.flatMap((d) => d.mInf));
	const refStat = stats[0];
	const totalGames = stats.map((d) => d.games).reduce((a, b) => a + b, 0);
	const totalWins = stats.map((d) => d.wins).reduce((a, b) => a + b, 0);
	const result: DeckStat = {
		archetypeId: refStat.aId,
		archetypeName: refStat.aName,
		cardVariations: refStat.cVar,
		archetypeCoreCards: refStat.cCore,
		decklist: refStat.dList,
		format: refStat.format,
		lastUpdate: refStat.updt,
		playerClass: refStat.pClass,
		rankBracket: refStat.rank,
		timePeriod: refStat.time,
		totalGames: totalGames,
		totalWins: totalWins,
		winrate: Math.round((totalWins / totalGames) * 100) / 100,
		cardsData: cardsData,
		matchupInfo: matchupInfo,
	};
	return result;
};

const mergeCardsData = (cardsData: readonly ConstructedCardDataOptim[]): readonly ConstructedCardData[] => {
	const groupedByCardId = groupByFunction((a: ConstructedCardDataOptim) => a.id)(cardsData);
	return Object.values(groupedByCardId).map((group) => mergeCardData(group));
};

const mergeCardData = (cardsData: readonly ConstructedCardDataOptim[]): ConstructedCardData => {
	const result: ConstructedCardData = {
		cardId: cardsData[0].id,
		inStartingDeck: cardsData.map((d) => d.start).reduce((a, b) => a + b, 0),
		wins: cardsData.map((d) => d.wins).reduce((a, b) => a + b, 0),
		drawnBeforeMulligan: cardsData.map((d) => d.drawnBM).reduce((a, b) => a + b, 0),
		keptInMulligan: cardsData.map((d) => d.keptM).reduce((a, b) => a + b, 0),
		inHandAfterMulligan: cardsData.map((d) => d.handAM).reduce((a, b) => a + b, 0),
		inHandAfterMulliganThenWin: cardsData.map((d) => d.handAMWin).reduce((a, b) => a + b, 0),
		drawn: cardsData.map((d) => d.drawn).reduce((a, b) => a + b, 0),
		drawnThenWin: cardsData.map((d) => d.drawnWin).reduce((a, b) => a + b, 0),
	};
	return result;
};

export const mergeMatchupInfo = (
	matchupInfo: readonly ConstructedMatchupInfoOptim[],
): readonly ConstructedMatchupInfo[] => {
	const groupedByOpponent = groupByFunction((a: ConstructedMatchupInfoOptim) => a.oClass)(matchupInfo);
	return Object.values(groupedByOpponent).map((group) => mergeMatchupInfoForOpponent(group));
};

const mergeMatchupInfoForOpponent = (matchupInfo: readonly ConstructedMatchupInfoOptim[]): ConstructedMatchupInfo => {
	const result: ConstructedMatchupInfo = {
		opponentClass: matchupInfo[0].oClass,
		totalGames: matchupInfo.map((d) => d.games).reduce((a, b) => a + b, 0),
		wins: matchupInfo.map((d) => d.wins).reduce((a, b) => a + b, 0),
		losses: matchupInfo.map((d) => d.losses).reduce((a, b) => a + b, 0),
	};
	return result;
};
