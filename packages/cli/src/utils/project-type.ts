import { ProjectType } from '@openfairygui/core';

export function parseProjectType(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (trimmed === '') return undefined;
	if (/^\d+$/u.test(trimmed)) return Number(trimmed);
	const normalized = trimmed.toLowerCase();
	const map: Record<string, number> = {
		unity: ProjectType.Unity,
		flash: ProjectType.Flash,
		starling: ProjectType.Starling,
		cocoscreator: ProjectType.CocosCreator,
		cocos: ProjectType.CocosCreator,
		layabox: ProjectType.LayaBox,
		laya: ProjectType.LayaBox,
		egret: ProjectType.Egret,
		haxe: ProjectType.Haxe,
		pixi: ProjectType.Pixi,
		libgdx: ProjectType.LibGDX,
		unreal: ProjectType.Unreal,
		cryengine: ProjectType.CryEngine,
		monogame: ProjectType.MonoGame,
		vision: ProjectType.Vision,
	};
	const resolved = map[normalized];
	if (resolved === undefined) {
		throw new Error(`Unknown project type: ${value}. Use a numeric id or one of: ${Object.keys(map).join(', ')}`);
	}
	return resolved;
}
