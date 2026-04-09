import { Graph } from 'property-graph';
import type { Extension } from './extension.js';
import {
	type Property,
	Root,
	Package,
	ImageResource,
	SoundResource,
	FontResource,
	MovieClipResource,
	Component,
	Atlas,
	Sprite,
	FairyBuffer,
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
	FontGlyph,
	MovieFrame,
} from './properties/index.js';
import { type ILogger, Logger } from './utils/index.js';

export interface TransformContext {
	stack: string[];
}

export type Transform = (doc: Document, context?: TransformContext) => void;

/**
 * Wraps a FairyGUI project and its resources for easier modification.
 *
 * Documents manage FairyGUI assets and the relationships among dependencies using an
 * internal property graph. A new resource is created by calling 'create' methods on the
 * document. Resources are destroyed by calling {@link Property.dispose}().
 *
 * Usage:
 *
 * ```ts
 * const document = new Document();
 * const pkg = document.createPackage('MyPackage');
 * const component = document.createComponent('Button');
 * const image = document.createGImage('bg');
 * component.addChild(image);
 * pkg.addResource(component);
 * ```
 *
 * @category Documents
 */
export class Document {
	private _graph: Graph<Property> = new Graph<Property>();
	private _root: Root = new Root(this._graph);
	private _logger: ILogger = Logger.DEFAULT_INSTANCE;

	private static _GRAPH_DOCUMENTS = new WeakMap<Graph<Property>, Document>();

	public static fromGraph(graph: Graph<Property>): Document | null {
		return Document._GRAPH_DOCUMENTS.get(graph) || null;
	}

	public constructor() {
		Document._GRAPH_DOCUMENTS.set(this._graph, this);
	}

	public getRoot(): Root {
		return this._root;
	}

	/** @hidden */
	public getGraph(): Graph<Property> {
		return this._graph;
	}

	public getLogger(): ILogger {
		return this._logger;
	}

	public setLogger(logger: ILogger): Document {
		this._logger = logger;
		return this;
	}

	public async transform(...transforms: Transform[]): Promise<this> {
		const stack = transforms.map((fn) => fn.name);
		for (const transform of transforms) {
			await transform(this, { stack });
		}
		return this;
	}

	/****** Extension factory methods ******/

	createExtension<T extends Extension>(ctor: new (doc: Document) => T): T {
		const extensionName = (ctor as unknown as { EXTENSION_NAME: 'string' }).EXTENSION_NAME;
		const prevExtension = this.getRoot()
			.listExtensionsUsed()
			.find((ext) => ext.extensionName === extensionName);
		return (prevExtension || new ctor(this)) as T;
	}

	/****** Property factory methods ******/

	createPackage(name = ''): Package {
		return new Package(this._graph, name);
	}

	createImageResource(name = ''): ImageResource {
		return new ImageResource(this._graph, name);
	}

	createSoundResource(name = ''): SoundResource {
		return new SoundResource(this._graph, name);
	}

	createFontResource(name = ''): FontResource {
		return new FontResource(this._graph, name);
	}

	createMovieClipResource(name = ''): MovieClipResource {
		return new MovieClipResource(this._graph, name);
	}

	createComponent(name = ''): Component {
		return new Component(this._graph, name);
	}

	createAtlas(name = ''): Atlas {
		return new Atlas(this._graph, name);
	}

	createSprite(name = ''): Sprite {
		return new Sprite(this._graph, name);
	}

	createBuffer(name = ''): FairyBuffer {
		return new FairyBuffer(this._graph, name);
	}

	createGImage(name = ''): GImage {
		return new GImage(this._graph, name);
	}

	createGTextField(name = ''): GTextField {
		return new GTextField(this._graph, name);
	}

	createGRichTextField(name = ''): GRichTextField {
		return new GRichTextField(this._graph, name);
	}

	createGTextInput(name = ''): GTextInput {
		return new GTextInput(this._graph, name);
	}

	createGGraph(name = ''): GGraph {
		return new GGraph(this._graph, name);
	}

	createGGroup(name = ''): GGroup {
		return new GGroup(this._graph, name);
	}

	createGLoader(name = ''): GLoader {
		return new GLoader(this._graph, name);
	}

	createGLoader3D(name = ''): GLoader3D {
		return new GLoader3D(this._graph, name);
	}

	createGMovieClip(name = ''): GMovieClip {
		return new GMovieClip(this._graph, name);
	}

	createGComponent(name = ''): GComponent {
		return new GComponent(this._graph, name);
	}

	createGList(name = ''): GList {
		return new GList(this._graph, name);
	}

	createGButton(name = ''): GButton {
		return new GButton(this._graph, name);
	}

	createGLabel(name = ''): GLabel {
		return new GLabel(this._graph, name);
	}

	createGComboBox(name = ''): GComboBox {
		return new GComboBox(this._graph, name);
	}

	createGProgressBar(name = ''): GProgressBar {
		return new GProgressBar(this._graph, name);
	}

	createGSlider(name = ''): GSlider {
		return new GSlider(this._graph, name);
	}

	createGScrollBar(name = ''): GScrollBar {
		return new GScrollBar(this._graph, name);
	}

	createController(name = ''): Controller {
		return new Controller(this._graph, name);
	}

	createControllerPage(name = ''): ControllerPage {
		return new ControllerPage(this._graph, name);
	}

	createControllerAction(name = ''): ControllerAction {
		return new ControllerAction(this._graph, name);
	}

	createTransition(name = ''): Transition {
		return new Transition(this._graph, name);
	}

	createTransitionItem(name = ''): TransitionItem {
		return new TransitionItem(this._graph, name);
	}

	createGear(name = ''): Gear {
		return new Gear(this._graph, name);
	}

	createFontGlyph(name = ''): FontGlyph {
		return new FontGlyph(this._graph, name);
	}

	createMovieFrame(name = ''): MovieFrame {
		return new MovieFrame(this._graph, name);
	}
}
