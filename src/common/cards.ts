import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { baseCardId } from '../hourly/constructed-card-data';
import { ConstructedCardData, ConstructedDiscoverCardData } from '../model';

export const mergeCardsData = (
	inputCardsData: ConstructedCardData[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedCardData[] => {
	const result = [];
	let currentCardId: string = null;
	let currentCardData: ConstructedCardData = null;
	let cardData = null;
	const sortedCardsData = [...inputCardsData].sort((a, b) =>
		baseCardId(a.cardId, format, allCards).localeCompare(baseCardId(b.cardId, format, allCards)),
	);
	while ((cardData = sortedCardsData.pop()) != null) {
		if (currentCardId === null || baseCardId(cardData.cardId, format, allCards) !== currentCardId) {
			if (currentCardData !== null) {
				result.push(currentCardData);
			}
			currentCardData = {
				cardId: baseCardId(cardData.cardId, format, allCards),
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
		currentCardId = baseCardId(cardData.cardId, format, allCards);
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
};

export const mergeDiscoverData = (
	inputDiscoverData: ConstructedDiscoverCardData[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedDiscoverCardData[] => {
	const result = [];
	let currentCardId: string = null;
	let currentCardData: ConstructedDiscoverCardData = null;
	let cardData = null;
	const sortedCardsData = [...inputDiscoverData].sort((a, b) =>
		baseCardId(a.cardId, format, allCards).localeCompare(baseCardId(b.cardId, format, allCards)),
	);
	while ((cardData = sortedCardsData.pop()) != null) {
		if (currentCardId === null || baseCardId(cardData.cardId, format, allCards) !== currentCardId) {
			if (currentCardData !== null) {
				result.push(currentCardData);
			}
			currentCardData = {
				cardId: baseCardId(cardData.cardId, format, allCards),
				discovered: 0,
				discoveredThenWin: 0,
			};
		}
		currentCardId = baseCardId(cardData.cardId, format, allCards);
		currentCardData.discovered += cardData.discovered ?? 0;
		currentCardData.discoveredThenWin += cardData.discoveredThenWin ?? 0;
	}
	if (currentCardData !== null) {
		result.push(currentCardData);
	}
	return result;
};
