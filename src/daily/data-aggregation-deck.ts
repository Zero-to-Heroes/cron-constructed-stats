import { mergeCardsData } from '../common/cards';
import { DECK_STATS_BUCKET } from '../common/config';
import { mergeMatchupInfo } from '../common/matchup';
import { buildFileKeys, buildFileNamesForGivenDay } from '../common/utils';
import { DeckStat, GameFormat, RankBracket } from '../model';
import { s3 } from './_build-daily-aggregate';

export const mergeAllHourlyStatsForTheDay = async (
	format: GameFormat,
	rankBracket: RankBracket,
	targetDate: string,
): Promise<readonly DeckStat[]> => {
	const fileNames = buildFileNamesForGivenDay(targetDate);
	console.log('fileNames', targetDate, fileNames);
	const fileKeys = buildFileKeys(format, rankBracket, 'hourly', fileNames);
	const hourlyRawData = await Promise.all(
		fileKeys.map((fileKey) => s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300)),
	);
	const hourlyData = hourlyRawData.map((data) => JSON.parse(data));

	const tempResult: { [decklist: string]: DeckStat } = {};
	mergeDeckStatsData(
		tempResult,
		hourlyData?.flatMap((d) => d?.deckStats ?? []),
	);
	return Object.values(tempResult);
};

const mergeDeckStatsData = (currentData: { [decklist: string]: DeckStat }, newData: readonly DeckStat[]) => {
	if (!newData?.length) {
		return currentData;
	}

	for (const newStat of newData) {
		const existingStat = currentData[newStat.decklist];
		if (!existingStat) {
			currentData[newStat.decklist] = newStat;
		} else {
			currentData[newStat.decklist] = mergeDeckStats(existingStat, newStat);
		}
	}
};

const mergeDeckStats = (currentStat: DeckStat, newStat: DeckStat): DeckStat => {
	const cardsData = mergeCardsData(currentStat.cardsData.concat(newStat.cardsData));
	const matchupInfo = mergeMatchupInfo(currentStat.matchupInfo.concat(newStat.matchupInfo));
	const result: DeckStat = {
		...currentStat,
		totalGames: currentStat.totalGames + newStat.totalGames,
		totalWins: currentStat.totalWins + newStat.totalWins,
		winrate:
			Math.round(
				((currentStat.totalWins + newStat.totalWins) / (currentStat.totalGames + newStat.totalGames)) * 100,
			) / 100,
		cardsData: cardsData,
		matchupInfo: matchupInfo,
	};
	return result;
};
