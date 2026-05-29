export { inspect, type InspectReport, type InspectCategoryReport } from './inspect.js';
export { validate, type ValidateOptions, type ValidationResult, type ValidationIssue, ValidationSeverity } from './validate.js';
export { prune, type PruneOptions } from './prune.js';
export { rename, type RenameOptions } from './rename.js';
export { atlas, type AtlasOptions } from './atlas.js';
export { publishCodeGeneration, AUTO_GENERATED_CODE_MARK, type PublishCodeGenerationOptions } from './codegen.js';
export type {
	CodeWriter,
	ICodeWriterConfig,
	MaybePromise,
	Plugin,
	PluginManifest,
	PluginModule,
} from './plugins/types.js';
export {
	restore,
	type RestoreFileSystem,
	type RestoreImageCropInput,
	type RestoreImageCropper,
	type RestoreImageExtractInput,
	type RestoreImageExtractor,
	type RestoreOptions,
	type RestoreResult,
} from './restore.js';
export {
	publish,
	resolvePublishOptions,
	type PublishOptions,
	type ResolvedPublishAtlasOptions,
	type ResolvedPublishOptions,
	type ResolvePublishOptionsOverrides,
} from './publish.js';
export {
	applyUamTransactionApp,
	type ApplyUamTransactionAppDiagnostic,
	type ApplyUamTransactionAppError,
	type ApplyUamTransactionAppInput,
	type ApplyUamTransactionAppResult,
} from './uam-transaction.js';
export { createTransform } from './utils.js';
export type {
	CliAtlasSettings,
	CliPublishSettings,
	ExtrasMap,
	HasOptionalFont,
	HasOptionalSrc,
	HasOptionalUrl,
	PublishDependency,
	PublishFileSystem,
	RootProjectSettings,
} from './shared-types.js';
