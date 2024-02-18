import { ConstructedCardData } from '../model';

export const mergeCardsData = (inputCardsData: ConstructedCardData[]): readonly ConstructedCardData[] => {
	const result = [];
	let currentCardId: string = null;
	let currentCardData: ConstructedCardData = null;
	let cardData = null;
	const sortedCardsData = [...inputCardsData].sort((a, b) => a.cardId.localeCompare(b.cardId));
	while ((cardData = sortedCardsData.pop()) != null) {
		if (currentCardId === null || cardData.cardId !== currentCardId) {
			if (currentCardData !== null) {
				result.push(currentCardData);
			}
			currentCardData = {
				cardId: cardData.cardId,
				inStartingDeck: 0,
				wins: 0,
				drawnBeforeMulligan: 0,
				keptInMulligan: 0,
				inHandAfterMulligan: 0,
				inHandAfterMulliganThenWin: 0,
				drawn: 0,
				drawnThenWin: 0,
			};
		}
		currentCardId = cardData.cardId;
		currentCardData.inStartingDeck += cardData.inStartingDeck;
		currentCardData.wins += cardData.wins;
		currentCardData.drawnBeforeMulligan += cardData.drawnBeforeMulligan;
		currentCardData.keptInMulligan += cardData.keptInMulligan;
		currentCardData.inHandAfterMulligan += cardData.inHandAfterMulligan;
		currentCardData.inHandAfterMulliganThenWin += cardData.inHandAfterMulliganThenWin;
		currentCardData.drawn += cardData.drawn;
		currentCardData.drawnThenWin += cardData.drawnThenWin;
	}
	if (currentCardData !== null) {
		result.push(currentCardData);
	}
	return result;
	// const groupedByCardId = groupByFunction((a: ConstructedCardData) => a.cardId)(sortedCardsData);
	// return Object.values(groupedByCardId).map((group) => mergeCardData(group));
};

// const mergeCardData = (cardsData: readonly ConstructedCardData[]): ConstructedCardData => {
// 	const result: ConstructedCardData = {
// 		cardId: cardsData[0].cardId,
// 		inStartingDeck: cardsData.map((d) => d.inStartingDeck).reduce((a, b) => a + b, 0),
// 		wins: cardsData.map((d) => d.wins).reduce((a, b) => a + b, 0),
// 		drawnBeforeMulligan: cardsData.map((d) => d.drawnBeforeMulligan).reduce((a, b) => a + b, 0),
// 		keptInMulligan: cardsData.map((d) => d.keptInMulligan).reduce((a, b) => a + b, 0),
// 		inHandAfterMulligan: cardsData.map((d) => d.inHandAfterMulligan).reduce((a, b) => a + b, 0),
// 		inHandAfterMulliganThenWin: cardsData.map((d) => d.inHandAfterMulliganThenWin).reduce((a, b) => a + b, 0),
// 		drawn: cardsData.map((d) => d.drawn).reduce((a, b) => a + b, 0),
// 		drawnThenWin: cardsData.map((d) => d.drawnThenWin).reduce((a, b) => a + b, 0),
// 	};
// 	return result;
// };
