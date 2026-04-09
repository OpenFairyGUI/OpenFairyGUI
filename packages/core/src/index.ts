// Document
export { Document, type Transform, type TransformContext } from './document.js';

// Extension
export { Extension } from './extension.js';

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
	ImageResource,
	type PixelHitTestData,
	SoundResource,
	FontResource,
	MovieClipResource,
	Component,
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
	type IGLoader3D,
	GMovieClip,
	GComponent,
	GList,
	GButton,
	GLabel,
	GComboBox,
	GProgressBar,
	GSlider,
	GScrollBar,
	Controller,
	ControllerPage,
	ControllerAction,
	Transition,
	TransitionItem,
	Gear,
} from './properties/index.js';

// Utilities
export {
	Logger, Verbosity, type ILogger, generateId, parseURL, buildURL,
	maxRectsPack, type PackInput, type PackResult, type PackerOptions,
	parseJta, type JtaDef, type JtaFrame, type JtaTexture,
} from './utils/index.js';

// I/O
export {
	PlatformIO,
	NodeIO,
	ProjectReader,
	ProjectWriter,
	BinaryReader,
	BinaryWriter,
	ReaderContext,
	type BinaryWriterOptions,
	type FileSystem,
} from './io/index.js';

// Types
export type {
	FairyProjectDesc,
	PublishSettings,
	CommonSettings,
	AdaptationSettings,
	ProjectSettings,
} from './types/index.js';
