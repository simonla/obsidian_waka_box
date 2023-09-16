export enum ApiUrlType {
	/**
	 * WakaTime API
	 */
	WakaTime = 'WakaTime',

	/**
	 * Wakapi API
	 */
	Wakapi = 'Wakapi',

	/**
	 * custom API
	 */
	Custom = 'Custom'
}

export const ApiUrlTypeRecord: Record<string, string> = {
	WakaTime: ApiUrlType.WakaTime,
	Wakapi: ApiUrlType.Wakapi,
	Custom: ApiUrlType.Custom
}
