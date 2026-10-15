import type {
	UamComponentSelector,
	UamControllerSelector,
	UamDisplayNodeSelector,
	UamGearSelector,
	UamLookGearSelector,
	UamPackageSelector,
	UamResourceFolderSelector,
	UamResourceSelector,
	UamTransactionOperation,
	UamTransactionSupportIssue,
	UamTransactionSupportIssueCode,
	UamTransitionSelector,
} from '../transaction-contracts.js';
import { UAM_SUPPORTED_TRANSACTION_SCOPE } from '../model.js';
import { OPERATION_PAYLOAD_SCHEMA } from '../generated/operation-payload-schema.js';
import { validatePayloadSchema } from './payload-schema.js';
import { pushSupportIssue } from './support.js';
import { isPlainRecord } from './values.js';

type ShapeCheck = 'string' | 'boolean' | 'number' | 'bytes' | 'object';

const EXPECTED: Record<ShapeCheck, string> = {
	string: 'a string',
	boolean: 'a boolean',
	number: 'a number',
	bytes: 'a Uint8Array',
	object: 'an object',
};

interface FieldRule<T> {
	readonly check: ShapeCheck;
	readonly optional: boolean;
	/** Exhaustive values of a literal-typed string field. */
	readonly values?: readonly string[];
	readonly fields?: Readonly<Record<string, FieldRule<never>>>;
	readonly payload?: PayloadCodes;
	/** Type-only: a rule must accept every value of the contract field it describes. */
	readonly accepts?: (value: T) => void;
}

/** Codes of the domain that owns a snapshot payload, for structural issues found inside it. */
interface PayloadCodes {
	readonly code: UamTransactionSupportIssueCode;
	/** A discriminator directly on the payload that names no contract member. */
	readonly kindCode?: UamTransactionSupportIssueCode;
	/** A field directly on the payload that its contract does not declare. */
	readonly unknownFieldCode?: UamTransactionSupportIssueCode;
}

/** Type-only: a literal rule must also accept nothing outside the contract field's values. */
type LiteralRule<T> = FieldRule<T> & { readonly values: readonly T[]; readonly yields?: () => T };

/** A literal-typed string field needs a `oneOf` rule listing exactly its values; `text` is rejected. */
type RuleFor<T> = [T] extends [string] ? (string extends T ? FieldRule<T> : LiteralRule<T>) : FieldRule<T>;

type RequiredRule<T> = RuleFor<T> & { readonly optional: false };
type OptionalRule<T> = RuleFor<T> & { readonly optional: true };

/** Mirrors the contract interface: every field, its optionality, and a compatible JS type. */
type FieldRules<T> = {
	readonly [K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>>
		? RequiredRule<T[K]>
		: OptionalRule<Exclude<T[K], undefined>>;
};

type OperationFields = {
	readonly [K in UamTransactionOperation['kind']]: FieldRules<
		Omit<Extract<UamTransactionOperation, { kind: K }>, 'kind' | 'opId'>
	>;
};

type Rule<T> = FieldRule<T> & { readonly optional: false };

function rule<T>(check: ShapeCheck): Rule<T> {
	return { check, optional: false };
}

function oneOf<const T extends string>(values: readonly T[]): Rule<T> & LiteralRule<T> {
	return { check: 'string', optional: false, values };
}

function optional<R extends { readonly optional: false }>(
	required: R,
): Omit<R, 'optional'> & { readonly optional: true } {
	return { ...required, optional: true };
}

function shape<T>(fields: FieldRules<T>): Rule<T> {
	return { check: 'object', optional: false, fields: fields as Record<string, FieldRule<never>> };
}

const text = rule<string>('string');
const flag = rule<boolean>('boolean');
const count = rule<number>('number');
const bytes = rule<Uint8Array>('bytes');

/** Snapshot payloads follow the structure generated from the same contract; domain stages check their values. */
function payload(codes: PayloadCodes): Rule<object> {
	return { check: 'object', optional: false, payload: codes };
}

const projectSettings = payload({ code: 'invalid_project_settings' });
const packageSettings = payload({ code: 'invalid_package_settings' });
const resourceProps = payload({ code: 'invalid_resource_payload' });
const assetResource = payload({ code: 'invalid_resource_payload', kindCode: 'unsupported_resource_kind' });
const packageSnapshot = payload({ code: 'invalid_package_payload' });
const componentPayload = payload({ code: 'invalid_component_payload' });
const displayNodeProps = payload({
	code: 'invalid_display_node_payload',
	unknownFieldCode: 'unsupported_display_node_field',
});
const displayNode = payload({ code: 'invalid_display_node_payload', kindCode: 'unsupported_display_node_kind' });
const controller = payload({ code: 'invalid_controller_payload' });
const transition = payload({ code: 'invalid_transition_payload' });
const gear = payload({ code: 'invalid_gear_payload' });

const packageSelector = shape<UamPackageSelector>({ packageId: text });
const resourceSelector = shape<UamResourceSelector>({ packageId: text, resourceId: text });
const folderSelector = shape<UamResourceFolderSelector>({ packageId: text, branch: optional(text), path: text });
const branchSelector = shape<{ branch: string }>({ branch: text });
const componentSelector = shape<UamComponentSelector>({ packageId: text, componentResourceId: text });
const displayNodeSelector = shape<UamDisplayNodeSelector>({
	packageId: text,
	componentResourceId: text,
	displayNodeId: text,
});
const controllerSelector = shape<UamControllerSelector>({
	packageId: text,
	componentResourceId: text,
	controllerName: text,
});
const transitionSelector = shape<UamTransitionSelector>({
	packageId: text,
	componentResourceId: text,
	transitionName: text,
});
const lookGearSelector = shape<UamLookGearSelector>({
	packageId: text,
	componentResourceId: text,
	displayNodeId: text,
	kind: oneOf(['look']),
	controllerName: text,
});
const gearSelector = shape<UamGearSelector>({
	packageId: text,
	componentResourceId: text,
	displayNodeId: text,
	kind: oneOf(UAM_SUPPORTED_TRANSACTION_SCOPE.gearKinds),
	controllerName: text,
});

const OPERATION_FIELDS: OperationFields = {
	updateProjectSettings: { settings: projectSettings },
	updatePackageSettings: { selector: packageSelector, settings: packageSettings },
	renameResource: { selector: resourceSelector, newName: text },
	moveResource: { selector: resourceSelector, toPath: text },
	setResourceFavorite: { selector: resourceSelector, favorite: flag },
	setResourceFolderFavorite: { selector: folderSelector, favorite: flag },
	setResourceFolderAtlas: { selector: folderSelector, atlas: text },
	setResourceExported: { selector: resourceSelector, exported: flag },
	addResourceFolder: {
		selector: packageSelector,
		path: text,
		branch: optional(text),
		favorite: optional(flag),
		atlas: optional(text),
	},
	renameResourceFolder: { selector: folderSelector, newName: text },
	moveResourceFolder: { selector: folderSelector, toPath: text },
	removeResourceFolder: { selector: folderSelector },
	setImageResourceProps: { selector: resourceSelector, props: resourceProps },
	addResource: { selector: packageSelector, resource: assetResource, atIndex: optional(count) },
	addBranch: { branch: text },
	renameBranch: { selector: branchSelector, newName: text },
	removeBranch: { selector: branchSelector },
	addPackage: { package: packageSnapshot, atIndex: count },
	renamePackage: { selector: packageSelector, newName: text },
	removePackage: { selector: packageSelector },
	addComponent: { selector: packageSelector, component: componentPayload, atIndex: count },
	removeComponent: { selector: componentSelector },
	moveComponent: { selector: componentSelector, toPackageId: text, toIndex: count },
	replaceResourceBytes: { selector: resourceSelector, sourceBytes: bytes },
	removeResource: { selector: resourceSelector },
	setComponentProps: { selector: componentSelector, props: componentPayload },
	setDisplayNodeProps: { selector: displayNodeSelector, props: displayNodeProps },
	attachDisplayNode: { selector: componentSelector, atIndex: count, node: displayNode },
	detachDisplayNode: { selector: displayNodeSelector },
	addController: { selector: controllerSelector, controller },
	updateController: { selector: controllerSelector, controller },
	removeController: { selector: controllerSelector },
	addTransition: { selector: transitionSelector, transition },
	updateTransition: { selector: transitionSelector, transition },
	removeTransition: { selector: transitionSelector },
	addLookGear: { selector: lookGearSelector, gear },
	updateLookGear: { selector: lookGearSelector, gear },
	removeLookGear: { selector: lookGearSelector },
	addGear: { selector: gearSelector, gear },
	updateGear: { selector: gearSelector, gear },
	removeGear: { selector: gearSelector },
};

const OPERATION_BASE_FIELDS: Readonly<Record<string, FieldRule<never>>> = { opId: optional(text) };

function expected(field: FieldRule<never>): string {
	return field.values ? `one of ${field.values.map((value) => `"${value}"`).join(', ')}` : EXPECTED[field.check];
}

function matches(value: unknown, field: FieldRule<never>): boolean {
	if (field.values) return typeof value === 'string' && field.values.includes(value);
	switch (field.check) {
		case 'string':
		case 'boolean':
		case 'number':
			return typeof value === field.check;
		case 'bytes':
			return value instanceof Uint8Array;
		case 'object':
			return isPlainRecord(value);
	}
}

function validateFields(
	record: Record<string, unknown>,
	fields: Readonly<Record<string, FieldRule<never>>>,
	reserved: readonly string[],
	path: string,
	label: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const accepted = [...reserved, ...Object.keys(fields)];
	for (const [name, value] of Object.entries(record)) {
		if (value === undefined || accepted.includes(name)) continue;
		pushSupportIssue(
			issues,
			'invalid_operation_payload',
			`${path}.${name}`,
			`${label} does not accept field "${name}"; accepted fields: ${accepted.join(', ')}.`,
			{ operationKind, field: name },
		);
	}
	for (const [name, field] of Object.entries(fields)) {
		const value = record[name];
		if (value === undefined) {
			if (!field.optional) {
				pushSupportIssue(
					issues,
					'invalid_operation_payload',
					`${path}.${name}`,
					`${label}.${name} is required and must be ${expected(field)}.`,
					{ operationKind, field: name },
				);
			}
			continue;
		}
		if (!matches(value, field)) {
			pushSupportIssue(
				issues,
				'invalid_operation_payload',
				`${path}.${name}`,
				`${label}.${name} must be ${expected(field)}.`,
				{ operationKind, field: name },
			);
			continue;
		}
		if (field.fields) {
			validateFields(
				value as Record<string, unknown>,
				field.fields,
				[],
				`${path}.${name}`,
				`${label}.${name}`,
				issues,
				operationKind,
			);
		}
		if (field.payload) {
			validatePayload(value, field.payload, name, `${path}.${name}`, `${label}.${name}`, issues, operationKind);
		}
	}
}

function validatePayload(
	value: unknown,
	codes: PayloadCodes,
	name: string,
	path: string,
	label: string,
	issues: UamTransactionSupportIssue[],
	operationKind: UamTransactionOperation['kind'],
): void {
	const root = OPERATION_PAYLOAD_SCHEMA.roots[operationKind]?.[name];
	if (root === undefined) throw new Error(`Missing generated payload schema for ${operationKind}.${name}.`);
	for (const issue of validatePayloadSchema(OPERATION_PAYLOAD_SCHEMA, root, value)) {
		// Only issues on the payload's own fields can mean a wrong kind or an unsupported field.
		const direct = !/[.[]/.test(issue.path.slice(1));
		const code =
			(direct && issue.discriminant && codes.kindCode) ||
			(direct && issue.unknownField && codes.unknownFieldCode) ||
			codes.code;
		pushSupportIssue(issues, code, `${path}${issue.path}`, `${label}${issue.path} ${issue.message}`, {
			operationKind,
			field: direct && issue.unknownField ? issue.path.slice(1) : name,
		});
	}
}

/**
 * Checks every operation against its contract envelope before any stage reads it. Later stages and
 * cross-operation projections rely on these field types, so a malformed batch stops here.
 */
export function validateOperationShapes(
	operations: unknown,
	issues: UamTransactionSupportIssue[],
): operations is UamTransactionOperation[] {
	if (!Array.isArray(operations)) {
		pushSupportIssue(issues, 'invalid_operation_payload', 'operations', 'Transaction operations must be an array.');
		return false;
	}
	const initialIssueCount = issues.length;
	for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
		const operation: unknown = operations[operationIndex];
		const operationPath = `operations[${operationIndex}]`;
		if (!isPlainRecord(operation)) {
			pushSupportIssue(
				issues,
				'invalid_operation_payload',
				operationPath,
				'Each transaction operation must be an object with a kind discriminator.',
			);
			continue;
		}
		const kind = operation.kind;
		if (typeof kind !== 'string' || !Object.hasOwn(OPERATION_FIELDS, kind)) {
			pushSupportIssue(
				issues,
				'unsupported_operation',
				`${operationPath}.kind`,
				// Never stringify a caller value: objects can make conversion itself throw.
				typeof kind === 'string'
					? `Unsupported transaction operation "${kind}".`
					: `Transaction operation kind must be a string; received ${kind === null ? 'null' : typeof kind}.`,
			);
			continue;
		}
		const operationKind = kind as UamTransactionOperation['kind'];
		const fields = { ...OPERATION_FIELDS[operationKind], ...OPERATION_BASE_FIELDS } as Record<
			string,
			FieldRule<never>
		>;
		validateFields(operation, fields, ['kind'], operationPath, operationKind, issues, operationKind);
	}
	return issues.length === initialIssueCount;
}
