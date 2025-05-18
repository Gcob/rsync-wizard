import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export const paths = {
    root: rootDir,
    src: path.join(rootDir, '/src'),
    data: path.join(rootDir, '/data'),
    nodeModules: path.join(rootDir, '/node_modules'),
};

const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o777 });
    }
};

ensureDir(paths.data);

export const fromRoot = (relativePath) => {
    return path.join(rootDir, relativePath);
};

export const fromSrc = (relativePath) => {
    return path.join(paths.src, relativePath);
};

export const fromData = (relativePath) => {
    return path.join(paths.data, relativePath);
};

export const fromNodeModules = (relativePath) => {
    return path.join(paths.nodeModules, relativePath);
};
