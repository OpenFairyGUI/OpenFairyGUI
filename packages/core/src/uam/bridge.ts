import type { PlatformIO } from '../io/platform-io.js';
import type { ProjectReadOptions } from '../io/project-io-contracts.js';
import type { UamProject } from './model.js';
import { liftDocumentToUamProject } from './bridge-lift.js';
import { materializeUamProject } from './bridge-materialize.js';
import { commitUamProjectSourcePaths, staleBranchDirectories, staleResourceFolders, staleSourceFiles } from './project-source-files.js';

export { liftDocumentToUamProject } from './bridge-lift.js';
export {
	materializeAssetResource,
	materializeDisplayNode,
	materializeUamGear,
	materializeUamProject,
} from './bridge-materialize.js';
export {
	commitUamProjectSourcePaths,
	staleBranchDirectories,
	staleResourceFolders,
	staleSourceFiles,
} from './project-source-files.js';

export interface WriteProjectFromUamOptions {
	/** Previous project state used to safely clean replaced, moved, renamed, or removed package files. */
	previousProject?: UamProject;
}


export async function writeProjectFromUam(
	io: Pick<PlatformIO, 'writeProject'>,
	project: UamProject,
	projectPath: string,
	options: WriteProjectFromUamOptions = {},
): Promise<void> {
	await io.writeProject(materializeUamProject(project), projectPath, {
		staleSourceFiles: options.previousProject ? staleSourceFiles(options.previousProject, project) : [],
		staleResourceFolders: options.previousProject ? staleResourceFolders(options.previousProject, project) : [],
		staleBranchDirectories: options.previousProject ? staleBranchDirectories(options.previousProject, project) : [],
	});
	commitUamProjectSourcePaths(project);
}

export async function readProjectAsUam(
	io: Pick<PlatformIO, 'readProject'>,
	projectPath: string,
	options?: ProjectReadOptions,
): Promise<UamProject> {
	return liftDocumentToUamProject(await io.readProject(projectPath, options));
}
