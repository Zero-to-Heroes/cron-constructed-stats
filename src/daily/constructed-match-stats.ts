import { ConstructedMatchStatDbRow, RankBracket } from '../model';

export const isCorrectRank = (row: ConstructedMatchStatDbRow, rankBracket: RankBracket): boolean => {
	switch (rankBracket) {
		case 'top-2000-legend':
			return row.isLegend && row.playerRank <= 2000;
		case 'legend':
			return row.isLegend;
		case 'legend-diamond':
			return row.isLegend || row.playerRank <= 10;
		case 'diamond':
			return !row.isLegend && row.playerRank <= 10;
		case 'platinum':
			return !row.isLegend && row.playerRank <= 20 && row.playerRank > 10;
		case 'bronze-gold':
			return !row.isLegend && row.playerRank > 20;
		case 'all':
			return true;
		default:
			console.warn('unknown rank bracket', rankBracket);
			return false;
	}
};
