export { ProjectIOError, BinaryFormatError } from './io/errors.js';
// Document
export { Document, type Transform, type TransformContext } from './document.js';

// Extension
export { Extension } from './extension.js';

// Validation
export {
	createProjectValidationReport,
	sortProjectDiagnostics,
	type ProjectDiagnostic,
	type ProjectDiagnosticCode,
	type ProjectDiagnosticSeverity,
	type ProjectValidationReport,
} from './validation.js';
export { validateSafeSvgSource } from './utils/svg-validation.js';

// Unified Authoring Model (Gate A)
export * from './uam/index.js';

// Authoring helpers
export {
	bindLookGear,
	composeController,
	composeTransition,
	type ControllerActionComposition,
	type ControllerCompositionOptions,
	type ControllerPageComposition,
	type LookGearBindingOptions,
	type LookGearBindingState,
	type LookGearBindingValue,
	type TransitionCompositionOptions,
	type TransitionItemComposition,
} from './authoring.js';

// Constants and Enums
export {
	VERSION,
	FGUI_MAGIC,
	NULL_STRING_INDEX,
	EMPTY_STRING_INDEX,
	PropertyType,
	PackageItemType,
	ObjectType,
	ButtonMode,
	AutoSizeType,
	AlignType,
	VertAlignType,
	LoaderFillType,
	ListLayoutType,
	ListSelectionMode,
	OverflowType,
	ProgressTitleType,
	ScrollBarDisplayType,
	ScrollType,
	FlipType,
	ChildrenRenderOrder,
	GroupLayoutType,
	PopupDirection,
	RelationType,
	FillMethod,
	FillOrigin,
	FillOrigin90,
	GraphType,
	GearType,
	TransitionActionType,
	ControllerActionType,
	EaseType,
	ObjectPropID,
	CurveType,
	ProjectType,
	type Nullable,
	type RelationDef,
} from './constants.js';

// Properties
export {
	Property,
	type IProperty,
	type PropertyResolver,
	COPY_IDENTITY,
	ExtensibleProperty,
	type IExtensibleProperty,
	ExtensionProperty,
	Root,
	Package,
	type PackageAtlasSizeOption,
	type PackageResourceFolder,
	type PackageSourceAtlas,
	type PackageSourceAtlasSettings,
	ImageResource,
	type PixelHitTestData,
	MiscResource,
	SoundResource,
	FontResource,
	MovieClipResource,
	SwfResource,
	SpineResource,
	DragonBonesResource,
	Component,
	type ComponentCustomProperty,
	Atlas,
	Sprite,
	FairyBuffer,
	FontGlyph,
	MovieFrame,
	GObject,
	type IGObject,
	GImage,
	GTextField,
	GRichTextField,
	GTextInput,
	GGraph,
	GGroup,
	GLoader,
	GLoader3D,
	GMovieClip,
	GComponent,
	GList,
	GTree,
	type GTreeItemTemplateInfo,
	type GTreeRuntimeNode,
	type GTreeInteractionState,
	type GTreeNavigationDirection,
	GButton,
	GLabel,
	GComboBox,
	GProgressBar,
	GSlider,
	GScrollBar,
	Controller,
	type ControllerHomePageType,
	ControllerPage,
	ControllerAction,
	Transition,
	TransitionItem,
	Gear,
} from './properties/index.js';

// Utilities
export {
	Logger,
	Verbosity,
	type ILogger,
	generateId,
	parseURL,
	buildURL,
	applyDerivedMovieClipModel,
	deriveMovieClipModel,
	deriveMovieClipModelFromJta,
	parseJta,
	type DerivedMovieClipFrame,
	type DerivedMovieClipModel,
	type JtaDef,
	type JtaFrame,
	type JtaTexture,
	probeRasterImage,
	type RasterImageFormat,
	type RasterImageInfo,
} from './utils/index.js';

// I/O
export {
	PlatformIO,
	ProjectReader,
	ProjectWriter,
	type BinaryReadLimits,
	type BinaryReaderOptions,
	type BinaryWriterOptions,
	type BinaryPackageEncodingContext,
	type FileSystem,
	type ProjectReadOptions,
	type ProjectReadResult,
	type ProjectBranchDirectory,
	type ProjectSourceFile,
	type ProjectWriteOptions,
	type ProjectImageWriteHints,
} from './io/index.js';

// Types
export type {
	FairyProjectDesc,
	PublishSettings,
	CommonSettings,
	AdaptationSettings,
	JsonValue,
	CustomPropertiesSettings,
	I18nSettings,
	ProjectSettings,
} from './types/index.js';
