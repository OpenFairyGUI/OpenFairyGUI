export interface FairyProjectDesc {
	id: string;
	type: string;
	version: string;
}

export interface PublishSettings {
	binaryFormat?: boolean;
	compressDesc?: boolean;
	fileExtension?: string;
	path?: string;
	branchPath?: string;
	includeHighResolution?: number;
	branchProcessing?: number;
	seperatedAtlasForBranch?: boolean;
	packageCount?: number;
	atlasSetting?: {
		maxSize?: number;
		paging?: boolean;
		sizeOption?: string;
		forceSquare?: boolean;
		fast?: boolean;
		allowRotation?: boolean;
		padding?: number;
		trimImage?: boolean;
		extractAlpha?: boolean;
	};
	codeGeneration?: {
		allowGenCode?: boolean;
		classNamePrefix?: string;
		codePath?: string;
		codeType?: string;
		getMemberByName?: boolean;
		ignoreNoname?: boolean;
		memberNamePrefix?: string;
		packageName?: string;
	};
}

export interface CommonSettings {
	font?: string;
	fontSize?: number;
	textColor?: string;
	buttonClickSound?: string;
	scrollBars?: {
		defaultDisplay?: string;
		horizontal?: string;
		vertical?: string;
	};
	pivot?: string;
	colorScheme?: string[];
	fontScheme?: string[];
	fontSizeScheme?: string[];
	tipsRes?: string;
}

export interface AdaptationSettings {
	designResolutionX?: number;
	designResolutionY?: number;
	scaleMode?: string;
	screenMathMode?: string;
	devices?: unknown[];
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type CustomPropertiesSettings = Record<string, JsonValue>;

export interface I18nSettings {
	langFiles: Array<{
		name: string;
		path: string;
	}>;
}

export interface ProjectSettings {
	publish?: PublishSettings;
	common?: CommonSettings;
	adaptation?: AdaptationSettings;
	customProperties?: CustomPropertiesSettings;
	i18n?: I18nSettings;
	[key: string]: unknown;
}
