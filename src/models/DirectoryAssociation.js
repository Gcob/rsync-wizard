export default class DirectoryAssociation {
    /** @type {string|null} */
    distantPath = null;

    /** @type {string|null} */
    localPath = null;

    constructor(distantPath, localPath = null) {
        this.distantPath = distantPath;
        this.localPath = localPath;
    }
}