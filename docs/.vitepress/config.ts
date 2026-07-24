import { defineConfig } from 'vitepress';

const base = process.env.VITEPRESS_BASE ?? '/';
const siteUrl = process.env.VITEPRESS_SITE_URL?.replace(/\/$/, '');

export default defineConfig({
	base,
	lang: 'zh-CN',
	title: 'OpenFairyGUI',
	description: '面向 Node.js 与自动化工作流的 FairyGUI 工程 SDK。',
	cleanUrls: true,
	head: siteUrl
		? [
				['meta', { name: 'theme-color', content: '#0f766e' }],
				['meta', { property: 'og:image', content: `${siteUrl}/og.png` }],
				['meta', { name: 'twitter:card', content: 'summary_large_image' }],
			]
		: [['meta', { name: 'theme-color', content: '#0f766e' }]],
	themeConfig: {
		nav: [
			{ text: '指南', link: '/guide/getting-started' },
			{ text: '参考文档', link: '/architecture-overview' },
			{ text: 'API', link: '/api/' },
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
		search: { provider: 'local' },
		socialLinks: [{ icon: 'github', link: 'https://github.com/OpenFairyGUI/OpenFairyGUI' }],
		footer: {
			message: 'MIT Licensed',
			copyright: 'OpenFairyGUI Contributors',
		},
	},
});
