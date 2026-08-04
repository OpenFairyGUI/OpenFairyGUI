import { defineConfig } from 'vitepress';

const base = process.env.VITEPRESS_BASE ?? '/';
const siteUrl = process.env.VITEPRESS_SITE_URL?.replace(/\/$/, '');

export default defineConfig({
	base,
	title: 'OpenFairyGUI',
	locales: {
		root: {
			label: '简体中文',
			lang: 'zh-CN',
			description: '面向 Node.js 与自动化工作流的 FairyGUI 工程 SDK。',
			themeConfig: {
				nav: [
					{ text: '指南', link: '/guide/getting-started' },
					{ text: '参考文档', link: '/architecture-overview' },
					{ text: 'API', link: '/api/', target: '_self' },
				],
				sidebar: {
					'/guide/': [
						{
							text: '开始使用',
							items: [
								{ text: '快速开始', link: '/guide/getting-started' },
								{ text: '包与工具', link: '/guide/packages' },
							],
						},
					],
					'/': [
						{
							text: '参考文档',
							items: [
								{ text: '架构图说明', link: '/architecture-overview' },
								{ text: '编辑器发布设置', link: '/editor-publish-settings' },
								{ text: 'Publish 插件', link: '/publish-plugins' },
								{ text: '发布产物还原限制', link: '/published-project-restore-limitations' },
								{ text: 'Project XML 属性协议', link: '/project-xml-attribute-reference' },
								{ text: 'Project XML DisplayList Tag 对齐', link: '/project-xml-displaylist-variants' },
								{ text: '二进制封包协议', link: '/fairygui-binary-package-format' },
							],
						},
					],
				},
			},
		},
		en: {
			label: 'English',
			lang: 'en-US',
			link: '/en/',
			description: 'A FairyGUI project SDK for Node.js and automation workflows.',
			themeConfig: {
				nav: [
					{ text: 'Guide', link: '/en/guide/getting-started' },
					{ text: 'Reference', link: '/en/architecture-overview' },
					{ text: 'API', link: '/api/', target: '_self' },
				],
				sidebar: {
					'/en/guide/': [
						{
							text: 'Getting Started',
							items: [
								{ text: 'Quick Start', link: '/en/guide/getting-started' },
								{ text: 'Packages and Tools', link: '/en/guide/packages' },
							],
						},
					],
					'/en/': [
						{
							text: 'Reference',
							items: [
								{ text: 'Architecture Overview', link: '/en/architecture-overview' },
								{ text: 'Editor Publish Settings', link: '/en/editor-publish-settings' },
								{ text: 'Publish Plugins', link: '/en/publish-plugins' },
								{ text: 'Published Project Recovery Limits', link: '/en/published-project-restore-limitations' },
								{ text: 'Project XML Attribute Protocol', link: '/en/project-xml-attribute-reference' },
								{ text: 'Project XML DisplayList Tag Alignment', link: '/en/project-xml-displaylist-variants' },
								{ text: 'FairyGUI Binary Package Format', link: '/en/fairygui-binary-package-format' },
							],
						},
					],
				},
			},
		},
	},
	cleanUrls: true,
	head: [
		['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
		['meta', { name: 'theme-color', content: '#0f766e' }],
		...(siteUrl
			? [
					['meta', { property: 'og:image', content: `${siteUrl}/og.png` }] as const,
					['meta', { name: 'twitter:card', content: 'summary_large_image' }] as const,
				]
			: []),
	],
	themeConfig: {
		logo: { src: '/logo.svg', alt: 'OpenFairyGUI' },
		search: { provider: 'local' },
		socialLinks: [{ icon: 'github', link: 'https://github.com/OpenFairyGUI/OpenFairyGUI' }],
		footer: {
			message: 'MIT Licensed',
			copyright: 'OpenFairyGUI Contributors',
		},
	},
});
