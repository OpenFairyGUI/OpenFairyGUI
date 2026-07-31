export interface ProjectReadOptions {
	/**
	 * Load primary source bytes for image, sound, misc, font, movie-clip,
	 * Spine, and DragonBones resources. Disabled by default to keep normal
	 * inspection reads lightweight.
	 */
	hydrateResourceBytes?: boolean;
}

export interface ProjectWriteOptions {
	/**
	 * Previous package-controlled files to remove only after every new project file
	 * has been written successfully. Paths are package-relative by construction;
	 * arbitrary filesystem paths are deliberately not accepted.
	 */
	staleSourceFiles?: readonly ProjectSourceFile[];
	/** Empty resource directories to remove after replacement files are written. */
	staleResourceFolders?: readonly ProjectResourceFolder[];
}

/** Identifies one package-controlled file without exposing a filesystem path. */
export interface ProjectSourceFile {
	packageName: string;
	branch: string;
	path: string;
	fileName: string;
}

/** Identifies one package-controlled resource directory. */
export interface ProjectResourceFolder {
	packageName: string;
	branch: string;
	path: string;
}
