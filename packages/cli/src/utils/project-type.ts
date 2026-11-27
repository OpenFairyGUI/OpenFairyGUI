import { ProjectType } from '@openfairygui/core';
import { InvalidArgumentError } from 'commander';

const VALID_PROJECT_TYPE_IDS = new Set<number>(
	Object.values(ProjectType).filter((value): value is number => typeof value === 'number'),
);

export function parseNonEmptyPathOption(value: string, label: string): string {
	if (!value || !value.trim()) {
		throw new InvalidArgumentError(`${label} must not be empty.`);
	}
	return value;
}

export function parsePackageFilterOption(value: string | undefined): string[] | undefined {
	if (value === undefined) return undefined;
	const packages = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (packages.length === 0) {
		throw new InvalidArgumentError('--packages must specify at least one package name.');
	}
	return packages;
}

export function parseProjectType(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	if (trimmed === '') {
		throw new InvalidArgumentError('Project type must not be empty.');
	}
	if (/^\d+$/u.test(trimmed)) {
		const numeric = Number(trimmed);
		if (!Number.isSafeInteger(numeric) || !VALID_PROJECT_TYPE_IDS.has(numeric)) {
			throw new InvalidArgumentError(
				`Unknown numeric project type: ${value}. Valid ids: ${[...VALID_PROJECT_TYPE_IDS].sort((a, b) => a - b).join(', ')}`,
			);
		}
		return numeric;
	}
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
		cry: ProjectType.CryEngine,
		monogame: ProjectType.MonoGame,
		vision: ProjectType.Vision,
		cocos2dx: ProjectType.Cocos2dx,
		corona: ProjectType.Corona,
		threejs: ProjectType.ThreeJS,
		createjs: ProjectType.CreateJS,
		dom: ProjectType.DOM,
	};
	const resolved = map[normalized];
	if (resolved === undefined) {
		throw new InvalidArgumentError(
			`Unknown project type: ${value}. Use a valid numeric id or one of: ${Object.keys(map).join(', ')}`,
		);
	}
	return resolved;
}
