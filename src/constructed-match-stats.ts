import { PatchInfo } from '@firestone-hs/aws-lambda-utils';
import serverlessMysql from 'serverless-mysql';
import { ConstructedMatchStatDbRow, GameFormat, RankBracket, TimePeriod } from './model';

export const loadRows = async (
	mysql: serverlessMysql.ServerlessMysql,
	format: GameFormat,
): Promise<readonly ConstructedMatchStatDbRow[]> => {
	const query = `
		SELECT * FROM constructed_match_stats
		WHERE creationDate > DATE_SUB(NOW(), INTERVAL 30 DAY)
		AND format = (?)
	`;
	const rows: readonly ConstructedMatchStatDbRow[] = await mysql.query(query, [format]);
	return rows;
};

export const isCorrectTime = (row: ConstructedMatchStatDbRow, timePeriod: TimePeriod, patch: PatchInfo): boolean => {
	switch (timePeriod) {
		// case 'past-30':
		// 	return new Date(row.creationDate) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		case 'past-20':
			return new Date(row.creationDate) >= new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
		case 'past-7':
			return new Date(row.creationDate) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		case 'past-3':
			return new Date(row.creationDate) >= new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		case 'current-season':
			// creationDate is after the start of the current month
			return new Date(row.creationDate) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
		case 'last-patch':
			return (
				row.buildNumber >= patch.number ||
				new Date(row.creationDate).getTime() > new Date(patch.date).getTime() + 24 * 60 * 60 * 1000
			);
		default:
			console.warn('unknown time period', timePeriod);
			return false;
	}
};

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
