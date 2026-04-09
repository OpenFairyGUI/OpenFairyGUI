/**
 * Current version of the package.
 * @hidden
 */
export const VERSION: string = `v${(import.meta as Record<string, any>).env?.PACKAGE_VERSION ?? '0.0.0-dev'}`;

/** @internal */
export const NAME = '@openfairygui/core';

/** Binary package file magic number: "FGUI" as uint32. */
export const FGUI_MAGIC = 0x46475549;

/** Null string index in the binary string table. */
export const NULL_STRING_INDEX = 65534;

/** Empty string index in the binary string table. */
export const EMPTY_STRING_INDEX = 65533;

/**
 * TypeScript utility for nullable types.
 * @hidden
 */
export type Nullable<T> = { [P in keyof T]: T[P] | null };

/** String IDs for core {@link Property} types. */
export enum PropertyType {
	ROOT = 'Root',
	PACKAGE = 'Package',
	IMAGE_RESOURCE = 'ImageResource',
	SOUND_RESOURCE = 'SoundResource',
	FONT_RESOURCE = 'FontResource',
	MOVIE_CLIP_RESOURCE = 'MovieClipResource',
	COMPONENT = 'Component',
	ATLAS = 'Atlas',
	SPRITE = 'Sprite',
	BUFFER = 'Buffer',
	G_OBJECT = 'GObject',
	G_IMAGE = 'GImage',
	G_TEXT_FIELD = 'GTextField',
	G_RICH_TEXT_FIELD = 'GRichTextField',
	G_TEXT_INPUT = 'GTextInput',
	G_GRAPH = 'GGraph',
	G_GROUP = 'GGroup',
	G_LOADER = 'GLoader',
	G_MOVIE_CLIP = 'GMovieClip',
	G_COMPONENT = 'GComponent',
	G_LIST = 'GList',
	G_BUTTON = 'GButton',
	G_LABEL = 'GLabel',
	G_COMBO_BOX = 'GComboBox',
	G_PROGRESS_BAR = 'GProgressBar',
	G_SLIDER = 'GSlider',
	G_SCROLL_BAR = 'GScrollBar',
	CONTROLLER = 'Controller',
	CONTROLLER_PAGE = 'ControllerPage',
	CONTROLLER_ACTION = 'ControllerAction',
	TRANSITION = 'Transition',
	TRANSITION_ITEM = 'TransitionItem',
	GEAR = 'Gear',
	FONT_GLYPH = 'FontGlyph',
	MOVIE_FRAME = 'MovieFrame',
}

/** Package item types used in binary format. */
export enum PackageItemType {
	Image,
	MovieClip,
	Sound,
	Component,
	Atlas,
	Font,
	Swf,
	Misc,
	Unknown,
	Spine,
	DragonBones,
}

/** Display object types. */
export enum ObjectType {
	Image,
	MovieClip,
	Swf,
	Graph,
	Loader,
	Group,
	Text,
	RichText,
	InputText,
	Component,
	List,
	Label,
	Button,
	ComboBox,
	ProgressBar,
	Slider,
	ScrollBar,
	Tree,
	Loader3D,
}

/** Button interaction modes. */
export enum ButtonMode {
	Common,
	Check,
	Radio,
}

/** Text auto-size behavior. */
export enum AutoSizeType {
	None,
	Both,
	Height,
	Shrink,
	Ellipsis,
}

/** Horizontal alignment. */
export enum AlignType {
	Left,
	Center,
	Right,
}

/** Vertical alignment. */
export enum VertAlignType {
	Top,
	Middle,
	Bottom,
}

/** Loader fill types for scaling/fitting content. */
export enum LoaderFillType {
	None,
	Scale,
	ScaleMatchHeight,
	ScaleMatchWidth,
	ScaleFree,
	ScaleNoBorder,
}

/** List layout modes. */
export enum ListLayoutType {
	SingleColumn,
	SingleRow,
	FlowHorizontal,
	FlowVertical,
	Pagination,
}

/** List selection modes. */
export enum ListSelectionMode {
	Single,
	Multiple,
	MultipleSingleClick,
	None,
}

/** Component overflow behavior. */
export enum OverflowType {
	Visible,
	Hidden,
	Scroll,
}

/** Progress bar title display style. */
export enum ProgressTitleType {
	Percent,
	ValueAndMax,
	Value,
	Max,
}

/** Scrollbar display behavior. */
export enum ScrollBarDisplayType {
	Default,
	Visible,
	Auto,
	Hidden,
}

/** Scroll direction. */
export enum ScrollType {
	Horizontal,
	Vertical,
	Both,
}

/** Image flip modes. */
export enum FlipType {
	None,
	Horizontal,
	Vertical,
	Both,
}

/** Children render order. */
export enum ChildrenRenderOrder {
	Ascent,
	Descent,
	Arch,
}

/** Group layout direction. */
export enum GroupLayoutType {
	None,
	Horizontal,
	Vertical,
}

/** Popup direction. */
export enum PopupDirection {
	Auto,
	Up,
	Down,
}

/** Relation types for responsive layout anchoring. */
export enum RelationType {
	Left_Left = 0,
	Left_Center = 1,
	Left_Right = 2,
	Center_Center = 3,
	Right_Left = 4,
	Right_Center = 5,
	Right_Right = 6,
	Top_Top = 7,
	Top_Middle = 8,
	Top_Bottom = 9,
	Middle_Middle = 10,
	Bottom_Top = 11,
	Bottom_Middle = 12,
	Bottom_Bottom = 13,
	Width = 14,
	Height = 15,
	LeftExt_Left = 16,
	LeftExt_Right = 17,
	RightExt_Left = 18,
	RightExt_Right = 19,
	TopExt_Top = 20,
	TopExt_Bottom = 21,
	BottomExt_Top = 22,
	BottomExt_Bottom = 23,
	Size = 24,
}

/** Image fill method. */
export enum FillMethod {
	None,
	Horizontal,
	Vertical,
	Radial90,
	Radial180,
	Radial360,
}

/** Fill origin direction. */
export enum FillOrigin {
	Top,
	Bottom,
	Left,
	Right,
}

/** Fill origin for 90-degree radial fill. */
export enum FillOrigin90 {
	TopLeft,
	TopRight,
	BottomLeft,
	BottomRight,
}

/** GGraph shape type. */
export enum GraphType {
	Empty = 0,
	Rect = 1,
	Ellipse = 2,
	Polygon = 3,
	RegularPolygon = 4,
}

/** Gear types, indexed by their binary format position. */
export enum GearType {
	Display = 0,
	XY = 1,
	Size = 2,
	Look = 3,
	Color = 4,
	Animation = 5,
	Text = 6,
	Icon = 7,
	Display2 = 8,
	FontSize = 9,
}

/** Transition action types. */
export enum TransitionActionType {
	XY = 0,
	Size = 1,
	Scale = 2,
	Pivot = 3,
	Alpha = 4,
	Rotation = 5,
	Color = 6,
	Animation = 7,
	Visible = 8,
	Sound = 9,
	Transition = 10,
	Shake = 11,
	ColorFilter = 12,
	Skew = 13,
	Text = 14,
	Icon = 15,
	Unknown = 16,
}

/** Controller action types. */
export enum ControllerActionType {
	PlayTransition = 0,
	ChangePage = 1,
}

/** Easing function types for transitions. */
export enum EaseType {
	Linear = 0,
	SineIn = 1,
	SineOut = 2,
	SineInOut = 3,
	QuadIn = 4,
	QuadOut = 5,
	QuadInOut = 6,
	CubicIn = 7,
	CubicOut = 8,
	CubicInOut = 9,
	QuartIn = 10,
	QuartOut = 11,
	QuartInOut = 12,
	QuintIn = 13,
	QuintOut = 14,
	QuintInOut = 15,
	ExpoIn = 16,
	ExpoOut = 17,
	ExpoInOut = 18,
	CircIn = 19,
	CircOut = 20,
	CircInOut = 21,
	ElasticIn = 22,
	ElasticOut = 23,
	ElasticInOut = 24,
	BackIn = 25,
	BackOut = 26,
	BackInOut = 27,
	BounceIn = 28,
	BounceOut = 29,
	BounceInOut = 30,
	Custom = 31,
}

/** Object property IDs used for generic get/set. */
export enum ObjectPropID {
	Text,
	Icon,
	Color,
	OutlineColor,
	Playing,
	Frame,
	DeltaTime,
	TimeScale,
	FontSize,
	Selected,
}

/** Curve types for path animation. */
export enum CurveType {
	CRSpline,
	Bezier,
	CubicBezier,
	Straight,
}

/** Target project/engine type. */
export enum ProjectType {
	Unity = 0,
	Flash = 1,
	Starling = 2,
	CocosCreator = 3,
	LayaBox = 4,
	Egret = 5,
	Haxe = 6,
	Pixi = 7,
	LibGDX = 8,
	Unreal = 9,
	CryEngine = 10,
	MonoGame = 11,
	Vision = 12,
}

/** Relation definition stored on GObject. */
export interface RelationDef {
	target: string;
	type: RelationType;
	usePercent: boolean;
}
