import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { ConstructedCardData } from '../model';

export const mergeCardsData = (cardsData: readonly ConstructedCardData[]): readonly ConstructedCardData[] => {
	const groupedByCardId = groupByFunction((a: ConstructedCardData) => a.cardId)(cardsData);
	return Object.values(groupedByCardId).map((group) => mergeCardData(group));
};

const mergeCardData = (cardsData: readonly ConstructedCardData[]): ConstructedCardData => {
	const result: ConstructedCardData = {
		cardId: cardsData[0].cardId,
		inStartingDeck: cardsData.map((d) => d.inStartingDeck).reduce((a, b) => a + b, 0),
		wins: cardsData.map((d) => d.wins).reduce((a, b) => a + b, 0),
		drawnBeforeMulligan: cardsData.map((d) => d.drawnBeforeMulligan).reduce((a, b) => a + b, 0),
		keptInMulligan: cardsData.map((d) => d.keptInMulligan).reduce((a, b) => a + b, 0),
		inHandAfterMulligan: cardsData.map((d) => d.inHandAfterMulligan).reduce((a, b) => a + b, 0),
		inHandAfterMulliganThenWin: cardsData.map((d) => d.inHandAfterMulliganThenWin).reduce((a, b) => a + b, 0),
		drawn: cardsData.map((d) => d.drawn).reduce((a, b) => a + b, 0),
		drawnThenWin: cardsData.map((d) => d.drawnThenWin).reduce((a, b) => a + b, 0),
	};
	return result;
};
