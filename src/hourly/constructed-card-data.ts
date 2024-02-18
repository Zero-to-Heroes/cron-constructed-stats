import { MatchAnalysis } from '@firestone-hs/assign-constructed-archetype';
import {
	AllCardsService,
	GameFormatString,
	formatFormatReverse,
	getBaseCardIdForDeckbuilding,
} from '@firestone-hs/reference-data';
import { ConstructedCardData, ConstructedMatchStatDbRow } from '../model';
import { arraysEqual } from '../utils';

// Archetype cards data probably the same, we just don't have an initial list of cards
// And so, how to handle the second copy?
export const buildCardsDataForDeck = (
	rows: readonly ConstructedMatchStatDbRow[],
	allCards: AllCardsService,
): readonly ConstructedCardData[] => {
	let allDeckCards: string[] = [];
	const consolidatedData: ConstructedCardData[] = [];
	for (const row of rows) {
		const matchAnalysis: MatchAnalysis = JSON.parse(row.matchAnalysis);
		if (matchAnalysis.cardsAnalysis.some((c) => !c.cardId)) {
			continue;
		}

		if (!consolidatedData.length) {
			populateRefData(consolidatedData, matchAnalysis, row.format, allCards);
			allDeckCards = Object.keys(matchAnalysis.cardsAnalysis);
		}

		const deckCards = Object.keys(matchAnalysis.cardsAnalysis);
		// All cards for a single deck should always be the same
		if (!arraysEqual(deckCards, allDeckCards)) {
			console.error(`Mismatch in deck cards: ${deckCards} vs ${allDeckCards} for row ${row.id}`);
			continue;
		}

		for (let i = 0; i < deckCards.length; i++) {
			const consolidatedCardData = consolidatedData[i];
			const analysis = matchAnalysis.cardsAnalysis[i];
			consolidatedCardData.inStartingDeck += 1;
			consolidatedCardData.wins += row.result === 'won' ? 1 : 0;
			consolidatedCardData.drawnBeforeMulligan += analysis.drawnBeforeMulligan ? 1 : 0;
			consolidatedCardData.keptInMulligan += analysis.drawnBeforeMulligan && analysis.mulligan ? 1 : 0;
			consolidatedCardData.inHandAfterMulligan += analysis.mulligan ? 1 : 0;
			consolidatedCardData.inHandAfterMulliganThenWin += analysis.mulligan && row.result === 'won' ? 1 : 0;
			consolidatedCardData.drawn += analysis.drawnTurn > 0 ? 1 : 0;
			consolidatedCardData.drawnThenWin += analysis.drawnTurn > 0 && row.result === 'won' ? 1 : 0;
		}
	}

	if (consolidatedData.some((data) => data.inStartingDeck !== rows.length)) {
		console.warn(
			'incorrect data',
			rows[0],
			rows.length,
			consolidatedData.filter((data) => data.inStartingDeck !== rows.length).length,
			consolidatedData.filter((data) => data.inStartingDeck !== rows.length).slice(0, 10),
		);
	}

	return consolidatedData;
};

const populateRefData = (
	consolidatedData: ConstructedCardData[],
	matchAnalysis: MatchAnalysis,
	format: GameFormatString,
	allCards: AllCardsService,
) => {
	for (const card of matchAnalysis.cardsAnalysis) {
		if (!card.cardId) {
			console.error('missing card id', card);
			continue;
			// throw new Error('Missing card id');
		}
		consolidatedData.push({
			cardId: getBaseCardIdForDeckbuilding(card.cardId, formatFormatReverse(format), allCards),
			inStartingDeck: 0,
			wins: 0,
			drawnBeforeMulligan: 0,
			keptInMulligan: 0,
			inHandAfterMulligan: 0,
			inHandAfterMulliganThenWin: 0,
			drawn: 0,
			drawnThenWin: 0,
		});
	}
};
