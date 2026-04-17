export const UNITY_COMPONENT_TEMPLATE = `{{generatedMark}}

using FairyGUI;
using FairyGUI.Utils;

namespace {{namespaceName}}
{
\tpublic partial class {{className}} : {{componentType}}
\t{
\t\tpublic const string URL = "{{url}}";
{{variableLines}}
\t\tpublic static {{className}} CreateInstance()
\t\t{
\t\t\treturn ({{className}})UIPackage.CreateObject("{{packageName}}", "{{componentName}}");
\t\t}

\t\tpublic override void ConstructFromXML(XML xml)
\t\t{
\t\t\tbase.ConstructFromXML(xml);
{{assignmentLines}}
\t\t}
\t}
}
`;

export const UNITY_BINDER_TEMPLATE = `{{generatedMark}}

using FairyGUI;

namespace {{namespaceName}}
{
\tpublic static class {{binderClassName}}
\t{
\t\tpublic static void BindAll()
\t\t{
{{bindLines}}
\t\t}
\t}
}
`;

export const LAYA_TYPESCRIPT_COMPONENT_TEMPLATE = `{{generatedMark}}

{{importLines}}export default class {{className}} extends {{componentType}}
{
\tpublic static URL:string = "{{url}}";
{{variableLines}}
\tpublic static createInstance():{{className}}
\t{
\t\treturn <{{className}}><any>({{runtimeNamespace}}.UIPackage.createObject("{{packageName}}","{{componentName}}"));
\t}

\tprotected onConstruct():void
\t{
{{assignmentLines}}\t}
}
`;

export const LAYA_TYPESCRIPT_BINDER_TEMPLATE = `{{generatedMark}}

{{importLines}}export default class {{binderClassName}}
{
\tpublic static bindAll():void
\t{
{{bindLines}}\t}
}
`;
