import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { ConstructedCoinPlayInfo } from '../model';
import { mergeCardsData } from './cards';

export const mergeCoinPlayInfo = (
	inputMatchupInfo: ConstructedCoinPlayInfo[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedCoinPlayInfo[] => {
	return ['coin', 'play'].map((coinPlay: 'coin' | 'play') => {
		const coinPlayRows = inputMatchupInfo.filter((row) => row.coinPlay === coinPlay);
		const totalGames = coinPlayRows.map((r) => r.totalGames).reduce((a, b) => a + b, 0);

		const result: ConstructedCoinPlayInfo = {
			coinPlay: coinPlay,
			totalGames: totalGames,
			wins: coinPlayRows.map((r) => r.wins).reduce((a, b) => a + b, 0),
			losses: coinPlayRows.map((r) => r.losses).reduce((a, b) => a + b, 0),
			winrate: totalGames > 0 ? coinPlayRows.map((r) => r.wins).reduce((a, b) => a + b, 0) / totalGames : null,
			cardsData: mergeCardsData(
				coinPlayRows.flatMap((d) => d.cardsData),
				format,
				allCards,
			),
		};
		return result;
	});
};
