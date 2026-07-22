import test from 'ava';
import { Document } from '@openfairygui/core';
import {
	buildCodegenClasses,
	type CodegenMember,
	type ResolvedPackageCodegenPlan,
} from '../src/codegen.js';

function createPlan(): ResolvedPackageCodegenPlan {
	return createPlanWithIgnoreNoname(false);
}

function createPlanWithIgnoreNoname(ignoreNoname: boolean): ResolvedPackageCodegenPlan {
	return {
		outputDir: 'generated',
		packageFolderName: 'MainPkg',
		packageNamespace: 'MainPkg',
		binderClassName: 'MainPkgBinder',
		settings: {
			allowGenCode: true,
			classNamePrefix: 'UI_',
			memberNamePrefix: 'm_',
			packageName: '',
			ignoreNoname,
			getMemberByName: false,
			codePath: 'generated',
			codeType: '',
		},
	};
}

test('buildCodegenClasses annotates component child members with referenced package and component', (t) => {
	const doc = new Document();

	const sharedPkg = doc.createPackage('SharedPkg');
	sharedPkg.setId('shrd0001');
	sharedPkg.setGenCode(true);
	const sharedPanel = doc.createComponent('SharedPanel');
	sharedPanel.setId('cmpShared');
	sharedPanel.setExported(true);
	sharedPkg.addResource(sharedPanel);
	const sharedButton = doc.createComponent('SharedButton');
	sharedButton.setId('cmpButton');
	sharedButton.setExtensionType('Button');
	sharedPkg.addResource(sharedButton);

	const mainPkg = doc.createPackage('MainPkg');
	mainPkg.setId('main0001');
	const localPanel = doc.createComponent('LocalPanel');
	localPanel.setId('cmpLocal');
	localPanel.setExported(true);
	const localPanelChild = doc.createGTextField('caption');
	localPanelChild.setId('n0');
	localPanel.addChild(localPanelChild);
	mainPkg.addResource(localPanel);

	const main = doc.createComponent('Main');
	main.setId('cmpMain');
	main.setExported(true);
	const localChild = doc.createGComponent('localPanel');
	localChild.setId('n0');
	localChild.setSrc('cmpLocal');
	main.addChild(localChild);
	const sharedChild = doc.createGComponent('sharedPanel');
	sharedChild.setId('n1');
	sharedChild.setSrc('ui://shrd0001cmpShared');
	main.addChild(sharedChild);
	mainPkg.addResource(main);

	const classes = buildCodegenClasses(doc, mainPkg, createPlan());
	const mainClass = classes.find((classInfo) => classInfo.className === 'Main');
	t.truthy(mainClass);

	const localMember = mainClass?.members.find((member) => member.originalName === 'localPanel') as CodegenMember | undefined;
	t.is(localMember?.type, 'UI_LocalPanel');
	t.is(localMember?.referencedComponent?.package, mainPkg);
	t.is(localMember?.referencedComponent?.component, localPanel);

	const sharedMember = mainClass?.members.find((member) => member.originalName === 'sharedPanel') as CodegenMember | undefined;
	t.is(sharedMember?.type, 'GComponent');
	t.is(sharedMember?.referencedComponent?.package, sharedPkg);
	t.is(sharedMember?.referencedComponent?.component, sharedPanel);
});

test('buildCodegenClasses counts only advanced groups in child member getChildAt indexes', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MainPkg');
	pkg.setId('main0001');

	const main = doc.createComponent('Main');
	main.setId('cmpMain');
	const label = doc.createGTextField('label');
	label.setId('n0');
	main.addChild(label);
	const group = doc.createGGroup('n1');
	group.setId('n1');
	main.addChild(group);
	const advancedGroup = doc.createGGroup('advanced');
	advancedGroup.setId('n2');
	advancedGroup.setAdvanced(true);
	main.addChild(advancedGroup);
	const button = doc.createGComponent('button');
	button.setId('n3');
	main.addChild(button);
	pkg.addResource(main);

	const classes = buildCodegenClasses(doc, pkg, createPlanWithIgnoreNoname(false));
	const mainClass = classes.find((classInfo) => classInfo.className === 'Main');
	const labelMember = mainClass?.members.find((member) => member.originalName === 'label');
	const groupMember = mainClass?.members.find((member) => member.originalName === 'n1');
	const advancedGroupMember = mainClass?.members.find((member) => member.originalName === 'advanced');
	const buttonMember = mainClass?.members.find((member) => member.originalName === 'button');

	t.is(labelMember?.index, 0);
	t.is(groupMember, undefined);
	t.is(advancedGroupMember?.index, 1);
	t.is(buttonMember?.index, 2);
});

test('buildCodegenClasses skips classes with only ignored members and references them by base type', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MainPkg');
	pkg.setId('main0001');

	const ignoredPanel = doc.createComponent('IgnoredPanel');
	ignoredPanel.setId('cmpIgnored');
	ignoredPanel.setExported(true);
	const ignoredChild = doc.createGTextField('n0');
	ignoredChild.setId('n0');
	ignoredPanel.addChild(ignoredChild);
	pkg.addResource(ignoredPanel);

	const main = doc.createComponent('Main');
	main.setId('cmpMain');
	main.setExported(true);
	const panelChild = doc.createGComponent('panel');
	panelChild.setId('n0');
	panelChild.setSrc('cmpIgnored');
	main.addChild(panelChild);
	pkg.addResource(main);

	const classes = buildCodegenClasses(doc, pkg, createPlanWithIgnoreNoname(true));
	const mainClass = classes.find((classInfo) => classInfo.className === 'Main');
	const ignoredClass = classes.find((classInfo) => classInfo.className === 'IgnoredPanel');
	const panelMember = mainClass?.members.find((member) => member.originalName === 'panel') as CodegenMember | undefined;

	t.truthy(mainClass);
	t.is(ignoredClass, undefined);
	t.is(panelMember?.type, 'GComponent');
	t.is(panelMember?.referencedComponent?.component, ignoredPanel);
	t.is(panelMember?.referencedComponent?.package, pkg);
});

test('buildCodegenClasses keeps extended components with non-default controllers', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MainPkg');
	pkg.setId('main0001');

	const iconButton = doc.createComponent('IconButton');
	iconButton.setId('cmpIconButton');
	iconButton.setExtensionType('Button');
	iconButton.setExported(true);
	const bgController = doc.createController('bg');
	iconButton.addController(bgController);
	pkg.addResource(iconButton);

	const classes = buildCodegenClasses(doc, pkg, createPlanWithIgnoreNoname(true));
	const iconButtonClass = classes.find((classInfo) => classInfo.className === 'IconButton');
	const bgMember = iconButtonClass?.members.find((member) => member.originalName === 'bg');

	t.truthy(iconButtonClass);
	t.is(iconButtonClass?.encodedClassName, 'UI_IconButton');
	t.is(bgMember?.type, 'Controller');
	t.false(bgMember?.ignored);
});

test('buildCodegenClasses generates non-exported components with non-ignored members', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MainPkg');
	pkg.setId('main0001');

	const pageButton = doc.createComponent('PageButton');
	pageButton.setId('cmpPageButton');
	pageButton.setExtensionType('Button');
	pageButton.setExported(false);
	const bgController = doc.createController('bg');
	pageButton.addController(bgController);
	pkg.addResource(pageButton);

	const secondaryButton = doc.createComponent('SecondaryButton');
	secondaryButton.setId('cmpSecondaryButton');
	secondaryButton.setExtensionType('Button');
	secondaryButton.setExported(false);
	const stateController = doc.createController('state');
	secondaryButton.addController(stateController);
	pkg.addResource(secondaryButton);

	const noticeDialog = doc.createComponent('NoticeDialog');
	noticeDialog.setId('cmpNoticeDialog');
	noticeDialog.setExported(true);
	const quitButton = doc.createGComponent('bt_quit');
	quitButton.setId('n0');
	quitButton.setSrc('cmpPageButton');
	noticeDialog.addChild(quitButton);
	const confirmButton = doc.createGComponent('bt_confirm');
	confirmButton.setId('n1');
	confirmButton.setSrc('cmpPageButton');
	noticeDialog.addChild(confirmButton);
	pkg.addResource(noticeDialog);

	const classes = buildCodegenClasses(doc, pkg, createPlanWithIgnoreNoname(true));
	const pageButtonClass = classes.find((classInfo) => classInfo.className === 'PageButton');
	const secondaryButtonClass = classes.find((classInfo) => classInfo.className === 'SecondaryButton');
	const noticeDialogClass = classes.find((classInfo) => classInfo.className === 'NoticeDialog');
	const quitMember = noticeDialogClass?.members.find((member) => member.originalName === 'bt_quit');
	const confirmMember = noticeDialogClass?.members.find((member) => member.originalName === 'bt_confirm');

	t.truthy(pageButtonClass);
	t.truthy(secondaryButtonClass);
	t.is(pageButtonClass?.encodedClassName, 'UI_PageButton');
	t.is(secondaryButtonClass?.encodedClassName, 'UI_SecondaryButton');
	t.is(quitMember?.type, 'UI_PageButton');
	t.is(confirmMember?.type, 'UI_PageButton');
});

test('buildCodegenClasses ignores auto-named children on extended components when ignoreNoname is enabled', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MainPkg');
	pkg.setId('main0001');

	const main = doc.createComponent('Main');
	main.setId('cmpMain');
	main.setExtensionType('Button');
	main.setExported(true);
	const autoNamedChild = doc.createGTextField('n0');
	autoNamedChild.setId('n0');
	main.addChild(autoNamedChild);
	const defaultTitle = doc.createGTextField('title');
	defaultTitle.setId('n1');
	main.addChild(defaultTitle);
	const namedChild = doc.createGTextField('caption');
	namedChild.setId('n2');
	main.addChild(namedChild);
	pkg.addResource(main);

	const classes = buildCodegenClasses(doc, pkg, createPlanWithIgnoreNoname(true));
	const mainClass = classes.find((classInfo) => classInfo.className === 'Main');
	const autoNamedMember = mainClass?.members.find((member) => member.originalName === 'n0');
	const defaultTitleMember = mainClass?.members.find((member) => member.originalName === 'title');
	const namedMember = mainClass?.members.find((member) => member.originalName === 'caption');

	t.true(autoNamedMember?.ignored);
	t.true(defaultTitleMember?.ignored);
	t.false(namedMember?.ignored);
});

test('buildCodegenClasses uses base type for cross-package components when their package codegen is disabled', (t) => {
	const doc = new Document();

	const sharedPkg = doc.createPackage('SharedPkg');
	sharedPkg.setId('shrd0001');
	sharedPkg.setGenCode(false);
	const sharedPanel = doc.createComponent('SharedPanel');
	sharedPanel.setId('cmpShared');
	sharedPanel.setExported(true);
	sharedPkg.addResource(sharedPanel);
	const sharedButton = doc.createComponent('SharedButton');
	sharedButton.setId('cmpButton');
	sharedButton.setExtensionType('Button');
	sharedPkg.addResource(sharedButton);

	const mainPkg = doc.createPackage('MainPkg');
	mainPkg.setId('main0001');
	const main = doc.createComponent('Main');
	main.setId('cmpMain');
	main.setExported(true);
	const sharedChild = doc.createGComponent('sharedPanel');
	sharedChild.setId('n0');
	sharedChild.setSrc('ui://shrd0001cmpShared');
	main.addChild(sharedChild);
	const buttonChild = doc.createGComponent('sharedButton');
	buttonChild.setId('n1');
	buttonChild.setSrc('ui://shrd0001cmpButton');
	main.addChild(buttonChild);
	mainPkg.addResource(main);

	const classes = buildCodegenClasses(doc, mainPkg, createPlan());
	const mainClass = classes.find((classInfo) => classInfo.className === 'Main');
	const sharedMember = mainClass?.members.find((member) => member.originalName === 'sharedPanel') as CodegenMember | undefined;
	const buttonMember = mainClass?.members.find((member) => member.originalName === 'sharedButton') as CodegenMember | undefined;

	t.is(sharedMember?.type, 'GComponent');
	t.is(sharedMember?.referencedComponent?.package, sharedPkg);
	t.is(sharedMember?.referencedComponent?.component, sharedPanel);
	t.is(buttonMember?.type, 'GButton');
	t.is(buttonMember?.referencedComponent?.package, sharedPkg);
	t.is(buttonMember?.referencedComponent?.component, sharedButton);
});

test('buildCodegenClasses resolves cross-package component references stored as src plus package id', (t) => {
	const doc = new Document();

	const commercePkg = doc.createPackage('Commerce');
	commercePkg.setId('commerce1');
	commercePkg.setGenCode(true);
	const shortcutPanel = doc.createComponent('ShortcutPanel');
	shortcutPanel.setId('cmpShortcut');
	shortcutPanel.setExtensionType('Label');
	commercePkg.addResource(shortcutPanel);

	const mainPkg = doc.createPackage('MainPkg');
	mainPkg.setId('main0001');
	const createShortcut = doc.createComponent('CreateShortcut');
	createShortcut.setId('cmpCreateShortcut');
	const panel = doc.createGComponent('panel');
	panel.setId('n0');
	panel.setSrc('cmpShortcut');
	panel.setPackageId('commerce1');
	createShortcut.addChild(panel);
	mainPkg.addResource(createShortcut);

	const classes = buildCodegenClasses(doc, mainPkg, createPlanWithIgnoreNoname(true));
	const createShortcutClass = classes.find((classInfo) => classInfo.className === 'CreateShortcut');
	const panelMember = createShortcutClass?.members.find((member) => member.originalName === 'panel');

	t.is(panelMember?.type, 'GLabel');
	t.is(panelMember?.referencedComponent?.package, commercePkg);
	t.is(panelMember?.referencedComponent?.component, shortcutPanel);
});

test('buildCodegenClasses uses component base types for all referenced component extension kinds', (t) => {
	const extensionCases = [
		{ componentName: 'PlainPanel', extensionType: '', expectedType: 'GComponent' },
		{ componentName: 'ButtonPanel', extensionType: 'Button', expectedType: 'GButton' },
		{ componentName: 'LabelPanel', extensionType: 'Label', expectedType: 'GLabel' },
		{ componentName: 'ProgressPanel', extensionType: 'ProgressBar', expectedType: 'GProgressBar' },
		{ componentName: 'SliderPanel', extensionType: 'Slider', expectedType: 'GSlider' },
		{ componentName: 'ScrollPanel', extensionType: 'ScrollBar', expectedType: 'GScrollBar' },
		{ componentName: 'ComboPanel', extensionType: 'ComboBox', expectedType: 'GComboBox' },
	];

	for (const referenceStyle of ['ui-url', 'src-pkg'] as const) {
		const doc = new Document();
		const targetPkg = doc.createPackage(`TargetPkg_${referenceStyle}`);
		targetPkg.setId(referenceStyle === 'ui-url' ? 'tgtui001' : 'tgtsrc01');
		targetPkg.setGenCode(false);

		const mainPkg = doc.createPackage(`MainPkg_${referenceStyle}`);
		mainPkg.setId(referenceStyle === 'ui-url' ? 'mainui01' : 'mainsrc1');
		const main = doc.createComponent('Main');
		main.setId(`main_${referenceStyle}`);

		for (const [index, extensionCase] of extensionCases.entries()) {
			const target = doc.createComponent(extensionCase.componentName);
			target.setId(`cmp${index}`);
			if (extensionCase.extensionType) target.setExtensionType(extensionCase.extensionType);
			targetPkg.addResource(target);

			const child = doc.createGComponent(`child${index}`);
			child.setId(`n${index}`);
			if (referenceStyle === 'ui-url') {
				child.setSrc(`ui://${targetPkg.getId()}${target.getId()}`);
			} else {
				child.setSrc(target.getId());
				child.setPackageId(targetPkg.getId());
			}
			main.addChild(child);
		}

		mainPkg.addResource(main);

		const classes = buildCodegenClasses(doc, mainPkg, createPlanWithIgnoreNoname(true));
		const mainClass = classes.find((classInfo) => classInfo.className === 'Main');
		for (const [index, extensionCase] of extensionCases.entries()) {
			const member = mainClass?.members.find((candidate) => candidate.originalName === `child${index}`);
			t.is(member?.type, extensionCase.expectedType, `${referenceStyle} ${extensionCase.componentName}`);
		}
	}
});
